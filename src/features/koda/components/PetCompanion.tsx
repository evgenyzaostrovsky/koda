import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useReducedMotion } from './RightPanel';

export type PetPose = `poses_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`
  | `emotions_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`
  | `care_moods_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`
  | `celebration_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`;
export type PetLifeState = 'egg' | 'alive' | 'dead';

const petImages: Record<PetPose, ImageSourcePropType> = {
  poses_01: require('../../../../assets/pet/poses_01.png'), poses_02: require('../../../../assets/pet/poses_02.png'),
  poses_03: require('../../../../assets/pet/poses_03.png'), poses_04: require('../../../../assets/pet/poses_04.png'),
  poses_05: require('../../../../assets/pet/poses_05.png'), poses_06: require('../../../../assets/pet/poses_06.png'),
  poses_07: require('../../../../assets/pet/poses_07.png'), poses_08: require('../../../../assets/pet/poses_08.png'),
  emotions_01: require('../../../../assets/pet/emotions_01.png'), emotions_02: require('../../../../assets/pet/emotions_02.png'),
  emotions_03: require('../../../../assets/pet/emotions_03.png'), emotions_04: require('../../../../assets/pet/emotions_04.png'),
  emotions_05: require('../../../../assets/pet/emotions_05.png'), emotions_06: require('../../../../assets/pet/emotions_06.png'),
  emotions_07: require('../../../../assets/pet/emotions_07.png'), emotions_08: require('../../../../assets/pet/emotions_08.png'),
  care_moods_01: require('../../../../assets/pet/care_moods_01.png'), care_moods_02: require('../../../../assets/pet/care_moods_02.png'),
  care_moods_03: require('../../../../assets/pet/care_moods_03.png'), care_moods_04: require('../../../../assets/pet/care_moods_04.png'),
  care_moods_05: require('../../../../assets/pet/care_moods_05.png'), care_moods_06: require('../../../../assets/pet/care_moods_06.png'),
  care_moods_07: require('../../../../assets/pet/care_moods_07.png'), care_moods_08: require('../../../../assets/pet/care_moods_08.png'),
  celebration_01: require('../../../../assets/pet/celebration_01.png'), celebration_02: require('../../../../assets/pet/celebration_02.png'),
  celebration_03: require('../../../../assets/pet/celebration_03.png'), celebration_04: require('../../../../assets/pet/celebration_04.png'),
  celebration_05: require('../../../../assets/pet/celebration_05.png'), celebration_06: require('../../../../assets/pet/celebration_06.png'),
  celebration_07: require('../../../../assets/pet/celebration_07.png'), celebration_08: require('../../../../assets/pet/celebration_08.png'),
};

const WALK_FRAME_COUNT = 4;
const WALK_FRAME_MS = 240;
const WALK_FRAME_ASPECT = 543 / 724;
const walkSheet = require('../../../../assets/pet/kodik-walk-sheet-v1.png') as ImageSourcePropType;

export function PetCompanion({
  name,
  state = 'alive',
  pose = 'poses_01',
  size = 84,
  onPress,
  accessibilityLabel,
  walking = false,
  facing,
  jumping = false,
  ambientMotion = true,
}: {
  name: string;
  state?: PetLifeState;
  pose?: PetPose;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  walking?: boolean;
  facing?: Animated.Value;
  jumping?: boolean;
  ambientMotion?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const bob = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const jumpLift = useRef(new Animated.Value(0)).current;
  const [walkFrame, setWalkFrame] = useState(0);
  // The same locomotion cycle is used for every live mood and species; the
  // current pose is restored as soon as the pass pauses.
  const isWalking = walking && state === 'alive' && !reducedMotion;

  useEffect(() => {
    bob.stopAnimation();
    scale.stopAnimation();
    bob.setValue(0);
    scale.setValue(1);
    if (reducedMotion || state !== 'alive' || isWalking || !ambientMotion) return;

    const bobLoop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: -4, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const breathLoop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.025, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    bobLoop.start();
    breathLoop.start();
    return () => { bobLoop.stop(); breathLoop.stop(); };
  }, [ambientMotion, bob, isWalking, scale, reducedMotion, state]);

  useEffect(() => {
    setWalkFrame(0);
    if (!isWalking) return;
    const interval = setInterval(() => {
      setWalkFrame((frame) => (frame + 1) % WALK_FRAME_COUNT);
    }, WALK_FRAME_MS);
    return () => clearInterval(interval);
  }, [isWalking]);

  useEffect(() => {
    jumpLift.stopAnimation();
    jumpLift.setValue(0);
    if (!jumping || reducedMotion || state !== 'alive') return;
    const hop = Animated.sequence([
      Animated.timing(jumpLift, { toValue: -18, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(jumpLift, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    hop.start();
    return () => hop.stop();
  }, [jumping, jumpLift, reducedMotion, state]);

  const image = state === 'egg' ? null : petImages[pose];
  const accessibleName = name.trim() || 'Кодик';
  const frameWidth = size * WALK_FRAME_ASPECT;
  const walkArtwork = <View style={[s.walkViewport, { width: frameWidth, height: size }]}>
    <Animated.Image
      source={walkSheet}
      resizeMode="stretch"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -frameWidth * walkFrame, top: 0, width: frameWidth * WALK_FRAME_COUNT, height: size }}
    />
  </View>;
  const visual = state === 'egg'
    ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.egg, { width: size * .52, height: size * .66, borderRadius: size }]}><View style={s.eggLight} /></View>
    : <Animated.View style={[s.artwork, { width: size, height: size, transform: [
      { translateY: Animated.add(bob, jumpLift) }, { scale }, { scaleX: facing ?? 1 },
      ], opacity: state === 'dead' ? .55 : 1 }]}>
      {isWalking ? walkArtwork : <Animated.Image source={image!} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }} />}
    </Animated.View>;

  if (!onPress) return <View style={[s.artwork, { width: size, height: size }]}>{visual}</View>;

  const stateHint = state === 'egg' ? 'Яйцо ждёт встречи' : state === 'dead' ? 'Можно начать заново' : 'Открыть домик';
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? `${stateHint}: ${accessibleName}`}
    onPress={onPress}
    style={({ pressed }) => [s.floating, { width: Math.max(48, size), height: Math.max(48, size) }, pressed && s.pressed]}
  >
    {visual}
  </Pressable>;
}

const s = StyleSheet.create({
  artwork: { alignItems: 'center', justifyContent: 'center' },
  walkViewport: { overflow: 'hidden' },
  floating: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  pressed: { opacity: .88, transform: [{ scale: .97 }] },
  egg: { backgroundColor: '#f0e7c8', borderWidth: 2, borderColor: '#bdc888', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  eggLight: { width: '45%', height: '24%', borderRadius: 999, backgroundColor: '#fff7db', opacity: .9, alignSelf: 'flex-start', marginLeft: '17%', marginTop: '17%' },
});
