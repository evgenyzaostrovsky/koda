import type { ReactNode } from 'react';
import { View } from 'react-native';
import { styles } from '../styles';

export const desktopLayout = {
  globalNavWidth: 210,
  globalNavCollapsedWidth: 72,
  pageMaxWidth: 1360,
  pagePadding: 28,
  columnGap: 24,
  rightColumnWidth: 330,
  compactRightColumnWidth: 300,
} as const;

export function DesktopShell({ globalNavigation, workspace }: { globalNavigation: ReactNode; workspace: ReactNode }) {
  return (
    <View style={styles.desktopShell}>
      {globalNavigation}
      <View style={styles.desktopPageHost}>{workspace}</View>
    </View>
  );
}

export function DesktopPageLayout({ main, right }: { main: ReactNode; right: ReactNode }) {
  return (
    <View style={styles.desktopThreeColumnPage} testID="desktop-page-columns">
      <View style={styles.desktopMainColumn} testID="desktop-main-column">{main}</View>
      <View style={styles.desktopRightColumn} testID="desktop-right-column">{right}</View>
    </View>
  );
}
