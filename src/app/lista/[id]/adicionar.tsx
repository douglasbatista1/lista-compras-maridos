import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Send } from '@/components/icons';
import { ProductSearch } from '@/components/ProductSearch';
import { Notice, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useData, useQuery, useRepo } from '@/data/DataProvider';
import { colors, space } from '@/theme/tokens';

export default function AddProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useRepo();
  const { invalidate } = useData();
  const { data: list } = useQuery((r) => r.getList(id), id);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = list?.items.length ?? 0;

  /** "Enviar lista": encerra a montagem e volta ao início, onde a lista aparece pronta. */
  async function send() {
    setSending(true);
    setError(null);
    try {
      if (!list?.sentAt) await repo.sendList(id);
      invalidate();
      router.dismissTo('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a lista.');
      setSending(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <ProductSearch listId={id} autoFocus />
      <View style={{ padding: space.lg, paddingTop: space.sm, gap: space.sm }}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <SecondaryButton
            label={count > 0 ? `Ver lista (${count})` : 'Ver lista'}
            onPress={() => router.dismissTo({ pathname: '/lista/[id]', params: { id } })}
            style={{ flex: 1 }}
          />
          <PrimaryButton
            label={list?.sentAt ? 'Concluir' : 'Enviar lista'}
            icon={<Send size={18} color={colors.white} />}
            onPress={send}
            loading={sending}
            disabled={count === 0}
            accessibilityHint={count === 0 ? 'Adicione pelo menos um produto' : 'Encerra a montagem e volta ao início'}
            style={{ flex: 1.3 }}
          />
        </View>
      </View>
    </Screen>
  );
}
