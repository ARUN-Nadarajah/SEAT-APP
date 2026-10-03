import { colors, fonts, radius, spacing, touch, type } from '../index';

/**
 * Design-system contract (spec §8).
 *
 * These values come straight from the brief, so this suite doubles as a
 * regression guard against accidental re-theming.
 */
describe('theme — colours (spec §8)', () => {
  test('uses the specified primary, accent and background', () => {
    expect(colors.primary).toBe('#1B3D2F'); // deep forest green
    expect(colors.accent).toBe('#D4F26B'); // lime
    expect(colors.background).toBe('#F6F4EC'); // warm cream
    expect(colors.surface).toBe('#FFFFFF');
  });

  test('uses the specified soft boxes, danger and success', () => {
    expect(colors.infoBox).toBe('#E4EDDD');
    expect(colors.warningBox).toBe('#FFF1CC');
    expect(colors.danger).toBe('#C0392B');
    expect(colors.success).toBe('#2E7D4F');
  });

  test('uses the specified text and border colours', () => {
    expect(colors.textPrimary).toBe('#14211B');
    expect(colors.textSecondary).toBe('#5F6B64');
    expect(colors.border).toBe('#E3E0D5');
  });

  test('body text contrast stays above 4.5:1 on the cream background', () => {
    expect(contrastRatio(colors.textPrimary, colors.background)).toBeGreaterThan(4.5);
    expect(contrastRatio(colors.textSecondary, colors.background)).toBeGreaterThan(4.5);
    expect(contrastRatio(colors.textOnPrimary, colors.primary)).toBeGreaterThan(4.5);
  });
});

describe('theme — typography (spec §8)', () => {
  test('serif for headings, sans for body', () => {
    expect(fonts.serifSemiBold).toBe('Fraunces_600SemiBold');
    expect(fonts.sansRegular).toBe('Inter_400Regular');
    expect(type.display.fontFamily).toBe(fonts.serifSemiBold);
    expect(type.body.fontFamily).toBe(fonts.sansRegular);
  });
});

describe('theme — shape and ergonomics (spec §8, §9)', () => {
  test('cards use the specified 16–20 radius', () => {
    expect(radius.lg).toBe(16);
    expect(radius.xl).toBe(20);
    expect(radius.lg).toBeGreaterThanOrEqual(16);
    expect(radius.xl).toBeLessThanOrEqual(20);
  });

  test('tap targets and buttons meet the 48px minimum', () => {
    expect(touch.minTarget).toBeGreaterThanOrEqual(48);
    expect(touch.buttonHeight).toBeGreaterThanOrEqual(48);
  });

  test('spacing follows a 4pt scale', () => {
    Object.values(spacing).forEach((value) => {
      expect(value % 4).toBe(0);
    });
  });
});

/** WCAG relative luminance contrast ratio. */
function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const a = lum(hexA);
  const b = lum(hexB);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}
