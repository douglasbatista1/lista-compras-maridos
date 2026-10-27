// Edge Function (Deno): recebe os webhooks da RevenueCat e libera/retira o acesso da família.
//
// Segurança:
// - Publicada com verify_jwt = false (quem chama é a RevenueCat, não um usuário logado).
//   Em troca, exige o cabeçalho Authorization igual ao segredo REVENUECAT_WEBHOOK_SECRET,
//   configurado também no painel da RevenueCat (Integrations → Webhooks → Authorization header).
//   Sem o segredo configurado, recusa tudo (503).
// - Só grava pela função apply_store_event (service_role), que é idempotente e ignora
//   eventos atrasados. O app nunca escreve em entitlements.
//
// O app identifica a pessoa na RevenueCat com o id da conta (Purchases.logIn(user.id)).
// Deploy: npx supabase functions deploy revenuecat-webhook --no-verify-jwt
//         npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<valor longo e aleatório>
import { createClient } from '@supabase/supabase-js';

type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  transaction_id?: string;
  store?: string;
  event_timestamp_ms?: number;
  cancel_reason?: string;
  transferred_from?: string[];
  transferred_to?: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRANT = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Ids de conta do app (uuid) citados no evento; ids anônimos da RevenueCat são ignorados. */
function accountIds(...ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)))];
}

/** Para cada pessoa afetada, o status que a família dela deve ter. */
export function plan(event: RcEvent): { user: string; status: 'active' | 'refunded' | 'revoked' }[] {
  const type = event.type ?? '';
  const owner = accountIds(event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])).slice(0, 1);
  if (GRANT.has(type)) return owner.map((user) => ({ user, status: 'active' }));
  // reembolso pelo suporte da loja; desligar a renovação não tira o acesso já pago
  if (type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT') return owner.map((user) => ({ user, status: 'refunded' }));
  if (type === 'EXPIRATION') return owner.map((user) => ({ user, status: 'revoked' }));
  if (type === 'TRANSFER') {
    // compra restaurada em outra conta: quem recebeu ganha, quem tinha perde
    return [
      ...accountIds(...(event.transferred_from ?? [])).map((user) => ({ user, status: 'revoked' as const })),
      ...accountIds(...(event.transferred_to ?? [])).map((user) => ({ user, status: 'active' as const })),
    ];
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook ainda não configurado' }, 503);
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(given, secret.replace(/^Bearer\s+/i, ''))) return json({ error: 'Não autorizado' }, 401);

  let event: RcEvent;
  try {
    event = ((await req.json()) as { event?: RcEvent }).event ?? {};
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }

  const changes = plan(event);
  if (changes.length === 0) return json({ ignored: event.type ?? 'sem tipo' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const eventAt = event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : null;
  const applied: { user: string; status: string; family: string | null }[] = [];
  for (const change of changes) {
    const { data, error } = await admin.rpc('apply_store_event', {
      p_user: change.user,
      p_status: change.status,
      p_event_id: event.id ?? null,
      p_event_at: eventAt,
      p_store: event.store ?? null,
      p_product_id: event.product_id ?? null,
      p_transaction_id: event.transaction_id ?? null,
    });
    // erro → 500: a RevenueCat tenta de novo mais tarde
    if (error) return json({ error: error.message }, 500);
    applied.push({ ...change, family: (data as string | null) ?? null });
  }
  return json({ applied });
});
