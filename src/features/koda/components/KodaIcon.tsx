import Svg, { Path, Circle, Rect } from 'react-native-svg';
import type { TabKey } from '../types';
import { accent } from '../theme';

/** KODA Calm: an original 24-unit icon family with soft, open contours. */
export function KodaIcon({ name, size = 22, color = accent }: { name: TabKey | 'brand'; size?: number; color?: string }) {
  const shapes = {
    planner: <><Rect x="4" y="5" width="16" height="15" rx="4"/><Path d="M8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2"/></>,
    goals: <><Circle cx="12" cy="12" r="8.5"/><Path d="M17 5 12 12m2-8 4 .5.5 4M15 12a3 3 0 1 1-3-3"/></>,
    projects: <><Path d="M3 8a3 3 0 0 1 3-3h4l2 3h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/><Path d="M8 12v5m4-5v3m4-3v5"/></>,
    notes: <><Rect x="5" y="3" width="15" height="18" rx="4"/><Path d="M3 7h4M3 12h4M3 17h4m3-10h6m-6 4h6m-6 4h4"/></>,
    journal: <><Path d="M12 6C9 3 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-2-9 1Zm0 0v14m-6-11 3 1m6 0 3-1"/></>,
    habits: <><Path d="M5 18c1-7 6-11 14-12-1 8-5 12-12 12m0 2c1-4 4-7 8-10"/></>,
    timer: <><Circle cx="12" cy="13" r="8"/><Path d="M9 2h6m-3 0v3m6 1 2-2m-8 5v5l3 2"/></>,
    progress: <><Path d="M4 4v13a3 3 0 0 0 3 3h13M8 15l4-5 4 2 4-6M17 6h3v3"/></>,
    profile: <><Circle cx="12" cy="8" r="4"/><Path d="M4 21v-2a6 6 0 0 1 6-5h4a6 6 0 0 1 6 5v2"/></>,
    koda: <><Path d="M20 12c0 5-4 8-8 8H5l-2 2v-9a9 9 0 0 1 9-9m6-2v6m-3-3h6M8 11h5m-5 4h8"/></>,
    brand: <><Path d="M4 17c3-6 5-7 8-4s5 1 8-3M5 21h14M5 8l3-3 3 3"/><Circle cx="17" cy="6" r="2"/></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{shapes[name]}</Svg>;
}
