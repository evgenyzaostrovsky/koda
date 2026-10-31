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
