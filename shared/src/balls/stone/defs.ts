import type { BallTypeDef } from "../types.js";
import { STONE_LIFETIME_SEC } from "../constants.js";

export const STONE_TYPE_ID = "stone";

export function stoneDefs(): BallTypeDef[] {
  return [
    {
      id: STONE_TYPE_ID,
      kind: "stone",
      colors: [],
      title: "Камень",
      description: `Не комбинируется; взрыв или исчезновение через ${STONE_LIFETIME_SEC} с`,
      unique: false,
    },
  ];
}
