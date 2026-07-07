import { Moon, Sparkles, Sun } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AiMode } from '../types/koda';
import type { KodaTheme, ThemeMode } from '../theme/theme';

type Props = {
  aiMode: AiMode;
  theme: KodaTheme;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

export function Header({ aiMode, theme, themeMode, onToggleTheme }: Props) {
  const Icon = themeMode === 'dark' ? Sun : Moon;
  const aiLabel = aiMode === 'gemini' ? 'Gemini' : aiMode === 'openrouter' ? 'Router' : aiMode === 'checking' ? '...' : 'rules';

  return (
    <View style={styles.topBar}>
      <View style={styles.brand}>
        <View style={[styles.logoMark, { backgroundColor: theme.accentSoft }]}>
          <Sparkles size={20} color={theme.accent} strokeWidth={2.3} />
        </View>
        <Text style={[styles.logoText, { color: theme.text }]}>KODA</Text>
        <View style={[styles.aiPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.aiPillText, { color: aiMode === 'gemini' || aiMode === 'openrouter' ? theme.accent : theme.muted }]}>{aiLabel}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Переключить тему"
        onPress={onToggleTheme}
        style={({ pressed }) => [
          styles.themeButton,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && { opacity: 0.78 },
        ]}
      >
        <Icon size={20} color={theme.text} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoMark: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
  },
  aiPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiPillText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  themeButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
});
