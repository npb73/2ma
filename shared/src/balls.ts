/** Ball color ids 0–4 mapped into the closed palette. */
export const BALL_COLORS = [
  "#d9243c",
  "#ffd832",
  "#458239",
  "#1c92a7",
  "#c03b94",
] as const;

export const COLOR_COUNT = BALL_COLORS.length;

export const BOMB_FUSE_SEC = 5;
/** Balls destroyed on each side of an exploding bomb (not counting the bomb). */
export const BOMB_BLAST_RADIUS = 2;

export type SolidColor = 0 | 1 | 2 | 3 | 4;

export type BallKind = "solid" | "dual" | "bomb" | "rainbow";

export interface BallTypeDef {
  id: string;
  kind: BallKind;
  /** Display / match colors (empty for bomb). */
  colors: SolidColor[];
  title: string;
  description: string;
  /** Specials may only appear once in the pool; solids can repeat. */
  unique: boolean;
}

const COLOR_NAMES = ["Красный", "Жёлтый", "Зелёный", "Синий", "Розовый"] as const;

function solidId(c: SolidColor): string {
  return `solid_${c}`;
}

export function solidTypeId(color: number): string {
  const c = ((color % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT;
  return solidId(c as SolidColor);
}

function dualId(a: SolidColor, b: SolidColor): string {
  const lo = Math.min(a, b) as SolidColor;
  const hi = Math.max(a, b) as SolidColor;
  return `dual_${lo}_${hi}`;
}

function buildCatalog(): BallTypeDef[] {
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

  for (let a = 0; a < COLOR_COUNT; a++) {
    for (let b = a + 1; b < COLOR_COUNT; b++) {
      const ca = a as SolidColor;
      const cb = b as SolidColor;
      out.push({
        id: dualId(ca, cb),
        kind: "dual",
        colors: [ca, cb],
        title: `${COLOR_NAMES[ca]} + ${COLOR_NAMES[cb]}`,
        description: "Подходит к двум цветам сразу",
        unique: true,
      });
    }
  }

  out.push({
    id: "bomb",
    kind: "bomb",
    colors: [],
    title: "Бомба",
    description: "После попадания в цепь — обратный отсчёт 5 с, взрыв ±2 шара",
    unique: true,
  });

  out.push({
    id: "rainbow",
    kind: "rainbow",
    colors: [0, 1, 2, 3, 4],
    title: "Радуга",
    description: "Соединяется со всеми цветами",
    unique: true,
  });

  return out;
}

export const BALL_TYPES: readonly BallTypeDef[] = buildCatalog();

const BY_ID = new Map(BALL_TYPES.map((t) => [t.id, t]));

export function getBallType(id: string): BallTypeDef | undefined {
  return BY_ID.get(id);
}

export function isBallTypeId(id: string): boolean {
  return BY_ID.has(id);
}

/** Starting pool: one solid of each color. */
export function initialBallPool(): string[] {
  return Array.from({ length: COLOR_COUNT }, (_, c) => solidId(c as SolidColor));
}

/** Colors this type can match as (empty = bomb, no color match). */
export function matchColors(typeId: string): Set<SolidColor> | "all" | "none" {
  const t = getBallType(typeId);
  if (!t) return "none";
  if (t.kind === "bomb") return "none";
  if (t.kind === "rainbow") return "all";
  return new Set(t.colors);
}

/** Whether two adjacent ball types can belong to the same clear group. */
export function typesMatch(aId: string, bId: string): boolean {
  const a = matchColors(aId);
  const b = matchColors(bId);
  if (a === "none" || b === "none") return false;
  if (a === "all" || b === "all") return true;
  for (const c of a) {
    if (b.has(c)) return true;
  }
  return false;
}

/**
 * Expand a contiguous matching run around `idx`.
 * Only walks through balls that are in contact (gap <= contactMax).
 * Bomb never joins a color group.
 */
export function expandMatchGroup(
  typeIds: string[],
  dists: number[],
  idx: number,
  contactMax: number,
): [number, number] {
  if (idx < 0 || idx >= typeIds.length) return [idx, idx];
  if (matchColors(typeIds[idx]) === "none") return [idx, idx];

  let left = idx;
  let right = idx;
  while (
    left > 0 &&
    dists[left]! - dists[left - 1]! <= contactMax &&
    typesMatch(typeIds[left - 1]!, typeIds[left]!)
  ) {
    left--;
  }
  while (
    right < typeIds.length - 1 &&
    dists[right + 1]! - dists[right]! <= contactMax &&
    typesMatch(typeIds[right]!, typeIds[right + 1]!)
  ) {
    right++;
  }
  return [left, right];
}

/** Uniform pick from pool (each entry equal weight). */
export function pickFromPool(pool: readonly string[], rng: () => number): string {
  if (pool.length === 0) return solidId(0);
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i] ?? solidId(0);
}

/**
 * Roll 3 offer cards for level-up.
 * Unique specials appear only if not already in pool; solids always available.
 */
export function rollLevelOffer(
  pool: readonly string[],
  rng: () => number,
  count = 3,
): string[] {
  const ownedUnique = new Set(
    pool.filter((id) => getBallType(id)?.unique),
  );

  const candidates = BALL_TYPES.filter((t) => {
    if (!t.unique) return true;
    return !ownedUnique.has(t.id);
  });

  const solids = BALL_TYPES.filter((t) => t.kind === "solid");
  const pickPool = candidates.length > 0 ? candidates : solids;

  const picked: string[] = [];
  const used = new Set<string>();

  let guard = 0;
  while (picked.length < count && guard++ < 40) {
    const t = pickPool[Math.floor(rng() * pickPool.length)];
    if (!t) break;
    if (used.has(t.id) && pickPool.length > used.size) continue;
    used.add(t.id);
    picked.push(t.id);
  }

  while (picked.length < count) {
    const t = solids[Math.floor(rng() * solids.length)]!;
    picked.push(t.id);
  }

  return picked;
}

export function ballDisplayColors(typeId: string): string[] {
  const t = getBallType(typeId);
  if (!t) return [BALL_COLORS[0]];
  if (t.kind === "bomb") return ["#bfc3c6"];
  if (t.kind === "rainbow") return [...BALL_COLORS];
  return t.colors.map((c) => BALL_COLORS[c]);
}
