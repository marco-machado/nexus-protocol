import {
  agentQuirks,
  AUG_SLOTS,
  AUG_LEVEL_PTS,
  augLevel,
  augLevelUnlocked,
  buildSpec,
  campaignAct,
  campaignWon,
  clearSave,
  CONDITION_NAMES,
  CYCLE_MS,
  DEFENSE_UNREST,
  incomePerCycle,
  researchPerCycle,
  loadMeta,
  missionConditions,
  newAgent,
  nextMissionSeed,
  REGION_UNLOCK_OWNED,
  REGIONS,
  regionUnlocked,
  saveMeta,
  WEAPON_TIER_PTS,
  weaponTierUnlocked,
  type DebriefInfo,
  type MetaState,
  type Territory,
} from './meta';
import { WEAPONS } from '../sim/weapons';
import { applyPalette, PALETTES, type PaletteName } from '../render/palette';
import { audio } from './audio';
import { saveSettings, settings } from './settings';

const POOL_GEAR = {
  persuadertron: { name: 'Persuadertron', desc: 'F-key conversion pulse', price: 500, tier: 1, stock: 'persuadertrons' },
  armor: { name: 'Body Armor', desc: '+60 HP', price: 400, tier: 1, stock: 'armors' },
  scanner: { name: 'Scanner', desc: 'map-wide hostile tracking', price: 250, tier: 1, stock: 'scanners' },
  cloak: { name: 'Cloak Field', desc: 'V toggles invisibility, drains stims', price: 900, tier: 3, stock: 'cloaks' },
  drone: { name: 'Drone Scout', desc: 'U deploys a recon drone', price: 700, tier: 3, stock: 'drones' },
  shield: { name: 'Energy Shield', desc: 'absorbs 80 damage, recharges', price: 1200, tier: 4, stock: 'shields' },
  medbay: { name: 'MedBay Beacon', desc: 'Y deploys a healing zone', price: 1500, tier: 5, stock: 'medbays' },
} as const;
const CONSUMABLES = {
  medkit: { name: 'Medkit', desc: 'auto-heal', price: 100, tier: 1, field: 'medkits' },
  charge: { name: 'Demo Charge', desc: 'T plants a timed bomb', price: 350, tier: 4, field: 'charges' },
  emp: { name: 'EMP Burst', desc: 'K stuns everything nearby', price: 800, tier: 5, field: 'emps' },
} as const;
const CONTRACT_NAMES = [
  'ASSASSINATION',
  'ACQUISITION (PERSUADE)',
  'ASSET RAID',
  'SQUAD PURGE',
  'DEFENSE',
  'VAULT HEIST',
  'HQ ASSAULT',
];
const RECRUIT_COST = 800;
const SLOT_CAP = 8;

function slotsUsed(a: import('./meta').MetaAgent): number {
  return (
    a.loadout.length +
    (a.gear.persuadertron ? 1 : 0) +
    (a.gear.armor ? 1 : 0) +
    (a.gear.scanner ? 1 : 0) +
    (a.gear.cloak ? 1 : 0) +
    (a.gear.drone ? 1 : 0) +
    (a.gear.shield ? 1 : 0) +
    (a.gear.medbay ? 1 : 0) +
    (a.gear.medkits > 0 ? 1 : 0) +
    (a.gear.charges > 0 ? 1 : 0) +
    (a.gear.emps > 0 ? 1 : 0)
  );
}

