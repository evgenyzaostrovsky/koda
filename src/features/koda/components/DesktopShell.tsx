import { RightPanel } from './RightPanel';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { styles } from '../styles';

export const desktopLayout = {
  globalNavWidth: 238,
  globalNavCollapsedWidth: 72,
  pageMaxWidth: 1600,
  pagePadding: 24,
  columnGap: 24,
  rightColumnWidth: 282,
  compactRightColumnWidth: 282,
} as const;

export function DesktopShell({ globalNavigation, workspace }: { globalNavigation: ReactNode; workspace: ReactNode }) {
  return (
    <View style={[styles.desktopShell, { maxWidth: desktopLayout.pageMaxWidth, alignSelf: 'center' }]}>
      {globalNavigation}
      <View style={styles.desktopPageHost}>{workspace}</View>
    </View>
  );
}

export function DesktopPageLayout({ main, right }: { main: ReactNode; right: ReactNode }) {
  return (
    <View style={styles.desktopThreeColumnPage} testID="desktop-page-columns">
      <View style={styles.desktopMainColumn} testID="desktop-main-column">{main}</View>
      <RightPanel><View style={styles.desktopRightColumn} testID="desktop-right-column">{right}</View></RightPanel>
    </View>
  );
}
