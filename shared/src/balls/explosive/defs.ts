import { EXPLOSIVE_BLAST_RADIUS } from "../constants.js";
import type { BallTypeDef } from "../types.js";

export function explosiveDefs(): BallTypeDef[] {
  return [
    {
      id: "explosive",
      kind: "explosive",
      colors: [],
      title: "Взрывной шар",
      description: `Принимает цвет соседей одного цвета; комбо — взрыв ±${EXPLOSIVE_BLAST_RADIUS} шаров`,
      unique: true,
    },
  ];
}
