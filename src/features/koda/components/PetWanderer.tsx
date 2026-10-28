import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, useWindowDimensions } from 'react-native';
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
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const displayName = name.trim() || 'Кодик';
  const position = useRef(new Animated.Value(0)).current;
  const distance = Math.max(0, width - 96);
  const facing = useRef(new Animated.Value(-1)).current;
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => setAppActive(nextState === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    position.stopAnimation();
    position.setValue(0);
    facing.setValue(-1);
    setWalking(false);
    if (reducedMotion || !appActive || state === 'dead' || distance === 0) return;

    const duration = Math.max(5000, Math.min(9500, distance * 5.8));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const runPass = (toValue: number, pause: number, nextToValue: number, nextFacing: number) => {
      if (!active) return;
      setWalking(true);
      Animated.timing(position, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        .start(({ finished }) => {
          if (!active || !finished) return;
          setWalking(false);
          timeout = setTimeout(() => {
            if (!active) return;
            facing.setValue(nextFacing);
            runPass(nextToValue, pause === 14000 ? 16000 : 14000, toValue, nextFacing === -1 ? 1 : -1);
          }, pause);
        });
    };

    timeout = setTimeout(() => runPass(-distance, 14000, 0, 1), 5200);
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      position.stopAnimation();
      facing.stopAnimation();
    };
  }, [appActive, distance, facing, position, reducedMotion, state]);

  return <Animated.View testID="pet-wanderer" style={{ position: 'absolute', right: 12, bottom: 20, zIndex: 20, transform: [{ translateX: position }] }}>
    <PetCompanion name={displayName} state={state === 'egg' ? 'alive' : state} pose={pose} size={72}
      walking={walking && appActive && !reducedMotion && state !== 'dead'} facing={facing}
      accessibilityLabel={state === 'egg' ? `Познакомиться с питомцем ${displayName}` : `Открыть домик питомца ${displayName}`} onPress={onPress} />
  </Animated.View>;
}
