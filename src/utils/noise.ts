/**
 * Deterministic PRNG and procedural noise helpers for terrain, igloo, crystals, and particles.
 */

export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic permutation table for gradient noise
const PERM = new Uint8Array(512);
const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

(() => {
  const rand = createSeededRandom(20260723);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
  }
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X] + Y] % 12;
  const ab = PERM[PERM[X] + Y + 1] % 12;
  const ba = PERM[PERM[X + 1] + Y] % 12;
  const bb = PERM[PERM[X + 1] + Y + 1] % 12;

  const gAA = GRAD3[aa][0] * xf + GRAD3[aa][1] * yf;
  const gBA = GRAD3[ba][0] * (xf - 1) + GRAD3[ba][1] * yf;
  const gAB = GRAD3[ab][0] * xf + GRAD3[ab][1] * (yf - 1);
  const gBB = GRAD3[bb][0] * (xf - 1) + GRAD3[bb][1] * (yf - 1);

  return lerp(lerp(gAA, gBA, u), lerp(gAB, gBB, u), v);
}

export function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;

  const dot = (idx: number, dx: number, dy: number, dz: number): number => {
    const g = GRAD3[PERM[idx] % 12];
    return g[0] * dx + g[1] * dy + g[2] * dz;
  };

  return lerp(
    lerp(
      lerp(dot(AA, xf, yf, zf), dot(BA, xf - 1, yf, zf), u),
      lerp(dot(AB, xf, yf - 1, zf), dot(BB, xf - 1, yf - 1, zf), u),
      v,
    ),
    lerp(
      lerp(dot(AA + 1, xf, yf, zf - 1), dot(BA + 1, xf - 1, yf, zf - 1), u),
      lerp(dot(AB + 1, xf, yf - 1, zf - 1), dot(BB + 1, xf - 1, yf - 1, zf - 1), u),
      v,
    ),
    w,
  );
}

export function fbm2D(x: number, y: number, octaves = 4, lacunarity = 2.05, gain = 0.5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return norm > 0 ? sum / norm : 0;
}

export function ridgedFbm2D(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let signal = 1 - Math.abs(noise2D(x * freq, y * freq));
    signal *= signal * weight;
    weight = clamp(signal * 1.8, 0, 1);
    sum += signal * amp;
    freq *= 2.1;
    amp *= 0.5;
  }
  return sum;
}
