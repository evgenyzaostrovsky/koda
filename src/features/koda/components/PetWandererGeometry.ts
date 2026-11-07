export type PetRoutePoint = { x: number; y: number };
export type PetRouteRect = { left: number; top: number; right: number; bottom: number };

const PET_SIZE = 72;
export const MAX_PET_JUMP_Y = 100;

export function isShortPetJump(from: PetRoutePoint, to: PetRoutePoint): boolean {
  return Math.abs(to.y - from.y) <= MAX_PET_JUMP_Y;
}

/** Walking is constrained to a single horizontal screen lane. */
export function horizontalPetPath(start: PetRoutePoint, end: PetRoutePoint, width: number, height: number): PetRoutePoint[] | null {
  const maxX = width - PET_SIZE - 4, maxY = height - PET_SIZE - 4;
  const inBounds = (point: PetRoutePoint) => point.x >= 4 && point.x <= maxX && point.y >= 4 && point.y <= maxY;
  if (!inBounds(start) || !inBounds(end) || Math.abs(start.y - end.y) > .01) return null;
  return Math.abs(start.x - end.x) <= 1 ? [] : [end];
}

/** A landing must have space for the whole pet above the card, not inside a
 * neighbouring bubble. All coordinates are viewport coordinates. */
export function petSurfaceLanding(target: PetRouteRect, obstacles: PetRouteRect[], viewportWidth: number, size = 72): PetRoutePoint | null {
  const y = target.top - size;
  if (y < 8 || target.right - target.left < size) return null;
  const inset = Math.min(34, (target.right - target.left - size) / 2);
  const centers = [(target.left + target.right - size) / 2, target.left + inset, target.right - size - inset];
  for (const x of centers) {
    if (x < 8 || x + size > viewportWidth - 8) continue;
    if (obstacles.some(rect => rect.left < x + size && rect.right > x && rect.top < target.top - .5 && rect.bottom > y + .5)) continue;
    return {x, y};
  }
  return null;
}
