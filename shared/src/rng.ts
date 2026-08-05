/** Mulberry32 — small deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent color streams from one seed — same call order → same colors. */
export function createColorStream(
  seed: number,
  colorCount: number,
): () => number {
  const rng = mulberry32(seed >>> 0);
  return () => Math.floor(rng() * colorCount);
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
