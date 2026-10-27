import { Image } from 'expo-image';
import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii, space, touch, type } from '@/theme/tokens';

import { Check, Info, Minus, Package, Plus, Search, X } from './icons';

// ---------------------------------------------------------------- Texto e tela

type Variant = keyof typeof type;

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[type[variant], style]} />;
}

export function Screen({ children, scroll = false, edges = ['top'] as const }: {
  children: ReactNode;
  scroll?: boolean;
  edges?: readonly ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        <AppText variant="screenTitle" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText variant="meta" style={{ marginTop: 2, fontSize: 15 }}>{subtitle}</AppText> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="eyebrow" style={{ marginTop: space.xl, marginBottom: space.sm }}>
      {children.toUpperCase()}
    </AppText>
  );
}

// ---------------------------------------------------------------- Botões

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function PrimaryButton({ label, onPress, icon, disabled, loading, style, accessibilityHint }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }, inactive && styles.disabled, style]}>
      {loading ? <ActivityIndicator color={colors.white} /> : icon}
      <Text style={styles.primaryLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon, disabled, loading, style, accessibilityHint }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && { backgroundColor: colors.warmgray }, inactive && styles.disabled, style]}>
      {loading ? <ActivityIndicator color={colors.forest} /> : icon}
      <Text style={styles.secondaryLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ onPress, label, children, style }: {
  onPress: () => void;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.warmgray }, style]}>
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Entradas

export function SearchInput({ value, onChangeText, placeholder = 'Buscar produto, marca ou tamanho', autoFocus, loading, ref }: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  loading?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, focused && { borderColor: colors.forest }]}>
      <Search size={20} color={colors.muted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Buscar produtos"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.searchInput}
      />
      {loading ? <ActivityIndicator size="small" color={colors.muted} /> : null}
      {value && !loading ? (
        <IconButton label="Limpar busca" onPress={() => onChangeText('')} style={{ width: 32, height: 32 }}>
          <X size={18} color={colors.muted} />
        </IconButton>
      ) : null}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.lg }}>
      <AppText variant="label" style={{ marginBottom: space.xs, color: colors.ink }}>
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.field, focused && { borderColor: colors.forest, borderWidth: 2 }, props.style]}
      />
    </View>
  );
}

export function CategoryChips({ options, value, onChange }: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const all = [null, ...options];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: space.sm }}>
      {all.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt ?? '__todos'}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt)}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipLabel, selected && { color: colors.white }]}>{opt ?? 'Todos'}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function QuantityStepper({ value, onChange, min = 1, label = 'Quantidade', compact }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
  compact?: boolean;
}) {
  const btn = compact ? { width: 38, height: 38 } : undefined;
  // só a primeira letra em minúscula, para preservar nomes de produto
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  return (
    <View style={styles.stepper} accessibilityLabel={`${label}: ${value}`}>
      <IconButton label={`Diminuir ${lower}`} onPress={() => onChange(Math.max(min, value - 1))} style={btn}>
        <Minus size={18} color={value <= min ? colors.muted : colors.ink} />
      </IconButton>
      <Text style={[styles.stepperValue, compact && { minWidth: 22, fontSize: 15 }]}>{formatQty(value)}</Text>
      <IconButton label={`Aumentar ${lower}`} onPress={() => onChange(Math.min(999, value + 1))} style={btn}>
        <Plus size={18} color={colors.ink} />
      </IconButton>
    </View>
  );
}

export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// ---------------------------------------------------------------- Estados

export function CheckState({ checked, size = 28 }: { checked: boolean; size?: number }) {
  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: size / 2 },
        checked ? { backgroundColor: colors.forest, borderColor: colors.forest } : null,
      ]}>
      {checked ? <Check size={size * 0.6} color={colors.white} strokeWidth={3} /> : null}
    </View>
  );
}

export function ProgressIndicator({ done, total, compact }: { done: number; total: number; compact?: boolean }) {
  const ratio = total === 0 ? 0 : done / total;
  const pct = Math.round(ratio * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done, text: `${done} de ${total} itens comprados` }}
      style={compact ? undefined : styles.progressBox}>
      <View style={styles.progressHead}>
        <AppText variant={compact ? 'meta' : 'label'} style={!compact ? { color: colors.ink } : undefined}>
          {done} de {total} {total === 1 ? 'item comprado' : 'itens comprados'}
        </AppText>
        <AppText variant="metaStrong">{pct}%</AppText>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon ?? <Package size={28} color={colors.forest} />}</View>
      <AppText variant="sectionTitle" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="meta" style={{ textAlign: 'center', fontSize: 15, marginTop: space.xs }}>
        {message}
      </AppText>
      {action ? <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'demo' }) {
  const bg = tone === 'error' ? colors.errorSoft : tone === 'demo' ? colors.softgreen : colors.white;
  const fg = tone === 'error' ? colors.error : colors.forest;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <Info size={18} color={fg} style={{ marginTop: 1 }} />
      <AppText variant="meta" style={{ flex: 1, color: tone === 'error' ? colors.error : colors.ink }}>
        {children}
      </AppText>
    </View>
  );
}

export function Card({ children, style, onPress, onLongPress, accessibilityLabel }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Tocar e segurar: abre opções (editar, excluir...). */
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onLongPress ? 'Toque e segure para ver mais opções' : undefined}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Mais opções' }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onLongPress?.()}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.ivory }, style]}>
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Imagem de produto

export function ProductImage({ uri, size = 64 }: { uri: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.image, { width: size, height: size }]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={{ width: size - 8, height: size - 8 }}
          contentFit="contain"
          transition={120}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Package size={size * 0.4} color={colors.forest} />
      )}
    </View>
  );
}

/** Web: remove o contorno padrão do navegador; o foco é indicado pela borda verde. */
const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ivory },
  scrollContent: { padding: space.lg, paddingBottom: space.xxl * 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  primary: {
    minHeight: touch.primaryButtonHeight,
    borderRadius: radii.button,
    backgroundColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  primaryLabel: { color: colors.white, fontFamily: fonts.semibold, fontSize: 16 },
  secondary: {
    minHeight: 48,
    borderRadius: radii.button,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  secondaryLabel: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  disabled: { opacity: 0.45 },
  iconButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: space.md,
    minHeight: 50,
  },
  // a borda do contêiner indica o foco; sem o contorno padrão do navegador
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: space.md, ...noWebOutline },
  field: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: space.md,
    minHeight: 48,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    ...noWebOutline,
  },
  chip: {
    paddingHorizontal: space.lg,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radii.chip,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ivory,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepperValue: { minWidth: 28, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  check: { borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  progressBox: { backgroundColor: colors.softgreen, borderRadius: radii.card, padding: space.lg },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.warmgray, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.forest },
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.warmgray,
    padding: space.lg,
  },
  image: {
    borderRadius: radii.image,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
