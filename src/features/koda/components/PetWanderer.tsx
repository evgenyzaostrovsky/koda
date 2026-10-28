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
  const position = useRef(new Animated.Value(0)).current;
  const distance = Math.max(0, Math.min(width - 92, width < 680 ? width * .3 : 320));

  useEffect(() => {
    position.stopAnimation();
    position.setValue(0);
    if (reducedMotion || state === 'dead' || distance === 0) return;
    const wander = Animated.loop(Animated.sequence([
      Animated.delay(8000),
      Animated.timing(position, { toValue: -distance, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.delay(18000),
      Animated.timing(position, { toValue: 0, duration: 4800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    wander.start();
    return () => wander.stop();
  }, [distance, position, reducedMotion, state]);

  return <Animated.View testID="pet-wanderer" style={{ position: 'absolute', right: 12, bottom: 20, zIndex: 20, transform: [{ translateX: position }] }}>
    <PetCompanion name={name} state={state === 'egg' ? 'alive' : state} pose={pose} size={72}
      accessibilityLabel={state === 'egg' ? `Познакомиться с питомцем ${name}` : `Открыть домик питомца ${name}`} onPress={onPress} />
  </Animated.View>;
}
