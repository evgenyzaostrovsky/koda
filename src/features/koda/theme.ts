export type KodaThemeId = 'koda-dark' | 'reference-dark';

type KodaTheme = {
  id: KodaThemeId;
  name: string;
  description: string;
  colors: Record<string, string>;
};

export const themeOptions: KodaTheme[] = [
  {
    id: 'koda-dark',
    name: 'KODA Dark',
    description: 'Текущая черно-оранжевая схема',
    colors: {
      '--koda-app-bg': '#050605',
      '--koda-sidebar-bg': '#080908',
      '--koda-header-bg': '#070807',
      '--koda-surface-1': '#090a09',
      '--koda-surface-2': '#101110',
      '--koda-surface-3': '#171817',
      '--koda-editor-bg': '#151615',
      '--koda-border': '#333433',
      '--koda-border-strong': '#424342',
      '--koda-text': '#e3e3e3',
      '--koda-text-secondary': '#8e8f8e',
      '--koda-text-muted': '#5d5e5d',
      '--koda-accent': '#f26419',
      '--koda-accent-soft': 'rgba(242, 100, 25, 0.18)',
      '--koda-accent-faint': 'rgba(242, 100, 25, 0.08)',
      '--koda-accent-glow': 'rgba(242, 100, 25, 0.32)',
      '--koda-accent-border': 'rgba(242, 100, 25, 0.44)',
      '--koda-active-bg': '#f26419',
      '--koda-active-text': '#050605',
      '--koda-success': '#60b98a',
      '--koda-success-soft': '#16251e',
      '--koda-error': '#d97875',
      '--koda-error-soft': '#2b1919',
      '--koda-warning': '#d3a05e',
    },
  },
  {
    id: 'reference-dark',
    name: 'Reference Dark',
    description: 'Темная схема с синим акцентом',
    colors: {
      '--koda-app-bg': '#101010',
      '--koda-sidebar-bg': '#0d0d0d',
      '--koda-header-bg': '#121212',
      '--koda-surface-1': '#171717',
      '--koda-surface-2': '#1c1c1c',
      '--koda-surface-3': '#242424',
      '--koda-editor-bg': '#333333',
      '--koda-border': '#303030',
      '--koda-border-strong': '#414141',
      '--koda-text': '#f5f5f5',
      '--koda-text-secondary': '#a2a2a2',
      '--koda-text-muted': '#747474',
      '--koda-accent': '#2f7df6',
      '--koda-accent-soft': '#15243d',
      '--koda-accent-faint': 'rgba(47, 125, 246, 0.10)',
      '--koda-accent-glow': 'rgba(47, 125, 246, 0.34)',
      '--koda-accent-border': 'rgba(47, 125, 246, 0.46)',
      '--koda-active-bg': '#f1f1f1',
      '--koda-active-text': '#111111',
      '--koda-success': '#60b98a',
      '--koda-success-soft': '#16251e',
      '--koda-error': '#d97875',
      '--koda-error-soft': '#2b1919',
      '--koda-warning': '#d3a05e',
    },
  },
];

export function resolveKodaThemeId(value: unknown): KodaThemeId {
  return value === 'reference-dark' ? 'reference-dark' : 'koda-dark';
}

export function getKodaTheme(themeId: unknown) {
  const resolvedThemeId = resolveKodaThemeId(themeId);
  return themeOptions.find((theme) => theme.id === resolvedThemeId) ?? themeOptions[0];
}

export function applyKodaTheme(themeId: unknown) {
  if (typeof document === 'undefined') return;

  const theme = getKodaTheme(themeId);
  const root = document.documentElement;
  root.dataset.theme = theme.id;

  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  metaThemeColor?.setAttribute('content', theme.colors['--koda-app-bg']);
}

export const accent = 'var(--koda-accent, #f26419)';
export const bg = 'var(--koda-app-bg, #050605)';
export const sidebarBg = 'var(--koda-sidebar-bg, #080908)';
export const headerBg = 'var(--koda-header-bg, #070807)';
export const panel = 'var(--koda-surface-1, #090a09)';
export const panelSoft = 'var(--koda-surface-2, #101110)';
export const surfaceElevated = 'var(--koda-surface-3, #171817)';
export const editorBg = 'var(--koda-editor-bg, #151615)';
export const line = 'var(--koda-border, #333433)';
export const lineStrong = 'var(--koda-border-strong, #424342)';
export const text = 'var(--koda-text, #e3e3e3)';
export const muted = 'var(--koda-text-secondary, #8e8f8e)';
export const faint = 'var(--koda-text-muted, #5d5e5d)';
export const accentSoft = 'var(--koda-accent-soft, rgba(242, 100, 25, 0.18))';
export const accentFaint = 'var(--koda-accent-faint, rgba(242, 100, 25, 0.08))';
export const accentGlow = 'var(--koda-accent-glow, rgba(242, 100, 25, 0.32))';
export const accentBorder = 'var(--koda-accent-border, rgba(242, 100, 25, 0.44))';
export const activeBg = 'var(--koda-active-bg, #f26419)';
export const activeText = 'var(--koda-active-text, #050605)';