export class Screens {
  private el: HTMLElement;
  private selAgent = 0;
  private selRegion = -1;

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) audio.uiClick();
    });
  }

  show(): void {
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
    this.el.innerHTML = '';
  }

  menu(onStart: (fresh: boolean) => void): void {
    const hasSave = loadMeta() !== null;
    this.show();
    this.el.innerHTML = `
      <div class="panel menu">
        <h1>NEXUS<span>PROTOCOL</span></h1>
        <p class="tag">Corporate acquisitions. Kinetic division.</p>
        ${hasSave ? '<button data-act="continue">RESUME OPERATIONS</button>' : ''}
        <button data-act="new">NEW OPERATION</button>
        <button data-act="settings">SETTINGS</button>
        <p class="fine">Nexus Corp is an equal-opportunity employer. Asset attrition figures available on request.</p>
      </div>`;
    this.el.onclick = (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === 'new') {
        clearSave();
        onStart(true);
      } else if (act === 'continue') {
        onStart(false);
      } else if (act === 'settings') {
        this.settings(() => this.menu(onStart));
      }
    };
  }

  settings(onBack: () => void): void {
    this.show();
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.el.innerHTML = `
      <div class="panel">
        <h2>OPERATOR SETTINGS</h2>
        <h3>ACCESSIBILITY</h3>
        <div class="taxrow">Simulation speed <input type="range" min="50" max="100" step="5" value="${Math.round(settings.simSpeed * 100)}" data-set="simSpeed"/> <b>${Math.round(settings.simSpeed * 100)}%</b></div>
        <div class="taxrow">Palette ${(Object.keys(PALETTES) as PaletteName[])
          .map((p) => `<button data-palette="${p}" ${p === settings.palette ? 'class="primary"' : ''}>${PALETTES[p].label}</button>`)
          .join('')}</div>
        <h3>AUDIO</h3>
        <div class="taxrow">Master <input type="range" min="0" max="100" step="5" value="${Math.round(settings.masterVol * 100)}" data-set="masterVol"/> <b>${pct(settings.masterVol)}</b></div>
        <div class="taxrow">Score <input type="range" min="0" max="100" step="5" value="${Math.round(settings.musicVol * 100)}" data-set="musicVol"/> <b>${pct(settings.musicVol)}</b></div>
        <div class="taxrow">Effects <input type="range" min="0" max="100" step="5" value="${Math.round(settings.sfxVol * 100)}" data-set="sfxVol"/> <b>${pct(settings.sfxVol)}</b></div>
        <h3>VIDEO</h3>
        <div class="taxrow"><label><input type="checkbox" ${settings.postFx ? 'checked' : ''} data-set="postFx"/> Neon post-processing</label></div>
        <div class="taxrow"><label><input type="checkbox" ${settings.rain ? 'checked' : ''} data-set="rain"/> Weather effects (rain falls when the contract forecast says so)</label></div>
        <div class="btnrow"><button data-act="back">BACK</button></div>
        <p class="fine">Settings persist independently of operation saves.</p>
      </div>`;
    this.el.onclick = (e) => {
      const d = (e.target as HTMLElement).dataset;
      if (d.act === 'back') onBack();
      else if (d.palette !== undefined) {
        settings.palette = d.palette as PaletteName;
        applyPalette(settings.palette);
        saveSettings();
        this.settings(onBack);
      }
    };
    this.el.oninput = (e) => {
      const t = e.target as HTMLInputElement;
      const key = t.dataset.set;
      if (key === 'simSpeed' || key === 'masterVol' || key === 'musicVol' || key === 'sfxVol') {
        settings[key] = Number(t.value) / 100;
        const label = t.nextElementSibling;
        if (label) label.textContent = pct(settings[key]);
      } else if (key === 'postFx' || key === 'rain') {
        settings[key] = t.checked;
      } else {
        return;
      }
      saveSettings();
    };
  }

  worldMap(m: MetaState, onContract: (t: Territory, defense?: boolean) => void): void {
    this.show();
    if (this.selRegion < 0 || this.selRegion >= m.regionsUnlocked) this.selRegion = m.regionsUnlocked - 1;
    const tabs = REGIONS.map((r, i) => {
      const locked = !regionUnlocked(m, i);
      const ownedCount = m.territories.filter((t) => t.region === i && t.owned).length;
      return `<button data-region="${i}" ${locked ? 'disabled' : ''} class="${i === this.selRegion ? 'primary' : ''}">${locked ? `${r.name} [LOCKED]` : `${r.name} ${ownedCount}/5`}</button>`;
    }).join('');
    const nextLocked = m.regionsUnlocked < REGIONS.length;
    const charterNote = nextLocked
      ? `<div class="fine">Charter extension: manage ${REGION_UNLOCK_OWNED} districts in ${REGIONS[m.regionsUnlocked - 1]!.name} to open ${REGIONS[m.regionsUnlocked]!.name}.</div>`
      : '';
    const terr = m.territories
      .filter((t) => t.region === this.selRegion)
      .map((t) => {
        const owner = t.owned
          ? '<b class="own">NEXUS</b>'
          : t.rival >= 0
            ? `<b class="riv">${m.syndicates[t.rival]!.name}</b>`
            : '<b class="neutral">NEUTRAL</b>';
        const siegeMin = t.siege ? Math.ceil(Math.max(0, t.siege.deadline - m.lastSeen) / 60000) : 0;
        const siegeBanner = t.siege
          ? `<div class="siege">SIEGE: ${m.syndicates[t.siege.rival]!.name} strikes in ${Math.floor(siegeMin / 60)}h ${siegeMin % 60}m</div>`
          : '';
        const body = t.owned
          ? `${siegeBanner}<div>Income share <b>${Math.round((t.baseIncome * t.taxRate) / 100)}cr</b>/cycle</div>
             <div class="taxrow">Tax <input type="range" min="10" max="50" step="5" value="${t.taxRate}" data-tax="${t.id}"/> <b>${t.taxRate}%</b></div>
             <div>Unrest <span class="unrest ${t.unrest > 60 ? 'hot' : ''}">${t.unrest}</span>/100</div>
             ${t.siege ? `<button class="primary" data-defend="${t.id}">REPEL TAKEOVER</button>` : t.unrest >= DEFENSE_UNREST ? `<button data-defend="${t.id}">DEFENSE CONTRACT</button>` : ''}`
          : `<div>Est. income <b>${t.baseIncome}cr</b> base</div>
             <div>Contract: <b>${CONTRACT_NAMES[t.missionType]}</b>${t.hq ? ' <span class="hqtag">RIVAL HQ ARCOLOGY</span>' : ''}</div>
             <button data-contract="${t.id}">OPEN CONTRACT</button>`;
        return `<div class="terr ${t.owned ? 'owned' : ''}${t.siege ? ' sieged' : ''}"><h3>${t.name} ${owner}</h3>${body}</div>`;
      })
      .join('');
    const bar = (label: string, pts: number, need: number) =>
      `<div>${label}: <progress value="${Math.min(pts, need)}" max="${need}"></progress> ${pts >= need ? 'ONLINE' : `${pts}/${need}`}</div>`;
    const research = `
      <div class="research">
        <h3>R&amp;D ALLOCATION</h3>
        <div class="taxrow">Weapons <input type="range" min="0" max="100" step="10" value="${m.researchSplit}" data-split="1"/> Augments</div>
        ${[2, 3, 4, 5].map((tier) => bar(`Weapons tier ${tier}`, m.weaponPts, WEAPON_TIER_PTS[tier]!)).join('')}
        ${[1, 2, 3].map((lvl) => bar(`Augmentation V${lvl}`, m.augPts, AUG_LEVEL_PTS[lvl]!)).join('')}
      </div>`;
    this.el.innerHTML = `
      <div class="panel map">
        <div class="topbar"><h2>GLOBAL OPERATIONS</h2><span class="credits">${m.credits}cr</span><span>+${incomePerCycle(m) * 2}cr/hr</span><span>R&amp;D +${researchPerCycle(m) * 2}/hr</span><span>ACT ${campaignAct(m)}</span><span>CYCLE ${m.cycle} (next in ${Math.max(1, Math.ceil((CYCLE_MS - m.econMs) / 60000))}m)</span></div>
        <div class="regiontabs">${tabs}</div>
        ${charterNote}
        <div class="terrgrid">${terr}</div>
        ${research}
        <div class="loglines">${m.log.slice(0, 4).map((l) => `<div>&gt; ${l}</div>`).join('')}</div>
      </div>`;
    this.el.onclick = (e) => {
      const d = (e.target as HTMLElement).dataset;
      if (d.region !== undefined) {
        this.selRegion = Number(d.region);
        this.worldMap(m, onContract);
      } else if (d.contract !== undefined) onContract(m.territories[Number(d.contract)]!);
      else if (d.defend !== undefined) onContract(m.territories[Number(d.defend)]!, true);
    };
    this.el.oninput = (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.tax !== undefined) {
        m.territories[Number(t.dataset.tax)]!.taxRate = Number(t.value);
        saveMeta(m);
        this.worldMap(m, onContract);
      } else if (t.dataset.split !== undefined) {
        m.researchSplit = Number(t.value);
        saveMeta(m);
      }
    };
  }

  equip(m: MetaState, t: Territory, onLaunch: () => void, onBack: () => void, defense = false): void {
    this.show();
    const wpnRows = WEAPONS.map((w) => {
      const locked = w.tier > 1 && !weaponTierUnlocked(m, w.tier);
      const owned = m.arsenal[w.id] ?? 0;
      return `<div class="row">
        <span>${w.name} <small>T${w.tier} dmg${w.damage}${w.pellets > 1 ? 'x' + w.pellets : ''} rng${w.range}</small></span>
        <span>x${owned}</span>
        ${locked ? '<i>R&amp;D REQUIRED</i>' : `<button data-buy="${w.id}" ${m.credits < w.price ? 'disabled' : ''}>BUY ${w.price}</button>`}
        <button data-give="${w.id}" ${owned <= 0 ? 'disabled' : ''}>EQUIP</button>
      </div>`;
    }).join('');
    const poolRows = (Object.keys(POOL_GEAR) as (keyof typeof POOL_GEAR)[])
      .map((g) => {
        const def = POOL_GEAR[g];
        const locked = def.tier > 1 && !weaponTierUnlocked(m, def.tier);
        const stock = m[def.stock];
        return `<div class="row"><span>${def.name} <small>${def.tier > 1 ? `T${def.tier} ` : ''}${def.desc}</small></span><span>x${stock}</span>
          ${locked ? '<i>R&amp;D REQUIRED</i>' : `<button data-buygear="${g}" ${m.credits < def.price ? 'disabled' : ''}>BUY ${def.price}</button>`}
          <button data-givegear="${g}" ${stock <= 0 ? 'disabled' : ''}>EQUIP</button></div>`;
      })
      .join('');
    const consumableRows = (Object.keys(CONSUMABLES) as (keyof typeof CONSUMABLES)[])
      .map((g) => {
        const def = CONSUMABLES[g];
        const locked = def.tier > 1 && !weaponTierUnlocked(m, def.tier);
        return `<div class="row"><span>${def.name} <small>${def.tier > 1 ? `T${def.tier} ` : ''}${def.desc}</small></span><span></span>
          ${locked ? '<i>R&amp;D REQUIRED</i>' : `<button data-buygear="${g}" ${m.credits < def.price ? 'disabled' : ''}>BUY ${def.price} (sel. agent)</button>`}<span></span></div>`;
      })
      .join('');
    const gearRows = poolRows + consumableRows;

    const selForAugs = m.agents[this.selAgent]!;
    const augRows = AUG_SLOTS.map((slot) => {
      const lvl = selForAugs.alive ? augLevel(selForAugs, slot.key) : 0;
      if (lvl >= 3) {
        return `<div class="row"><span>${slot.name} V3 <small>fully augmented</small></span><span>V3</span><span></span><span></span></div>`;
      }
      const def = slot.levels[lvl]!;
      const locked = !augLevelUnlocked(m, lvl + 1);
      return `<div class="row"><span>${slot.name} V${lvl + 1} <small>${def.desc}</small></span><span>${lvl > 0 ? `V${lvl}` : ''}</span>
        ${locked ? '<i>R&amp;D REQUIRED</i>' : `<button data-aug="${slot.key}" ${m.credits < def.price ? 'disabled' : ''}>INSTALL ${def.price} (sel. agent)</button>`}<span></span></div>`;
    }).join('');

    const gearChip = (label: string, key: string, cyan = false) =>
      `<span class="chip${cyan ? ' cyan' : ''}">${label}<b data-dropgear="${key}">x</b></span>`;
    const agents = m.agents
      .map((a, i) => {
        const spec = buildSpec(a);
        if (!a.alive) {
          return `<div class="acard dead ${i === this.selAgent ? 'sel' : ''}" data-agent="${i}">
            <h4>${a.name} - WRITTEN OFF</h4>
            <button data-recruit="${i}" ${m.credits < RECRUIT_COST ? 'disabled' : ''}>DECANT REPLACEMENT ${RECRUIT_COST}cr</button>
          </div>`;
        }
        const load = a.loadout
          .map((wid, li) => `<span class="chip">${WEAPONS[wid]!.name}<b data-drop="${li}">x</b></span>`)
          .join('');
        const chips =
          (a.gear.persuadertron ? gearChip('Persuadertron', 'persuadertron', true) : '') +
          (a.gear.armor ? gearChip('Armor', 'armor') : '') +
          (a.gear.scanner ? gearChip('Scanner', 'scanner', true) : '') +
          (a.gear.cloak ? gearChip('Cloak', 'cloak', true) : '') +
          (a.gear.drone ? gearChip('Drone', 'drone', true) : '') +
          (a.gear.shield ? gearChip('Shield', 'shield') : '') +
          (a.gear.medbay ? gearChip('MedBay', 'medbay', true) : '') +
          `<span class="chip">Medkit x${a.gear.medkits}</span>` +
          (a.gear.charges > 0 ? `<span class="chip">Charge x${a.gear.charges}</span>` : '') +
          (a.gear.emps > 0 ? `<span class="chip">EMP x${a.gear.emps}</span>` : '');
        const augText = AUG_SLOTS.filter((slot) => augLevel(a, slot.key) > 0)
          .map((slot) => `${slot.name} V${augLevel(a, slot.key)}`)
          .join(', ');
        const quirkChips = agentQuirks(a)
          .map((q) => `<span class="chip gold" title="${q.desc}">${q.name}</span>`)
          .join('');
        return `<div class="acard ${i === this.selAgent ? 'sel' : ''}" data-agent="${i}">
          <h4>${a.name}</h4>
          <small>HP ${spec.maxHp} | missions ${a.missions} | kills ${a.kills} | persuasions ${a.persuasions} | SLOTS ${slotsUsed(a)}/${SLOT_CAP}</small>
          <div>${load || '<i>unarmed</i>'}</div>
          <div class="chips">${chips}</div>
          ${quirkChips ? `<div class="chips">${quirkChips}</div>` : ''}
          <small>${augText || 'no augments'}</small>
        </div>`;
      })
      .join('');

    const needsPersuadertron =
      !defense && t.missionType === 1 && !m.agents.some((a) => a.alive && a.gear.persuadertron);
    const cond = missionConditions(nextMissionSeed(t, m.ngPlus));
    const condNotes: string[] = [];
    if (cond.rain === 1) condNotes.push('counterparty sensor performance degraded 25%; umbrellas are not reimbursable');
    if (cond.tod === 2) condNotes.push('low light favors cloak fields');
    this.el.innerHTML = `
      <div class="panel equip">
        <div class="topbar"><h2>SQUAD PROVISIONING - ${t.name}${defense ? ' (DEFENSE)' : ''}</h2><span class="credits">${m.credits}cr</span></div>
        <div class="loglines">&gt; CONDITIONS: ${CONDITION_NAMES[cond.tod]}${cond.rain === 1 ? ' / RAIN' : ''}${condNotes.length > 0 ? ` (${condNotes.join('; ')})` : ''}</div>
        ${needsPersuadertron ? '<div class="loglines">&gt; COMPANY ISSUE: this contract requires a Persuadertron. Equip one before launch.</div>' : ''}
        <div class="cols">
          <div class="col"><h3>SQUAD (click to select)</h3>${agents}</div>
          <div class="col"><h3>ARMORY</h3>${wpnRows}<h3>EQUIPMENT</h3>${gearRows}<h3>AUGMENTATION (sel. agent)</h3>${augRows}</div>
        </div>
        <div class="btnrow"><button data-act="back">BACK</button><button class="primary" data-act="launch">LAUNCH CONTRACT</button></div>
      </div>`;

    const rerender = () => {
      saveMeta(m);
      this.equip(m, t, onLaunch, onBack, defense);
    };
    this.el.onclick = (e) => {
      const target = e.target as HTMLElement;
      const d = target.dataset;
      const sel = m.agents[this.selAgent]!;
      const card = target.closest<HTMLElement>('[data-agent]');
      if (card && d.recruit === undefined && d.drop === undefined && d.dropgear === undefined) {
        this.selAgent = Number(card.dataset.agent);
        rerender();
      } else if (d.act === 'back') onBack();
      else if (d.act === 'launch') onLaunch();
      else if (d.buy !== undefined) {
        const w = WEAPONS[Number(d.buy)]!;
        if (m.credits >= w.price) {
          m.credits -= w.price;
          m.arsenal[w.id] = (m.arsenal[w.id] ?? 0) + 1;
          rerender();
        }
      } else if (d.give !== undefined) {
        const wid = Number(d.give);
        if ((m.arsenal[wid] ?? 0) > 0 && sel.alive && slotsUsed(sel) < SLOT_CAP) {
          m.arsenal[wid]!--;
          sel.loadout.push(wid);
          rerender();
        }
      } else if (d.drop !== undefined) {
        const li = Number(d.drop);
        const wid = sel.loadout[li];
        if (wid !== undefined) {
          sel.loadout.splice(li, 1);
          m.arsenal[wid] = (m.arsenal[wid] ?? 0) + 1;
          rerender();
        }
      } else if (d.buygear !== undefined) {
        const g = d.buygear;
        if (g in CONSUMABLES) {
          const def = CONSUMABLES[g as keyof typeof CONSUMABLES];
          if (m.credits < def.price || !sel.alive) return;
          if (sel.gear[def.field] === 0 && slotsUsed(sel) >= SLOT_CAP) return;
          m.credits -= def.price;
          sel.gear[def.field]++;
          rerender();
        } else if (g in POOL_GEAR) {
          const def = POOL_GEAR[g as keyof typeof POOL_GEAR];
          if (m.credits < def.price) return;
          m.credits -= def.price;
          m[def.stock]++;
          rerender();
        }
      } else if (d.givegear !== undefined) {
        const g = d.givegear as keyof typeof POOL_GEAR;
        if (!(g in POOL_GEAR) || !sel.alive || slotsUsed(sel) >= SLOT_CAP) return;
        const def = POOL_GEAR[g];
        if (m[def.stock] > 0 && !sel.gear[g]) {
          m[def.stock]--;
          sel.gear[g] = true;
          rerender();
        }
      } else if (d.dropgear !== undefined) {
        const g = d.dropgear as keyof typeof POOL_GEAR;
        if (g in POOL_GEAR && sel.gear[g]) {
          sel.gear[g] = false;
          m[POOL_GEAR[g].stock]++;
          rerender();
        }
      } else if (d.aug !== undefined) {
        const slot = AUG_SLOTS.find((x) => x.key === d.aug)!;
        const lvl = augLevel(sel, slot.key);
        const def = slot.levels[lvl];
        if (sel.alive && def && m.credits >= def.price && augLevelUnlocked(m, lvl + 1)) {
          m.credits -= def.price;
          sel.augments[slot.key] = lvl + 1;
          rerender();
        }
      } else if (d.recruit !== undefined) {
        const idx = Number(d.recruit);
        if (m.credits >= RECRUIT_COST) {
          m.credits -= RECRUIT_COST;
          m.agents[idx] = newAgent(idx + m.cycle);
          rerender();
        }
      }
    };
  }

  debrief(info: DebriefInfo, m: MetaState, onContinue: () => void): void {
    this.show();
    const verdict = info.won ? 'CONTRACT FULFILLED' : 'CONTRACT UNFULFILLED';
    this.el.innerHTML = `
      <div class="panel debrief">
        <h2 class="${info.won ? 'good' : 'bad'}">${verdict}</h2>
        <div class="loglines">
          ${info.lines.map((l) => `<div>&gt; ${l}</div>`).join('')}
          ${info.salvage ? `<div>&gt; Augment salvage: +${info.salvage}cr</div>` : ''}
        </div>
        <div class="topbar"><span class="credits">BALANCE ${m.credits}cr</span></div>
        <button class="primary" data-act="continue">${campaignWon(m) ? 'FINALIZE GLOBAL ACQUISITION' : 'RETURN TO OPERATIONS'}</button>
      </div>`;
    this.el.onclick = (e) => {
      if ((e.target as HTMLElement).dataset.act === 'continue') onContinue();
    };
  }

  victory(m: MetaState, onNgPlus: () => void, onNewGame: () => void): void {
    this.show();
    this.el.innerHTML = `
      <div class="panel menu">
        <h1>GLOBAL<span>MONOPOLY</span></h1>
        <p class="tag">All forty territories under Nexus management. Three rival boards liquidated.${m.ngPlus > 0 ? ` (NG+${m.ngPlus})` : ''} The board demands growth.</p>
        <div class="loglines">${m.log.slice(0, 6).map((l) => `<div>&gt; ${l}</div>`).join('')}</div>
        <button class="primary" data-act="ngplus">NEW GAME+ (RETAIN ASSETS, HARDER RIVALS)</button>
        <button data-act="new">NEW OPERATION (CLEAN LEDGER)</button>
      </div>`;
    this.el.onclick = (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === 'ngplus') {
        onNgPlus();
      } else if (act === 'new') {
        clearSave();
        onNewGame();
      }
    };
  }
}
