// Seeded PRNG for deterministic mock data - split from lib/data.ts to keep files small; why: gives reproducible datasets across reloads and tests.
function createRng(seed: number) {
  let s = seed >>> 0;
  const next = (): number => {
    s = Math.imul(s ^ (s >>> 13), s | 7) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = Math.imul(s ^ (s >>> 5), s | 3) >>> 0;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
  };
}
export { createRng };
export type Rng = ReturnType<typeof createRng>;
