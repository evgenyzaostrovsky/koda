import { useEffect, useRef } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';
import { PetCompanion, type PetLifeState, type PetPose } from './PetCompanion';
import { useReducedMotion } from './RightPanel';

/** A small, accessible entrance to the pet's room across the workspace. */
export function PetWanderer({ name, state, pose, onPress }: {
  name: string;
  state: PetLifeState;
  pose: PetPose;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const displayName = name.trim() || 'Кодик';
  const position = useRef(new Animated.Value(0)).current;
  const walkPhase = useRef(new Animated.Value(0)).current;
  const distance = Math.max(0, width - 96);
  const facing = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    position.stopAnimation();
    walkPhase.stopAnimation();
    position.setValue(0);
    walkPhase.setValue(0);
    facing.setValue(-1);
    if (reducedMotion || state === 'dead' || distance === 0) return;

    const duration = Math.max(5000, Math.min(9500, distance * 5.8));
    const pass = (toValue: number) => Animated.parallel([
      Animated.timing(position, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(walkPhase, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(walkPhase, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      ]),
    ]);
    const turn = (toValue: number) => Animated.timing(facing, { toValue, duration: 1, useNativeDriver: true });
    const wander = Animated.loop(Animated.sequence([
      Animated.delay(5200),
      pass(-distance),
      Animated.delay(14000),
      turn(1),
      pass(0),
      Animated.delay(16000),
      turn(-1),
    ]));
    wander.start();
    return () => { wander.stop(); position.stopAnimation(); walkPhase.stopAnimation(); facing.stopAnimation(); };
  }, [distance, facing, position, reducedMotion, state, walkPhase]);

  return <Animated.View testID="pet-wanderer" style={{ position: 'absolute', right: 12, bottom: 20, zIndex: 20, transform: [{ translateX: position }] }}>
    <PetCompanion name={displayName} state={state === 'egg' ? 'alive' : state} pose={pose} size={72}
      walkPhase={reducedMotion || state === 'dead' ? undefined : walkPhase} facing={facing}
      accessibilityLabel={state === 'egg' ? `Познакомиться с питомцем ${displayName}` : `Открыть домик питомца ${displayName}`} onPress={onPress} />
  </Animated.View>;
}
