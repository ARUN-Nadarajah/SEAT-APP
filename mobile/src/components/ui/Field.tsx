import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { AppText } from './Text';
import { colors, radius, spacing, touch } from '@/theme';

/**
 * Labelled text input with inline error (spec §10: form validation with
 * inline error messages). Errors are announced via accessibilityHint so the
 * message is not conveyed by colour alone (spec §9).
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  editable = true,
  multiline = false,
  returnKeyType,
  onSubmitEditing,
  maxLength,
  leftAccessory,
  rightAccessory,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  multiline?: boolean;
  returnKeyType?: 'done' | 'go' | 'next' | 'send';
  onSubmitEditing?: () => void;
  maxLength?: number;
  leftAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  testID?: string;
}) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>

      <View
        style={[
          styles.inputShell,
          Boolean(error) && styles.inputShellError,
          !editable && styles.inputShellDisabled,
          multiline && styles.multilineShell,
        ]}
      >
        {leftAccessory}
        <TextInput
          style={[styles.input, multiline && styles.multilineInput]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={editable}
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          testID={testID}
        />
        {rightAccessory}
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((current) => !current)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <AppText variant="label" style={styles.reveal}>
              {hidden ? 'Show' : 'Hide'}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <AppText variant="caption" style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { color: colors.textSecondary, textTransform: 'none' },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.minTarget,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  multilineShell: { alignItems: 'flex-start', paddingVertical: spacing.md },
  inputShellError: { borderColor: colors.danger },
  inputShellDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  input: {
    flex: 1,
    minHeight: 44,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  multilineInput: { minHeight: 92, textAlignVertical: 'top' },
  reveal: { color: colors.primary },
  error: { color: colors.danger },
  hint: { color: colors.textMuted },
});
