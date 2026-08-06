import { getBallType } from "../catalog.js";
import { STONE_LIFETIME_SEC } from "../constants.js";
import { STONE_TYPE_ID } from "./defs.js";

export function isStone(typeId: string): boolean {
  return typeId === STONE_TYPE_ID || getBallType(typeId)?.kind === "stone";
}

/** Remaining lifetime seconds when a stone enters the chain; -1 otherwise. */
export function spawnStoneFuse(typeId: string): number {
  return isStone(typeId) ? STONE_LIFETIME_SEC : -1;
}
