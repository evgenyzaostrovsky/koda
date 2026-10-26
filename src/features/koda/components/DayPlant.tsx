import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Ellipse } from 'react-native-svg';
import { muted } from '../theme';

/** Quiet illustration for the day card; decorative shapes never cover controls. */
export function DayPlant() {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 148, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
      <Svg width={148} height={148} viewBox="0 0 148 148">
        <Defs>
          <LinearGradient id="day-leaf" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#bacb9d" />
            <Stop offset=".52" stopColor="#91a879" />
            <Stop offset="1" stopColor="#687d50" />
          </LinearGradient>
          <LinearGradient id="day-leaf-light" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#aabd88" />
            <Stop offset="1" stopColor="#7d9562" />
          </LinearGradient>
        </Defs>
        <Ellipse cx="75" cy="145" rx="73" ry="23" fill="#e7ebda" opacity=".55" />
        <Ellipse cx="96" cy="141" rx="43" ry="6.5" fill="#dfe7ce" opacity=".58" />
        <Ellipse cx="96" cy="139" rx="30" ry="3.5" fill="#cbd8b8" opacity=".34" />
        {/* Large, quiet leaves in the background soften the silhouette. */}
        <Path d="M96 119 C76 106 57 84 54 59 C72 66 89 84 96 119Z" fill="#9caf80" opacity=".11" />
        <Path d="M99 115 C107 87 124 64 145 57 C145 81 127 105 99 115Z" fill="#9caf80" opacity=".09" />
        {/* One continuous, fine stem bends gently toward the light. */}
        <Path d="M95 137 C88 116 91 99 96 83 C101 65 99 46 101 27" fill="none" stroke="#83996a" strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M96 87 C81 85 68 78 56 72 C50 69 44 68 39 69 C45 83 61 91 76 93 C84 94 91 92 96 90Z" fill="url(#day-leaf-light)" />
        <Path d="M98 111 C96 101 101 92 109 85 C115 80 122 77 130 76 C129 89 123 100 114 106 C109 109 103 111 98 111Z" fill="url(#day-leaf)" />
        <Path d="M101 60 C95 59 91 55 90 49 C88 41 93 31 101 23 C107 17 115 12 124 8 C125 19 123 31 119 41 C115 51 109 57 101 60Z" fill="url(#day-leaf)" />
        {/* A single soft midrib keeps the leaves readable without busy detail. */}
        <Path d="M99 57 C107 44 115 27 122 12" fill="none" stroke="#d7e0c5" strokeWidth=".7" strokeLinecap="round" opacity=".25" />
      </Svg>
      <Text style={{ width: '100%', color: muted, fontSize: 12, lineHeight: 18, textAlign: 'left', marginTop: -2 }}>
        Маленькие шаги каждый день приводят к большим результатам.
      </Text>
    </View>
  );
}
