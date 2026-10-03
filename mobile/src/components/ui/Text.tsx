import { StyleSheet, Text, type TextProps } from 'react-native';

import { type } from '@/theme';

type Variant = keyof typeof type;

/**
 * Typography primitive.
 *
 * Maps the theme's serif-display / sans-body styles onto a single element so
 * screens never hard-code font sizes (spec §8).
 */
export function AppText({
  variant = 'body',
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant; children?: React.ReactNode }) {
  return (
    <Text
      style={[styles[variant], style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** Convenience aliases used across screens. */
export const Display = (props: TextProps) => <AppText variant="display" {...props} />;
export const Title = (props: TextProps) => <AppText variant="title" {...props} />;
export const Heading = (props: TextProps) => <AppText variant="heading" {...props} />;
export const Body = (props: TextProps) => <AppText variant="body" {...props} />;
export const Secondary = (props: TextProps) => <AppText variant="secondary" {...props} />;
export const Label = (props: TextProps) => <AppText variant="label" {...props} />;
export const Caption = (props: TextProps) => <AppText variant="caption" {...props} />;

const styles = StyleSheet.create({
  display: type.display,
  title: type.title,
  heading: type.heading,
  body: type.body,
  bodyMedium: type.bodyMedium,
  secondary: type.secondary,
  label: type.label,
  caption: type.caption,
  button: type.button,
  numeral: type.numeral,
});
