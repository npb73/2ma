import {
  COLOR_COUNT,
  COLOR_NAMES,
  type BallTypeDef,
  type SolidColor,
} from "../types.js";

export function plasmaId(c: SolidColor): string {
  return `plasma_${c}`;
}

export function plasmaDefs(): BallTypeDef[] {
  const out: BallTypeDef[] = [];
  for (let c = 0; c < COLOR_COUNT; c++) {
    const color = c as SolidColor;
    out.push({
      id: plasmaId(color),
      kind: "plasma",
      colors: [color],
      title: `Плазма · ${COLOR_NAMES[color]}`,
      description: `Комбо уничтожает все ${COLOR_NAMES[color].toLowerCase()} шары на поле`,
      unique: true,
    });
  }
  return out;
}
