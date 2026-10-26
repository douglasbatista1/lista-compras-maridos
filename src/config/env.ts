/**
 * Configuração pública do app. Só valores seguros para o cliente podem usar EXPO_PUBLIC_*:
 * a URL do projeto Supabase e a chave publishable/anon. Nunca coloque service_role aqui.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const publishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

function looksLikeServiceRole(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(globalThis.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

const unsafeKey = publishableKey ? looksLikeServiceRole(publishableKey) : false;

export const env = {
  supabaseUrl: url,
  supabaseKey: unsafeKey ? '' : publishableKey,
  /** Supabase só é ativado com URL + chave pública válidas; caso contrário, modo demonstração. */
  supabaseEnabled: Boolean(url && publishableKey && !unsafeKey),
  /** Se alguém colocar a chave secreta no app, recusamos usá-la e avisamos. */
  unsafeKeyRejected: unsafeKey,
  /** Bucket público com as fotos do catálogo importado. */
  productImagesBucket: 'product-images',
} as const;
