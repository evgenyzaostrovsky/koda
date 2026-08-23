import { Platform } from 'react-native';
import { env } from '../config/env';
import { registerServiceWorker } from './serviceWorker';

type PushStatus = 'unsupported' | 'blocked' | 'enabled' | 'default';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function getPushStatus(): PushStatus {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'enabled';
  if (Notification.permission === 'denied') return 'blocked';
  return 'default';
}

export async function enablePushNotifications() {
  if (getPushStatus() === 'unsupported') {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error('Service worker registration failed.');
  }
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey),
    }));

  const response = await fetch('/api/push-subscriptions', {
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      reminderTime: '14:00',
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to save push subscription.');
  }

  return subscription;
}
