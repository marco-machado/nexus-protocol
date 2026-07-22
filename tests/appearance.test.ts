import { describe, expect, it } from 'vitest';
import {
  buildAppearanceManifest,
  PRIMARY_SLOTS,
  rivalAugmentLevels,
  type AppearanceManifest,
  type AttachmentSlot,
} from '../src/render/appearance';

function levelsOf(m: AppearanceManifest): Record<AttachmentSlot, number> {
  return m.levels;
}

describe('buildAppearanceManifest', () => {
  it('returns an empty attachment list for a blank recruit', () => {
    const m = buildAppearanceManifest({ variant: 'male' });
    expect(m.attachments).toEqual([]);
    expect(m.chassis).toBe('operative');
    expect(m.variant).toBe('male');
    expect(m.faction).toBe('nexus');
    expect(Object.values(m.levels).every((v) => v === 0)).toBe(true);
  });

  it('is deterministic for equal inputs', () => {
    const input = {
      variant: 'female' as const,
      levels: { legs: 2, arms: 1, torso: 3, eyes: 2, brain: 1 },
      armor: true,
      trimSlot: 2,
      faction: 'rival' as const,
    };
    expect(buildAppearanceManifest(input)).toEqual(buildAppearanceManifest(input));
  });

  it('changes each primary slot at every version step', () => {
    for (const slot of PRIMARY_SLOTS) {
      const seen = new Set<string>();
      for (let v = 0; v <= 3; v++) {
        const m = buildAppearanceManifest({ variant: 'male', levels: { [slot]: v } });
        const key = JSON.stringify(m.attachments.filter((a) => a.slot === slot));
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        if (v === 0) {
          expect(m.attachments.some((a) => a.slot === slot)).toBe(false);
        } else {
          const cue = m.attachments.find((a) => a.slot === slot)!;
          expect(cue.version).toBe(v);
          expect(cue.strength).toBe(v);
        }
      }
    }
  });

  it('maps a full V3 loadout to all six slots', () => {
    const m = buildAppearanceManifest({
      variant: 'male',
      levels: { legs: 3, arms: 3, torso: 3, eyes: 3, brain: 3, heart: 3 },
    });
    expect(m.attachments.map((a) => a.slot).sort()).toEqual(
      ['arms', 'brain', 'eyes', 'heart', 'legs', 'torso'].sort(),
    );
    expect(m.attachments.every((a) => a.version === 3)).toBe(true);
  });

  it('thickens torso from body armor without inventing a new kind', () => {
    const bare = buildAppearanceManifest({ variant: 'male', levels: { torso: 1 } });
    const armored = buildAppearanceManifest({ variant: 'male', levels: { torso: 1 }, armor: true });
    expect(bare.levels.torso).toBe(1);
    expect(armored.levels.torso).toBe(2);
    expect(armored.attachments.find((a) => a.slot === 'torso')!.kind).toBe('torso-armor');
  });

  it('caps armor-boosted torso at V3', () => {
    const m = buildAppearanceManifest({ variant: 'female', levels: { torso: 3 }, armor: true });
    expect(m.levels.torso).toBe(3);
  });

  it('carries only subtle cues for brain and heart when set', () => {
    const m = buildAppearanceManifest({ variant: 'male', levels: { brain: 2, heart: 1 } });
    expect(m.attachments).toEqual([
      { slot: 'brain', version: 2, kind: 'brain-node', strength: 2 },
      { slot: 'heart', version: 1, kind: 'heart-core', strength: 1 },
    ]);
  });

  it('clamps out-of-range levels', () => {
    const m = buildAppearanceManifest({
      variant: 'male',
      levels: { legs: 9, arms: -2, eyes: 1.9 as unknown as number },
    });
    expect(levelsOf(m)).toMatchObject({ legs: 3, arms: 0, eyes: 1 });
  });
});

describe('rivalAugmentLevels', () => {
  it('telegraphs full V3 on elite (Act 3 / HQ) peers', () => {
    const m = buildAppearanceManifest({
      variant: 'male',
      levels: rivalAugmentLevels(true, 5),
      faction: 'rival',
      trimSlot: 0,
    });
    expect(m.faction).toBe('rival');
    expect(m.levels.legs).toBe(3);
    expect(m.levels.arms).toBe(3);
    expect(m.levels.torso).toBe(3);
    expect(m.levels.eyes).toBe(3);
  });

  it('scales mid-tier rivals below elite', () => {
    expect(rivalAugmentLevels(false, 4)).toEqual({ legs: 2, arms: 2, torso: 2, eyes: 2 });
    expect(rivalAugmentLevels(false, 3)).toEqual({ legs: 1, arms: 1, torso: 1, eyes: 1 });
    expect(rivalAugmentLevels(false, 2)).toEqual({});
  });
});
