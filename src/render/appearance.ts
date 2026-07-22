// Pure agent appearance-manifest data. No Three.js imports, no sim state.

export type BodyVariant = 'male' | 'female';
export type ChassisId = 'operative';
export type AppearanceFaction = 'nexus' | 'rival';

// GDD-named augment slots that must read on the body; brain/heart are subtle.
export type AttachmentSlot = 'legs' | 'arms' | 'torso' | 'eyes' | 'brain' | 'heart';

export type AttachmentKind =
  | 'leg-struts'
  | 'arm-plating'
  | 'torso-armor'
  | 'eye-glow'
  | 'brain-node'
  | 'heart-core';

export interface AttachmentCue {
  slot: AttachmentSlot;
  version: 1 | 2 | 3;
  kind: AttachmentKind;
  // 1..3, mirrors version; consumers may use it for scale without re-branching
  strength: number;
}

export interface AppearanceManifest {
  chassis: ChassisId;
  variant: BodyVariant;
  trimSlot: number;
  faction: AppearanceFaction;
  attachments: AttachmentCue[];
  levels: Record<AttachmentSlot, number>;
}

export interface AppearanceInput {
  variant: BodyVariant;
  // 0 absent/missing, 1..3 installed
  levels?: Partial<Record<AttachmentSlot, number>>;
  // body armor gear thickens the torso armor profile by one effective step
  // (capped at 3) without inventing a new attachment kind
  armor?: boolean;
  trimSlot?: number;
  faction?: AppearanceFaction;
}

const SLOT_KIND: Record<AttachmentSlot, AttachmentKind> = {
  legs: 'leg-struts',
  arms: 'arm-plating',
  torso: 'torso-armor',
  eyes: 'eye-glow',
  brain: 'brain-node',
  heart: 'heart-core',
};

const ALL_SLOTS: AttachmentSlot[] = ['legs', 'arms', 'torso', 'eyes', 'brain', 'heart'];

// GDD primary reads: these four must change the manifest at each version step.
export const PRIMARY_SLOTS: AttachmentSlot[] = ['legs', 'arms', 'torso', 'eyes'];

function clampLevel(n: number | undefined): number {
  if (n === undefined || n <= 0) return 0;
  if (n >= 3) return 3;
  return n | 0;
}

export function buildAppearanceManifest(input: AppearanceInput): AppearanceManifest {
  const levels: Record<AttachmentSlot, number> = {
    legs: 0,
    arms: 0,
    torso: 0,
    eyes: 0,
    brain: 0,
    heart: 0,
  };
  for (const slot of ALL_SLOTS) {
    levels[slot] = clampLevel(input.levels?.[slot]);
  }
  if (input.armor) {
    levels.torso = Math.min(3, levels.torso + 1);
  }

  const attachments: AttachmentCue[] = [];
  for (const slot of ALL_SLOTS) {
    const v = levels[slot];
    if (v <= 0) continue;
    attachments.push({
      slot,
      version: v as 1 | 2 | 3,
      kind: SLOT_KIND[slot],
      strength: v,
    });
  }

  return {
    chassis: 'operative',
    variant: input.variant,
    trimSlot: input.trimSlot ?? 0,
    faction: input.faction ?? 'nexus',
    attachments,
    levels,
  };
}

// Act-tier rival elite read: Act 3 / HQ peers telegraph V3, earlier acts scale down.
export function rivalAugmentLevels(elite: boolean, loadoutTier: number): Partial<Record<AttachmentSlot, number>> {
  if (elite) {
    return { legs: 3, arms: 3, torso: 3, eyes: 3, brain: 2, heart: 2 };
  }
  if (loadoutTier >= 4) {
    return { legs: 2, arms: 2, torso: 2, eyes: 2 };
  }
  if (loadoutTier >= 3) {
    return { legs: 1, arms: 1, torso: 1, eyes: 1 };
  }
  return {};
}
