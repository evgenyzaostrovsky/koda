/** Update the tab icon both during HTML bootstrap and after a theme change.
 * @param {Record<string, string>} colors
 */
function applyKodaFavicon(colors) {
  if (typeof document === 'undefined') return;
  const accent = colors['--koda-accent'];
  const background = colors['--koda-app-bg'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${background}"/><g fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17c3-6 5-7 8-4s5 1 8-3M5 21h14M5 8l3-3 3 3"/><circle cx="17" cy="6" r="2"/></g></svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let icons = Array.from(document.querySelectorAll('link[rel~="icon"]'));
  if (!icons.length) {
    const icon = document.createElement('link');
    icon.setAttribute('rel', 'icon');
    document.head.appendChild(icon);
    icons = [icon];
  }
  icons.forEach(icon => {
    icon.setAttribute('type', 'image/svg+xml');
    icon.setAttribute('sizes', 'any');
    if (icon.getAttribute('href') !== href) icon.setAttribute('href', href);
  });
}

module.exports = { applyKodaFavicon };
