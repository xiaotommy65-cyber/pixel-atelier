export interface GridPos {
  x: number;
  y: number;
}

const CARDINAL_DIRS: readonly GridPos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Breadth-first shortest step on a 4-connected integer grid.
 * Returns the immediate next tile to step onto toward `goal`, or null if unreachable.
 */
export function findNextStep(
  width: number,
  height: number,
  start: GridPos,
  goal: GridPos,
  isWalkable: (x: number, y: number) => boolean,
): GridPos | null {
  if (start.x === goal.x && start.y === goal.y) return null;
  const toKey = (x: number, y: number) => y * width + x;
  const startKey = toKey(start.x, start.y);
  const goalKey = toKey(goal.x, goal.y);

  const visited = new Set<number>([startKey]);
  const firstStep = new Map<number, GridPos>();
  const queue: GridPos[] = [start];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curKey = toKey(cur.x, cur.y);

    for (const d of CARDINAL_DIRS) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nk = toKey(nx, ny);
      if (visited.has(nk)) continue;
      if (nk !== goalKey && !isWalkable(nx, ny)) continue;

      visited.add(nk);
      const step = curKey === startKey ? { x: nx, y: ny } : firstStep.get(curKey)!;
      if (nk === goalKey) return step;
      firstStep.set(nk, step);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/**
 * Bresenham line-of-sight check between two grid cells.
 */
export function hasLineOfSight(
  a: GridPos,
  b: GridPos,
  isOpaque: (x: number, y: number) => boolean,
): boolean {
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (!(x0 === x1 && y0 === y1)) {
    if (!(x0 === a.x && y0 === a.y) && !(x0 === x1 && y0 === y1) && isOpaque(x0, y0)) {
      return false;
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return true;
}

/**
 * Computes circular FOV with line-of-sight occlusion.
 */
export function computeVisibility(
  width: number,
  height: number,
  origin: GridPos,
  radius: number,
  isOpaque: (x: number, y: number) => boolean,
): Set<number> {
  const visible = new Set<number>();
  const r2 = radius * radius;
  const minY = Math.max(0, origin.y - radius);
  const maxY = Math.min(height - 1, origin.y + radius);
  const minX = Math.max(0, origin.x - radius);
  const maxX = Math.min(width - 1, origin.x + radius);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - origin.x;
      const dy = y - origin.y;
      if (dx * dx + dy * dy > r2) continue;
      if (hasLineOfSight(origin, { x, y }, isOpaque)) {
        visible.add(y * width + x);
      }
    }
  }
  return visible;
}
