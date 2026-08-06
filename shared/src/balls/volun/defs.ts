import {
  COLOR_COUNT,
  COLOR_NAMES,
  type BallTypeDef,
  type SolidColor,
} from "../types.js";
import { VOLUN_STONE_COUNT } from "../constants.js";

export function volunId(c: SolidColor): string {
  return `volun_${c}`;
}

export function volunDefs(): BallTypeDef[] {
  const out: BallTypeDef[] = [];
  for (let c = 0; c < COLOR_COUNT; c++) {
    const color = c as SolidColor;
    out.push({
      id: volunId(color),
      kind: "volun",
      colors: [color],
      title: `Волун · ${COLOR_NAMES[color]}`,
      description: `Комбо — ${VOLUN_STONE_COUNT} камней на поле противника`,
      unique: true,
    });
  }
  return out;
}
