import { getBallType } from "../catalog.js";
import { EXPLOSIVE_BLAST_RADIUS } from "../constants.js";

export function isExplosive(typeId: string): boolean {
  return getBallType(typeId)?.kind === "explosive";
}

/** Inclusive index range destroyed by an explosive at `idx`. */
export function blastInclusiveRange(
  idx: number,
  length: number,
  radius = EXPLOSIVE_BLAST_RADIUS,
): { left: number; right: number } {
  return {
    left: Math.max(0, idx - radius),
    right: Math.min(length - 1, idx + radius),
  };
}
