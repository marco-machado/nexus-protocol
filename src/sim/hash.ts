import type { SimState } from './state';

export function hashState(s: SimState): number {
  let h = 0x811c9dc5 | 0;
  const mix = (v: number) => {
    for (let i = 0; i < 4; i++) {
      h ^= (v >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  };
  mix(s.tick);
  mix(s.rng);
  mix(s.kills);
  mix(s.civKills);
  mix(s.alarm.heat);
  mix(s.alarm.level);
  mix(s.mission.status);
  mix(s.mission.stage | (s.mission.wave << 4) | (s.mission.crackT << 8));
  mix(s.env.tod | (s.env.rain << 4));
  mix(s.projectiles.length);
  mix(s.blasts.length);
  mix(s.smoke.length);
  mix(s.breaches.length);
  for (const c of s.breaches) mix(c);
  for (const a of s.agents) {
    mix(a.x);
    mix(a.z);
    mix(a.hp);
    mix(a.reserve);
    mix(a.cooldown);
    mix(a.stims[0] | (a.stims[1] << 4) | (a.stims[2] << 8) | (a.active << 12));
    mix(a.alive ? 1 : 0);
    mix(a.cloakT | (a.shield << 9) | (a.stunT << 18));
    mix((a.driving + 2) | ((a.attackVeh + 2) << 8));
  }
  for (const n of s.npcs) {
    mix(n.x);
    mix(n.z);
    mix(n.hp | (n.state << 16) | (n.kind << 20));
    mix(n.stunT | ((n.raider ? 1 : 0) << 8));
    mix(n.cloakT | ((n.enemyMaster + 1) << 9));
  }
  for (const d of s.deployables) {
    mix(d.x);
    mix(d.z);
    mix(d.hp | (d.kind << 12) | ((d.alive ? 1 : 0) << 16) | (d.charge << 17));
  }
  for (const v of s.vehicles) {
    mix(v.x);
    mix(v.z);
    mix(v.hp);
    mix(
      v.fuseT |
        (v.stopT << 8) |
        (v.kind << 18) |
        (v.state << 20) |
        ((v.driver + 1) << 23) |
        ((v.dirX + 1) << 26) |
        ((v.dirZ + 1) << 28),
    );
  }
  return h >>> 0;
}
