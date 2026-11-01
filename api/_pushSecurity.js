// Push services send authenticated requests to these URLs. Restrict them so a
// forged subscription cannot turn the scheduled sender into an HTTP proxy.
function isAllowedPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' || host === 'android.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'notify.windows.com' || host.endsWith('.notify.windows.com') ||
      host === 'web.push.apple.com' || host.endsWith('.web.push.apple.com');
  } catch {
    return false;
  }
}

module.exports = { isAllowedPushEndpoint };
