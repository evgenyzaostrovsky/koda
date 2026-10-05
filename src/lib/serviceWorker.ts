import { Platform } from 'react-native';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/sw.js').then((registration) => {
      void registration.update();
      return registration;
    }).catch(() => null);
  }

  return registrationPromise;
}
