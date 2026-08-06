export type ProjectileHitTarget = {
  x: number;
  y: number;
  /** Path distance (or any key returned on hit). */
  dist: number;
};

/**
 * Earliest t ∈ [0, 1] when a point moving (x0,y0)→(x1,y1) enters a circle
 * of `radius` around (cx,cy). null = no hit on this segment.
 */
export function segmentCircleHitT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const r2 = radius * radius;
  const c = fx * fx + fy * fy - r2;

  // Already overlapping at the start of the step.
  if (c <= 0) return 0;

  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;

  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrt = Math.sqrt(disc);
  const tNear = (-b - sqrt) / (2 * a);
  if (tNear >= 0 && tNear <= 1) return tNear;
  const tFar = (-b + sqrt) / (2 * a);
  if (tFar >= 0 && tFar <= 1) return tFar;
  return null;
}

/**
 * First chain ball the projectile would hit while traveling (x0,y0)→(x1,y1).
 * Uses continuous swept collision so shots can pass between path folds
 * instead of snapping to the nearest Euclidean neighbor at the end point.
 */
export function firstProjectileHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  targets: readonly ProjectileHitTarget[],
  radius: number,
): ProjectileHitTarget | null {
  let bestT = Infinity;
  let best: ProjectileHitTarget | null = null;
  for (const t of targets) {
    const hitT = segmentCircleHitT(x0, y0, x1, y1, t.x, t.y, radius);
    if (hitT === null) continue;
    if (hitT < bestT) {
      bestT = hitT;
      best = t;
    }
  }
  return best;
}
