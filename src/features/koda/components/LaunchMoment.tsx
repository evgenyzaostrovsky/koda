import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Leaf } from 'lucide-react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { PetCompanion } from './PetCompanion';
import { accent, activeText, bg, lime, muted, text } from '../theme';

/** A short, skippable brand hello; the workspace stays mounted and available behind it. */
export function LaunchMoment({ onFinished }: { onFinished: () => void }) {
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const veil = useRef(new Animated.Value(1)).current;
  const sprout = useRef(new Animated.Value(0)).current;
  const leafLeft = useRef(new Animated.Value(0)).current;
  const leafRight = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);

  useEffect(() => {
    let active = true;
    let changed = false;
    // If the platform cannot answer, avoid leaving the companion hidden.
    const fallback = setTimeout(() => { if (active) setReducedMotion(value => value ?? true); }, 800);
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active && !changed) setReducedMotion(value); })
      .catch(() => { if (active && !changed) setReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReducedMotion(value); });
    return () => { active = false; clearTimeout(fallback); subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!visible || reducedMotion === true) onFinished();
  }, [visible, reducedMotion, onFinished]);

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    veil.stopAnimation();
    Animated.timing(veil, {
      toValue: 0,
      duration: reducedMotion ? 0 : 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [reducedMotion, veil]);

  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion) {
      setVisible(false);
      return;
    }

    Animated.sequence([
      Animated.parallel([
        Animated.timing(sprout, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.12)), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(100),
          Animated.timing(leafLeft, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(210),
          Animated.timing(leafRight, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(220),
      Animated.timing(veil, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => setVisible(false));

    return () => {
      sprout.stopAnimation();
      leafLeft.stopAnimation();
      leafRight.stopAnimation();
      veil.stopAnimation();
    };
  }, [leafLeft, leafRight, reducedMotion, sprout, veil]);

  if (!visible || reducedMotion !== false) return null;

  return (
    <Animated.View
      testID="launch-moment"
      pointerEvents="box-none"
      style={[s.overlay, { opacity: veil }]}
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.art}>
        <Animated.View style={[s.halo, { opacity: sprout, transform: [{ scale: sprout }] }]}>
          <Svg width="276" height="276" viewBox="0 0 216 216">
            <Defs><RadialGradient id="koda-launch-glow"><Stop offset="0" stopColor={lime} stopOpacity={0.58}/><Stop offset="1" stopColor={lime} stopOpacity={0}/></RadialGradient></Defs>
            <Circle cx="108" cy="108" r="106" fill="url(#koda-launch-glow)"/>
            <Circle cx="108" cy="108" r="80" fill="none" stroke={accent} strokeOpacity={0.13} strokeWidth="1"/>
            <Circle cx="39" cy="94" r="2.2" fill={accent} fillOpacity={0.5}/>
            <Circle cx="177" cy="117" r="2.2" fill={accent} fillOpacity={0.5}/>
          </Svg>
        </Animated.View>
        <Animated.View style={[s.stem, { transform: [{ scale: sprout }] }]}>
          <Animated.View style={[s.leafLeft, { opacity: leafLeft, transform: [{ rotate: '-36deg' }, { scale: leafLeft }] }]}>
            <Leaf size={48} color={accent} strokeWidth={1.7} />
          </Animated.View>
          <Animated.View style={[s.leafRight, { opacity: leafRight, transform: [{ rotate: '32deg' }, { scale: leafRight }] }]}>
            <Leaf size={42} color={accent} strokeWidth={1.7} />
          </Animated.View>
          <View style={s.petPlate}><PetCompanion name="Кодик" pose="emotions_01" size={116} /></View>
        </Animated.View>
      </View>
      <Text accessibilityRole="header" style={s.wordmark}>KODA <Text style={s.light}>LIFE</Text></Text>
      <Text style={s.tagline}>Маленькие шаги. Свой ритм.</Text>
      <Pressable
        testID="launch-skip"
        accessibilityRole="button"
        accessibilityLabel="Пропустить заставку"
        onPress={dismiss}
        style={({ pressed }) => [s.skip, pressed && s.skipPressed]}
      >
        <Text style={s.skipText}>Пропустить</Text>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50,
    alignItems: 'center', justifyContent: 'center', backgroundColor: bg,
    paddingHorizontal: 20, gap: 8,
  },
  art: { width: 220, height: 198, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  halo: { position: 'absolute', width: 276, height: 276, left: -28, top: -39 },
  stem: { width: 194, height: 188, alignItems: 'center', justifyContent: 'flex-end' },
  leafLeft: { position: 'absolute', left: 12, top: 35 },
  leafRight: { position: 'absolute', right: 9, top: 12 },
  petPlate: {
    width: 140, height: 140,
    alignItems: 'center', justifyContent: 'center',
  },
  wordmark: { color: text, fontSize: 28, fontWeight: '600', letterSpacing: 2.2 },
  light: { fontWeight: '300', letterSpacing: 2.8 },
  tagline: { color: muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  skip: {
    position: 'absolute', bottom: 20, alignSelf: 'center', minWidth: 48, minHeight: 48,
    paddingHorizontal: 18, borderRadius: 24, backgroundColor: lime,
    alignItems: 'center', justifyContent: 'center',
  },
  skipPressed: { opacity: 0.78 },
  skipText: { color: activeText, fontSize: 14, fontWeight: '600' },
});
