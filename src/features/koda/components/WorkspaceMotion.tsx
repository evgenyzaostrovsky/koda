import { Platform } from 'react-native';

/** Motion changes paint only: measured widget geometry and drag targets stay stable. */
export function WorkspaceMotion() {
 if (Platform.OS !== 'web') return null;
 return <style>{`
 [data-testid="bento-app-shell"] :is([role="button"],button,[role="checkbox"]) {
   transition: transform 150ms cubic-bezier(.2,.8,.2,1), background-color 150ms ease, box-shadow 150ms ease;
 }
 [data-testid="bento-app-shell"] :is([role="button"],button,[role="checkbox"]):focus-visible {
   outline: 2px solid #536d36; outline-offset: 3px;
 }
 [data-testid="bento-app-shell"] :is([role="button"],button,[role="checkbox"]):not(:disabled):not([aria-disabled="true"]):active {
   transform: scale(.97);
 }
 [data-testid="bento-app-shell"] [role="progressbar"] > div {
   transition: width 350ms cubic-bezier(.16,1,.3,1), background-color 180ms ease;
 }
 [data-testid="workspace-panel"] { animation: koda-panel-reveal 200ms cubic-bezier(.16,1,.3,1) both; transform-origin: top; }
 [data-testid="workspace-content"] { animation: koda-page-reveal 260ms cubic-bezier(.16,1,.3,1) both; }
 [data-widget-slot] > [data-testid^="widget-"] { transition: transform 200ms cubic-bezier(.2,.8,.2,1), filter 200ms ease; }
 [data-testid="bento-app-shell"] [role="checkbox"][aria-checked="true"] > div:first-child { animation: koda-check-confirm 180ms ease-out; }
 @media (hover:hover) and (pointer:fine) {
   [data-testid="bento-app-shell"] :is([role="button"],button,[role="checkbox"]):not(:disabled):not([aria-disabled="true"]):hover:not(:active) {
     box-shadow: 0 3px 9px rgba(28,46,30,.09); transform: translateY(-1px);
   }
   [data-testid="widget-drag-grid"]:not([data-drag-active="true"]) [data-widget-slot]:hover > [data-testid^="widget-"] {
     transform: translateY(-3px); filter: drop-shadow(0 10px 16px rgba(26,45,34,.13));
   }
   [data-testid="bento-app-shell"] :is([role="button"],button):has(> div):hover > svg:last-child { translate: 2px 0; }
 }
 [data-testid="bento-app-shell"] :is([role="button"],button) > svg:last-child { transition: translate 160ms ease; }
 [data-drag-active="true"] [data-widget-slot] > [data-testid^="widget-"] { transition: none; transform: none; }
 @keyframes koda-panel-reveal { from { opacity:.65; transform:translateY(-6px); clip-path:inset(0 0 12% 0 round 24px); } to {opacity:1;transform:none;clip-path:inset(0 round 24px);} }
 @keyframes koda-page-reveal { from {opacity:.8;transform:translateY(5px)} to {opacity:1;transform:none} }
 @keyframes koda-check-confirm { 0% {transform:scale(.94)} 65% {transform:scale(1.06)} 100% {transform:none} }
 @media(prefers-reduced-motion:reduce) {
   [data-testid="bento-app-shell"] *, [data-testid="bento-app-shell"] *::before, [data-testid="bento-app-shell"] *::after {
     animation:none!important;transition:none!important;scroll-behavior:auto!important;
   }
   [data-testid="widget-drag-grid"] [data-widget-slot]:hover > [data-testid^="widget-"],
   [data-testid="bento-app-shell"] :is([role="button"],button,[role="checkbox"]):hover,
   [data-testid="bento-app-shell"] :is([role="button"],button,[role="checkbox"]):active {transform:none!important;}
   [data-testid="bento-app-shell"] :is([role="button"],button) > svg {translate:none!important;}
 }
 `}</style>;
}
