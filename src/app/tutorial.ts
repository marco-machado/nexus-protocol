import { fromFx } from '../sim/fixed';
import type { SimState } from '../sim/state';
import { influence } from '../sim/tick';
import { NPC_CIV, ST_DEAD, ST_PERSUADED } from '../sim/units';
import type { MetaState, Territory } from './meta';

export interface TutorialHint {
  when(state: SimState): boolean;
  text: string;
}

function hostileNear(state: SimState, radius: number): boolean {
  for (const a of state.agents) {
    if (!a.alive) continue;
    for (const n of state.npcs) {
      if (n.kind === NPC_CIV || n.state === ST_DEAD || n.state === ST_PERSUADED) continue;
      const dx = fromFx(n.x) - fromFx(a.x);
      const dz = fromFx(n.z) - fromFx(a.z);
      if (dx * dx + dz * dz < radius * radius) return true;
    }
  }
  return false;
}

export function hintsFor(m: MetaState, t: Territory): TutorialHint[] {
  const owned = m.territories.filter((x) => x.owned).length;
  const hints: TutorialHint[] = [];

  if (owned === 1) {
    hints.push(
      {
        when: (s) => s.tick >= 20,
        text: 'Field operations onboarding: drag to select assets. Right-click to reposition.',
      },
      {
        when: (s) => hostileNear(s, 12) || s.alarm.level > 0,
        text: 'Assets engage hostiles autonomously. Right-click a hostile to prioritize it.',
      },
      {
        when: (s) => s.alarm.level >= 1,
        text: 'Gunfire attracts local law enforcement. Their response budget is, thankfully, finite.',
      },
    );
  }

  if (owned === 2) {
    hints.push(
      {
        when: (s) => s.tick >= 20,
        text: 'Chemical management enabled. Q/W/E adjust Combat/Focus/Surge on selected assets.',
      },
      {
        when: (s) => s.agents.some((a) => a.alive && a.hp < a.maxHp * 0.6),
        text: 'Reminder: Combat stims harden assets against damage. Stim costs are payroll-deducted.',
      },
    );
  }

  if (t.missionType === 1 && owned <= 3) {
    hints.push(
      {
        when: (s) => s.tick >= 40,
        text: 'Company property: one (1) Persuadertron. Press F near demographic units to enroll them.',
      },
      {
        when: (s) => {
          const vip = s.npcs[s.mission.vipId];
          return influence(s) >= 8 && vip !== undefined && vip.state !== ST_PERSUADED;
        },
        text: 'Influence quota met. Approach the VIP and press F to finalize the acquisition.',
      },
    );
  }

  return hints;
}
