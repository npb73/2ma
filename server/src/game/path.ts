import { buildPath, pointAtPath, type PathGeom } from "@2ma/shared";
import type { Point } from "@2ma/shared";

export type { PathGeom };

export function pointAt(path: PathGeom, dist: number): Point {
  return pointAtPath(path, dist);
}

export { buildPath };
