export type PathPoint = { x: number; y: number };

export interface PathGeom {
  points: PathPoint[];
  lengths: number[];
  total: number;
}

export function buildPath(points: PathPoint[]): PathGeom {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.hypot(dx, dy);
    lengths.push(total);
  }
  return { points, lengths, total };
}

export function pointAtPath(path: PathGeom, dist: number): PathPoint {
  const d = Math.max(0, Math.min(dist, path.total));
  if (d <= 0) return { ...path.points[0] };
  for (let i = 1; i < path.lengths.length; i++) {
    if (d <= path.lengths[i]) {
      const segStart = path.lengths[i - 1];
      const segLen = path.lengths[i] - segStart;
      const t = segLen === 0 ? 0 : (d - segStart) / segLen;
      const a = path.points[i - 1];
      const b = path.points[i];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }
  }
  return { ...path.points[path.points.length - 1] };
}
