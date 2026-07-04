export function xorshift32(state: number): number {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

export function seedFrom(n: number): number {
  const s = n | 0;
  return s === 0 ? 0x9e3779b9 | 0 : s;
}
