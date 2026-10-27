// Edge Function (Deno): exclui a conta de quem chamou (Família → Excluir minha conta).
//
// Segurança:
// - Só apaga a conta dona do JWT enviado; o corpo da requisição é ignorado.
// - Pede a confirmação { confirm: 'EXCLUIR' } para evitar chamadas acidentais.
// - A chave service_role só existe aqui, no servidor: é ela que pode chamar
//   delete_account_data (passa a responsabilidade ou apaga a família de uma pessoa só)
//   e apagar o login em auth.users.
//
// Deploy: npx supabase functions deploy delete-account
import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado' }, 401);

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }
  if (body.confirm !== 'EXCLUIR') return json({ error: 'Confirmação ausente' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sessão inválida. Entre de novo e tente outra vez.' }, 401);
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { error: dataError } = await admin.rpc('delete_account_data', { p_user: userId });
  if (dataError) return json({ error: `Não foi possível excluir os dados: ${dataError.message}` }, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: `Não foi possível excluir o login: ${deleteError.message}` }, 500);

  return json({ deleted: true });
});
