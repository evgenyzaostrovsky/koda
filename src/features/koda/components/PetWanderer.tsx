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

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let currentPosition = 0;

    const runPass = () => {
      if (!active) return;
      // Pick a point anywhere along the available width, excluding a small
      // area around the current position so that each stroll is visible.
      const minimumStep = Math.min(80, distance * .35);
      const leftRange = Math.max(0, currentPosition - minimumStep + distance);
      const rightRange = Math.max(0, -currentPosition - minimumStep);
      const choice = Math.random() * (leftRange + rightRange);
      const destination = choice < leftRange
        ? -distance + choice
        : currentPosition + minimumStep + (choice - leftRange);
      const travel = Math.abs(destination - currentPosition);
      facing.setValue(destination < currentPosition ? -1 : 1);
      setWalking(true);
      Animated.timing(position, { toValue: destination, duration: Math.max(800, travel / 38 * 1000), easing: Easing.linear, useNativeDriver: true })
        .start(({ finished }) => {
          if (!active || !finished) return;
          currentPosition = destination;
          setWalking(false);
          timeout = setTimeout(runPass, 5000 + Math.random() * 6000);
        });
    };

    timeout = setTimeout(runPass, 2500 + Math.random() * 2000);
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
