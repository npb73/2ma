import { getBallType } from "./catalog.js";
import type { SolidColor } from "./types.js";

/** Colors this type can match as. */
export function matchColors(typeId: string): Set<SolidColor> | "all" | "none" {
  const t = getBallType(typeId);
  if (!t) return "none";
  if (t.kind === "stone") return "none";
  /** Empty color list = wildcard (e.g. explosive). */
  if (t.colors.length === 0) return "all";
  return new Set(t.colors);
}

/** True for wildcards and multi-color balls — they adopt a shared group color. */
export function isMulticolorMatch(typeId: string): boolean {
  const mc = matchColors(typeId);
  if (mc === "all") return true;
  if (mc === "none") return false;
  return mc.size > 1;
}

/** Whether two adjacent ball types can belong to the same clear group (pairwise). */
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

function initialRequired(typeId: string): Set<SolidColor> | null {
  const mc = matchColors(typeId);
  // Wild / multi-color: unconstrained until a single-color ball sets the group color.
  if (mc === "none" || mc === "all" || mc.size > 1) return null;
  return new Set(mc);
}

/** Can `typeId` join a group constrained to `required` (null = unconstrained yet). */
function canJoin(
  typeId: string,
  required: Set<SolidColor> | null,
): boolean {
  const mc = matchColors(typeId);
  if (mc === "none") return false;
  if (mc === "all") return true;
  if (mc.size > 1) {
    if (required === null) return true;
    for (const c of mc) {
      if (required.has(c)) return true;
    }
    return false;
  }
  if (required === null) return true;
  for (const c of mc) {
    if (required.has(c)) return true;
  }
  return false;
}

function refineRequired(
  required: Set<SolidColor> | null,
  typeId: string,
): Set<SolidColor> | null {
  const mc = matchColors(typeId);
  if (mc === "all" || mc === "none") return required;
  // Multi-color: never impose both colors as the group constraint.
  if (mc.size > 1) {
    if (required === null) return null;
    const next = new Set<SolidColor>();
    for (const c of required) {
      if (mc.has(c)) next.add(c);
    }
    return next;
  }
  // Single color
  if (required === null) return new Set(mc);
  const next = new Set<SolidColor>();
  for (const c of required) {
    if (mc.has(c)) next.add(c);
  }
  return next;
}

/**
 * Expand a contiguous matching run around `idx`.
 * Only walks through balls that are in contact (gap <= contactMax).
 * Stone never joins a color group.
 *
 * Wildcards and multi-color balls adopt the shared color of the group —
 * they do NOT bridge two different solid colors.
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
  let required = initialRequired(typeIds[idx]!);

  while (
    left > 0 &&
    dists[left]! - dists[left - 1]! <= contactMax &&
    canJoin(typeIds[left - 1]!, required)
  ) {
    required = refineRequired(required, typeIds[left - 1]!);
    left--;
  }

  // Re-seed required from the settled left edge so right expansion
  // uses the same color constraint (wild/multi at start may be unconstrained).
  required = null;
  for (let i = left; i <= right; i++) {
    required = refineRequired(required, typeIds[i]!);
  }

  while (
    right < typeIds.length - 1 &&
    dists[right + 1]! - dists[right]! <= contactMax &&
    canJoin(typeIds[right + 1]!, required)
  ) {
    required = refineRequired(required, typeIds[right + 1]!);
    right++;
  }

  return [left, right];
}
