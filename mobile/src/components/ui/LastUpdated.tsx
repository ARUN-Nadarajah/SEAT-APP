import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './Text';
import { colors, spacing } from '@/theme';

/**
 * "Last updated" timestamp (NFR03: shown on every availability and queue
 * screen) plus a pulsing live dot where Socket.IO is streaming updates.
 */
export function LastUpdated({
  timestamp,
  live = false,
  label,
  style,
}: {
  timestamp?: string | null;
  live?: boolean;
  label?: string;
  style?: object;
}) {
  const [, force] = useState(0);

  // Re-render every 15s so "Updated 20s ago" never goes stale (FR05).
  useEffect(() => {
    const timer = setInterval(() => force((value) => value + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const text = label || relativeLabel(timestamp);

  return (
    <View style={[styles.row, style]}>
      {live ? <LiveDot /> : null}
      <AppText variant="caption" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

/** Small pulsing dot used next to "Live". */
export function LiveDot({ color = colors.success }: { color?: string }) {
  const opacity = usePulse();
  return <View style={[styles.dot, { backgroundColor: color, opacity }]} />;
}

/** "Last updated 12:04:33" / "Updated just now". */
export function relativeLabel(timestamp?: string | null): string {
  if (!timestamp) return 'Updated just now';

  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return 'Updated just now';

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 10) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;

  const time = new Date(then).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Last updated ${time}`;
}

function usePulse() {
  const [value, setValue] = useState(1);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      timer = setTimeout(() => {
        if (!mounted) return;
        setValue((current) => (current === 1 ? 0.35 : 1));
        tick();
      }, 900);
    };

    tick();

    return () => {
      mounted = false;
      // Clear the pending tick so the test runner can exit cleanly.
      if (timer) clearTimeout(timer);
    };
  }, []);

  return value;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { color: colors.textMuted },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
