import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { KodaTheme } from '../theme/theme';

type Props = {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  theme: KodaTheme;
  onPress: () => void;
};

export function PrimaryButton({ compact, disabled, label, theme, onPress }: Props) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.compactButton,
        { backgroundColor: theme.accent },
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.primaryButtonText, { color: theme.buttonText }]}>{label}</Text>
      {!disabled && <ArrowRight size={21} color={theme.buttonText} strokeWidth={2.4} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  compactButton: {
    flex: 1,
    minHeight: 50,
  },
  disabledButton: {
    opacity: 0.42,
  },
  pressedButton: {
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
