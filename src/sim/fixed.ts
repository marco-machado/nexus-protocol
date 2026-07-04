export type Fx = number;

export const FX_SHIFT = 16;
export const FX_ONE = 1 << FX_SHIFT;

export function toFx(n: number): Fx {
  return Math.round(n * FX_ONE) | 0;
}

export function fromFx(a: Fx): number {
  return a / FX_ONE;
}

// Products are computed in doubles, exact only below 2^53. Keeping world
// coordinates within +/-4096 units and speeds below one unit per tick keeps
// every product in the exact range, which is what makes this deterministic.
export function fxMul(a: Fx, b: Fx): Fx {
  return Math.trunc((a * b) / FX_ONE) | 0;
}

export function fxDiv(a: Fx, b: Fx): Fx {
  return Math.trunc((a * FX_ONE) / b) | 0;
}

// Length of a fixed-point vector, in fixed-point: isqrt(fx^2) is already fx.
export function fxLen(dx: Fx, dz: Fx): Fx {
  return isqrt(dx * dx + dz * dz);
}

// Math.sqrt rounding is not guaranteed by the ES spec, so correct the guess
// to the exact floor value.
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}
