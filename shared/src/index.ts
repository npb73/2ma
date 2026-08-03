/** Closed palette — never use colors outside this set. */
export const PALETTE = [
  "#43002a",
  "#890027",
  "#d9243c",
  "#ff6157",
  "#ffb762",
  "#c76e46",
  "#73392e",
  "#34111f",
  "#030710",
  "#273b2d",
  "#458239",
  "#9cb93b",
  "#ffd832",
  "#ff823b",
  "#d1401f",
  "#7c191a",
  "#310c1b",
  "#833f34",
  "#eb9c6e",
  "#ffdaac",
  "#ffffe4",
  "#bfc3c6",
  "#6d8a8d",
  "#293b49",
  "#041528",
  "#033e5e",
  "#1c92a7",
  "#77d6c1",
  "#ffe0dc",
  "#ff88a9",
  "#c03b94",
  "#601761",
] as const;

export type PaletteColor = (typeof PALETTE)[number];

export const UI = {
  bg: "#030710" as PaletteColor,
  bgPanel: "#041528" as PaletteColor,
  text: "#ffffe4" as PaletteColor,
  textMuted: "#ffdaac" as PaletteColor,
  accent: "#ff6157" as PaletteColor,
  accentHot: "#ff823b" as PaletteColor,
  secondary: "#6d8a8d" as PaletteColor,
  secondaryDark: "#293b49" as PaletteColor,
  path: "#273b2d" as PaletteColor,
  hole: "#890027" as PaletteColor,
  cannon: "#bfc3c6" as PaletteColor,
} as const;

/** Ball color ids 0–4 mapped into the closed palette. */
export const BALL_COLORS = [
  "#d9243c",
  "#ffd832",
  "#458239",
  "#1c92a7",
  "#c03b94",
] as const;

export const COLOR_COUNT = BALL_COLORS.length;

export const RATING_DELTA = 30;
export const STARTING_RATING = 1000;

export const TICK_HZ = 20;
export const BALL_RADIUS = 14;
export const PATH_SPEED = 18; // px/s — push from spawn along the path
/** Max speed of floating segments rolling back toward the train. */
export const ROLLBACK_SPEED = 48;
/** Floating segments wait this long before starting to roll back. */
export const ROLLBACK_PAUSE_SEC = 1;
/** Time to ease from 0 → ROLLBACK_SPEED after the pause. */
export const ROLLBACK_RAMP_SEC = 0.65;
export const PROJECTILE_SPEED = 620;
export const COMBO_PER_LEVEL = 3;
export const INITIAL_CHAIN = 18;
export const MAX_CHAIN = 55;
/** Spacing slack before two balls count as separate segments. */
export const GAP_EPS = 2;

export type CardId = "wild10" | "speedOpponent" | "explodeNeighbors";

export interface CardDef {
  id: CardId;
  title: string;
  description: string;
}

export const CARDS: CardDef[] = [
  {
    id: "wild10",
    title: "Хамелеон",
    description: "Следующие 10 шаров подходят к любым цветам",
  },
  {
    id: "speedOpponent",
    title: "Ускорение",
    description: "Скорость шаров соперника +50% на 10 секунд",
  },
  {
    id: "explodeNeighbors",
    title: "Взрыв",
    description: "Ваши шары взрывают соседей слева и справа",
  },
];

export type Point = { x: number; y: number };

/** Simple mirrored paths on one field (1280×720). */
export const PATH_A: Point[] = [
  { x: 80, y: 120 },
  { x: 220, y: 100 },
  { x: 380, y: 140 },
  { x: 480, y: 220 },
  { x: 520, y: 340 },
  { x: 480, y: 460 },
  { x: 360, y: 540 },
  { x: 200, y: 560 },
  { x: 120, y: 480 },
];

export const PATH_B: Point[] = [
  { x: 1200, y: 120 },
  { x: 1060, y: 100 },
  { x: 900, y: 140 },
  { x: 800, y: 220 },
  { x: 760, y: 340 },
  { x: 800, y: 460 },
  { x: 920, y: 540 },
  { x: 1080, y: 560 },
  { x: 1160, y: 480 },
];

export const CANNON_A: Point = { x: 280, y: 360 };
export const CANNON_B: Point = { x: 1000, y: 360 };

export type RoomPhase = "lobby" | "playing" | "ended";
export type TargetMode = 0 | 1; // 0 = own chain, 1 = opponent

export const MESSAGES = {
  aim: "aim",
  fire: "fire",
  setTarget: "setTarget",
  pickCard: "pickCard",
  ready: "ready",
} as const;
