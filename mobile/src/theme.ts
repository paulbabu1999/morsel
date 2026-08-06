/**
 * Morsel design tokens — a single cohesive palette + spacing/typography scale
 * so every screen reads as one app.
 */

export const colors = {
  // Surfaces
  bg: '#F6F5F1', // warm paper
  surface: '#FFFFFF',
  surfaceAlt: '#F1EFE9',
  border: '#E8E5DC',

  // Text
  text: '#1B1D1A',
  textMuted: '#6C7268',
  textFaint: '#9AA096',

  // Brand — warm, appetizing tangerine
  primary: '#E4572E',
  primaryDark: '#C7431F',
  primarySoft: '#FBE7DF',
  onPrimary: '#FFFFFF',

  // Macro accents
  calories: '#E4572E',
  protein: '#2E7D5B',
  carbs: '#C9902B',
  fat: '#B5562E',

  // Route badges (the "AI platform" story)
  aggregate: '#2563EB',
  aggregateSoft: '#E1EBFF',
  semantic: '#7C3AED',
  semanticSoft: '#EEE6FF',
  hybrid: '#0F9488',
  hybridSoft: '#D9F2EF',

  // Source badges
  phone: '#3B7A57',
  phoneSoft: '#E1F0E8',
  glasses: '#7C3AED',
  glassesSoft: '#EEE6FF',
  manual: '#6C7268',
  manualSoft: '#EDEBE4',

  // Feedback
  danger: '#C0392B',
  dangerSoft: '#FBE4E1',
  success: '#2E7D5B',
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
