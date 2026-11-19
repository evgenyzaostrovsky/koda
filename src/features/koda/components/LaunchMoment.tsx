import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { bg, muted, text } from '../theme';

const waveSheet = require('../../../../assets/pet/kodik-wave-sheet-v1.png');
const houseSheet = require('../../../../assets/pet/kodik-house-sheet-v1.png');

/** A real loading screen; it stays visible until the application is ready. */
export function LaunchMoment() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    setFrame(0);
    if (reducedMotion) return;
    const frames = [0, 1, 2, 1];
    let index = 0;
    // Sprite frames must jump; interpolating the atlas shows two half characters.
    const timer = setInterval(() => { index = (index + 1) % frames.length; setFrame(frames[index]); }, 180);
    return () => clearInterval(timer);
  }, [reducedMotion]);
  return (
    <View testID="launch-moment" pointerEvents="auto" style={s.overlay}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.art}>
        <View style={s.houseCrop}><Image source={houseSheet} resizeMode="stretch" style={[s.houseAtlas,{left:0,top:0}]} /></View>
        <View style={s.waveFrame}>
          <Image source={waveSheet} resizeMode="stretch" style={[s.waveAtlas, { left: -frame * 104 }]} />
        </View>
      </View>
      <Text accessibilityRole="header" style={s.wordmark}>KODA <Text style={s.light}>LIFE</Text></Text>
      <Text style={s.tagline}>Маленькие шаги. Свой ритм.</Text>
      <View style={s.loading}>
        <Text style={s.loadingText}>Загрузка…</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50,
    alignItems: 'center', justifyContent: 'center', backgroundColor: bg,
    paddingHorizontal: 20, gap: 8,
  },
  art: { width: 300, height: 270, marginBottom: 12 },
  houseCrop: { position:'absolute', left:8, top:0, width:266.1, height:266.1, overflow:'hidden' },
  houseAtlas: { position:'absolute', width:532.2, height:266.1 },
  waveFrame: { position:'absolute', left:168, top:154, width:104, height:104, overflow:'hidden' },
  waveAtlas: { position:'absolute', width:312, height:104, left:0, top:0 },
  wordmark: { color: text, fontSize: 28, fontWeight: '600', letterSpacing: 2.2 },
  light: { fontWeight: '300', letterSpacing: 2.8 },
  tagline: { color: muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  loading: { width: 220, maxWidth: '100%', marginTop: 24 },
  loadingText: { color: muted, fontSize: 14, textAlign: 'center' },
});
