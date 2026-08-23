import { Platform } from 'react-native';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    let reloadedForUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'KODA_SW_UPDATED' && !reloadedForUpdate) {
        reloadedForUpdate = true;
        window.location.reload();
      }
    });

    registrationPromise = navigator.serviceWorker.register('/sw.js').then((registration) => {
      void registration.update();
      return registration;
    }).catch(() => null);
  }

  return registrationPromise;
}
