/**
 * Bite design tokens — a single cohesive palette + spacing/typography scale
 * so every screen reads as one app.
 */

export const colors = {
  // Surfaces
  bg: '#FBF7F1', // warm paper
  surface: '#FFFFFF',
  surfaceAlt: '#F6F1E9',
  border: '#ECE3D6',

  // Text
  text: '#3B352E',
  textMuted: '#8B8175',
  textFaint: '#B4AA9C',

  // Brand — warm, appetizing tangerine
  primary: '#E7A17C',
  primaryDark: '#D98A5E',
  primarySoft: '#FBECE1',
  onPrimary: '#FFFFFF',

  // Macro accents
  calories: '#E7A17C',
  protein: '#5FA980',
  carbs: '#D9A64E',
  fat: '#D98A5E',

  // Route badges (the "AI platform" story)
  aggregate: '#4C82D6',
  aggregateSoft: '#E7EEFB',
  semantic: '#9B84E0',
  semanticSoft: '#EFEAFB',
  hybrid: '#46B08A',
  hybridSoft: '#E0F2EC',

  // Source badges
  phone: '#4C82D6',
  phoneSoft: '#E7EEFB',
  glasses: '#9B84E0',
  glassesSoft: '#EFEAFB',
  manual: '#8B8175',
  manualSoft: '#EFEAE1',

  // Feedback
  danger: '#D9776A',
  dangerSoft: '#F8E6E2',
  success: '#5FA980',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const font = {
  h1: 28,
  h2: 22,
  h3: 18,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;
