import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Trash2 } from '@/components/icons';
import { AppText, Card, Field, Notice, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useData, useQuery } from '@/data/DataProvider';
import { getSupabase } from '@/data/supabase/client';
import { SupabaseRepository } from '@/data/supabase/supabaseRepository';
import { DELETE_CONFIRMATION, accountDeletionImpact } from '@/domain/auth';
import { colors, space } from '@/theme/tokens';

const IMPACT_TEXT = {
  'delete-family':
    'Você é a única pessoa da família. A família inteira será apagada: todas as listas, o histórico de compras e os produtos cadastrados.',
  'transfer-ownership':
    'As listas e o histórico continuam com a família. A pessoa que entrou primeiro na família passa a ser a responsável.',
  'leave-family': 'Você sai da família. As listas e o histórico continuam com ela, sem o seu nome.',
} as const;

/** Família → Excluir minha conta (exigido pela Apple). Apaga o login, nome e e-mail; não tem volta. */
export default function DeleteAccountScreen() {
  const { state, reloadSession } = useData();
  const { data: members } = useQuery((r) => r.listMembers());
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repo = state.status === 'ready' ? state.repo : null;
  const family = state.status === 'ready' ? state.family : null;
  const impact = family && members ? accountDeletionImpact(family.role, members.length) : null;
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION;

  async function remove() {
    if (!(repo instanceof SupabaseRepository)) return;
    setBusy(true);
    setError(null);
    try {
      await repo.deleteAccount();
      // o login já não existe no servidor: basta limpar a sessão deste aparelho
      await getSupabase()?.auth.signOut({ scope: 'local' });
      await reloadSession();
      router.replace('/entrar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir a conta.');
      setBusy(false);
    }
  }

  if (!(repo instanceof SupabaseRepository)) {
    return (
      <Screen edges={['bottom']} scroll>
        <Notice tone="demo">No modo demonstração não há conta: os dados ficam só neste aparelho.</Notice>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
        <Trash2 size={22} color={colors.error} />
        <AppText variant="screenTitle" accessibilityRole="header">
          Excluir minha conta
        </AppText>
      </View>
      <Card style={{ marginBottom: space.md, gap: space.sm }}>
        <AppText>Seu login, seu nome e seu e-mail serão apagados. Esta ação não pode ser desfeita.</AppText>
        {impact ? <AppText>{IMPACT_TEXT[impact]}</AppText> : null}
        <AppText variant="meta">
          Se a família tiver comprado o acesso pela App Store, a compra fica com o seu ID Apple e pode ser restaurada em
          uma conta nova.
        </AppText>
      </Card>
      <Field
        label={`Para confirmar, digite ${DELETE_CONFIRMATION}`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <PrimaryButton
        label="Excluir minha conta"
        onPress={remove}
        loading={busy}
        disabled={!confirmed || !impact}
        style={{ backgroundColor: colors.error }}
      />
      <SecondaryButton label="Cancelar" onPress={() => router.back()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}
