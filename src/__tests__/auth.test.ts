import { authErrorMessage, isValidEmail, linkErrorMessage, parseAuthRedirect, passwordProblem } from '@/domain/auth';

describe('link do e-mail', () => {
  it('lê convite: código da família + sessão no fragmento', () => {
    const r = parseAuthRedirect('listacompras://convite?code=k7m2q9xa#access_token=AAA&refresh_token=RRR&type=invite');
    expect(r).toEqual({ accessToken: 'AAA', refreshToken: 'RRR', type: 'invite', inviteCode: 'K7M2Q9XA', tokenHash: null, error: null });
  });

  it('lê link de nova senha', () => {
    const r = parseAuthRedirect('https://app.exemplo/redefinir-senha#access_token=A&refresh_token=R&type=recovery');
    expect(r.type).toBe('recovery');
    expect(r.inviteCode).toBeNull();
  });

  it('mostra erro de link expirado', () => {
    const r = parseAuthRedirect('listacompras://convite?code=K7M2Q9XA#error=access_denied&error_description=Email+link+is+invalid+or+has+expired');
    expect(r.error).toBe('Email link is invalid or has expired');
  });

  it('lê o link novo do convite (token_hash, sem sessão)', () => {
    const r = parseAuthRedirect('https://lista.exemplo/convite?code=K7M2Q9XA&token_hash=pkce_abc123&type=invite');
    expect(r).toMatchObject({ tokenHash: 'pkce_abc123', type: 'invite', inviteCode: 'K7M2Q9XA', accessToken: null });
  });

  it('traduz erro de link usado ou expirado', () => {
    expect(linkErrorMessage('Email link is invalid or has expired')).toBe('Este link já foi usado ou expirou.');
    expect(authErrorMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe('Este link já foi usado ou expirou.');
  });

  it('ignora códigos que não são de convite (ex.: PKCE longo) e URL vazia', () => {
    expect(parseAuthRedirect('listacompras://convite?code=3b1f6c2e-aaaa-bbbb-cccc-1234567890ab').inviteCode).toBeNull();
    expect(parseAuthRedirect(null).accessToken).toBeNull();
  });
});

describe('cadastro', () => {
  it('valida e-mail', () => {
    expect(isValidEmail(' Ana@Exemplo.com ')).toBe(true);
    expect(isValidEmail('ana@exemplo')).toBe(false);
  });

  it('exige senha com 8+ caracteres, letras e números, e confirmação igual', () => {
    expect(passwordProblem('abc123')).toMatch(/8 caracteres/);
    expect(passwordProblem('abcdefgh')).toMatch(/letras e números/);
    expect(passwordProblem('abcd1234', 'abcd12345')).toMatch(/não são iguais/);
    expect(passwordProblem('abcd1234', 'abcd1234')).toBeNull();
  });

  it('traduz erros do Supabase Auth', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.');
    expect(authErrorMessage({ message: 'User already registered' })).toMatch(/Já existe uma conta/);
  });
});
