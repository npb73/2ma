import { BALL_TYPES, getBallType } from "./catalog.js";
import { solidId } from "./solid/defs.js";
import {
  BALL_COLORS,
  COLOR_COUNT,
  COLOR_NAMES,
  type SolidColor,
} from "./types.js";

/** Fixed cannon ammo: one solid of each color (equal weight, never grows). */
export function cannonSolidPool(): string[] {
  return Array.from({ length: COLOR_COUNT }, (_, c) =>
    solidId(c as SolidColor),
  );
}

/** Color rune boosts that color; `"neutral"` gives equal counts. */
export type RuneId = SolidColor | "neutral";

export interface RuneDef {
  id: RuneId;
  /** Hex color for UI; null = colorless. */
  color: string | null;
  title: string;
}

export const RUNES: readonly RuneDef[] = [
  ...Array.from({ length: COLOR_COUNT }, (_, c) => {
    const color = c as SolidColor;
    return {
      id: color,
      color: BALL_COLORS[color]!,
      title: COLOR_NAMES[color]!,
    };
  }),
  { id: "neutral", color: null, title: "Бесцветная" },
];

export function isRuneId(value: unknown): value is RuneId {
  if (value === "neutral") return true;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value < COLOR_COUNT;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n < COLOR_COUNT;
  }
  return false;
}

/** Parse wire/UI value into RuneId (`"0"`…`"4"` or `"neutral"`). */
export function parseRuneId(value: unknown): RuneId | null {
  if (value === "neutral") return "neutral";
  if (typeof value === "number" && isRuneId(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    if (isRuneId(n)) return n;
  }
  return null;
}

const FAVORED_COUNT = 6;
const OTHER_COUNT = 4;
const NEUTRAL_COUNT = 4;

/**
 * Starting chain spawn pool from the chosen rune.
 * Color rune: 6 favored + 4 of each other. Neutral: 4 of each.
 */
export function initialBallPool(rune: RuneId): string[] {
  const out: string[] = [];
  if (rune === "neutral") {
    for (let n = 0; n < NEUTRAL_COUNT; n++) {
      for (let c = 0; c < COLOR_COUNT; c++) {
        out.push(solidId(c as SolidColor));
      }
    }
    return out;
  }

  for (let c = 0; c < COLOR_COUNT; c++) {
    const count = c === rune ? FAVORED_COUNT : OTHER_COUNT;
    for (let n = 0; n < count; n++) {
      out.push(solidId(c as SolidColor));
    }
  }
  return out;
}

/**
 * Weighted run lengths (legacy / solo-debug defaults; spawn no longer uses runs).
 */
export const CHAIN_RUN_LENGTHS: readonly number[] = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4,
];

function sanitizeRunLengths(lengths: readonly number[]): number[] {
  const cleaned = lengths
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 99);
  return cleaned.length > 0 ? cleaned : [...CHAIN_RUN_LENGTHS];
}

/** Uniform pick from a run-length table (defaults to {@link CHAIN_RUN_LENGTHS}). */
export function pickChainRunLength(
  rng: () => number,
  lengths: readonly number[] = CHAIN_RUN_LENGTHS,
): number {
  const table = lengths.length > 0 ? lengths : CHAIN_RUN_LENGTHS;
  const i = Math.min(table.length - 1, Math.floor(rng() * table.length));
  return table[i] ?? 1;
}

/** Uniform pick from pool (each entry equal weight). */
export function pickFromPool(
  pool: readonly string[],
  rng: () => number,
): string {
  if (pool.length === 0) return solidId(0);
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i] ?? solidId(0);
}

/**
 * Chain spawn stream: pick a type from the pool, then emit it for a run
 * length drawn from the weighted table (specials always run length 1).
 */
export class ChainTypeStream {
  private currentType: string | null = null;
  private remaining = 0;
  private runLengths: number[] = [...CHAIN_RUN_LENGTHS];
  /** Level-up picks forced to the front of the spawn ribbon (FIFO). */
  private forced: string[] = [];

  reset(): void {
    this.currentType = null;
    this.remaining = 0;
    this.forced.length = 0;
  }

  getRunLengths(): number[] {
    return [...this.runLengths];
  }

  setRunLengths(lengths: readonly number[]): void {
    this.runLengths = sanitizeRunLengths(lengths);
    this.currentType = null;
    this.remaining = 0;
  }

  /**
   * Queue a type to appear as the next chain ball(s), before normal pool rolls.
   * Interrupts any in-progress solid run so the pick shows up ASAP.
   */
  enqueueNext(typeId: string): void {
    this.forced.push(typeId);
    this.currentType = null;
    this.remaining = 0;
  }

  next(pool: readonly string[], rng: () => number): string {
    if (this.forced.length > 0) {
      return this.forced.shift()!;
    }

    if (this.remaining > 0 && this.currentType) {
      this.remaining -= 1;
      return this.currentType;
    }

    const typeId = pickFromPool(pool, rng);
    const kind = getBallType(typeId)?.kind;
    const run = kind === "solid" ? pickChainRunLength(rng, this.runLengths) : 1;
    this.currentType = typeId;
    this.remaining = Math.max(0, run - 1);
    return typeId;
  }
}

/**
 * Roll 3 offer cards for level-up (added to the chain spawn pool).
 * Unique specials only if not already owned.
 */
export function rollLevelOffer(
  pool: readonly string[],
  rng: () => number,
  count = 3,
): string[] {
  const ownedUnique = new Set(pool.filter((id) => getBallType(id)?.unique));

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
