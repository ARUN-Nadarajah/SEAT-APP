/**
 * SEAT design system — single source of truth for colours, spacing,
 * typography and radii. Mirrors the Figma high-fidelity prototype.
 *
 * Spec §8: warm, calm, food-friendly look.
 */

export const colors = {
  /** Primary — buttons, headers, active tab, queue position card */
  primary: '#1B3D2F',
  primaryMuted: '#2A5544',
  primarySoft: '#E4EDDD',

  /** Accent — icon badges, success checkmarks, highlights */
  accent: '#D4F26B',

  /** Surfaces */
  background: '#F6F4EC',
  surface: '#FFFFFF',
  surfaceAlt: '#FBFAF4',

  /** Soft info / courtesy note boxes */
  infoBox: '#E4EDDD',
  warningBox: '#FFF1CC',

  /** Semantic */
  danger: '#C0392B',
  success: '#2E7D4F',
  warning: '#B7791F',

  /** Text */
  textPrimary: '#14211B',
  textSecondary: '#5F6B64',
  textOnPrimary: '#FFFFFF',
  textMuted: '#8A948E',

  /** Lines */
  border: '#E3E0D5',
  borderStrong: '#CFCCBE',

  /** Feedback */
  overlay: 'rgba(20, 33, 27, 0.45)',
  skeleton: '#EAE7DC',
  skeletonHighlight: '#F3F1E8',
} as const;

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

/** Rounded cards (16–20) per spec. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Typography — elegant serif for large headings (Fraunces),
 * clean sans (Inter) for body. Loaded via expo-google-fonts in _layout.
 */
export const fonts = {
  serifRegular: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  serifSemiBold: 'Fraunces_600SemiBold',
  sansRegular: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

export const type = {
  /** Large serif display — screen hero headings */
  display: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.textPrimary,
  },
  /** Serif screen title */
  title: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  /** Serif section heading */
  heading: {
    fontFamily: fonts.serifMedium,
    fontSize: 19,
    lineHeight: 25,
    color: colors.textPrimary,
  },
  /** Sans body */
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  bodyMedium: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  /** Secondary/supporting copy */
  secondary: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  caption: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  button: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    lineHeight: 20,
    color: colors.textOnPrimary,
  },
  /** Big queue position numeral */
  numeral: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 72,
    lineHeight: 78,
    color: colors.textOnPrimary,
  },
} as const;

/** Minimum tap target (spec §9: 48px). */
export const touch = {
  minTarget: 48,
  buttonHeight: 52,
} as const;

/** Elevation presets for cards. */
export const shadow = {
  card: {
    shadowColor: '#14211B',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#14211B',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
} as const;

export const theme = { colors, spacing, radius, fonts, type, touch, shadow };

export default theme;
