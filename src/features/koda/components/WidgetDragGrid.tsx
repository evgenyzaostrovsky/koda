import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Platform, View } from 'react-native';
import type { WidgetId } from '../widgetDesktop';

type Item = { id: WidgetId; label: string; content: ReactNode; placement: CSSProperties; onOpen: () => void };
type Props = { items: Item[]; columns: boolean | number; gap: number; enabled: boolean; masonry?: boolean; onMove: (source: WidgetId, target: WidgetId) => void };
type Gesture = { id: WidgetId; pointer: number; x: number; y: number; active: boolean; target: WidgetId; node: HTMLDivElement };

/** Click opens a widget, movement reorders it, and keyboard controls remain available. */
export function WidgetDragGrid({ items, columns, gap, enabled, masonry=false, onMove }: Props) {
  const nodes = useRef(new Map<WidgetId, HTMLDivElement>());
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const [drag, setDrag] = useState<{ id: WidgetId; target: WidgetId; dx: number; dy: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [heights, setHeights] = useState<Partial<Record<WidgetId, number>>>({});
  const itemKeys = items.map(item=>item.id).join(',');
  useEffect(() => {
    if (Platform.OS !== 'web' || !masonry) return;
    const measure = () => {
      const next: Partial<Record<WidgetId, number>> = {};
      for (const [id,node] of nodes.current) next[id] = Math.ceil(node.getBoundingClientRect().height);
      setHeights(previous => Object.keys(next).every(id=>previous[id as WidgetId]===next[id as WidgetId]) && Object.keys(previous).length===Object.keys(next).length ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    for (const node of nodes.current.values()) observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [masonry,itemKeys]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !drag) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const current = gesture.current;
      gesture.current = null;
      setDrag(null);
      suppressClickUntil.current = Date.now() + 350;
      if (current?.node.hasPointerCapture(current.pointer)) current.node.releasePointerCapture(current.pointer);
      setAnnouncement('Перенос отменён.');
      event.preventDefault();
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [Boolean(drag)]);
  if (Platform.OS !== 'web') return <View style={{ gap }}>{items.map(item => <View key={item.id}>{item.content}</View>)}</View>;

  function begin(event: ReactPointerEvent<HTMLDivElement>, id: WidgetId) {
    if (!enabled || event.button !== 0 || !['mouse', 'touch'].includes(event.pointerType)) return;
    const target = event.target as HTMLElement;
    const interactive = target.closest('button,a,input,textarea,select,[role="button"],[role="checkbox"],[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])');
    if (interactive && interactive !== event.currentTarget) return;
    gesture.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, active: false, target: id, node: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.active && Math.hypot(dx, dy) < 8) return;
    current.active = true;
    let nearest = current.id, distance = Infinity;
    for (const [id, node] of nodes.current) {
      if (id === current.id) continue;
      const rect = node.getBoundingClientRect();
      const x = Math.max(rect.left, Math.min(event.clientX, rect.right));
      const y = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
      const candidate = Math.hypot(event.clientX - x, event.clientY - y);
      if (candidate < distance) { distance = candidate; nearest = id; }
    }
    // Only highlight a tile under/near the pointer; releasing outside cancels the move.
    current.target = distance < 45 ? nearest : current.id;
    setDrag({ id: current.id, target: current.target, dx, dy });
    let scroller = current.node.parentElement;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight + 2) scroller = scroller.parentElement;
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      if (event.clientY > rect.bottom - 64) scroller.scrollTop += 20;
      else if (event.clientY < rect.top + 64) scroller.scrollTop -= 20;
    }
    event.preventDefault();
  }
  function finish(event: ReactPointerEvent<HTMLDivElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    gesture.current = null;
    setDrag(null);
    if (current.node.hasPointerCapture(event.pointerId)) current.node.releasePointerCapture(event.pointerId);
    if (current.active) {
      suppressClickUntil.current = Date.now() + 350;
      if (!cancel && current.id !== current.target) {
        onMove(current.id, current.target);
        setAnnouncement(`Виджет «${items.find(item => item.id === current.id)?.label}» перемещён. Порядок сохранён на этом устройстве.`);
      }
    }
  }
  return <>
    <div data-testid="widget-drag-grid" data-drag-active={drag ? "true" : "false"} style={{ display: 'grid', gridTemplateColumns: columns ? `repeat(${typeof columns === 'number' ? columns : 12},minmax(0,1fr))` : 'minmax(0,1fr)', columnGap:gap, rowGap:masonry?0:gap, gridAutoRows:masonry?'1px':undefined, gridAutoFlow:masonry?'row dense':undefined, alignItems: 'stretch', minWidth: 0 }}>
      {items.map(item => <div key={item.id} ref={node => { if (node) nodes.current.set(item.id, node); else nodes.current.delete(item.id); }}
        className="koda-widget-slot" data-widget-slot={item.id}
        onPointerDown={event => begin(event, item.id)} onPointerMove={move}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={event => { if (gesture.current) finish(event, true); }}
        role="group" tabIndex={0} aria-label={`${item.label}. Нажмите Enter, чтобы открыть. Стрелками можно изменить порядок.`}
        onClick={event => {
          if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); return; }
          const target = event.target as HTMLElement;
          const interactive = target.closest('button,a,input,textarea,select,[role="button"],[role="checkbox"],[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])');
          if (interactive && interactive !== event.currentTarget) return;
          item.onOpen();
        }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (['Enter', ' '].includes(event.key)) { event.preventDefault(); item.onOpen(); return; }
          if (!enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const index = items.findIndex(candidate => candidate.id === item.id);
          const target = items[index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)];
          if (target) { onMove(item.id, target.id); setAnnouncement(`Виджет «${item.label}» перемещён.`); }
        }}
        style={{ ...item.placement, ...(masonry?{gridRowEnd:`span ${(heights[item.id]??320)+gap}`,alignSelf:'start'}:{}), position: 'relative', minWidth: 0, display: 'flex', touchAction: 'pan-y', cursor: enabled ? 'grab' : undefined,
          ...(drag?.id === item.id ? { transform: `translate(${drag.dx}px,${drag.dy}px)`, opacity: .78, zIndex: 30, cursor: 'grabbing', userSelect: 'none' } : {}),
          ...(drag && drag.target === item.id && drag.id !== item.id ? { outline: '2px dashed #426528', outlineOffset: 5, borderRadius: 28 } : {}) }}>
        {item.content}
      </div>)}
    </div>
    <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{announcement}</span>
  </>;
}
