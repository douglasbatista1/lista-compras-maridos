import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { progressOf } from '@/domain/lists';
import { productSubtitle } from '@/domain/search';
import type { AnyProduct, ShoppingList, ShoppingListItem } from '@/domain/types';
import { colors, fonts, radii, space } from '@/theme/tokens';

import { ChevronRight, Plus, Trash } from './icons';
import { AppText, Card, CheckState, IconButton, ProductImage, ProgressIndicator, QuantityStepper, formatQty } from './ui';

/**
 * Resultado de busca: foto, nome completo, marca, variante, tamanho, quantidade
 * (começa em 1) e ação explícita "Adicionar".
 */
export function ProductCard({ product, added, onAdd }: {
  product: AnyProduct;
  added: number;
  onAdd: (quantity: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const subtitle = productSubtitle(product);
  const meta = product.kind === 'family' ? 'Cadastrado pela família' : product.category ?? product.department;
  return (
    <View style={styles.productCard}>
      <ProductImage uri={product.imageUrl} size={72} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={3}>
          {product.name}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" numberOfLines={1} style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        ) : null}
        <AppText variant="metaStrong" numberOfLines={1} style={{ marginTop: 2, fontSize: 12 }}>
          {[meta, added > 0 ? `Já na lista: ${formatQty(added)}` : null].filter(Boolean).join(' · ')}
        </AppText>
        <View style={styles.cardFooter}>
          <QuantityStepper value={qty} onChange={setQty} compact label={`Quantidade de ${product.name}`} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Adicionar ${formatQty(qty)} ${product.name}`}
            onPress={() => {
              onAdd(qty);
              setQty(1);
            }}
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.8 }]}>
            <Plus size={18} color={colors.white} />
            <Text style={styles.addLabel}>Adicionar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Linha do checklist, compacta: foto maior, texto menor e todas as informações.
 * Um toque alterna pendente/comprado; o estado nunca depende só da cor.
 */
export function ShoppingListItemRow({ item, editing, onToggle, onQuantity, onRemove }: {
  item: ShoppingListItem;
  editing: boolean;
  onToggle: () => void;
  onQuantity: (q: number) => void;
  onRemove: () => void;
}) {
  const done = item.status === 'purchased';
  const s = item.snapshot;
  const subtitle = productSubtitle(s);
  const body = (
    <>
      <ProductImage uri={s.imageUrl} size={76} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemName, done && styles.doneText]}>{s.name}</Text>
        {subtitle ? <Text style={styles.itemMeta}>{subtitle}</Text> : null}
        <Text style={styles.itemQty}>
          {done ? 'Comprado · ' : ''}Qtd. {formatQty(item.quantityRequested)}
        </Text>
      </View>
    </>
  );
  if (editing) {
    return (
      <View style={[styles.itemRow, done && styles.itemDone]}>
        {body}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <QuantityStepper value={item.quantityRequested} onChange={onQuantity} compact />
          <IconButton label={`Remover ${s.name}`} onPress={onRemove}>
            <Trash size={20} color={colors.error} />
          </IconButton>
        </View>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${s.name}, ${subtitle}, quantidade ${formatQty(item.quantityRequested)}`}
      accessibilityHint={done ? 'Toque para marcar como pendente' : 'Toque para marcar como comprado'}
      onPress={onToggle}
      style={({ pressed }) => [styles.itemRow, done && styles.itemDone, pressed && { backgroundColor: colors.softgreen }]}>
      {body}
      <CheckState checked={done} size={26} />
    </Pressable>
  );
}

export function ListCard({ list, onPress, onLongPress }: { list: ShoppingList; onPress: () => void; onLongPress?: () => void }) {
  const p = progressOf(list);
  const sent = Boolean(list.sentAt);
  return (
    <Card onPress={onPress} onLongPress={onLongPress} accessibilityLabel={`Abrir ${list.name}`} style={{ marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{list.name}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={[styles.badge, sent ? styles.badgeSent : null]}>
              <Text style={[styles.badgeLabel, sent ? { color: colors.forest } : null]}>
                {sent ? 'Pronta para comprar' : 'Em preparação'}
              </Text>
            </View>
            <AppText variant="meta">
              {list.kind === 'simple' ? 'simples · ' : ''}
              {p.total === 0 ? 'vazia' : `${p.total} ${p.total === 1 ? 'item' : 'itens'}`}
            </AppText>
          </View>
        </View>
        <ChevronRight size={20} color={colors.muted} />
      </View>
      {p.total > 0 ? <ProgressIndicator done={p.done} total={p.total} compact /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  productCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.warmgray,
    padding: space.md,
    marginBottom: space.sm,
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.sm },
  addButton: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radii.chip,
    backgroundColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addLabel: { color: colors.white, fontFamily: fonts.semibold, fontSize: 14 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radii.image,
    borderWidth: 1,
    borderColor: colors.warmgray,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: space.md,
    marginBottom: 6,
  },
  itemDone: { backgroundColor: colors.softgreen, borderColor: colors.sage },
  itemName: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.ink },
  itemMeta: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted, marginTop: 1 },
  itemQty: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.forest, marginTop: 2 },
  doneText: { color: colors.muted },
  badge: { borderRadius: radii.chip, backgroundColor: colors.warmgray, paddingHorizontal: space.sm, paddingVertical: 2 },
  badgeSent: { backgroundColor: colors.sage },
  badgeLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
});
