export const authTheme = {
  colors: {
    // Re-mapped to the SEAT design system (spec §8): deep forest green,
    // warm cream, lime accent. Key names kept so existing screens compile.
    burgundy: '#1B3D2F',
    ivory: '#F6F4EC',
    amber: '#D4F26B',
    surface: '#FFFFFF',
    cream: '#E4EDDD',
    text: '#14211B',
    textMuted: '#5F6B64',
    border: '#E3E0D5',
    success: '#2E7D4F',
    warning: '#B7791F',
    error: '#C0392B',
  },
  radius: {
    small: 12,
    medium: 16,
    large: 20,
  },
  shadow: {
    color: '#14211B',
    opacity: 0.08,
    radius: 18,
    offset: { width: 0, height: 10 },
  },
} as const;