import 'react-native';

declare module 'react-native' {
  interface ViewStyle {
    overflowY?: 'auto' | 'hidden' | 'scroll' | 'visible';
    overscrollBehavior?: string;
    touchAction?: string;
  }
}
