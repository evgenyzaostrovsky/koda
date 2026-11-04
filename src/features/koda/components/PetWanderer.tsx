import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Keyboard, Platform, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getPetActionFrameBounds, getPetClimbHandX, PetCompanion, type PetActionPose, type PetClimbPose, type PetLifeState, type PetPose } from './PetCompanion';
import { useReducedMotion } from './RightPanel';

type Scene = 'rest' | 'approach' | 'push' | 'hop' | 'roam' | 'big-jump' | 'look-user';
type Point = { x: number; y: number };
type WidgetRect = { id: string; element?: HTMLElement; left: number; top: number; right: number; bottom: number; width: number; height: number };
type WidgetApproach = { side: 'left' | 'right' | 'below' | 'current'; facing: 1 | -1; point: Point };
type VineScene = { id: number; x: number; top: number; height: number; opacity: Animated.Value };
type FlightPath = {
  x: Animated.AnimatedInterpolation<number>;
  y: Animated.AnimatedInterpolation<number>;
  progress: Animated.Value;
  from: Point;
  to: Point;
  height: number;
  listenerId: string;
};

const PET_SIZE = 72;
const SURFACE_SELECTOR = '[data-widget-slot], [data-pet-surface]';

// Keep the real top edge for landing, but use only the visible side for contact.
// A tall card remains playable when its bottom extends below a scroll viewport.
function measureSurface(element: HTMLElement, id: string): WidgetRect | null {
  if (!element.isConnected || element.closest('[role="dialog"], [aria-modal="true"], [aria-hidden="true"], [data-pet-surface="off"]') || element.querySelector('input, textarea, select, [contenteditable="true"]')) return null;
  const rect = element.getBoundingClientRect();
  let clipTop = 0, clipLeft = 0;
  let clipBottom = window.innerHeight, clipRight = document.documentElement.clientWidth || window.innerWidth;
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    if (parent === element) continue;
    const bounds = parent.getBoundingClientRect();
    if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { clipTop = Math.max(clipTop, bounds.top); clipBottom = Math.min(clipBottom, bounds.bottom); }
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { clipLeft = Math.max(clipLeft, bounds.left); clipRight = Math.min(clipRight, bounds.right); }
  }
  const bottom = Math.min(rect.bottom, clipBottom);
  if (rect.width < 60 || rect.height < 60 || rect.top < Math.max(PET_SIZE + 8, clipTop) || bottom - rect.top < 60 || rect.left < clipLeft || rect.right > clipRight) return null;
  return { id, element, left: rect.left, right: rect.right, top: rect.top, bottom, width: rect.width, height: bottom - rect.top };
}

const pick = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pointOnArc = (from: Point, to: Point, height: number, progress: number): Point => {
  const t = clamp(progress, 0, 1);
  return { x: from.x + (to.x - from.x) * t, y: Math.max(8, from.y + (to.y - from.y) * t - 4 * height * t * (1 - t)) };
};

