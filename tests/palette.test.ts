import { describe, expect, it } from 'vitest';
import { PALETTES, SCENE_COLORS } from '../src/render/palette';

// Principle VI: every gameplay marker has an entry in all palettes. The
// contracts track added the milestone C marker set.
const MILESTONE_C_MARKERS = ['convoy', 'relay', 'broadcaster', 'escort', 'cargo', 'captive'] as const;

describe('palette coverage for contract markers', () => {
  it('defines every milestone C marker in the canonical scene colors', () => {
    for (const key of MILESTONE_C_MARKERS) {
      expect(SCENE_COLORS[key], key).toBeDefined();
    }
  });

  it('defines every scene color in all three palettes', () => {
    for (const [name, def] of Object.entries(PALETTES)) {
      for (const key of Object.keys(SCENE_COLORS) as (keyof typeof SCENE_COLORS)[]) {
        expect(def.scene[key], `${name}.${key}`).toBeTypeOf('number');
      }
    }
  });
});
