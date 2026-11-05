import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { PetCompanion } from './PetCompanion';
import { accent, activeText, bg, lime, muted, text } from '../theme';

const waveSheet = require('../../../../assets/pet/kodik-wave-sheet-v1.png');
const walkSheet = require('../../../../assets/pet/kodik-walk-sheet-v1.png');
const waveFrames = [0, 1, 2, 1];
const houseSheet = require('../../../../assets/pet/kodik-house-sheet-v1.png');
// Original transparent atlas: 1774 × 887. Crop both parts at the same 0.3 scale.
const houseAtlasStyle = { position: 'absolute' as const, width: 532.2, height: 266.1 };

/** A short, skippable brand hello; the workspace stays mounted and available behind it. */
export function LaunchMoment({ onFinished }: { onFinished: () => void }) {
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const veil = useRef(new Animated.Value(1)).current;
  const story = useRef(new Animated.Value(0)).current;

  const dismissing = useRef(false);
  const [acting, setActing] = useState<{phase:'peek'|'walk'|'wave'; frame:number}>({phase:'peek',frame:0});

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
    if (!visible || reducedMotion === null) return;
    if (reducedMotion) {
      setVisible(false);
      return;
    }

    // Frame changes follow the same clock as displacement: paws plant between steps.
    const listener = story.addListener(({value}) => {
      const ms = value * 3750;
      const phase = ms < 1450 ? 'peek' : ms < 2700 ? 'walk' : 'wave';
      const frame = phase === 'walk' ? Math.min(7, Math.floor((ms-1450)/156.25)) % 4
        : phase === 'wave' ? waveFrames[Math.floor((ms-2700)/140)%waveFrames.length] : 0;
      setActing(previous => previous.phase===phase && previous.frame===frame ? previous : {phase,frame});
    });
    const entrance = Animated.sequence([
      Animated.timing(story, { toValue: 1, duration: 3750, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(veil, { toValue: 0, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    entrance.start(({ finished }) => { if (finished) setVisible(false); });
    return () => { story.removeListener(listener); entrance.stop(); story.stopAnimation(); veil.stopAnimation(); };
  }, [reducedMotion, story, veil, visible]);

  if (!visible || reducedMotion !== false) return null;

  return (
    <Animated.View
      testID="launch-moment"
      pointerEvents="auto"
      style={[s.overlay, { opacity: veil }]}
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.art}>
        <View style={s.houseCrop}><Image source={houseSheet} resizeMode="stretch" style={[houseAtlasStyle,{left:0,top:0}]} /></View>
        <Animated.View testID="launch-window" style={[s.windowLight, { opacity: story.interpolate({inputRange:[0,.08,.16,1],outputRange:[0,0,.5,.5]}) }]}>
          <Svg width="70" height="70" viewBox="0 0 70 70"><Defs><RadialGradient id="house-window-glow"><Stop offset="0" stopColor="#ffdf81" stopOpacity=".6"/><Stop offset="1" stopColor="#ffdf81" stopOpacity="0"/></RadialGradient></Defs><Circle cx="35" cy="35" r="35" fill="url(#house-window-glow)"/></Svg>
        </Animated.View>
        {acting.phase==='peek'?<View style={s.peekWindow}>
          <Animated.View testID="launch-kodik-peek" style={{position:'absolute',left:-14,top:-13,transform:[
            {translateX:story.interpolate({inputRange:[0,.24,.30,.34,.3867,1],outputRange:[-58,-58,-12,-18,-12,-12]})},
            {rotate:story.interpolate({inputRange:[0,.24,.30,.34,.3867,1],outputRange:['0deg','0deg','-10deg','-5deg','0deg','0deg']})},
          ]}}><PetCompanion name="Кодик" pose="emotions_01" size={104} animatingScene/></Animated.View>
        </View>:<Animated.View testID="launch-kodik" {...({dataSet:{phase:acting.phase,frame:acting.frame}} as any)} style={[s.petPlate, { transform: [
          { translateX: story.interpolate({ inputRange:[0,.3867,.4283,.47,.5117,.5533,.595,.6367,.6783,.72,1],outputRange:[0,0,15,15,31,31,47,47,62,62,62] }) },
          { translateY: story.interpolate({ inputRange:[0,.3867,.4283,.47,.5117,.5533,.595,.6367,.6783,.72,1],outputRange:[0,0,1,5,6,10,11,15,14,18,18] }) },
        ] }]}>
          {acting.phase==='walk'?<View style={s.walkFrame}><Image source={walkSheet} resizeMode="stretch" style={{position:'absolute',width:372,height:124,left:-acting.frame*93,top:-9}}/></View>
            :<View style={s.waveFrame}><Image source={waveSheet} resizeMode="stretch" style={{position:'absolute',width:312,height:104,left:-acting.frame*104,top:0}}/></View>}
        </Animated.View>}
        <Animated.View testID="launch-door" style={[s.door, { transform: [
          { translateX: story.interpolate({inputRange:[0,.18,.36,1],outputRange:[0,0,-36,-36]}) },
          { scaleX: story.interpolate({inputRange:[0,.18,.36,1],outputRange:[1,1,.12,.12]}) },
        ] }]}>
          <View style={s.doorCrop}><Image source={houseSheet} resizeMode="stretch" style={[houseAtlasStyle,{left:-360,top:-132}]} /></View>
        </Animated.View>
        <Animated.View style={[s.greeting, {
          opacity: story.interpolate({inputRange:[0,.72,.78,.97,1],outputRange:[0,0,1,1,1]}),
          transform: [{translateY:story.interpolate({inputRange:[0,.78,1],outputRange:[6,6,-6]})}],
        }]}><Text style={s.greetingText}>Привет!</Text></Animated.View>
      </View>
      <Text accessibilityRole="header" style={s.wordmark}>KODA <Text style={s.light}>LIFE</Text></Text>
      <Text style={s.tagline}>Маленькие шаги. Свой ритм.</Text>
      <View style={s.loading}>
        <View accessibilityRole="progressbar" accessibilityLabel="Готовим твоё пространство" style={s.track}>
          <Animated.View style={[s.fill, { width: '100%', transformOrigin: 'left center', transform: [{ scaleX: story }] }]} />
        </View>
        <Text style={s.loadingText}>Готовим твоё пространство</Text>
      </View>
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
  art: { width: 300, height: 270, marginBottom: 12 },
  houseCrop: { position:'absolute', left:8, top:0, width:266.1, height:266.1, overflow:'hidden' },
  windowLight: { position:'absolute', left:55, top:140, width:70, height:70 },
  door: { position:'absolute', left:116, top:132, width:85.5, height:105 },
  doorCrop: { width:85.5, height:105, overflow:'hidden' },
  peekWindow: {position:'absolute',left:120,top:145,width:76,height:91,borderTopLeftRadius:34,borderTopRightRadius:34,overflow:'hidden'},
  walkFrame: {position:'absolute',left:5.5,top:0,width:93,height:104,overflow:'hidden'},
  waveFrame: {position:'absolute',left:0,top:4,width:104,height:104,overflow:'hidden'},
  petPlate: { position:'absolute', left:106, top:132, width:104, height:104 },
  greeting: { position:'absolute', left:225, top:140, backgroundColor:'#f7f8e9', borderRadius:14, paddingHorizontal:12, paddingVertical:8 },
  greetingText: { color:accent, fontSize:13, fontWeight:'600' },
  wordmark: { color: text, fontSize: 28, fontWeight: '600', letterSpacing: 2.2 },
  light: { fontWeight: '300', letterSpacing: 2.8 },
  tagline: { color: muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  loading: { width: 220, maxWidth: '100%', gap: 10, marginTop: 24 },
  track: { height: 6, borderRadius: 6, backgroundColor: 'rgba(62,80,27,0.13)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: accent },
  loadingText: { color: muted, fontSize: 12, textAlign: 'center' },
  skip: {
    position: 'absolute', bottom: 20, alignSelf: 'center', minWidth: 48, minHeight: 48,
    paddingHorizontal: 18, borderRadius: 24, backgroundColor: lime,
    alignItems: 'center', justifyContent: 'center',
  },
  skipPressed: { opacity: 0.78 },
  skipText: { color: activeText, fontSize: 14, fontWeight: '600' },
});