export function PetWanderer({ name, state, pose, onPress }: {
  name: string;
  state: PetLifeState;
  pose: PetPose;
  onPress: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [blocked, setBlocked] = useState(false);
  const [navigationPaused, setNavigationPaused] = useState(false);
  const [scene, setScene] = useState<Scene>('rest');
  const [scenePose, setScenePose] = useState<PetPose | null>(null);
  const [actionPose, setActionPose] = useState<PetActionPose | null>(null);
  const [climbFrame, setClimbFrame] = useState<PetClimbPose>('climb-reach');
  const [walking, setWalking] = useState(false);
  const [climbing, setClimbing] = useState(false);
  const [vine, setVine] = useState<VineScene | null>(null);
  const [flightMode, setFlightMode] = useState(false);
  const [targetId, setTargetId] = useState('');
  const displayState: PetLifeState = state === 'egg' ? 'alive' : state;
  const displayName = name.trim() || 'Кодик';
  const basePose = useRef(pose);
  basePose.current = pose;
  const initialPoint = { x: Math.max(8, width - PET_SIZE - 16), y: Math.max(8, height - PET_SIZE - 20) };
  const position = useRef(new Animated.ValueXY(initialPoint)).current;
  const springOffset = useRef(new Animated.Value(0)).current;
  const point = useRef<Point>(initialPoint);
  const facing = useRef(new Animated.Value(-1)).current;
  const flightPath = useRef<FlightPath | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const climbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const widgetAnimations = useRef<Animation[]>([]);
  const vineOpacity = useRef<Animated.Value | null>(null);

  const syncBlocked = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    const inputFocused = Boolean(active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable));
    const dialogOpen = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).some(node => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
    setBlocked(inputFocused || dialogOpen);
  }, []);

  useEffect(() => {
    const appSubscription = AppState.addEventListener('change', value => setAppActive(value === 'active'));
    const keyboardShow = Keyboard.addListener('keyboardDidShow', () => setBlocked(true));
    const keyboardHide = Keyboard.addListener('keyboardDidHide', () => Platform.OS === 'web' ? syncBlocked() : setBlocked(false));
    if (Platform.OS !== 'web' || typeof document === 'undefined') return () => { appSubscription.remove(); keyboardShow.remove(); keyboardHide.remove(); };
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const focusOut = () => { if (focusTimer) clearTimeout(focusTimer); focusTimer = setTimeout(() => { focusTimer = null; syncBlocked(); }, 0); };
    const focus = () => { setAppActive(true); syncBlocked(); };
    const blur = () => setAppActive(false);
    const visibility = () => setAppActive(document.visibilityState === 'visible');
    document.addEventListener('focusin', syncBlocked);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(syncBlocked);
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'aria-modal', 'role', 'hidden', 'class'] });
    syncBlocked();
    return () => {
      appSubscription.remove(); keyboardShow.remove(); keyboardHide.remove();
      document.removeEventListener('focusin', syncBlocked);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
      if (focusTimer) clearTimeout(focusTimer);
      observer?.disconnect();
    };
  }, [syncBlocked]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const pause = () => {
      setNavigationPaused(true);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = null; setNavigationPaused(false); }, 260);
    };
    window.addEventListener('scroll', pause, { capture: true, passive: true });
    window.addEventListener('hashchange', pause);
    window.addEventListener('popstate', pause);
    return () => {
      window.removeEventListener('scroll', pause, true);
      window.removeEventListener('hashchange', pause);
      window.removeEventListener('popstate', pause);
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  useEffect(() => {
    const safe = { x: clamp(point.current.x, 8, Math.max(8, width - PET_SIZE - 8)), y: clamp(point.current.y, 8, Math.max(8, height - PET_SIZE - 8)) };
    point.current = safe;
    position.setValue(safe);
  }, [height, position, width]);

  const widgets = useCallback((): WidgetRect[] => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return [];
    const elements = Array.from(document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR));
    return elements.flatMap((element, index) => {
      // Dashboard slots already contain a marked card: animate their outer slot once.
      if (element.parentElement?.closest(SURFACE_SELECTOR)) return [];
      const measured = measureSurface(element, element.dataset.widgetSlot || `${element.dataset.petSurface || 'card'}-${index}`);
      return measured ? [measured] : [];
    });
  }, []);

  const live = appActive && !blocked && displayState === 'alive';
  useEffect(() => {
    activeAnimation.current?.stop();
    widgetAnimations.current.forEach(animation => animation.cancel());
    widgetAnimations.current = [];
    const previousFlight = flightPath.current;
    if (previousFlight) {
      previousFlight.progress.stopAnimation(value => { point.current = pointOnArc(previousFlight.from, previousFlight.to, previousFlight.height, value); position.setValue(point.current); });
      previousFlight.progress.removeListener(previousFlight.listenerId);
      flightPath.current = null;
      setFlightMode(false);
    } else position.stopAnimation(value => { point.current = value; });
    facing.stopAnimation();
    springOffset.stopAnimation(); springOffset.setValue(0);
    vineOpacity.current?.stopAnimation();
    vineOpacity.current = null;
    activeAnimation.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (climbTimer.current) clearTimeout(climbTimer.current);
    timer.current = null;
    climbTimer.current = null;
    setWalking(false);
    setClimbing(false); setVine(null);
    setScene('rest'); setScenePose(null); setActionPose(null); setTargetId('');
    if (!live || navigationPaused || reducedMotion) return;

    let cancelled = false;
    const safePoint = (p: Point): Point => ({ x: clamp(p.x, 8, Math.max(8, width - PET_SIZE - 8)), y: clamp(p.y, 8, Math.max(8, height - PET_SIZE - 8)) });
    const wait = (ms: number, done: () => void) => { timer.current = setTimeout(() => { timer.current = null; if (!cancelled) done(); }, ms); };
    const climbVertical = (target: Point, done: () => void) => {
      const from = point.current;
      const direction = target.y < from.y ? -1 : 1;
      if (Math.abs(target.y - from.y) <= 24) { point.current = target; setClimbing(false); done(); return; }
      const vineTop = Math.max(8, Math.min(from.y, target.y) - 18);
      const vineHeight = Math.max(24, Math.min(height - vineTop - 8, Math.abs(target.y - from.y) + PET_SIZE + 36));
      const opacity = new Animated.Value(0);
      vineOpacity.current = opacity;
      setVine({ id: Date.now(), x: target.x + getPetClimbHandX(PET_SIZE) - 18, top: vineTop, height: vineHeight, opacity });
      setClimbing(true); setWalking(false); setActionPose(null);
      facing.setValue(1);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      let y = from.y;
      let frame: PetClimbPose = direction < 0 ? 'climb-pull' : 'climb-reach';
      const climbStep = () => {
        if (cancelled) return;
        frame = frame === 'climb-reach' ? 'climb-pull' : 'climb-reach';
        setClimbFrame(frame);
        const nextY = y + direction * Math.min(22, Math.abs(target.y - y));
        activeAnimation.current = Animated.timing(position.y, {
          toValue: nextY,
          duration: 280,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        });
        activeAnimation.current.start(({ finished }) => {
          if (!finished || cancelled) return;
          y = nextY; point.current = { x: target.x, y };
          if (Math.abs(target.y - y) > .5) { climbTimer.current = setTimeout(climbStep, 24); return; }
          point.current = target; setClimbing(false);
          Animated.timing(opacity, { toValue: 0, duration: 360, delay: 90, useNativeDriver: true }).start(() => {
            if (vineOpacity.current === opacity) { setVine(null); vineOpacity.current = null; }
          });
          done();
        });
      };
      setClimbFrame(frame); climbStep();
    };
    const moveTo = (p: Point, done: () => void) => {
      const target = safePoint(p); const from = point.current;
      const dy = target.y - from.y;
      const horizontalPoint = { x: target.x, y: from.y };
      const vertical = () => climbVertical(target, done);
      const walk = (walkTarget: Point, finish: () => void) => {
        const start = point.current;
        if (Math.hypot(walkTarget.x - start.x, walkTarget.y - start.y) < 2) { point.current = walkTarget; finish(); return; }
        if (Math.abs(walkTarget.x - start.x) > 2) facing.setValue(walkTarget.x < start.x ? -1 : 1);
        setWalking(true); setClimbing(false);
        const duration = Math.max(850, Math.min(3600, Math.hypot(walkTarget.x - start.x, walkTarget.y - start.y) / 40 * 1000));
        activeAnimation.current = Animated.parallel([
          Animated.timing(position.x, { toValue: walkTarget.x, duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(position.y, { toValue: walkTarget.y, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        ]);
        activeAnimation.current.start(({ finished }) => { if (!finished || cancelled) return; point.current = walkTarget; setWalking(false); finish(); });
      };
      if (Math.abs(dy) > 24) walk(horizontalPoint, vertical);
      else walk(target, done);
    };
    const arc = (from: Point, to: Point, desiredPeak: number, duration: number, done: () => void) => {
      const value = new Animated.Value(0);
      const heightLimit = (Math.sqrt(Math.max(0, from.y - 8)) + Math.sqrt(Math.max(0, to.y - 8))) ** 2 / 4;
      const h = clamp((from.y + to.y) / 2 - desiredPeak, 0, heightLimit);
      const inputRange = Array.from({ length: 31 }, (_, i) => i / 30);
      const outputX = inputRange.map(t => from.x + (to.x - from.x) * t);
      const outputY = inputRange.map(t => Math.max(8, from.y + (to.y - from.y) * t - 4 * h * t * (1 - t)));
      const listener = value.addListener(({ value: progress }) => { point.current = pointOnArc(from, to, h, progress); });
      flightPath.current = { x: value.interpolate({ inputRange, outputRange: outputX }), y: value.interpolate({ inputRange, outputRange: outputY }), progress: value, from, to, height: h, listenerId: listener };
      setFlightMode(true);
      activeAnimation.current = Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true });
      activeAnimation.current.start(({ finished }) => {
        if (!finished || cancelled) return;
        value.removeListener(listener); point.current = to; position.setValue(to); flightPath.current = null; setFlightMode(false); done();
      });
    };
    const freshWidget = (widget: WidgetRect): WidgetRect | null => {
      const element = widget.element;
      if (!element?.isConnected) return null;
      return measureSurface(element, widget.id);
    };
    const sideFor = (widget: WidgetRect): WidgetApproach | null => {
      const bounds = getPetActionFrameBounds('push-ready', PET_SIZE);
      const leftOk = widget.left >= bounds.right + 8;
      // The push frames are right-aligned to the canvas before mirroring, so
      // their mirrored left edge is exactly the canvas edge.
      const rightOk = width - widget.right >= PET_SIZE + 8;
      if (!leftOk && !rightOk) return null;
      const side: 'left' | 'right' = leftOk && rightOk ? (Math.random() < .8 ? 'left' : 'right') : leftOk ? 'left' : 'right';
      const x = side === 'left' ? widget.left - bounds.right : widget.right;
      return { side, facing: side === 'left' ? 1 : -1, point: safePoint({ x, y: widget.top + widget.height / 2 - PET_SIZE / 2 }) };
    };
    const approach = (widget: WidgetRect, allowFallback: boolean, done: (target: WidgetRect, side: WidgetApproach) => void) => {
      const fresh = freshWidget(widget); if (!fresh) { wait(800, startPush); return; }
      const side = sideFor(fresh) ?? (allowFallback ? (() => {
        const below = fresh.bottom + 6; const canStandBelow = below + PET_SIZE <= height - 8;
        const p = canStandBelow ? safePoint({ x: fresh.left + fresh.width / 2 - PET_SIZE / 2, y: below }) : safePoint(point.current);
        return { side: canStandBelow ? 'below' as const : 'current' as const, facing: p.x < fresh.left + fresh.width / 2 ? 1 as const : -1 as const, point: p };
      })() : null);
      if (!side) { wait(800, startPush); return; }
      setTargetId(fresh.id); setScene('approach'); setScenePose(basePose.current); setActionPose(null);
      moveTo(side.point, () => { facing.setValue(side.facing); point.current = side.point; done(fresh, side); });
    };
    const widgetAnimation = (widget: WidgetRect, dx: number, dy: number, duration: number) => new Promise<void>(resolve => {
      const element = widget.element;
      if (!element?.animate) { resolve(); return; }
      let animation: Animation;
      try {
        animation = element.animate([
          { translate: '0px 0px', offset: 0 },
          { translate: `${dx}px ${dy}px`, offset: .28, easing: 'cubic-bezier(.2,.8,.3,1)' },
          { translate: `${dx * 1.08}px ${dy * 1.08}px`, offset: .48, easing: 'cubic-bezier(.16,1,.3,1)' },
          { translate: '0px 0px', offset: 1, easing: 'cubic-bezier(.2,0,.8,1)' },
        ] as any, { duration, fill: 'none', composite: 'add', easing: 'cubic-bezier(.2,.8,.2,1)' } as any);
      } catch { resolve(); return; }
      widgetAnimations.current.push(animation);
      const finish = () => { widgetAnimations.current = widgetAnimations.current.filter(item => item !== animation); resolve(); };
      animation.onfinish = finish; animation.oncancel = finish;
    });
    const widgetLandingSpring = (widget: WidgetRect) => new Promise<void>(resolve => {
      const element = widget.element;
      if (!element?.animate) { resolve(); return; }
      let animation: Animation;
      try {
        animation = element.animate([
          { translate: '0px 0px', offset: 0 },
          { translate: '0px 7px', offset: .25 },
          { translate: '0px -3px', offset: .52 },
          { translate: '0px 1px', offset: .77 },
          { translate: '0px 0px', offset: 1 },
        ] as any, { duration: 650, fill: 'none', composite: 'add', easing: 'linear' } as any);
      } catch { resolve(); return; }
      widgetAnimations.current.push(animation);
      const finish = () => { widgetAnimations.current = widgetAnimations.current.filter(item => item !== animation); resolve(); };
      animation.onfinish = finish; animation.oncancel = finish;
    });
    const petPress = (side: WidgetApproach) => new Promise<void>(resolve => {
      activeAnimation.current = Animated.sequence([
        Animated.timing(position.x, { toValue: side.point.x + side.facing * 2, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(position.x, { toValue: side.point.x, duration: 260, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]);
      activeAnimation.current.start(() => { point.current = side.point; resolve(); });
    });
    const roam = (done: () => void) => {
      setScene('roam'); setScenePose(basePose.current); setActionPose(null); setTargetId('');
      const from = point.current;
      const to = safePoint({ x: 8 + Math.random() * Math.max(1, width - PET_SIZE - 16), y: 8 + Math.random() * Math.max(1, height - PET_SIZE - 16) });
      moveTo(to, () => {
        if (Math.random() > .2) { wait(700, done); return; }
        const landing = safePoint({ x: 8 + Math.random() * Math.max(1, width - PET_SIZE - 16), y: 8 + Math.random() * Math.max(1, height - PET_SIZE - 16) });
        setScene('big-jump'); setActionPose('jump-tuck'); facing.setValue(landing.x < to.x ? -1 : 1);
        arc(to, landing, Math.max(8, Math.min(to.y, landing.y) - 80), 1050, () => {
          setScenePose(basePose.current); setActionPose('land-brace'); wait(850, done);
        });
      });
    };
    const hop = (widget: WidgetRect, side: WidgetApproach) => {
      const current = freshWidget(widget);
      if (!current) { roam(() => wait(3500, startPush)); return; }
      setTargetId(current.id);
      const bounds = getPetActionFrameBounds('land-brace', PET_SIZE);
      const landing = safePoint({ x: current.left + current.width / 2 - (bounds.left + bounds.right) / 2, y: current.top - bounds.bottom });
      setScene('hop'); setScenePose(null); setActionPose('jump-tuck'); facing.setValue(landing.x < side.point.x ? -1 : 1);
      const desiredPeak = Math.max(8, landing.y - 60);
      arc(side.point, landing, desiredPeak, 1100, () => {
        point.current = landing; setActionPose('land-brace');
        springOffset.setValue(0);
        const bounceDone = new Promise<boolean>(resolve => {
          activeAnimation.current = Animated.timing(springOffset, { toValue: 1, duration: 650, easing: Easing.linear, useNativeDriver: true });
          activeAnimation.current.start(({ finished }) => resolve(finished));
        });
        Promise.all([widgetLandingSpring(current), bounceDone]).then(([, finished]) => {
          if (!finished || cancelled) return;
          point.current = landing;
          const stamp = (index: number) => {
            if (index >= 2) {
              setScene('look-user'); setActionPose(null); setScenePose('poses_01'); facing.setValue(1);
              wait(1300, () => roam(() => wait(8000 + Math.random() * 7000, startPush)));
              return;
            }
            const target = freshWidget(widget);
            if (!target) { roam(() => wait(3500, startPush)); return; }
            setActionPose('stomp');
            wait(130, () => {
              if (cancelled) return;
              setActionPose('land-brace');
              Promise.all([widgetAnimation(target, 0, 2, 390), new Promise<void>(resolve => {
              activeAnimation.current = Animated.sequence([
                Animated.timing(position.y, { toValue: landing.y + 2, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(position.y, { toValue: landing.y, duration: 230, easing: Easing.out(Easing.back(1.25)), useNativeDriver: true }),
              ]);
              activeAnimation.current.start(() => resolve());
              })]).then(() => { if (!cancelled) wait(160, () => stamp(index + 1)); });
            });
          };
          stamp(0);
        });
      });
    };
    function startPush() {
      if (cancelled) return;
      const visible = widgets(); const widget = visible.length ? pick(visible) : null;
      if (!widget) { roam(() => wait(3500 + Math.random() * 2500, startPush)); return; }
      const side = sideFor(widget);
      if (!side) { approach(widget, true, (target, fallback) => hop(target, fallback)); return; }
      approach(widget, false, (target, contact) => {
        setTargetId(target.id); setScene('push'); setScenePose(null); facing.setValue(contact.facing); setActionPose('push-ready');
        const attempt = (index: number) => {
          if (cancelled) return;
          if (index >= 3) {
            setScene('look-user'); setActionPose(null); setScenePose(basePose.current);
            wait(380, () => { setScenePose(basePose.current); hop(target, contact); });
            return;
          }
          setActionPose(index === 0 ? 'push-ready' : 'push-recoil');
          wait(110, () => {
            if (cancelled) return;
            setActionPose('push-drive');
            Promise.all([widgetAnimation(target, contact.facing * 3, 0, 480), petPress(contact)]).then(() => {
              if (cancelled) return;
              setActionPose('push-recoil'); point.current = contact.point;
              wait(120, () => attempt(index + 1));
            });
          });
        };
        attempt(0);
      });
    }
    timer.current = setTimeout(startPush, 1500);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (climbTimer.current) clearTimeout(climbTimer.current);
      activeAnimation.current?.stop();
      widgetAnimations.current.forEach(animation => animation.cancel()); widgetAnimations.current = [];
      vineOpacity.current?.stopAnimation(); vineOpacity.current = null;
      springOffset.stopAnimation();
      const activeFlight = flightPath.current;
      if (activeFlight) {
        activeFlight.progress.stopAnimation(value => { point.current = pointOnArc(activeFlight.from, activeFlight.to, activeFlight.height, value); position.setValue(point.current); });
        activeFlight.progress.removeListener(activeFlight.listenerId); flightPath.current = null;
      } else position.stopAnimation(value => { point.current = value; });
      facing.stopAnimation();
    };
  }, [appActive, blocked, facing, height, live, navigationPaused, position, reducedMotion, springOffset, state, widgets, width]);

  const visible = appActive && !blocked;
  const landingOffset = springOffset.interpolate({ inputRange: [0, .25, .52, .77, 1], outputRange: [0, 7, -3, 1, 0] });
  const translation = flightMode && flightPath.current ? [{ translateX: flightPath.current.x }, { translateY: flightPath.current.y }] : [...position.getTranslateTransform(), { translateY: landingOffset }];
  const vineVisual = vine ? <Animated.View testID="pet-vine" pointerEvents="none" style={{ position: 'absolute', left: vine.x, top: vine.top, width: 36, height: vine.height, opacity: vine.opacity, zIndex: 0 }}>
    <Svg pointerEvents="none" width="36" height={vine.height} viewBox={`0 0 36 ${vine.height}`}>
      <Path d={`M18 0 C6 ${vine.height * .2} 29 ${vine.height * .35} 17 ${vine.height * .52} C7 ${vine.height * .67} 28 ${vine.height * .82} 18 ${vine.height}`} fill="none" stroke="#819b62" strokeWidth="2.4" strokeLinecap="round" />
      <Path d={`M17 ${vine.height * .24} C6 ${vine.height * .17} 4 ${vine.height * .26} 10 ${vine.height * .31} C14 ${vine.height * .3} 16 ${vine.height * .28} 17 ${vine.height * .24} M20 ${vine.height * .48} C30 ${vine.height * .4} 33 ${vine.height * .48} 27 ${vine.height * .55} C24 ${vine.height * .55} 21 ${vine.height * .53} 20 ${vine.height * .48} M15 ${vine.height * .72} C5 ${vine.height * .65} 3 ${vine.height * .74} 9 ${vine.height * .8} C13 ${vine.height * .79} 15 ${vine.height * .76} 15 ${vine.height * .72}`} fill="#a8bd7b" opacity=".94" />
    </Svg>
  </Animated.View> : null;
  const pet = <Animated.View testID="pet-body" pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width: PET_SIZE, height: PET_SIZE, transform: translation }}>
    <PetCompanion name={displayName} state={displayState} pose={scenePose ?? pose} actionPose={actionPose ?? undefined} climbPose={climbing ? climbFrame : undefined} size={PET_SIZE} walking={walking && live && !reducedMotion} animatingScene={Boolean(actionPose) || climbing || scene === 'hop' || scene === 'big-jump'} facing={facing} accessibilityLabel={state === 'egg' ? `Познакомиться с питомцем ${displayName}` : `Открыть домик питомца ${displayName}`} onPress={onPress} />
  </Animated.View>;
  const overlayStyle = { position: Platform.OS === 'web' ? 'fixed' : 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 70, pointerEvents: 'none' } as any;
  if (Platform.OS === 'web') return createElement('div' as any, { 'data-testid': 'pet-wanderer', 'data-pet-scene': scene, 'data-pet-target': targetId, 'data-pet-action': actionPose ?? '', 'data-pet-locomotion': climbing ? 'climb' : walking ? 'walk' : '', 'data-pet-climb-frame': climbing ? climbFrame : '', 'aria-hidden': !visible, style: { ...overlayStyle, display: visible ? 'block' : 'none' } }, vineVisual, pet);
  return <View testID="pet-wanderer" pointerEvents="box-none" style={[overlayStyle, !visible && { display: 'none' }]}>{vineVisual}{pet}</View>;
}
