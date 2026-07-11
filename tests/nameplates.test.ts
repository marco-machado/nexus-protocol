import { describe, expect, it } from 'vitest';
import { layoutPlates, plateLabel } from '../src/app/nameplates';

function frame(
  xs: number[],
  ys: number[],
  linked: boolean[][],
  shownIn?: boolean[],
): { sx: number[]; sy: number[] } {
  const sx = [...xs];
  const sy = [...ys];
  const shown = shownIn ?? xs.map(() => true);
  layoutPlates(xs.length, sx, sy, shown, linked, []);
  return { sx, sy };
}

describe('plateLabel', () => {
  it('uppercases codenames and falls back to slot ids', () => {
    expect(plateLabel('viper', 0)).toBe('VIPER');
    expect(plateLabel('  ', 2)).toBe('A3');
    expect(plateLabel(undefined, 3)).toBe('A4');
  });
});

describe('layoutPlates', () => {
  it('stacks clustered plates 18px apart in slot order', () => {
    const { sy } = frame([400, 402, 398, 401], [300, 301, 299, 300], []);
    expect(sy).toEqual([301, 283, 265, 247]);
  });

  it('leaves separated plates untouched', () => {
    const { sx, sy } = frame([100, 400, 700, 1000], [300, 300, 300, 300], []);
    expect(sx).toEqual([100, 400, 700, 1000]);
    expect(sy).toEqual([300, 300, 300, 300]);
  });

  it('keeps a clustered stack identical across frames', () => {
    const linked: boolean[][] = [];
    const a = frame([400, 402, 398, 401], [300, 301, 299, 300], linked);
    const b = frame([400, 402, 398, 401], [300, 301, 299, 300], linked);
    expect(b.sy).toEqual(a.sy);
  });

  it('holds the link across the threshold band instead of flickering', () => {
    const linked: boolean[][] = [];
    const near = frame([400, 470], [300, 300], linked);
    expect(near.sy[1]).toBe(282);
    const band = frame([400, 480], [300, 300], linked);
    expect(band.sy[1]).toBe(282);
    const far = frame([400, 495], [300, 300], linked);
    expect(far.sy[1]).toBe(300);
    const bandAgain = frame([400, 480], [300, 300], linked);
    expect(bandAgain.sy[1]).toBe(300);
  });

  it('merges chained pairs into one stack', () => {
    const { sy } = frame([400, 460, 520], [300, 300, 300], []);
    expect(sy).toEqual([300, 282, 264]);
  });

  it('ignores hidden plates when stacking', () => {
    const { sy } = frame([400, 401, 402], [300, 300, 300], [], [true, false, true]);
    expect(sy).toEqual([300, 300, 282]);
  });
});
