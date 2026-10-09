import { useEffect, useMemo } from 'react';
import { Text, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * Letter-by-letter entrance text (launch screen).
 *
 * Every character fades in while rising `risePx`, staggered by `staggerMs`
 * and offset by `delayMs`. Font styling comes from `style`; the letters only
 * drive opacity and transform, so they inherit the parent's typography.
 *
 * Pass `enabled: false` (reduce-motion) to render the text immediately with
 * no animation at all.
 */
export function AnimatedText({
  text,
  delayMs = 0,
  staggerMs = 40,
  risePx = 12,
  durationMs = 400,
  enabled = true,
  style,
  testID,
}: {
  text: string;
  delayMs?: number;
  staggerMs?: number;
  risePx?: number;
  durationMs?: number;
  enabled?: boolean;
  style?: TextStyle;
  testID?: string;
}) {
  const characters = useMemo(() => Array.from(text), [text]);

  if (!enabled) {
    return (
      <Text style={style} testID={testID}>
        {text}
      </Text>
    );
  }

  return (
    <Text style={style} testID={testID}>
      {characters.map((character, index) => (
        <Letter
          key={`${character}-${index}`}
          character={character}
          delayMs={delayMs + index * staggerMs}
          risePx={risePx}
          durationMs={durationMs}
        />
      ))}
    </Text>
  );
}

function Letter({
  character,
  delayMs,
  risePx,
  durationMs,
}: {
  character: string;
  delayMs: number;
  risePx: number;
  durationMs: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withTiming(1, {
        duration: durationMs,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [delayMs, durationMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * risePx }],
  }));

  // A literal space collapses in a nested Text, so keep it non-breaking.
  const glyph = character === ' ' ? '\u00A0' : character;

  return <Animated.Text style={animatedStyle}>{glyph}</Animated.Text>;
}
