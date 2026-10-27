import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppText, Field, Notice, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { getSupabase } from '@/data/supabase/client';
import { authErrorMessage, isValidEmail, normalizeEmail, passwordProblem } from '@/domain/auth';
import { colors, fonts, space } from '@/theme/tokens';

type Mode = 'entrar' | 'criar' | 'esqueci' | 'codigo';

/** Entrada com e-mail e senha; criar conta; esqueci a senha; ou código por e-mail. */
export function AuthScreen({ initialMode = 'entrar' }: { initialMode?: 'entrar' | 'criar' }) {
  const sb = getSupabase();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchTo(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const emailOk = isValidEmail(email);

  const signIn = () =>
    run(async () => {
      const { error: e } = await sb!.auth.signInWithPassword({ email: normalizeEmail(email), password });
      if (e) setError(authErrorMessage(e));
      // sucesso: o DataProvider recebe SIGNED_IN e segue para a família
    });

  const signUp = () =>
    run(async () => {
      const problem = passwordProblem(password, confirm);
      if (problem) return setError(problem);
      const { data, error: e } = await sb!.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
          emailRedirectTo: Linking.createURL('/entrar'),
        },
      });
      if (e) return setError(authErrorMessage(e));
      if (!data.session) {
        switchTo('entrar');
        setInfo('Conta criada. Enviamos um e-mail de confirmação: toque no link e depois entre com sua senha.');
      }
    });

  const forgot = () =>
    run(async () => {
      const { error: e } = await sb!.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo: Linking.createURL('/redefinir-senha'),
      });
      if (e) return setError(authErrorMessage(e));
      // mesma mensagem existindo ou não a conta (não revela quem tem cadastro)
      setInfo('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.');
    });

  const sendCode = () =>
    run(async () => {
      const { error: e } = await sb!.auth.signInWithOtp({ email: normalizeEmail(email), options: { shouldCreateUser: false } });
      if (e) return setError(authErrorMessage(e));
      setCodeSent(true);
    });

  const verifyCode = () =>
    run(async () => {
      const { error: e } = await sb!.auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: 'email' });
      if (e) setError('Código inválido ou expirado. Confira o e-mail ou peça outro código.');
    });

  const emailField = (
    <Field
      label="E-mail"
      value={email}
      onChangeText={setEmail}
      placeholder="voce@exemplo.com"
      keyboardType="email-address"
      autoCapitalize="none"
      autoComplete="email"
      textContentType="emailAddress"
    />
  );

  return (
    <Screen scroll>
      <Image
        source={require('../../assets/brand/logo_horizontal.png')}
        style={{ width: '100%', height: 88, marginVertical: space.xl }}
        contentFit="contain"
        accessibilityLabel="Lista de Compras para Maridos"
      />

      {mode === 'entrar' || mode === 'criar' ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
          {(['entrar', 'criar'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => switchTo(m)}
              style={{
                flex: 1,
                minHeight: 44,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 999,
                backgroundColor: mode === m ? colors.forest : colors.white,
                borderWidth: 1,
                borderColor: mode === m ? colors.forest : colors.line,
              }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: mode === m ? colors.white : colors.ink }}>
                {m === 'entrar' ? 'Entrar' : 'Criar conta'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {info ? <Notice tone="demo">{info}</Notice> : null}

      {mode === 'entrar' ? (
        <>
          {emailField}
          <Field
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={() => emailOk && password && signIn()}
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <PrimaryButton label="Entrar" onPress={signIn} loading={busy} disabled={!emailOk || !password} />
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <SecondaryButton label="Esqueci minha senha" onPress={() => switchTo('esqueci')} />
            <SecondaryButton label="Entrar com código por e-mail" onPress={() => switchTo('codigo')} />
          </View>
        </>
      ) : null}

      {mode === 'criar' ? (
        <>
          <Field label="Seu nome" value={displayName} onChangeText={setDisplayName} placeholder="Como a família te chama" maxLength={80} />
          {emailField}
          <Field
            label="Senha (mínimo 8, com letras e números)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label="Confirme a senha"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <PrimaryButton label="Criar conta" onPress={signUp} loading={busy} disabled={!emailOk || !password || !confirm} />
        </>
      ) : null}

      {mode === 'esqueci' ? (
        <>
          <AppText variant="sectionTitle">Esqueci minha senha</AppText>
          <AppText variant="meta" style={{ marginBottom: space.lg }}>
            Enviaremos um link para você criar uma nova senha.
          </AppText>
          {emailField}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <PrimaryButton label="Enviar link" onPress={forgot} loading={busy} disabled={!emailOk} />
          <SecondaryButton label="Voltar" onPress={() => switchTo('entrar')} style={{ marginTop: space.sm }} />
        </>
      ) : null}

      {mode === 'codigo' ? (
        <>
          <AppText variant="sectionTitle">Entrar com código</AppText>
          <AppText variant="meta" style={{ marginBottom: space.lg }}>
            {codeSent ? `Enviamos um código para ${email.trim()}.` : 'Para quem já tem conta: enviamos um código de 6 dígitos.'}
          </AppText>
          {codeSent ? (
            <Field
              label="Código"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={10}
            />
          ) : (
            emailField
          )}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {codeSent ? (
            <PrimaryButton label="Entrar" onPress={verifyCode} loading={busy} disabled={code.trim().length < 6} />
          ) : (
            <PrimaryButton label="Receber código" onPress={sendCode} loading={busy} disabled={!emailOk} />
          )}
          <SecondaryButton
            label="Voltar"
            onPress={() => {
              setCodeSent(false);
              switchTo('entrar');
            }}
            style={{ marginTop: space.sm }}
          />
        </>
      ) : null}
      <View style={{ marginTop: space.xl, flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
        <Link href="/termos" style={{ paddingVertical: space.sm }}>
          <AppText variant="meta" style={{ textDecorationLine: 'underline' }}>
            Termos de Uso
          </AppText>
        </Link>
        <Link href="/privacidade" style={{ paddingVertical: space.sm }}>
          <AppText variant="meta" style={{ textDecorationLine: 'underline' }}>
            Política de Privacidade
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}
