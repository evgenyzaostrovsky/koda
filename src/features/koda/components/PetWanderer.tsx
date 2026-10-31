import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, useWindowDimensions } from 'react-native';
import { PetCompanion, type PetLifeState, type PetPose } from './PetCompanion';
import { horizontalPetPath, isShortPetJump, type PetRoutePoint, type PetRouteRect } from './PetWandererGeometry';
import { useReducedMotion } from './RightPanel';

type Point = PetRoutePoint;
type Rect = PetRouteRect;
const PET_SIZE = 72;

/** A small, accessible entrance to the pet's room across the workspace. */
export function PetWanderer({ name, state, pose, onPress }: {
  name: string;
  state: PetLifeState;
  pose: PetPose;
  onPress: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const displayName = name.trim() || 'Кодик';
  const positionX = useRef(new Animated.Value(0)).current;
  const positionY = useRef(new Animated.Value(0)).current;
  const facing = useRef(new Animated.Value(-1)).current;
  const [walking, setWalking] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [overControl, setOverControl] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !appActive) {
      setOverControl(false);
      return;
    }
    const measure = () => {
      const pet = document.querySelector<HTMLElement>('[data-testid="pet-wanderer"]');
      if (!pet) return;
      const bounds = pet.getBoundingClientRect();
      const controls = document.querySelectorAll<HTMLElement>('button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="switch"]');
      const overlaps = Array.from(controls).some(control => {
        if (pet.contains(control)) return false;
        const rect = control.getBoundingClientRect();
        const clearance = 24;
        return rect.width > 0 && rect.height > 0 && bounds.left - clearance < rect.right && bounds.right + clearance > rect.left && bounds.top - clearance < rect.bottom && bounds.bottom + clearance > rect.top;
      });
      setOverControl(previous => previous === overlaps ? previous : overlaps);
    };
    measure();
    const interval = setInterval(measure, 80);
    return () => clearInterval(interval);
  }, [appActive]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => setAppActive(nextState === 'active'));
    if (Platform.OS !== 'web' || typeof document === 'undefined') return () => subscription.remove();
    const updateVisibility = () => setAppActive(document.visibilityState === 'visible' && AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    document.addEventListener('visibilitychange', updateVisibility);
    updateVisibility();
    return () => { subscription.remove(); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);

  useEffect(() => {
    positionX.stopAnimation();
    positionY.stopAnimation();
    positionX.setValue(0);
    positionY.setValue(0);
    facing.setValue(-1);
    setWalking(false);
    setJumping(false);
    if (reducedMotion || !appActive || state === 'dead' || width < 240 || height < 240) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let actionCycle = 0;
    let passCount = 0;
    let direction = -1;
    let cleanupPush: (() => void) | null = null;
    let baseline = { x: Math.max(0, width - 84), y: Math.max(0, height - 92) };
    let currentPoint = { ...baseline };

    // Widget slots expose their actual web positions. The pet may overlap a
    // card's blank edge; text and controls are measured separately for landings.
    const visibleWidgets = () => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
      const pet = document.querySelector('[data-testid="pet-wanderer"]');
      const root = pet?.parentElement?.getBoundingClientRect();
      if (!root) return null;
      baseline = { x: Math.max(0, root.width - 84), y: Math.max(0, root.height - 92) };
      const visibleRect = (node: HTMLElement) => {
        const source = node.getBoundingClientRect();
        let left = Math.max(source.left, root.left), top = Math.max(source.top, root.top);
        let right = Math.min(source.right, root.right), bottom = Math.min(source.bottom, root.bottom);
        for (let ancestor = node.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = window.getComputedStyle(ancestor);
          if (!/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) continue;
          const clip = ancestor.getBoundingClientRect();
          left = Math.max(left, clip.left); top = Math.max(top, clip.top);
          right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
        }
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      };
      const contentRects = (card: HTMLElement) => {
        const rects: Rect[] = [];
        for (const node of Array.from(card.querySelectorAll<HTMLElement>('button,a,input,textarea,select,[role="button"],[role="checkbox"],[role="switch"],[tabindex]:not([tabindex="-1"])'))) {
          const rect = node.getBoundingClientRect();
          if (rect.width && rect.height) rects.push({ left: rect.left - root.left, top: rect.top - root.top, right: rect.right - root.left, bottom: rect.bottom - root.top });
        }
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (node.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of Array.from(range.getClientRects())) if (rect.width && rect.height) rects.push({ left: rect.left - root.left, top: rect.top - root.top, right: rect.right - root.left, bottom: rect.bottom - root.top });
            range.detach();
          }
          node = walker.nextNode();
        }
        return rects;
      };
      const slots = Array.from(document.querySelectorAll<HTMLElement>('[data-widget-slot]'))
        .map(slot => {
          const card = slot.querySelector<HTMLElement>(':scope > [data-testid^="widget-"]');
          return card ? { id: slot.dataset.widgetSlot ?? '', slot, card, rect: visibleRect(card), textRects: contentRects(card) } : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item && item.rect.width > 0 && item.rect.height > 0));
      return { root, widgets: slots.map(item => ({ ...item, rect: { left: item.rect.left - root.left, top: item.rect.top - root.top, right: item.rect.right - root.left, bottom: item.rect.bottom - root.top } })) };
    };

    const pickWidgetAction = () => {
      const measured = visibleWidgets();
      if (!measured || !measured.widgets.length) return null;
      const { root, widgets } = measured;
      const petCenterY = currentPoint.y + PET_SIZE / 2;
      const nearby = widgets
        .filter(widget => widget.rect.top < currentPoint.y + PET_SIZE && widget.rect.bottom > currentPoint.y
          && (widget.rect.left - PET_SIZE - 8 >= 4 || widget.rect.right + PET_SIZE + 8 <= root.width - 4))
        .sort((a, b) => {
          const distance = (rect: Rect) => Math.abs((rect.top + rect.bottom) / 2 - petCenterY)
            + Math.min(Math.abs(rect.left - PET_SIZE - 8 - currentPoint.x), Math.abs(rect.right + 8 - currentPoint.x));
          return distance(a.rect) - distance(b.rect);
        })
        .slice(0, 2);
      if (!nearby.length) return null;
      const target = nearby[Math.floor(Math.random() * nearby.length)];
      const r = target.rect;
      const canApproachLeft = r.left - PET_SIZE - 8 >= 4;
      const canApproachRight = r.right + PET_SIZE + 8 <= root.width - 4;
      if (!canApproachLeft && !canApproachRight) return null;
      const side: 'left' | 'right' = canApproachLeft && canApproachRight
        ? (Math.abs(r.left - PET_SIZE - 8 - currentPoint.x) <= Math.abs(r.right + 8 - currentPoint.x) ? 'left' : 'right')
        : canApproachLeft ? 'left' : 'right';
      const launch = side === 'left'
        ? { x: r.left - PET_SIZE - 8, y: currentPoint.y }
        : { x: r.right + 8, y: currentPoint.y };
      const textAndControls = target.textRects;
      const approach = horizontalPetPath(currentPoint, launch, root.width, root.height);
      if (!approach) return null;
      const clearOfCopy = (point: Point, from: Point = point) => {
        const swept = { left: Math.min(point.x, from.x), top: Math.min(point.y, from.y), right: Math.max(point.x, from.x) + PET_SIZE, bottom: Math.max(point.y, from.y) + PET_SIZE };
        return textAndControls.every(rect => swept.right <= rect.left - 2 || swept.left >= rect.right + 2 || swept.bottom <= rect.top - 2 || swept.top >= rect.bottom + 2);
      };
      const candidates: Array<{ kind: 'peek' | 'land' | 'push'; point: Point; launch: Point; approach: Point[] }> = [];
      // Both peek and landing occupy only a 12px blank strip over the card edge.
      const peek = { x: side === 'left' ? r.left - PET_SIZE + 12 : r.right - PET_SIZE + 12, y: currentPoint.y };
      if (clearOfCopy(peek, launch)) candidates.push({ kind: 'peek', point: peek, launch, approach });
      const landingX = side === 'left' ? r.left + 10 : r.right - PET_SIZE - 10;
      const landing = { x: landingX, y: r.top - PET_SIZE + 8 };
      if (landingX >= 4 && landingX + PET_SIZE <= root.width - 4 && landing.y >= 4 && landing.y + PET_SIZE <= root.height - 4 && isShortPetJump(launch, landing)) {
        candidates.push({ kind: 'land', point: landing, launch, approach: approach.concat([landing]) });
      }
      candidates.push({ kind: 'push', point: launch, launch, approach });
      if (!candidates.length) return null;
      const preferred = (['push', 'land', 'peek'] as const)[actionCycle % 3];
      const selected = candidates.find(candidate => candidate.kind === preferred) ?? candidates[0];
      actionCycle++;
      return { ...selected, target, measuredRoot: root };
    };

    const moveTo = (point: Point, next: () => void, durationOverride?: number) => {
      const dx = point.x - currentPoint.x, dy = point.y - currentPoint.y;
      direction = dx < 0 ? -1 : 1;
      facing.setValue(direction);
      setWalking(true);
      const duration = durationOverride ?? Math.max(500, Math.hypot(dx, dy) / 42 * 1000);
      Animated.parallel([
        Animated.timing(positionX, { toValue: point.x - baseline.x, duration, easing: durationOverride ? Easing.inOut(Easing.cubic) : Easing.linear, useNativeDriver: true }),
        Animated.timing(positionY, { toValue: point.y - baseline.y, duration, easing: durationOverride ? Easing.inOut(Easing.cubic) : Easing.linear, useNativeDriver: true }),
      ]).start(({ finished }) => { if (active && finished) { currentPoint = point; setWalking(false); next(); } });
    };

    const moveAlong = (points: Point[], next: () => void, jumpingAtEnd = false) => {
      const walk = (index: number) => {
        if (!active) return;
        if (index >= points.length) { setWalking(false); next(); return; }
        const finalHop = jumpingAtEnd && index === points.length - 1;
        if (finalHop) setJumping(true);
        moveTo(points[index], () => {
          if (finalHop) setJumping(false);
          walk(index + 1);
        }, finalHop ? 430 : undefined);
      };
      walk(0);
    };

    const clearWidgetPush = () => {
      cleanupPush?.();
      cleanupPush = null;
    };

    const runPass = () => {
      if (!active) return;
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.querySelector('[data-testid="widget-drag-grid"]')?.getAttribute('data-drag-active') === 'true') {
        timeout = setTimeout(runPass, 1200);
        return;
      }
      const action = passCount++ % 2 === 0 ? pickWidgetAction() : null;
      if (action) {
        const faceCard = () => facing.setValue(action.measuredRoot.left + (action.target.rect.left + action.target.rect.right) / 2 < action.measuredRoot.left + currentPoint.x + PET_SIZE / 2 ? -1 : 1);
        const returnHome = (from?: Point, landed = false) => {
          const goHome = () => {
            const measured = visibleWidgets();
            const route = horizontalPetPath(currentPoint, baseline, measured?.root.width ?? width, measured?.root.height ?? height);
            if (route) moveAlong(route, () => { timeout = setTimeout(runPass, 2500 + Math.random() * 4000); });
            else {
              positionX.setValue(0); positionY.setValue(0); currentPoint = { ...baseline };
              timeout = setTimeout(runPass, 2500 + Math.random() * 4000);
            }
          };
          if (from) {
            if (landed) setJumping(true);
            moveTo(from, () => { if (landed) setJumping(false); goHome(); }, landed ? 430 : undefined);
          } else goHome();
        };
        moveAlong(action.approach, () => {
          faceCard();
          if (action.kind === 'peek') {
            moveTo(action.point, () => {
              faceCard();
              timeout = setTimeout(() => returnHome(action.launch), 750);
            }, 260);
          } else if (action.kind === 'land') {
            timeout = setTimeout(() => returnHome(action.launch, true), 650);
          } else {
            const card = action.target.card;
            const oldTranslate = card.style.translate;
            const oldTransition = card.style.transition;
            const push = action.point.y < action.target.rect.top ? '0px 5px' : currentPoint.x < (action.target.rect.left + action.target.rect.right) / 2 ? '5px 0px' : '-5px 0px';
            card.style.transition = 'translate 110ms ease-out';
            card.style.translate = push;
            timeout = setTimeout(() => {
              card.style.translate = '0px 0px';
              timeout = setTimeout(() => {
                card.style.translate = oldTranslate;
                card.style.transition = oldTransition;
                cleanupPush = null;
                returnHome();
              }, 130);
            }, 110);
            cleanupPush = () => { card.style.translate = oldTranslate; card.style.transition = oldTransition; };
          }
        }, action.kind === 'land');
        return;
      }

      // Ordinary strolls choose a fresh direction and endpoint, with varied
      // pauses. The route planner rejects paths through cards or their text.
      const measured = visibleWidgets();
      const rootWidth = measured?.root.width ?? width, rootHeight = measured?.root.height ?? height;
      const minX = 8, maxX = Math.max(minX, rootWidth - PET_SIZE - 8);
      const travel = Math.min(80 + Math.random() * 180, Math.max(32, maxX - minX));
      const sign = Math.random() < .5 ? -1 : 1;
      let destinationX = Math.max(minX, Math.min(maxX, currentPoint.x + sign * travel));
      if (Math.abs(destinationX - currentPoint.x) < 32) destinationX = Math.max(minX, Math.min(maxX, currentPoint.x - sign * travel));
      const destination = { x: destinationX, y: baseline.y };
      const route = horizontalPetPath(currentPoint, destination, rootWidth, rootHeight);
      if (route) moveAlong(route, () => {
        timeout = setTimeout(() => {
          const latest = visibleWidgets();
          const homeRoute = horizontalPetPath(currentPoint, baseline, latest?.root.width ?? width, latest?.root.height ?? height);
          if (homeRoute) moveAlong(homeRoute, () => { timeout = setTimeout(runPass, 2600 + Math.random() * 4400); });
          else { positionX.setValue(0); positionY.setValue(0); currentPoint = { ...baseline }; timeout = setTimeout(runPass, 2600 + Math.random() * 4400); }
        }, 900 + Math.random() * 1600);
      });
      else timeout = setTimeout(runPass, 2600 + Math.random() * 4400);
    };

    const cancelTrip = () => {
      if (!active) return;
      if (timeout) clearTimeout(timeout);
      clearWidgetPush();
      positionX.stopAnimation();
      positionY.stopAnimation();
      positionX.setValue(0);
      positionY.setValue(0);
      currentPoint = { ...baseline };
      setWalking(false);
      setJumping(false);
      timeout = setTimeout(runPass, 1400);
    };
    const handleDragMove = () => {
      if (typeof document !== 'undefined' && document.querySelector('[data-testid="widget-drag-grid"]')?.getAttribute('data-drag-active') === 'true') cancelTrip();
    };
    const workspace = typeof document !== 'undefined' ? document.querySelector('[data-testid="workspace-content"]') : null;
    let screenNode = workspace?.firstElementChild ?? null;
    const screenObserver = workspace && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
      const next = workspace.firstElementChild;
      if (next !== screenNode) { screenNode = next; cancelTrip(); }
    }) : null;
    if (workspace && screenObserver) screenObserver.observe(workspace, { childList: true });
    const grid = typeof document !== 'undefined' ? document.querySelector('[data-testid="widget-drag-grid"]') : null;
    const dragObserver = grid && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
      handleDragMove();
      if (grid.getAttribute('data-drag-active') !== 'true') cancelTrip();
    }) : null;
    if (grid && dragObserver) dragObserver.observe(grid, { attributes: true, attributeFilter: ['data-drag-active'], childList: true });
    if (Platform.OS === 'web') {
      window.addEventListener('scroll', cancelTrip, true);
      window.addEventListener('pointermove', handleDragMove, true);
    }
    timeout = setTimeout(runPass, 2200);
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      clearWidgetPush();
      screenObserver?.disconnect();
      dragObserver?.disconnect();
      if (Platform.OS === 'web') {
        window.removeEventListener('scroll', cancelTrip, true);
        window.removeEventListener('pointermove', handleDragMove, true);
      }
      positionX.stopAnimation();
      positionY.stopAnimation();
      facing.stopAnimation();
    };
  }, [appActive, facing, height, positionX, positionY, reducedMotion, state, width]);

  return <Animated.View testID="pet-wanderer" pointerEvents={overControl ? 'none' : 'auto'} style={{ position: 'absolute', right: 12, bottom: 20, zIndex: 20, transform: [{ translateX: positionX }, { translateY: positionY }] }}>
    <PetCompanion name={displayName} state={state === 'egg' ? 'alive' : state} pose={pose} size={72}
      walking={walking && appActive && !reducedMotion && state !== 'dead'} facing={facing}
      jumping={jumping && appActive && !reducedMotion && state !== 'dead'}
      ambientMotion={false}
      accessibilityLabel={state === 'egg' ? `Познакомиться с питомцем ${displayName}` : `Открыть домик питомца ${displayName}`} onPress={onPress} />
  </Animated.View>;
}
