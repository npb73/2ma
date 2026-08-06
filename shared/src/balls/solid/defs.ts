import {
  COLOR_COUNT,
  COLOR_NAMES,
  type BallTypeDef,
  type SolidColor,
} from "../types.js";

export function solidId(c: SolidColor): string {
  return `solid_${c}`;
}

export function solidTypeId(color: number): string {
  const c = ((color % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
  return solidId(c as SolidColor);
}

export function solidDefs(): BallTypeDef[] {
  const out: BallTypeDef[] = [];
  for (let c = 0; c < COLOR_COUNT; c++) {
    const color = c as SolidColor;
    out.push({
      id: solidId(color),
      kind: "solid",
      colors: [color],
      title: COLOR_NAMES[color],
      description: `Обычный ${COLOR_NAMES[color].toLowerCase()} шар`,
      unique: false,
    });
  }
  return out;
}
