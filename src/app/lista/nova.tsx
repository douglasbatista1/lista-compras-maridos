import { router } from 'expo-router';
import { NotebookPen, ShoppingBag } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Field, Notice, PrimaryButton, Screen } from '@/components/ui';
import { useData, useRepo } from '@/data/DataProvider';
import type { ListKind } from '@/domain/types';
import { colors, radii, space } from '@/theme/tokens';

function KindOption({ selected, onPress, icon, title, description }: {
  selected: boolean;
  onPress: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}>
      <View style={[styles.optionIcon, selected && { backgroundColor: colors.forest }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="meta">{description}</AppText>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

export default function NewListScreen() {
  const repo = useRepo();
  const { invalidate } = useData();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('complete');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const list = await repo.createList(name, kind);
      invalidate();
      // completa: vai buscar produtos no catálogo; simples: vai direto escrever os itens
      if (kind === 'complete') router.replace(`/lista/${list.id}/adicionar`);
      else router.replace(`/lista/${list.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a lista.');
      setSaving(false);
    }
  }

  return (
    <Screen edges={['bottom']} scroll>
      <Field
        label="Nome da lista"
        value={name}
        onChangeText={setName}
        placeholder="Ex.: Compras da semana"
        autoFocus
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={() => name.trim() && create()}
      />
      <AppText variant="label" style={{ color: colors.ink, marginBottom: space.sm }}>
        Tipo de lista
      </AppText>
      <View accessibilityRole="radiogroup" style={{ gap: space.sm, marginBottom: space.xl }}>
        <KindOption
          selected={kind === 'complete'}
          onPress={() => setKind('complete')}
          icon={<ShoppingBag size={22} color={kind === 'complete' ? colors.white : colors.forest} />}
          title="Lista completa"
          description="Produtos do catálogo com foto, marca e tamanho."
        />
        <KindOption
          selected={kind === 'simple'}
          onPress={() => setKind('simple')}
          icon={<NotebookPen size={22} color={kind === 'simple' ? colors.white : colors.forest} />}
          title="Lista simples"
          description="Você escreve o que precisa. Sem fotos e sem busca."
        />
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <PrimaryButton
        label={kind === 'complete' ? 'Criar e adicionar produtos' : 'Criar lista simples'}
        onPress={create}
        disabled={!name.trim()}
        loading={saving}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  optionSelected: { borderColor: colors.forest, borderWidth: 2, backgroundColor: colors.softgreen },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.image,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.forest },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.forest },
});
