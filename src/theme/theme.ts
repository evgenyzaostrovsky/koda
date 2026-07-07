export type ThemeMode = 'light' | 'dark';

export const themes = {
  light: {
    app: '#F3F5FB',
    surface: '#FFFFFF',
    surfaceSoft: '#F6F7FC',
    border: '#E3E7F2',
    text: '#10172D',
    muted: '#66708A',
    label: '#48516B',
    accent: '#6C4DFF',
    accentSoft: '#EEE9FF',
    shadow: '#63708E',
    buttonText: '#FFFFFF',
  },
  dark: {
    app: '#0E1220',
    surface: '#171C2E',
    surfaceSoft: '#20263A',
    border: '#2C344C',
    text: '#F5F7FF',
    muted: '#A6AEC4',
    label: '#CBD2E4',
    accent: '#8B74FF',
    accentSoft: '#282344',
    shadow: '#000000',
    buttonText: '#FFFFFF',
  },
};

export type KodaTheme = (typeof themes)['light'];
