/** Ball color ids 0–4 mapped into the closed palette. */
export const BALL_COLORS = [
  "#d9243c",
  "#ffd832",
  "#458239",
  "#1c92a7",
  "#c03b94",
] as const;

export const COLOR_COUNT = BALL_COLORS.length;

export type SolidColor = 0 | 1 | 2 | 3 | 4;

export type BallKind =
  | "solid"
  | "plasma"
  | "explosive"
  | "ice"
  | "volun"
  | "stone";

export interface BallTypeDef {
  id: string;
  kind: BallKind;
  /** Display / match colors (empty for stone / explosive uses "all"). */
  colors: SolidColor[];
  title: string;
  description: string;
  /** Specials may only appear once in the spawn pool; solids can repeat. */
  unique: boolean;
}

export const COLOR_NAMES = [
  "Красный",
  "Жёлтый",
  "Зелёный",
  "Синий",
  "Розовый",
] as const;

/** Blue index used by the ice ball. */
export const ICE_COLOR: SolidColor = 3;
