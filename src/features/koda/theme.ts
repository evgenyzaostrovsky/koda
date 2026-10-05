import palettes from './themeOptions.json';
import { applyKodaFavicon } from './favicon';
export type KodaThemeId = 'koda-dark' | 'reference-dark';

type KodaTheme = {
  id: KodaThemeId;
  name: string;
  description: string;
  colors: Record<string, string>;
};

export const themeOptions = palettes as KodaTheme[];

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
  try { window.localStorage.setItem('koda:theme:v1', theme.id); } catch {}
  const root = document.documentElement;
  root.dataset.theme = theme.id;

  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  metaThemeColor?.setAttribute('content', theme.colors['--koda-app-bg']);
  applyKodaFavicon(theme.colors);
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
