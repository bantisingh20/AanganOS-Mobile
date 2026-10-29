import React, { useId } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '@/theme';

export interface AppTextFieldProps
  extends Pick<
    TextInputProps,
    | 'value'
    | 'onChangeText'
    | 'placeholder'
    | 'secureTextEntry'
    | 'keyboardType'
    | 'autoCapitalize'
    | 'autoComplete'
    | 'textContentType'
    | 'editable'
    | 'onBlur'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'multiline'
    | 'numberOfLines'
  > {
  /** Visible label; also used as the accessibility label. Required for accessibility (Req 65.6). */
  label: string;
  /** Mark the field required — appends a red "*" and flags the input required to assistive tech. */
  required?: boolean;
  /** Validation/error message; announced and styled when present. */
  error?: string;
  testID?: string;
}

/**
 * Accessible labelled text field (Req 65.6): a visible `<Text>` label, the input exposed to
 * assistive tech with that label and an invalid state, an inline error, and a ≥44pt touch target.
 * Both apps use this instead of a bare `TextInput`.
 */
export function AppTextField({ label, required = false, error, testID, ...inputProps }: AppTextFieldProps) {
  const labelId = useId();
  const hasError = Boolean(error);
  return (
    <View style={styles.container}>
      <Text nativeID={labelId} style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        {...inputProps}
        testID={testID}
        accessibilityLabel={required ? `${label}, required` : label}
        accessibilityLabelledBy={labelId}
        accessibilityState={{ disabled: inputProps.editable === false }}
        placeholderTextColor={theme.color.mutedText}
        textAlignVertical={inputProps.multiline ? 'top' : undefined}
        style={[styles.input, inputProps.multiline ? styles.inputMultiline : null, hasError ? styles.inputError : null]}
      />
      {hasError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  label: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  required: { color: theme.color.danger, fontWeight: '800' },
  input: {
    minHeight: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.body,
    color: theme.color.text,
  },
  inputError: { borderColor: theme.color.danger },
  // A roomier box for multi-line text (e.g. an announcement body); text starts at the top.
  inputMultiline: { minHeight: 110, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  error: { fontSize: theme.fontSize.label, color: theme.color.danger },
});
