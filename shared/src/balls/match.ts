import { getBallType } from "./catalog.js";
import type { SolidColor } from "./types.js";

/** Colors this type can match as. */
export function matchColors(typeId: string): Set<SolidColor> | "all" | "none" {
  const t = getBallType(typeId);
  if (!t) return "none";
  if (t.kind === "stone") return "none";
  if (t.kind === "explosive") return "all";
  return new Set(t.colors);
}

/** Whether two adjacent ball types can belong to the same clear group. */
export function typesMatch(aId: string, bId: string): boolean {
  const a = matchColors(aId);
  const b = matchColors(bId);
  if (a === "none" || b === "none") return false;
  if (a === "all" || b === "all") return true;
  for (const c of a) {
    if (b.has(c)) return true;
  }
  return false;
}

/**
 * Expand a contiguous matching run around `idx`.
 * Only walks through balls that are in contact (gap <= contactMax).
 * Stone never joins a color group.
 */
export function expandMatchGroup(
  typeIds: string[],
  dists: number[],
  idx: number,
  contactMax: number,
): [number, number] {
  if (idx < 0 || idx >= typeIds.length) return [idx, idx];
  if (matchColors(typeIds[idx]!) === "none") return [idx, idx];

  let left = idx;
  let right = idx;
  while (
    left > 0 &&
    dists[left]! - dists[left - 1]! <= contactMax &&
    typesMatch(typeIds[left - 1]!, typeIds[left]!)
  ) {
    left--;
  }
  while (
    right < typeIds.length - 1 &&
    dists[right + 1]! - dists[right]! <= contactMax &&
    typesMatch(typeIds[right]!, typeIds[right + 1]!)
  ) {
    right++;
  }
  return [left, right];
}
