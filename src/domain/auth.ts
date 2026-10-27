/** Regras de cadastro/login e leitura dos links enviados por e-mail (convite e nova senha). */

/** Limite combinado: o responsável + até 5 pessoas convidadas. Também é verificado no banco. */
export const MAX_INVITED_PEOPLE = 5;
export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(email));
}

/** Devolve a mensagem de erro da senha, ou null se estiver boa. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use letras e números na senha.';
  if (confirm !== undefined && password !== confirm) return 'As senhas não são iguais.';
  return null;
}

export type AuthRedirect = {
  accessToken: string | null;
  refreshToken: string | null;
  /** 'invite' (convite), 'recovery' (esqueci a senha), 'signup'... */
  type: string | null;
  /** Código do convite da família (?code=XXXXXXXX). */
  inviteCode: string | null;
  error: string | null;
};

/**
 * Lê o link que o Supabase Auth abre no app depois do clique no e-mail, por exemplo:
 * listacompras://convite?code=K7M2Q9XA#access_token=...&refresh_token=...&type=invite
 */
export function parseAuthRedirect(url: string | null | undefined): AuthRedirect {
  const empty: AuthRedirect = { accessToken: null, refreshToken: null, type: null, inviteCode: null, error: null };
  if (!url) return empty;
  const hashIdx = url.indexOf('#');
  const qIdx = url.indexOf('?');
  const query = qIdx >= 0 ? url.slice(qIdx + 1, hashIdx > qIdx ? hashIdx : undefined) : '';
  const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
  const q = new URLSearchParams(query);
  const f = new URLSearchParams(fragment);
  const get = (k: string) => f.get(k) ?? q.get(k);
  const code = q.get('code');
  return {
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    type: get('type'),
    // convites usam 8 caracteres; códigos PKCE do Supabase são longos e ficam de fora
    inviteCode: code && /^[A-Za-z0-9]{8}$/.test(code) ? code.toUpperCase() : null,
    error: get('error_description') ?? get('error'),
  };
}

/** Traduz os erros mais comuns do Supabase Auth. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const code = error?.code ?? '';
  const msg = error?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return 'Já existe uma conta com este e-mail. Use "Entrar".';
  if (code === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres com letras e números.';
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) return 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.';
  return msg || 'Não foi possível concluir. Tente de novo.';
}

/** Palavra que a pessoa digita para confirmar a exclusão da conta (também conferida no servidor). */
export const DELETE_CONFIRMATION = 'EXCLUIR';

export type DeletionImpact = 'delete-family' | 'transfer-ownership' | 'leave-family';

/**
 * O que acontece com a família quando a pessoa exclui a conta (mesma regra de
 * delete_account_data no banco): sozinha → a família é apagada; responsável com outras
 * pessoas → quem entrou primeiro assume; membro → só sai da família.
 */
export function accountDeletionImpact(role: 'owner' | 'member', activeMembers: number): DeletionImpact {
  if (activeMembers <= 1) return 'delete-family';
  return role === 'owner' ? 'transfer-ownership' : 'leave-family';
}
