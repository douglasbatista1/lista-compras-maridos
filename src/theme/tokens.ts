/**
 * Ponto central da identidade visual. Os valores vêm do arquivo oficial
 * assets/brand/design_tokens.json (cópia do kit de marca) — não espalhe cores pelas telas.
 */
import brand from '../../assets/brand/design_tokens.json';

export const colors = {
  forest: brand.colors.forest,
  sage: brand.colors.sage,
  ink: brand.colors.ink,
  ivory: brand.colors.ivory,
  white: brand.colors.white,
  warmgray: brand.colors.warmgray,
  muted: brand.colors.muted,
  line: brand.colors.line,
  softgreen: brand.colors.softgreen,
  success: brand.colors.success,
  warning: brand.colors.warning,
  error: brand.colors.error,
  /** Fundo de alerta de erro: tom claro derivado de `error` (não existe no kit). */
  errorSoft: '#F6E3E1',
} as const;

/** Escala oficial: 4 / 8 / 12 / 16 / 24 / 32. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Raios dentro das faixas do brand book (cards 12-16, botão principal 14-18, chip 999). */
export const radii = {
  card: 14,
  button: 16,
  input: 14,
  chip: 999,
  image: 12,
} as const;

/** Inter, carregada via @expo-google-fonts/inter (licença SIL OFL). */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Tamanhos: título de tela 24-28, corpo 15-16, metadados 12-13. */
export const type = {
  screenTitle: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.ink, letterSpacing: -0.5 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  metaStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.forest },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.forest, letterSpacing: 1.2 },
} as const;

/** Alvo mínimo de toque confortável para uso com uma mão. */
export const touch = {
  min: 44,
  primaryButtonHeight: 52,
} as const;

export const tagline = brand.tagline;
export const shortTagline = brand.short_tagline;
