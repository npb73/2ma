import { explosiveDefs } from "./explosive/defs.js";
import { iceDefs } from "./ice/defs.js";
import { plasmaDefs } from "./plasma/defs.js";
import { solidDefs } from "./solid/defs.js";
import { stoneDefs } from "./stone/defs.js";
import { volunDefs } from "./volun/defs.js";
import type { BallTypeDef } from "./types.js";

export const BALL_TYPES: readonly BallTypeDef[] = [
  ...solidDefs(),
  ...plasmaDefs(),
  ...explosiveDefs(),
  ...iceDefs(),
  ...volunDefs(),
  ...stoneDefs(),
];

const BY_ID = new Map(BALL_TYPES.map((t) => [t.id, t]));

export function getBallType(id: string): BallTypeDef | undefined {
  return BY_ID.get(id);
}

export function isBallTypeId(id: string): boolean {
  return BY_ID.has(id);
}
