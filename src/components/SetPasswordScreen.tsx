import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { useData } from '@/data/DataProvider';
import { getSupabase } from '@/data/supabase/client';
import { authErrorMessage, parseAuthRedirect, passwordProblem } from '@/domain/auth';
import { colors, space } from '@/theme/tokens';

import { AppText, Field, Notice, PrimaryButton, Screen, ScreenTitle, SecondaryButton } from './ui';

type Status = 'checking' | 'ready' | 'invalid';

/**
 * Destino dos links enviados por e-mail:
 * - 'invite'   (/convite?code=...): a pessoa convidada cria a senha e entra na família;
 * - 'recovery' (/redefinir-senha): quem esqueceu a senha cria uma nova.
 */
export function SetPasswordScreen({ kind }: { kind: 'invite' | 'recovery' }) {
  const sb = getSupabase();
  const { reloadSession } = useData();
  const params = useLocalSearchParams<{ code?: string }>();
  const linkingUrl = Linking.useLinkingURL();
  const [status, setStatus] = useState<Status>('checking');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : linkingUrl;
      const link = parseAuthRedirect(url);
      if (link.error) {
        if (alive) {
          setLinkError(link.error);
          setStatus('invalid');
        }
        return;
      }
      if (link.accessToken && link.refreshToken) {
        await sb.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
      }
      const { data } = await sb.auth.getUser();
      if (!alive) return;
      const code = link.inviteCode ?? (typeof params.code === 'string' && /^[A-Za-z0-9]{8}$/.test(params.code) ? params.code.toUpperCase() : null);
      setInviteCode(code ?? (data.user?.user_metadata?.invite_code as string | undefined) ?? null);
      setName((data.user?.user_metadata?.display_name as string | undefined) ?? '');
      setStatus(data.user ? 'ready' : 'invalid');
    })().catch(() => alive && setStatus('invalid'));
    return () => {
      alive = false;
    };
  }, [sb, linkingUrl, params.code]);

  async function submit() {
    if (!sb) return;
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const { data: updated, error: e } = await sb.auth.updateUser({
        password,
        data: kind === 'invite' && name.trim() ? { display_name: name.trim() } : undefined,
      });
      if (e) throw new Error(authErrorMessage(e));
      if (kind === 'invite' && name.trim() && updated.user) {
        await sb.from('profiles').update({ display_name: name.trim() }).eq('id', updated.user.id);
      }
      if (kind === 'invite' && inviteCode) {
        const { error: acceptError } = await sb.rpc('accept_family_invite', { p_code: inviteCode });
        if (acceptError) throw new Error(acceptError.message);
      }
      await reloadSession();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
      setBusy(false);
    }
  }

  if (!sb) {
    return (
      <Screen scroll>
        <ScreenTitle title={kind === 'invite' ? 'Convite' : 'Nova senha'} />
        <Notice>Convites e senha funcionam quando o Supabase está configurado. No modo demonstração não há contas.</Notice>
        <SecondaryButton label="Ir para o início" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (status === 'checking') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ivory }}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  if (status === 'invalid') {
    return (
      <Screen scroll>
        <ScreenTitle title="Link expirado" />
        <Notice tone="error">
          {linkError ?? 'Este link não é mais válido.'}{' '}
          {kind === 'invite'
            ? 'Peça para quem convidou tocar em "Reenviar" na aba Família.'
            : 'Peça um novo link em "Esqueci minha senha".'}
        </Notice>
        <SecondaryButton label="Ir para o login" onPress={() => router.replace('/entrar')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenTitle
        title={kind === 'invite' ? 'Bem-vindo(a)!' : 'Criar nova senha'}
        subtitle={kind === 'invite' ? 'Crie sua senha para entrar na lista da família.' : 'Escolha uma senha nova para sua conta.'}
      />
      {kind === 'invite' ? (
        <Field label="Seu nome" value={name} onChangeText={setName} placeholder="Como a família te chama" maxLength={80} />
      ) : null}
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
      <PrimaryButton
        label={kind === 'invite' ? 'Criar senha e entrar' : 'Salvar nova senha'}
        onPress={submit}
        loading={busy}
        disabled={!password || !confirm}
      />
      {kind === 'invite' && !inviteCode ? (
        <AppText variant="meta" style={{ marginTop: space.md }}>
          Não encontramos o código do convite no link. Depois de criar a senha, digite o código que você recebeu.
        </AppText>
      ) : null}
    </Screen>
  );
}
