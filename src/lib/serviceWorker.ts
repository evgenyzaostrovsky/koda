import { Platform } from 'react-native';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let lifecycleInstalled = false;
let currentRegistration: ServiceWorkerRegistration | null = null;
let lastUpdateCheck = -Infinity;

function installUpdateLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  const pageBuild = document.querySelector<HTMLMetaElement>('meta[name="koda-build"]')?.content;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'KODA_GET_PAGE_BUILD') event.ports[0]?.postMessage({ buildId: pageBuild || null });
  });
  let interacted = false;
  let reloading = false;
  let changedController: ServiceWorker | null = null;
  // Never discard an edited form or interrupt an action to apply an update.
  // An untouched launch can safely switch to the fully installed new shell.
  for (const name of ['pointerdown', 'touchstart', 'click', 'keydown', 'input', 'change', 'compositionstart']) {
    window.addEventListener(name, () => { interacted = true; }, { capture: true, once: true });
  }

  const checkController = () => {
    const controller = changedController;
    if (!controller || !pageBuild || interacted || reloading || document.visibilityState !== 'visible') return;
    const channel = new MessageChannel();
    let settled = false;
    const close = () => { settled = true; channel.port1.close(); channel.port2.close(); };
    const timeout = window.setTimeout(close, 2000);
    channel.port1.onmessage = (event: MessageEvent<{ buildId?: string }>) => {
      if (settled) return;
      window.clearTimeout(timeout);
      close();
      if (navigator.serviceWorker.controller !== controller || interacted || reloading || document.visibilityState !== 'visible') return;
      if (typeof event.data?.buildId === 'string' && event.data.buildId !== pageBuild) {
        reloading = true;
        window.location.reload();
      }
    };
    try {
      controller.postMessage({ type: 'KODA_GET_BUILD' }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      close();
    }
  };
  const checkForUpdate = () => {
    checkController();
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (!currentRegistration) {
      void registerServiceWorker();
      return;
    }
    if (Date.now() - lastUpdateCheck < 60_000) return;
    lastUpdateCheck = Date.now();
    void currentRegistration.update().catch(() => { lastUpdateCheck = -Infinity; });
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    changedController = navigator.serviceWorker.controller;
    checkController();
  });
  window.addEventListener('online', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
  document.addEventListener('visibilitychange', checkForUpdate);
}

export function registerServiceWorker() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  installUpdateLifecycle();
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      currentRegistration = registration;
      lastUpdateCheck = Date.now();
      // Offline failures are expected; a later online/focus event retries.
      void registration.update().catch(() => { lastUpdateCheck = -Infinity; });
      return registration;
    }).catch(() => {
      registrationPromise = null;
      return null;
    });
  }

  return registrationPromise;
}
