import { getBallType } from "../catalog.js";

export function isVolun(typeId: string): boolean {
  return getBallType(typeId)?.kind === "volun";
}
