import { getBallType } from "./catalog.js";
import { blastInclusiveRange } from "./explosive/logic.js";
import { matchColors } from "./match.js";
import type { BallKind, SolidColor } from "./types.js";

export interface ClearResolution {
  /** Sorted unique indices to remove. */
  remove: number[];
  freeze: boolean;
  volun: boolean;
  /** Plasma colors that triggered a full-field wipe. */
  plasmaColors: SolidColor[];
}

/**
 * Given a contiguous match group [left, right], resolve special effects
 * into the final set of indices to remove and side-effect flags.
 */
export function resolveClearEffects(
  typeIds: readonly string[],
  left: number,
  right: number,
): ClearResolution {
  const remove = new Set<number>();
  for (let i = left; i <= right; i++) remove.add(i);

  let freeze = false;
  let volun = false;
  const plasmaColors: SolidColor[] = [];

  let explosiveIdx = -1;
  for (let i = left; i <= right; i++) {
    const kind = getBallType(typeIds[i]!)?.kind;
    if (kind === "explosive") explosiveIdx = i;
    if (kind === "ice") freeze = true;
    if (kind === "volun") volun = true;
    if (kind === "plasma") {
      const colors = getBallType(typeIds[i]!)?.colors ?? [];
      for (const c of colors) plasmaColors.push(c);
    }
  }

  if (explosiveIdx >= 0) {
    const { left: bl, right: br } = blastInclusiveRange(
      explosiveIdx,
      typeIds.length,
    );
    for (let i = bl; i <= br; i++) remove.add(i);
  }

  if (plasmaColors.length > 0) {
    const colorSet = new Set(plasmaColors);
    for (let i = 0; i < typeIds.length; i++) {
      const mc = matchColors(typeIds[i]!);
      if (mc === "none" || mc === "all") continue;
      for (const c of mc) {
        if (colorSet.has(c)) {
          remove.add(i);
          break;
        }
      }
    }
  }

  return {
    remove: [...remove].sort((a, b) => a - b),
    freeze,
    volun,
    plasmaColors,
  };
}

export function groupContainsKind(
  typeIds: readonly string[],
  left: number,
  right: number,
  kind: BallKind,
): boolean {
  for (let i = left; i <= right; i++) {
    if (getBallType(typeIds[i]!)?.kind === kind) return true;
  }
  return false;
}
