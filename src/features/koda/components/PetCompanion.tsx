import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useReducedMotion } from './RightPanel';

export type PetPose = `poses_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`
  | `emotions_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`
  | `care_moods_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`
  | `celebration_${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'}`;
export type PetLifeState = 'egg' | 'alive' | 'dead';
export type PetActionPose = 'push-ready' | 'push-drive' | 'push-recoil' | 'jump-tuck' | 'land-brace' | 'stomp';
export type PetClimbPose = 'climb-reach' | 'climb-pull';
export type PetActionBounds = { left: number; top: number; right: number; bottom: number };

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
const playSheet = require('../../../../assets/pet/kodik-play-sheet-v2.png') as ImageSourcePropType;
const climbSheet = require('../../../../assets/pet/kodik-climb-sheet-v1.png') as ImageSourcePropType;
const PLAY_CELL_SIZE = 512;
const CLIMB_CELL_SIZE = 887;
const CLIMB_REFERENCE_SIZE = 760;
const climbFrames: Record<PetClimbPose, number> = { 'climb-reach': 0, 'climb-pull': 1 };
const climbBounds: Record<PetClimbPose, { handX: number; bottom: number }> = {
  'climb-reach': { handX: 650, bottom: 806 },
  'climb-pull': { handX: 640, bottom: 763 },
};
const playFrames: Record<PetActionPose, number> = { 'push-ready': 0, 'push-drive': 1, 'push-recoil': 2, 'jump-tuck': 3, 'land-brace': 4, stomp: 5 };
const playBounds: Record<PetActionPose, PetActionBounds> = {
  'push-ready': { left: 93, top: 11, right: 442, bottom: 495 },
  'push-drive': { left: 45, top: 45, right: 484, bottom: 494 },
  'push-recoil': { left: 81, top: 15, right: 410, bottom: 496 },
  'jump-tuck': { left: 69, top: 5, right: 423, bottom: 425 },
  'land-brace': { left: 41, top: 85, right: 460, bottom: 484 },
  stomp: { left: 90, top: 4, right: 425, bottom: 485 },
};

export function getPetActionFrameBounds(actionPose: PetActionPose, size: number): PetActionBounds {
  const scale = size / PLAY_CELL_SIZE;
  const bounds = playBounds[actionPose];
  const xOffset = actionPose.startsWith('push-') ? (PLAY_CELL_SIZE - bounds.right) * scale : 0;
  const yOffset = (PLAY_CELL_SIZE - bounds.bottom) * scale;
  return { left: bounds.left * scale + xOffset, top: bounds.top * scale + yOffset, right: bounds.right * scale + xOffset, bottom: size };
}

export function getPetClimbHandX(size: number): number { return size * .78; }

export function PetCompanion({
  name,
  state = 'alive',
  pose = 'poses_01',
  size = 84,
  onPress,
  accessibilityLabel,
  walking = false,
  animatingScene = false,
  actionPose,
  climbPose,
  facing,
}: {
  name: string;
  state?: PetLifeState;
  pose?: PetPose;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  walking?: boolean;
  animatingScene?: boolean;
  actionPose?: PetActionPose;
  climbPose?: PetClimbPose;
  facing?: Animated.Value;
}) {
  const reducedMotion = useReducedMotion();
  const bob = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [walkFrame, setWalkFrame] = useState(0);
  // The same locomotion cycle is used for every live mood and species; the
  // current pose is restored as soon as the pass pauses.
  const isWalking = walking && state === 'alive' && !reducedMotion;

  useEffect(() => {
    bob.stopAnimation();
    scale.stopAnimation();
    bob.setValue(0);
    scale.setValue(1);
    if (reducedMotion || state !== 'alive' || isWalking || animatingScene) return;

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
  }, [animatingScene, bob, isWalking, scale, reducedMotion, state]);

  useEffect(() => {
    setWalkFrame(0);
    if (!isWalking) return;
    const interval = setInterval(() => {
      setWalkFrame((frame) => (frame + 1) % WALK_FRAME_COUNT);
    }, WALK_FRAME_MS);
    return () => clearInterval(interval);
  }, [isWalking]);

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
  const actionFrame = actionPose ? playFrames[actionPose] : 0;
  const actionBounds = actionPose ? playBounds[actionPose] : playBounds['push-ready'];
  const actionScale = size / PLAY_CELL_SIZE;
  const actionXOffset = actionPose?.startsWith('push-') ? (PLAY_CELL_SIZE - actionBounds.right) * actionScale : 0;
  const actionYOffset = (PLAY_CELL_SIZE - actionBounds.bottom) * actionScale;
  const actionArtwork = <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.walkViewport, { width: size, height: size }]}>
    <View style={[s.walkViewport, { width: size, height: size, transform: [{ translateX: actionXOffset }, { translateY: actionYOffset }] }]}>
      <Animated.Image source={playSheet} resizeMode="stretch" style={{ position: 'absolute', left: -(actionFrame % 3) * size, top: -Math.floor(actionFrame / 3) * size, width: size * 3, height: size * 2 }} />
    </View>
  </View>;
  const climbFrame = climbPose ? climbFrames[climbPose] : 0;
  const climbMetadata = climbPose ? climbBounds[climbPose] : climbBounds['climb-reach'];
  const climbScale = size / CLIMB_REFERENCE_SIZE;
  const climbCellSize = CLIMB_CELL_SIZE * climbScale;
  const climbXOffset = getPetClimbHandX(size) - climbMetadata.handX * climbScale;
  const climbYOffset = size - climbMetadata.bottom * climbScale;
  const climbArtwork = <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.walkViewport, { width: size, height: size }]}>
    <View style={[s.walkViewport, { width: climbCellSize, height: climbCellSize, transform: [{ translateX: climbXOffset }, { translateY: climbYOffset }] }]}>
      <Animated.Image source={climbSheet} resizeMode="stretch" style={{ position: 'absolute', left: -climbFrame * climbCellSize, top: 0, width: climbCellSize * 2, height: climbCellSize }} />
    </View>
  </View>;
  const visual = state === 'egg'
    ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.egg, { width: size * .52, height: size * .66, borderRadius: size }]}><View style={s.eggLight} /></View>
    : <Animated.View style={[s.artwork, { width: size, height: size, transform: [
      { translateY: bob }, { scale }, { scaleX: facing ?? 1 },
    ], opacity: state === 'dead' ? .55 : 1 }]}>
      {climbPose ? climbArtwork : actionPose ? actionArtwork : isWalking ? walkArtwork : <Animated.Image source={image!} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }} />}
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
