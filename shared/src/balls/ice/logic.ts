import { getBallType } from "../catalog.js";

export function isIce(typeId: string): boolean {
  return getBallType(typeId)?.kind === "ice";
}
