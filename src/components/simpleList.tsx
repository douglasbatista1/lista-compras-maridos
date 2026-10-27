import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ShoppingListItem } from '@/domain/types';
import { colors, fonts, radii, space } from '@/theme/tokens';

import { Plus, Trash } from './icons';
import { CheckState, IconButton, QuantityStepper, formatQty } from './ui';

/**
 * Lista simples: a pessoa escreve o item, escolhe a quantidade (começa em 1) e adiciona.
 * Depois de adicionar, o campo fica vazio e com o cursor, pronto para o próximo item.
 */
export function SimpleItemInput({ onAdd }: { onAdd: (text: string, quantity: number) => Promise<void> | void }) {
  const [text, setText] = useState('');
  const [qty, setQty] = useState(1);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // valor mais recente do campo: ao digitar rápido, o Enter pode chegar antes de a tela
  // atualizar, e o estado `text` ainda estaria com o valor antigo
  const latest = useRef('');

  function change(value: string) {
    latest.current = value;
    setText(value);
  }

  async function submit(fromEvent?: string) {
    const value = (fromEvent ?? latest.current).trim();
    if (!value) return;
    change('');
    inputRef.current?.clear();
    setQty(1);
    inputRef.current?.focus();
    await onAdd(value, qty);
  }

  return (
    <View style={styles.box}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={change}
        placeholder="Escreva um item (ex.: pão francês)"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Novo item da lista"
        returnKeyType="done"
        submitBehavior="submit"
        // react-native-web ignora submitBehavior e tira o foco no Enter; blurOnSubmit evita isso
        {...webKeepFocus}
        onSubmitEditing={(e) => submit(e?.nativeEvent?.text)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={120}
        style={[styles.input, focused && { borderColor: colors.forest }]}
      />
      <View style={styles.row}>
        <QuantityStepper value={qty} onChange={setQty} compact label="Quantidade do item" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar item"
          accessibilityState={{ disabled: !text.trim() }}
          disabled={!text.trim()}
          onPress={() => submit()}
          style={({ pressed }) => [styles.addButton, !text.trim() && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
          <Plus size={18} color={colors.white} />
          <Text style={styles.addLabel}>Adicionar</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Item de lista simples: só texto e quantidade, sem foto. Um toque marca/desmarca. */
export function SimpleListItemRow({ item, editing, onToggle, onQuantity, onRemove }: {
  item: ShoppingListItem;
  editing: boolean;
  onToggle: () => void;
  onQuantity: (q: number) => void;
  onRemove: () => void;
}) {
  const done = item.status === 'purchased';
  const body = (
    <View style={{ flex: 1 }}>
      <Text style={[styles.name, done && styles.doneText]}>{item.snapshot.name}</Text>
      <Text style={styles.qty}>
        {done ? 'Comprado · ' : ''}Qtd. {formatQty(item.quantityRequested)}
      </Text>
    </View>
  );
  if (editing) {
    return (
      <View style={[styles.item, done && styles.itemDone]}>
        {body}
        <QuantityStepper value={item.quantityRequested} onChange={onQuantity} compact />
        <IconButton label={`Remover ${item.snapshot.name}`} onPress={onRemove}>
          <Trash size={20} color={colors.error} />
        </IconButton>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${item.snapshot.name}, quantidade ${formatQty(item.quantityRequested)}`}
      accessibilityHint={done ? 'Toque para marcar como pendente' : 'Toque para marcar como comprado'}
      onPress={onToggle}
      style={({ pressed }) => [styles.item, done && styles.itemDone, pressed && { backgroundColor: colors.softgreen }]}>
      <CheckState checked={done} size={26} />
      {body}
    </Pressable>
  );
}

const webKeepFocus = Platform.OS === 'web' ? ({ blurOnSubmit: false } as object) : {};
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.warmgray,
    padding: space.md,
    gap: space.sm,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: space.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.ivory,
    ...noWebOutline,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  addButton: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: radii.chip,
    backgroundColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addLabel: { color: colors.white, fontFamily: fonts.semibold, fontSize: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.image,
    borderWidth: 1,
    borderColor: colors.warmgray,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: 52,
    marginBottom: 6,
  },
  itemDone: { backgroundColor: colors.softgreen, borderColor: colors.sage },
  name: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.ink },
  doneText: { color: colors.muted, textDecorationLine: 'line-through' },
  qty: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.forest, marginTop: 2 },
});
