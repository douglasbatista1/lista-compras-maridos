import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, Field, Notice, PrimaryButton, Screen, ScreenTitle, SecondaryButton } from '@/components/ui';
import { useData } from '@/data/DataProvider';
import { getSupabase } from '@/data/supabase/client';
import { space } from '@/theme/tokens';

/** Primeiro acesso com Supabase: criar a família ou entrar com o código do cônjuge. */
export default function FamilySetupScreen() {
  const { reloadSession, signOut } = useData();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'join'>(null);
  const [error, setError] = useState<string | null>(null);
  const sb = getSupabase();

  async function run(kind: 'create' | 'join') {
    if (!sb) return;
    setBusy(kind);
    setError(null);
    const { error: e } =
      kind === 'create'
        ? await sb.rpc('create_family', { p_name: name.trim() })
        : await sb.rpc('accept_family_invite', { p_code: code.trim().toUpperCase() });
    if (e) {
      setError(e.message);
      setBusy(null);
      return;
    }
    await reloadSession();
  }

  return (
    <Screen scroll>
      <ScreenTitle title="Sua família" subtitle="Uma lista compartilhada entre vocês" />
      <Card>
        <AppText variant="bodyStrong" style={{ marginBottom: space.md }}>
          Criar uma família
        </AppText>
        <Field label="Nome da família" value={name} onChangeText={setName} placeholder="Ex.: Casa da Ana e do Beto" maxLength={80} />
        <PrimaryButton label="Criar família" onPress={() => run('create')} loading={busy === 'create'} disabled={!name.trim() || !!busy} />
      </Card>
      <View style={{ height: space.lg }} />
      <Card>
        <AppText variant="bodyStrong" style={{ marginBottom: space.md }}>
          Recebi um código de convite
        </AppText>
        <Field label="Código" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={8} placeholder="Ex.: K7M2Q9XA" />
        <SecondaryButton label="Entrar na família" onPress={() => run('join')} loading={busy === 'join'} disabled={code.trim().length !== 8 || !!busy} />
      </Card>
      {error ? <View style={{ marginTop: space.lg }}><Notice tone="error">{error}</Notice></View> : null}
      <SecondaryButton label="Sair" onPress={signOut} style={{ marginTop: space.xl }} />
    </Screen>
  );
}
