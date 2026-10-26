import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, space, touch } from '@/theme/tokens';

import { AppText, Notice, SecondaryButton } from './ui';

export type SheetAction = {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Pede confirmação antes de executar (ações que apagam ou somem com dados). */
  confirm?: { title: string; message: string; confirmLabel: string };
  onPress: () => void | Promise<void>;
};

/**
 * Menu de opções que sobe de baixo (abre ao tocar e segurar uma lista).
 * Funciona igual no Android, iOS e web.
 */
export function ActionSheet({ visible, title, actions, onClose }: {
  visible: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<SheetAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setPending(null);
    setBusy(false);
    setError(null);
    onClose();
  }

  async function run(action: SheetAction) {
    if (action.confirm && pending !== action) {
      setPending(action);
      return;
    }
    setBusy(true);
    try {
      await action.onPress();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fechar menu" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        {pending?.confirm ? (
          <>
            <AppText variant="sectionTitle">{pending.confirm.title}</AppText>
            <AppText variant="meta" style={{ marginTop: space.xs, marginBottom: space.lg, fontSize: 14 }}>
              {pending.confirm.message}
            </AppText>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <SecondaryButton label="Cancelar" onPress={close} style={{ flex: 1 }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pending.confirm.confirmLabel}
                onPress={() => run(pending)}
                disabled={busy}
                style={({ pressed }) => [styles.danger, pressed && { opacity: 0.85 }]}>
                {busy ? <ActivityIndicator color={colors.white} /> : null}
                <Text style={styles.dangerLabel}>{pending.confirm.confirmLabel}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <AppText variant="label" numberOfLines={1} style={{ color: colors.muted, marginBottom: space.sm }}>
              {title}
            </AppText>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {actions.map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                onPress={() => run(a)}
                disabled={busy}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.ivory }]}>
                {a.icon}
                <Text style={[styles.optionLabel, a.destructive && { color: colors.error }]}>{a.label}</Text>
              </Pressable>
            ))}
            <SecondaryButton label="Cancelar" onPress={close} style={{ marginTop: space.sm }} />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21, 23, 21, 0.35)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch.min + 8,
    paddingHorizontal: space.sm,
    borderRadius: radii.input,
  },
  optionLabel: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  danger: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.button,
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  dangerLabel: { color: colors.white, fontFamily: fonts.semibold, fontSize: 15 },
});
