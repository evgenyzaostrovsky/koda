import palettes from './themeOptions.json';
import { applyKodaFavicon } from './favicon';
export type KodaThemeId = 'calm-light' | 'calm-dark' | 'calm-sky-light' | 'calm-sky-dark' | 'calm-lavender-light' | 'calm-lavender-dark';

type KodaTheme = {
  id: KodaThemeId;
  name: string;
  description: string;
  colors: Record<string, string>;
};

export const themeOptions = palettes as KodaTheme[];

export function resolveKodaThemeId(value: unknown): KodaThemeId {
  if (value === 'koda-dark') return 'calm-dark';
  if (value === 'reference-dark') return 'calm-sky-dark';
  return palettes.some(theme => theme.id === value) ? value as KodaThemeId : 'calm-light';
}

export function getKodaTheme(themeId: unknown) {
  const resolvedThemeId = resolveKodaThemeId(themeId);
  return themeOptions.find((theme) => theme.id === resolvedThemeId) ?? themeOptions[0];
}

export function applyKodaTheme(themeId: unknown) {
  if (typeof document === 'undefined') return;

  const theme = getKodaTheme(themeId);
  try { window.localStorage.setItem('koda:theme:v1', theme.id); } catch {}
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.id.endsWith('dark') ? 'dark' : 'light';

  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  metaThemeColor?.setAttribute('content', theme.colors['--koda-app-bg']);
  applyKodaFavicon(theme.colors);
}

export const accent = 'var(--koda-accent, #416d53)';
export const bg = 'var(--koda-app-bg, #f5f6f2)';
export const sidebarBg = 'var(--koda-sidebar-bg, #ffffff)';
export const headerBg = 'var(--koda-header-bg, #f5f6f2)';
export const panel = 'var(--koda-surface-1, #ffffff)';
export const panelSoft = 'var(--koda-surface-2, #f8f9f6)';
export const surfaceElevated = 'var(--koda-surface-3, #eef2ec)';
export const editorBg = 'var(--koda-editor-bg, #f8f9f6)';
export const line = 'var(--koda-border, #e2e7df)';
export const lineStrong = 'var(--koda-border-strong, #b8c4b8)';
export const text = 'var(--koda-text, #202620)';
export const muted = 'var(--koda-text-secondary, #586457)';
export const faint = 'var(--koda-text-muted, #687267)';
export const accentSoft = 'var(--koda-accent-soft, #e8f0e9)';
export const accentFaint = 'var(--koda-accent-faint, #f0f4ee)';
export const accentGlow = 'var(--koda-accent-glow, transparent)';
export const accentBorder = 'var(--koda-accent-border, #b8c4b8)';
export const activeBg = 'var(--koda-active-bg, #416d53)';
export const activeText = 'var(--koda-active-text, #ffffff)';
