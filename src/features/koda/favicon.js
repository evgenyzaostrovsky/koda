/** Update the tab icon both during HTML bootstrap and after a theme change.
 * @param {Record<string, string>} colors
 */
function applyKodaFavicon(colors) {
  if (typeof document === 'undefined') return;
  const accent = colors['--koda-accent'];
  const background = colors['--koda-app-bg'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="${background}" d="M0 0h1024v1024H0z"/><g fill="none" stroke="${accent}" stroke-width="204" stroke-linecap="round"><path opacity=".55" d="M410 410l204 204"/><path opacity=".25" d="M434 638l204-204"/><path d="M410 614l204-204"/></g></svg>`;
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
