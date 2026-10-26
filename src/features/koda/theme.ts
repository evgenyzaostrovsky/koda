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
  if (!document.getElementById('koda-product-surface')) {
    const style=document.createElement('style');style.id='koda-product-surface';
    style.textContent=`html,body,#root{background:var(--koda-app-bg);color:var(--koda-text)}body{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}::selection{background:#e4f56a;color:#202810}input,textarea{caret-color:var(--koda-accent)}:focus-visible{outline:2px solid var(--koda-accent)!important;outline-offset:3px}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:var(--koda-border-strong);border-radius:20px}::-webkit-scrollbar-track{background:transparent}[role=button]{transition:background-color 160ms ease,opacity 160ms ease}[role=button]:hover{filter:brightness(.97)}[data-testid=goal-roadmap] [role=button],[role=checkbox]{transition:background-color 160ms ease-out,box-shadow 160ms ease-out,transform 160ms ease-out}[data-testid=goal-roadmap] [role=button]:active,[role=checkbox]:active{transform:scale(.98)}[role=progressbar]>div{transition:width 220ms ease-out}@keyframes koda-goal-arrive{from{transform:translateY(3px);filter:drop-shadow(0 1px 2px rgba(26,45,34,.01))}to{transform:translateY(0);filter:drop-shadow(0 8px 18px rgba(26,45,34,.035))}}[data-testid=goal-hero]{animation:koda-goal-arrive 220ms cubic-bezier(.16,1,.3,1)}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
    document.head.appendChild(style);
  }
}

export const accent = 'var(--koda-accent, #3e501b)';
export const bg = 'var(--koda-app-bg, #c5cebd)';
export const sidebarBg = 'var(--koda-sidebar-bg, #d6decd)';
export const headerBg = 'var(--koda-header-bg, #c5cebd)';
export const panel = 'var(--koda-surface-1, #ffffff)';
export const panelSoft = 'var(--koda-surface-2, #f8f9f6)';
export const surfaceElevated = 'var(--koda-surface-3, #eef2ec)';
export const editorBg = 'var(--koda-editor-bg, #fbfcf6)';
export const line = 'var(--koda-border, #cbd3c0)';
export const lineStrong = 'var(--koda-border-strong, #a5b296)';
export const text = 'var(--koda-text, #1b241b)';
export const muted = 'var(--koda-text-secondary, #505e49)';
export const faint = 'var(--koda-text-muted, #596650)';
export const accentSoft = 'var(--koda-accent-soft, #e8efc3)';
export const accentFaint = 'var(--koda-accent-faint, #edf1dd)';
export const accentGlow = 'var(--koda-accent-glow, transparent)';
export const accentBorder = 'var(--koda-accent-border, #a3b467)';
export const activeBg = 'var(--koda-active-bg, #e4f56a)';
export const activeText = 'var(--koda-active-text, #202810)';
export const lime = 'var(--koda-lime, #e4f56a)';
export const ink = 'var(--koda-ink, #19221b)';
export const inkText = 'var(--koda-ink-text, #f4f6e9)';
export const geometry = { card:28, control:16, pill:999, gap:16, page:24 } as const;
export const typography = { page:30, card:24, section:20, body:15, meta:13, label:12 } as const;
export const spacing = { xs:4, sm:8, md:12, lg:16, xl:24, xxl:32 } as const;
export const readingWidths = { notes:960, journal:880, timer:760, chat:960, projects:1120 } as const;
