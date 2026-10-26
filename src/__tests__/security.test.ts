import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.git', '.expo', 'Banco de produtos', 'kit_marca_lista_de_compras', 'dist', 'out', 'ios', 'android']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.env.') && name !== '.env.example') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json|sql|md|py|sh|toml|example)$/.test(name) || name === '.env.example') out.push(full);
  }
  return out;
}

/** JWT cujo payload declara role=service_role, ou chave secreta no formato novo do Supabase. */
function findSecrets(text: string): string[] {
  const hits: string[] = [];
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) hits.push('sb_secret_');
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') hits.push('jwt service_role');
    } catch {
      // não é JWT válido
    }
  }
  return hits;
}

describe('segredos', () => {
  it('nenhum arquivo versionável contém chave secreta do Supabase', () => {
    const offenders = walk(ROOT)
      .filter((f) => !f.includes('__tests__'))
      .map((f) => ({ f: relative(ROOT, f), hits: findSecrets(readFileSync(f, 'utf8')) }))
      .filter((x) => x.hits.length > 0);
    expect(offenders).toEqual([]);
  });

  it('.env.example só tem nomes de variáveis, sem valores', () => {
    const lines = readFileSync(join(ROOT, '.env.example'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.split('=')[1].trim()).toBe('');
  });

  it('nenhuma variável EXPO_PUBLIC_* tem nome de segredo', () => {
    const sources = walk(join(ROOT, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(sources).not.toMatch(/EXPO_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET)/);
  });

  it('o app recusa uma chave service_role colocada por engano', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `eyJhbGciOiJIUzI1NiJ9.${payload}.assinaturaqualquer`;
    jest.isolateModules(() => {
      const { env } = require('@/config/env');
      expect(env.supabaseEnabled).toBe(false);
      expect(env.unsafeKeyRejected).toBe(true);
      expect(env.supabaseKey).toBe('');
    });
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('o app não pede localização no MVP', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies)).not.toContain('expo-location');
    const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;
    expect(app.android.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION']),
    );
    expect(JSON.stringify(app.ios.infoPlist ?? {})).not.toMatch(/Location/);
  });
});
