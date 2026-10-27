import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { DemoNotice } from '@/components/DemoNotice';
import { ChevronRight, Clock, Eye, Repeat, Trash } from '@/components/icons';
import { AppText, Card, EmptyState, Notice, Screen, ScreenTitle } from '@/components/ui';
import { useData, useQuery, useRepo } from '@/data/DataProvider';
import { formatDate } from '@/domain/format';
import type { Purchase } from '@/domain/types';
import { colors, space } from '@/theme/tokens';

export default function HistoryScreen() {
  const repo = useRepo();
  const { invalidate } = useData();
  const { data: purchases, error, loading } = useQuery((r) => r.listPurchases());
  const [menuFor, setMenuFor] = useState<Purchase | null>(null);

  return (
    <Screen>
      <FlatList
        data={purchases ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <>
            <ScreenTitle title="Histórico" subtitle="Compras concluídas e confirmadas" />
            <DemoNotice />
            {error ? <Notice tone="error">{error}</Notice> : null}
            {loading && !purchases ? <ActivityIndicator color={colors.forest} /> : null}
          </>
        }
        renderItem={({ item }) => (
          <Card
            onPress={() => router.push({ pathname: '/historico/[id]', params: { id: item.id } })}
            onLongPress={() => setMenuFor(item)}
            accessibilityLabel={`${item.listName}, ${formatDate(item.confirmedAt)}`}
            style={{ marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{item.listName}</AppText>
                <AppText variant="meta">
                  {formatDate(item.confirmedAt)} · {item.items.length} {item.items.length === 1 ? 'item comprado' : 'itens comprados'}
                </AppText>
              </View>
              <ChevronRight size={20} color={colors.muted} />
            </View>
          </Card>
        )}
        ListFooterComponent={
          purchases && purchases.length > 0 ? (
            <AppText variant="meta" style={{ textAlign: 'center', marginTop: space.xs }}>
              Toque e segure uma compra para mais opções.
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<Clock size={28} color={colors.forest} />}
              title="Nenhuma compra concluída"
              message="Quando você concluir uma lista, ela aparece aqui com a data e os itens comprados."
            />
          ) : undefined
        }
      />
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.listName ?? ''}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                {
                  label: 'Ver compra',
                  icon: <Eye size={20} color={colors.forest} />,
                  onPress: () => router.push({ pathname: '/historico/[id]', params: { id: menuFor.id } }),
                },
                {
                  label: 'Comprar novamente',
                  icon: <Repeat size={20} color={colors.forest} />,
                  onPress: async () => {
                    const clone = await repo.cloneList(menuFor.listId, `${menuFor.listName} · ${formatDate(new Date().toISOString())}`);
                    invalidate();
                    router.push({ pathname: '/lista/[id]', params: { id: clone.id } });
                  },
                },
                {
                  label: 'Excluir do meu histórico',
                  icon: <Trash size={20} color={colors.error} />,
                  destructive: true,
                  confirm: {
                    title: 'Excluir do seu histórico?',
                    message:
                      'Esta compra deixa de aparecer para você. Para os outros membros da família ela continua no histórico, e o registro da compra fica guardado.',
                    confirmLabel: 'Excluir',
                  },
                  onPress: async () => {
                    await repo.deleteList(menuFor.listId);
                    invalidate();
                  },
                },
              ]
            : []
        }
      />
    </Screen>
  );
}
