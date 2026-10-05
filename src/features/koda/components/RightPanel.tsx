import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from 'react-native';
import { PanelRight, X } from 'lucide-react-native';
import { accent, muted, panel, line } from '../theme';

const PanelContext = createContext({ open: false, setOpen: (_open: boolean) => {}, register: (_delta: number) => {} });

export function useRightPanel() {
  const { open, setOpen } = useContext(PanelContext);
  return { open, setOpen };
}

export function RightPanelProvider({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const register = useRef((delta: number) => setCount((value) => value + delta)).current;
  return <PanelContext.Provider value={{ open, setOpen, register }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16, minHeight: 60 }}><Text style={{ flex: 1, color: muted, fontSize: 12 }}>Моё пространство / {title}</Text>{actions}{count > 0 ? <View>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Скрыть правую панель' : 'Показать правую панель'} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ backgroundColor: panel, borderColor: line, borderWidth: 1, borderRadius: 14, padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <PanelRight color={open ? accent : muted} size={22} />
      </Pressable>
    </View> : null}</View>
    {children}
  </PanelContext.Provider>;
}

export function useReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduceMotion;
}

export function RightPanel({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const { open, setOpen, register } = useContext(PanelContext);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => { if (!enabled) return; register(1); return () => register(-1); }, [enabled, register]);
  useEffect(() => {
    if (open) setMounted(true);
    const animation = Animated.timing(progress, { toValue: open ? 1 : 0, duration: reduceMotion ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(({ finished }) => { if (finished && !open) setMounted(false); });
    return () => animation.stop();
  }, [open, progress, reduceMotion]);
  if (!enabled) return <>{children}</>;
  return <Animated.View pointerEvents={open ? 'auto' : 'none'} style={{ flexShrink: 0, overflow: 'hidden', width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 302] }), opacity: progress }}>
    {mounted ? <Animated.View style={{ marginLeft: 20, width: 282, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
      <View style={{ alignItems: 'flex-end' }}><Pressable accessibilityRole="button" accessibilityLabel="Закрыть правую панель" onPress={() => setOpen(false)} style={{ padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><X color={muted} size={18} /></Pressable></View>
      {children}
    </Animated.View> : null}
  </Animated.View>;
}
