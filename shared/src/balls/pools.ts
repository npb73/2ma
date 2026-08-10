import { BALL_TYPES, getBallType } from "./catalog.js";
import { solidId } from "./solid/defs.js";
import { COLOR_COUNT, type SolidColor } from "./types.js";

/** Fixed cannon ammo: one solid of each color (equal weight, never grows). */
export function cannonSolidPool(): string[] {
  return Array.from({ length: COLOR_COUNT }, (_, c) =>
    solidId(c as SolidColor),
  );
}

const INITIAL_SOLIDS_PER_COLOR = 5;

/** Starting chain spawn pool: 5 solids of each color. Level-ups append here. */
export function initialBallPool(): string[] {
  const out: string[] = [];
  for (let n = 0; n < INITIAL_SOLIDS_PER_COLOR; n++) {
    for (let c = 0; c < COLOR_COUNT; c++) {
      out.push(solidId(c as SolidColor));
    }
  }
  return out;
}

/**
 * Weighted run lengths for consecutive same-type chain balls.
 * Picking uniformly from this list ≈ more short runs, rarer long ones.
 */
export const CHAIN_RUN_LENGTHS: readonly number[] = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 6,
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

/** Primary solid color of a ball type, or null if uncolored / wildcard. */
function primaryColor(typeId: string): SolidColor | null {
  const t = getBallType(typeId);
  if (!t || t.colors.length === 0) return null;
  return t.colors[0]!;
}

/** True if two types share the same primary color (or are the same id). */
function sameSpawnColor(a: string, b: string): boolean {
  const ca = primaryColor(a);
  const cb = primaryColor(b);
  if (ca == null || cb == null) return a === b;
  return ca === cb;
}

/**
 * Chain spawn stream: pick a type from the pool, then emit it for a run
 * length drawn from the weighted table (specials always run length 1).
 * Consecutive runs never share the same primary color.
 */
export class ChainTypeStream {
  private currentType: string | null = null;
  private remaining = 0;
  private runLengths: number[] = [...CHAIN_RUN_LENGTHS];
  /** Level-up picks forced to the front of the spawn ribbon (FIFO). */
  private forced: string[] = [];
  /** Last emitted type — next pool roll must differ in primary color. */
  private lastTypeId: string | null = null;

  reset(): void {
    this.currentType = null;
    this.remaining = 0;
    this.forced.length = 0;
    this.lastTypeId = null;
  }

  getRunLengths(): number[] {
    return [...this.runLengths];
  }

  setRunLengths(lengths: readonly number[]): void {
    this.runLengths = sanitizeRunLengths(lengths);
    // Drop in-progress run so the next ball uses the new table.
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
      const id = this.forced.shift()!;
      this.lastTypeId = id;
      return id;
    }

    if (this.remaining > 0 && this.currentType) {
      this.remaining -= 1;
      this.lastTypeId = this.currentType;
      return this.currentType;
    }

    let typeId = pickFromPool(pool, rng);
    let guard = 0;
    while (
      this.lastTypeId &&
      sameSpawnColor(typeId, this.lastTypeId) &&
      guard++ < 40
    ) {
      typeId = pickFromPool(pool, rng);
    }

    const kind = getBallType(typeId)?.kind;
    const run =
      kind === "solid" ? pickChainRunLength(rng, this.runLengths) : 1;
    this.currentType = typeId;
    this.remaining = Math.max(0, run - 1);
    this.lastTypeId = typeId;
    return typeId;
  }
}

/**
 * Roll 3 offer cards for level-up (added to the chain spawn pool).
 * Stones are never offered. Unique specials only if not already owned.
 */
export function rollLevelOffer(
  pool: readonly string[],
  rng: () => number,
  count = 3,
): string[] {
  const ownedUnique = new Set(pool.filter((id) => getBallType(id)?.unique));

  const candidates = BALL_TYPES.filter((t) => {
    if (t.kind === "stone") return false;
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
