/**
 * Seeded, serializable PRNG streams.
 *
 * sfc32 with a 4×uint32 state that lives inside the save file, so reloading
 * between two actions reproduces the same next outcome (plan §12.1). Separate
 * named streams keep cosmetic actions from perturbing combat or loot.
 */

export type RngState = [number, number, number, number];

export type StreamName =
  | 'layout' | 'encounter' | 'loot' | 'combat' | 'fortune' | 'ai' | 'narrative' | 'town';

export type RngStreams = Record<StreamName, RngState>;

export const STREAM_NAMES: StreamName[] = [
  'layout', 'encounter', 'loot', 'combat', 'fortune', 'ai', 'narrative', 'town',
];

/** xmur3 string hash → 32-bit seeds. */
export function hashString(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function seedState(seed: string): RngState {
  const h = hashString(seed);
  const s: RngState = [h(), h(), h(), h()];
  // Warm up so similar seeds diverge.
  const r = new Rng(s);
  for (let i = 0; i < 15; i++) r.next();
  return r.state;
}

export function makeStreams(seed: string): RngStreams {
  const out = {} as RngStreams;
  for (const name of STREAM_NAMES) out[name] = seedState(`${seed}::${name}`);
  return out;
}

export class Rng {
  state: RngState;
  constructor(state: RngState) {
    this.state = state;
  }

  /** Uniform float in [0, 1). Mutates the shared state array in place. */
  next(): number {
    const s = this.state;
    let a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    s[0] = a; s[1] = b; s[2] = c; s[3] = d;
    return t / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  die(sides: number): number {
    return this.int(1, sides);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick; weights must be non-negative and not all zero. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Pick n distinct elements. */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr.slice()).slice(0, Math.min(n, arr.length));
  }
}

/** Convenience: an Rng bound to one named stream of a state object. */
export function stream(streams: RngStreams, name: StreamName): Rng {
  return new Rng(streams[name]);
}

export function randomSeed(): string {
  const words = ['VOID', 'AQUILA', 'WARP', 'FURY', 'THRONE', 'SHARD', 'OBSIDIAN', 'RELIC', 'AUGUR', 'HULK', 'GELLAR', 'MAW'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
