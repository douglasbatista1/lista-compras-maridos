import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { Repeat } from '@/components/icons';
import { AppText, Notice, PrimaryButton, ProductImage, Screen, formatQty } from '@/components/ui';
import { useData, useQuery, useRepo } from '@/data/DataProvider';
import { formatDate, formatDateTime } from '@/domain/format';
import { productSubtitle } from '@/domain/search';
import { colors, radii, space } from '@/theme/tokens';

export default function PurchaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useRepo();
  const { invalidate } = useData();
  const { data, error, loading } = useQuery(async (r) => {
    const purchases = await r.listPurchases();
    const purchase = purchases.find((p) => p.id === id) ?? null;
    const list = purchase ? await r.getList(purchase.listId) : null;
    return { purchase, list };
  }, id);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const purchase = data?.purchase;
  const notBought = data?.list ? data.list.items.filter((i) => i.status !== 'purchased') : [];

  async function buyAgain() {
    if (!purchase) return;
    setBusy(true);
    try {
      const clone = await repo.cloneList(purchase.listId, `${purchase.listName} · ${formatDate(new Date().toISOString())}`);
      invalidate();
      router.replace({ pathname: '/lista/[id]', params: { id: clone.id } });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível criar a nova lista.');
      setBusy(false);
    }
  }

  if (!purchase) {
    return (
      <Screen edges={['bottom']}>
        <View style={{ padding: space.lg }}>
          {loading ? <ActivityIndicator color={colors.forest} /> : <Notice tone="error">{error ?? 'Compra não encontrada.'}</Notice>}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <FlatList
        data={purchase.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <AppText variant="screenTitle">{purchase.listName}</AppText>
            <AppText variant="meta" style={{ fontSize: 15 }}>
              Compra confirmada em {formatDateTime(purchase.confirmedAt)}
            </AppText>
            {actionError ? <View style={{ marginTop: space.md }}><Notice tone="error">{actionError}</Notice></View> : null}
            <AppText variant="eyebrow" style={{ marginTop: space.xl }}>
              COMPRADOS ({purchase.items.length})
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              backgroundColor: colors.white,
              borderRadius: radii.card,
              borderWidth: 1,
              borderColor: colors.warmgray,
              padding: space.md,
              marginBottom: space.sm,
            }}>
            {/* item de lista simples (texto livre): sem espaço de foto */}
            {item.productId || item.familyProductId || item.snapshot.imageUrl ? (
              <ProductImage uri={item.snapshot.imageUrl} size={56} />
            ) : null}
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {item.snapshot.name}
              </AppText>
              <AppText variant="meta" numberOfLines={1}>
                {productSubtitle(item.snapshot)}
              </AppText>
            </View>
            <AppText variant="metaStrong">{formatQty(item.quantityPurchased)}×</AppText>
          </View>
        )}
        ListFooterComponent={
          <View style={{ marginTop: space.lg }}>
            {notBought.length > 0 ? (
              <>
                <AppText variant="eyebrow" style={{ marginBottom: space.sm }}>
                  NÃO COMPRADOS ({notBought.length})
                </AppText>
                {notBought.map((i) => (
                  <AppText key={i.id} variant="meta" style={{ marginBottom: 4 }}>
                    • {i.snapshot.name} {i.snapshot.sizeLabel ? `(${i.snapshot.sizeLabel})` : ''}
                  </AppText>
                ))}
              </>
            ) : null}
          </View>
        }
      />
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg }}>
        <PrimaryButton
          label="Comprar novamente"
          icon={<Repeat size={20} color={colors.white} />}
          onPress={buyAgain}
          loading={busy}
          accessibilityHint="Cria uma nova lista com os mesmos itens; esta compra continua no histórico"
        />
      </View>
    </Screen>
  );
}
