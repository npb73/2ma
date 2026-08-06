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
