// Edge Function (Deno): cria/reenvia convite de família e envia o e-mail de cadastro.
//
// Segurança:
// - As regras (só o responsável convida, limite de 5 pessoas, e-mail duplicado) ficam no
//   banco: a criação roda como o PRÓPRIO usuário (RPC com RLS), nunca com privilégio admin.
// - A chave service_role só é usada aqui, no servidor, para chamar o envio de convite do
//   Supabase Auth e registrar email_sent_at. Ela nunca vai para o app.
//
// Corpo: { action: 'create', familyId, name, email } | { action: 'resend', inviteId }
// Resposta: { code, emailSent: boolean, reason?: 'already_registered' }
//
// Deploy: npx supabase functions deploy invite-member
// Link do e-mail: por padrão o site (https://lista-compras-maridos.vercel.app/convite), que abre
// em qualquer aparelho. Quando o app estiver nas lojas, troque pelo segredo
// INVITE_REDIRECT_URL=listacompras://convite (precisa estar nas Redirect URLs do Supabase).
import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

type Body =
  | { action: 'create'; familyId: string; name: string; email: string }
  | { action: 'resend'; inviteId: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const redirectBase = Deno.env.get('INVITE_REDIRECT_URL') ?? 'https://lista-compras-maridos.vercel.app/convite';

  // cliente com o JWT de quem chamou: o banco aplica RLS e as regras do convite
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }

  // 1) cria ou renova o convite como o próprio usuário
  let code: string;
  if (body.action === 'create') {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Informe nome e e-mail válidos' }, 400);
    const { data, error } = await asUser.rpc('create_family_invite', { p_family: body.familyId, p_name: name, p_email: email });
    if (error) return json({ error: error.message }, 400);
    code = data as string;
  } else if (body.action === 'resend') {
    const { data, error } = await asUser.rpc('renew_family_invite', { p_invite: body.inviteId });
    if (error) return json({ error: error.message }, 400);
    code = data as string;
  } else {
    return json({ error: 'Ação desconhecida' }, 400);
  }

  // 2) dados para o e-mail (lidos com privilégio de servidor, já validados acima)
  const { data: invite, error: inviteError } = await admin
    .from('family_invites')
    .select('id, name, email, created_by, family:families(name)')
    .eq('code', code)
    .single();
  if (inviteError || !invite?.email) return json({ code, emailSent: false });
  const { data: inviter } = await admin.from('profiles').select('display_name').eq('id', invite.created_by).maybeSingle();

  // 3) envio pelo Supabase Auth (usa o SMTP configurado no projeto)
  const { error: sendError } = await admin.auth.admin.inviteUserByEmail(invite.email, {
    redirectTo: `${redirectBase}?code=${code}`,
    data: {
      display_name: invite.name ?? '',
      invite_code: code,
      // deno-lint-ignore no-explicit-any
      family_name: (invite as any).family?.name ?? '',
      invited_by_name: inviter?.display_name ?? '',
    },
  });
  if (sendError) {
    // Quem já tem conta não recebe o e-mail de cadastro: o app mostra o código para compartilhar.
    const exists = sendError.status === 422 || /already|registered|exists/i.test(sendError.message);
    if (exists) return json({ code, emailSent: false, reason: 'already_registered' });
    return json({ error: `Convite criado, mas o e-mail não foi enviado: ${sendError.message}`, code }, 502);
  }

  await admin.from('family_invites').update({ email_sent_at: new Date().toISOString() }).eq('id', invite.id);
  return json({ code, emailSent: true });
});
