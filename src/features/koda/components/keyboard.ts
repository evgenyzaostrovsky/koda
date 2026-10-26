import { Platform } from 'react-native';

type WebKeyEvent = { key: string; repeat?: boolean; preventDefault: () => void };

// React Native Web handles Space for button roles, but not checkbox/radio roles.
// Enter already goes through Pressable's onPress; handling it here would toggle twice.
export function webSpaceActivationProps(activate: () => void, disabled = false) {
  return Platform.OS === 'web' ? {
    onKeyDown: (event: WebKeyEvent) => {
      if (disabled || (event.key !== ' ' && event.key !== 'Spacebar')) return;
      event.preventDefault();
      if (!event.repeat) activate();
    },
  } : {};
}
