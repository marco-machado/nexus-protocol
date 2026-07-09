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
import { OWNER_NEUTRAL, OWNER_NEXUS, type GlobeSnapshot, type WorldGlobe } from '../render/globe';
import { audio } from './audio';
import { SIM_SPEED_FAST, SIM_SPEED_NORMAL, saveSettings, settings, snapSimSpeed } from './settings';

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

function shortName(t: Territory): string {
  return t.name.replace('SECTOR ', '').replace(/"/g, '');
}

function fillPct(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 100);
}

function rangeInput(attrs: string, value: number, min: number, max: number, step: number): string {
  return `<input type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${fillPct(value, min, max)}%" ${attrs}/>`;
}

function syncRangeFill(t: HTMLInputElement): void {
  t.style.setProperty('--fill', `${fillPct(Number(t.value), Number(t.min), Number(t.max))}%`);
}

function toggleRow(label: string, note: string, key: string, on: boolean): string {
  return `<div class="setrow"><span class="setlbl">${label}${note ? `<small>${note}</small>` : ''}</span>
    <label class="toggle"><input type="checkbox" ${on ? 'checked' : ''} data-set="${key}"/><i class="tgl"></i><em class="tglval"></em></label>
  </div>`;
}

function slotSegments(used: number): string {
  const cells = Array.from({ length: SLOT_CAP }, (_, i) => `<i${i < used ? ' class="f"' : ''}></i>`).join('');
  return `<span class="slots${used >= SLOT_CAP ? ' full' : ''}">${cells}</span>`;
}

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
  private selTerr = -1;
  // replay the detail-panel entrance only when the selection actually changes,
  // not on the constant full re-renders (tax slider, R&D drawer, etc.)
  private lastDetailTerr = -1;
  private rdOpen = false;
  private globe: WorldGlobe | null = null;
  private globeWired = false;
  private mapMeta: MetaState | null = null;
  private mapOnContract: ((t: Territory, defense?: boolean) => void) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) audio.uiClick();
    });
  }

  setGlobe(globe: WorldGlobe): void {
    this.globe = globe;
  }

  show(): void {
    this.el.style.display = 'flex';
    this.el.classList.remove('mapmode');
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
        <div class="menustat"><span>NEXUS INTERNAL SYSTEMS</span><span class="live">LINK ACTIVE</span></div>
        <img class="logo" src="/logos/nexus-orbital-variant-02.png" alt="" />
        <h1>NEXUS<span>PROTOCOL</span></h1>
        <p class="tag">Corporate acquisitions. Kinetic division.</p>
        ${hasSave ? '<button class="primary" data-act="continue">RESUME OPERATIONS</button>' : ''}
        <button ${hasSave ? '' : 'class="primary" '}data-act="new">NEW OPERATION</button>
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
    const vol = (label: string, note: string, key: 'masterVol' | 'musicVol' | 'sfxVol') =>
      `<div class="setrow"><span class="setlbl">${label}${note ? `<small>${note}</small>` : ''}</span>${rangeInput(
        `data-set="${key}"`,
        Math.round(settings[key] * 100),
        0,
        100,
        5,
      )}<b class="setval">${pct(settings[key])}</b></div>`;
    this.el.innerHTML = `
      <div class="panel">
        <h2>OPERATOR SETTINGS</h2>
        <p class="tag">Terminal preferences. Applied immediately.</p>
        <h3>ACCESSIBILITY</h3>
        <div class="setrow"><span class="setlbl">Simulation speed<small>NORMAL runs contracts at half tempo for readability</small></span>
          <span class="seg">
            <button data-speed="${SIM_SPEED_NORMAL}" class="${settings.simSpeed === SIM_SPEED_NORMAL ? 'on' : ''}">NORMAL</button>
            <button data-speed="${SIM_SPEED_FAST}" class="${settings.simSpeed === SIM_SPEED_FAST ? 'on' : ''}">FAST</button>
          </span>
        </div>
        <div class="setrow"><span class="setlbl">Color palette<small>faction state is always paired with text and shape</small></span>
          <span class="seg">${(Object.keys(PALETTES) as PaletteName[])
            .map((p) => `<button data-palette="${p}" class="${p === settings.palette ? 'on' : ''}">${PALETTES[p].label}</button>`)
            .join('')}</span>
        </div>
        <h3>AUDIO</h3>
        ${vol('Master bus', '', 'masterVol')}
        ${vol('Score', 'adaptive stems follow the district alarm state', 'musicVol')}
        ${vol('Effects', 'weapons, comms, and city one-shots', 'sfxVol')}
        <h3>VIDEO</h3>
        ${toggleRow('Neon post-processing', 'bloom and vignette over the night palette', 'postFx', settings.postFx)}
        ${toggleRow('Weather effects', 'rain renders when the contract forecast calls it', 'rain', settings.rain)}
        ${toggleRow('Dynamic shadows', 'applies from the next deployment', 'shadows', settings.shadows)}
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
      } else if (d.speed !== undefined) {
        settings.simSpeed = snapSimSpeed(Number(d.speed));
        saveSettings();
        this.settings(onBack);
      }
    };
    this.el.oninput = (e) => {
      const t = e.target as HTMLInputElement;
      const key = t.dataset.set;
      if (key === 'masterVol' || key === 'musicVol' || key === 'sfxVol') {
        settings[key] = Number(t.value) / 100;
        syncRangeFill(t);
        const label = t.nextElementSibling;
        if (label) label.textContent = pct(settings[key]);
      } else if (key === 'postFx' || key === 'rain' || key === 'shadows') {
        settings[key] = t.checked;
      } else {
        return;
      }
      saveSettings();
    };
  }

  private mapHud(m: MetaState): string {
    const nextMin = Math.max(1, Math.ceil((CYCLE_MS - m.econMs) / 60000));
    return `<div class="maphud">
      <div class="maphud-brand"><i class="glyph"></i><h2>GLOBAL OPERATIONS</h2></div>
      <div class="stat"><label>BALANCE</label><b class="credits">${m.credits}<small>cr</small></b></div>
      <div class="stat"><label>INCOME</label><b class="good"><span data-incomehr="1">+${incomePerCycle(m) * 2}</span><small>cr/hr</small></b></div>
      <div class="stat"><label>R&amp;D</label><b class="accentv">+${researchPerCycle(m) * 2}<small>/hr</small></b></div>
      <div class="stat"><label>CAMPAIGN</label><b>ACT ${campaignAct(m)}</b></div>
      <div class="stat"><label>CYCLE ${m.cycle}</label><b class="muted">next ${nextMin}m</b></div>
    </div>`;
  }

  private terrList(m: MetaState): string {
    const region = REGIONS[this.selRegion]!;
    const terrs = m.territories.filter((t) => t.region === this.selRegion);
    const owned = terrs.filter((t) => t.owned).length;
    const rows = terrs.map((t) => this.terrRow(m, t)).join('');
    return `<div class="terrlist">
      <div class="terrlist-h"><span>${region.name}</span><span class="terrlist-cnt">${owned}/5 SECURED</span></div>
      <div class="terrlist-body">${rows}</div>
    </div>`;
  }

  private terrRow(m: MetaState, t: Territory): string {
    const owner = t.owned ? 'own' : t.rival >= 0 ? 'riv' : 'neu';
    const tag = t.owned
      ? '<span class="own">NEXUS</span>'
      : t.rival >= 0
        ? `<span class="riv">${m.syndicates[t.rival]!.name.split(' ')[0]}</span>`
        : '<span class="neu">NEUTRAL</span>';
    const extra = `${t.hq ? '<span class="hqtag">HQ</span>' : ''}${t.siege ? '<span class="sietag">SIEGE</span>' : ''}`;
    const line = t.owned ? `${Math.round((t.baseIncome * t.taxRate) / 100)}cr/cyc` : `est ${t.baseIncome}cr`;
    const ubar = t.owned
      ? `<i class="ub${t.unrest > 60 ? ' hot' : ''}" style="width:${Math.min(100, t.unrest)}%"></i>`
      : '';
    return `<button class="trow ${owner}${t.id === this.selTerr ? ' sel' : ''}" data-sel="${t.id}">
      <span class="trow-top"><span class="trow-nm">${shortName(t)}</span>${tag}${extra}</span>
      <span class="trow-sub"${t.owned ? ` data-inc="${t.id}"` : ''}>${line}</span>
      <span class="trow-ub">${ubar}</span>
    </button>`;
  }

  private popover(m: MetaState, t: Territory): string {
    const parts = /^SECTOR (\d+) "(.*)"$/.exec(t.name);
    const title = parts
      ? `<span class="seclbl">SECTOR ${parts[1]}</span><h4>${parts[2]}</h4>`
      : `<h4>${t.name}</h4>`;
    const head = `<div class="pop-h"><div>${title}</div><button class="pop-x" data-deselect="1" aria-label="Deselect">&times;</button></div>`;
    if (t.owned) {
      const siegeMin = t.siege ? Math.ceil(Math.max(0, t.siege.deadline - m.lastSeen) / 60000) : 0;
      const siegeBanner = t.siege
        ? `<div class="siege">SIEGE: ${m.syndicates[t.siege.rival]!.name} strikes in ${Math.floor(siegeMin / 60)}h ${siegeMin % 60}m</div>`
        : '';
      const action = t.siege
        ? `<button class="primary" data-defend="${t.id}">REPEL TAKEOVER</button>`
        : t.unrest >= DEFENSE_UNREST
          ? `<button data-defend="${t.id}">DEFENSE CONTRACT</button>`
          : '<div class="fine">HOLDING · NO ACTION REQUIRED</div>';
      return `<div class="pop">${head}<div class="own">NEXUS CONTROLLED</div>${siegeBanner}
        <dl><dt>Income share</dt><dd data-incval="1">${Math.round((t.baseIncome * t.taxRate) / 100)}cr/cycle</dd><dt>Unrest</dt><dd class="unrest ${t.unrest > 60 ? 'hot' : ''}">${t.unrest}/100</dd></dl>
        <div class="taxrow">Tax ${rangeInput(`data-tax="${t.id}"`, t.taxRate, 10, 50, 5)} <b>${t.taxRate}%</b></div>
        ${action}</div>`;
    }
    const owner = t.rival >= 0 ? `<div class="riv">${m.syndicates[t.rival]!.name}</div>` : '<div class="neutral">NEUTRAL</div>';
    return `<div class="pop">${head}${owner}${t.hq ? '<div class="hqtag">RIVAL HQ ARCOLOGY</div>' : ''}
      <dl><dt>Est. income</dt><dd>${t.baseIncome}cr base</dd><dt>Contract</dt><dd>${CONTRACT_NAMES[t.missionType]}</dd></dl>
      <button class="primary" data-contract="${t.id}">OPEN CONTRACT</button></div>`;
  }

  private globeSnapshot(m: MetaState): GlobeSnapshot {
    return {
      territories: m.territories.map((t) => ({
        id: t.id,
        region: t.region,
        owner: t.owned ? OWNER_NEXUS : t.rival >= 0 ? t.rival : OWNER_NEUTRAL,
        hq: t.hq === true,
        siege: t.siege !== undefined,
        siegeRival: t.siege ? t.siege.rival : -1,
        unrest: t.unrest,
        locked: t.region >= m.regionsUnlocked,
      })),
      focusRegion: this.selRegion,
      selected: this.selTerr,
    };
  }

  private onGlobePick(id: number): void {
    const m = this.mapMeta;
    const onContract = this.mapOnContract;
    if (!m || !onContract) return;
    if (id < 0) {
      if (this.selTerr === -1) return;
      this.selTerr = -1;
      this.worldMap(m, onContract);
      return;
    }
    const t = m.territories[id];
    if (!t || t.region >= m.regionsUnlocked) return;
    this.selRegion = t.region;
    this.selTerr = id;
    this.worldMap(m, onContract);
  }

  private legend(): string {
    const key = (color: string, label: string) => `<span><i class="sw" style="color:${color};background:${color}"></i>${label}</span>`;
    return `<div class="legend">${key('#33e08a', 'NEXUS')}${key('#ff9d3a', 'HELIOS')}${key('#c95bff', 'MIRAGE')}${key('#ff3b5c', 'CHORUS')}${key('#5b6b86', 'NEUTRAL')}</div>`;
  }

  private rdDrawer(m: MetaState): string {
    const bar = (label: string, pts: number, need: number) => {
      const done = pts >= need;
      return `<div class="rdrow${done ? ' done' : ''}"><span class="rdlbl">${label}</span><span class="meterbar${done ? ' done' : ''}"><i style="width:${Math.min(100, fillPct(pts, 0, need))}%"></i></span><b class="rdval">${done ? 'ONLINE' : `${pts}/${need}`}</b></div>`;
    };
    const wNext = [2, 3, 4, 5]
      .map((tier) => ({ label: `WPN T${tier}`, need: WEAPON_TIER_PTS[tier]! }))
      .find((x) => m.weaponPts < x.need);
    const aNext = [1, 2, 3]
      .map((lvl) => ({ label: `AUG V${lvl}`, need: AUG_LEVEL_PTS[lvl]! }))
      .find((x) => m.augPts < x.need);
    const nextTxt = `NEXT: ${wNext ? `${wNext.label} ${m.weaponPts}/${wNext.need}` : 'WPN MAXED'} · ${aNext ? `${aNext.label} ${m.augPts}/${aNext.need}` : 'AUG MAXED'}`;
    const grid = this.rdOpen
      ? `<div class="rdgrid">${[2, 3, 4, 5].map((tier) => bar(`WEAPONS TIER ${tier}`, m.weaponPts, WEAPON_TIER_PTS[tier]!)).join('')}${[1, 2, 3].map((lvl) => bar(`AUGMENTATION V${lvl}`, m.augPts, AUG_LEVEL_PTS[lvl]!)).join('')}</div>`
      : '';
    return `<div class="drawer"><span>R&amp;D ALLOCATION</span><b data-wsplit="1">WEAPONS ${m.researchSplit}%</b>${rangeInput('data-split="1"', m.researchSplit, 0, 100, 10)}<b data-asplit="1">AUGMENTS ${100 - m.researchSplit}%</b><span class="dnext">${nextTxt}</span><button data-act="rd">${this.rdOpen ? 'LESS' : 'ALL THRESHOLDS'}</button>${grid}</div>`;
  }

  worldMap(m: MetaState, onContract: (t: Territory, defense?: boolean) => void): void {
    this.show();
    this.el.classList.add('mapmode');
    if (this.selRegion < 0 || this.selRegion >= m.regionsUnlocked) this.selRegion = m.regionsUnlocked - 1;
    const st = m.territories[this.selTerr];
    if (!st || st.region !== this.selRegion) this.selTerr = -1;
    this.mapMeta = m;
    this.mapOnContract = onContract;
    if (this.globe && !this.globeWired) {
      this.globeWired = true;
      this.globe.onPick((id) => this.onGlobePick(id));
    }
    const tabs = REGIONS.map((r, i) => {
      const locked = !regionUnlocked(m, i);
      const ownedCount = m.territories.filter((t) => t.region === i && t.owned).length;
      return `<button class="rtab${i === this.selRegion ? ' primary' : ''}" data-region="${i}" ${locked ? 'disabled' : ''}>${r.name}<b>${locked ? 'LOCKED' : `${ownedCount}/5`}</b></button>`;
    }).join('');
    const nextLocked = m.regionsUnlocked < REGIONS.length;
    const charterNote = nextLocked
      ? `<div class="charter">CHARTER: secure ${REGION_UNLOCK_OWNED} districts in ${REGIONS[m.regionsUnlocked - 1]!.name} to open ${REGIONS[m.regionsUnlocked]!.name}</div>`
      : '';
    const sel = m.territories[this.selTerr];
    const detail = sel && sel.region === this.selRegion ? this.popover(m, sel) : '';
    const detailEnter = detail !== '' && this.selTerr !== this.lastDetailTerr;
    this.lastDetailTerr = detail === '' ? -1 : this.selTerr;
    const tickerTitle = m.log.slice(0, 4).join('\n').replace(/"/g, '&quot;');
    this.el.innerHTML = `
      <div class="mapframe">
        <div class="mapscrim top"></div>
        <div class="mapscrim bottom"></div>
        ${this.mapHud(m)}
        <div class="regiontabs">${tabs}</div>
        <div class="mapbody">
          <div class="leftcol">
            ${this.terrList(m)}
            <div class="detailwrap${detailEnter ? ' enter' : ''}">${detail}</div>
          </div>
          <div class="mapcenter">${charterNote}<div class="maphint">DRAG TO ROTATE · SELECT A BEACON</div></div>
          ${this.legend()}
        </div>
        ${this.rdDrawer(m)}
        <div class="ticker" title="${tickerTitle}">&gt; ${m.log[0] ?? 'Awaiting first directive.'}</div>
      </div>`;
    this.globe?.setData(this.globeSnapshot(m));
    this.el.onclick = (e) => {
      const el = e.target as HTMLElement;
      const d = el.dataset;
      if (d.contract !== undefined) {
        onContract(m.territories[Number(d.contract)]!);
        return;
      }
      if (d.defend !== undefined) {
        onContract(m.territories[Number(d.defend)]!, true);
        return;
      }
      if (d.deselect !== undefined) {
        this.selTerr = -1;
        this.worldMap(m, onContract);
        return;
      }
      if (d.act === 'rd') {
        this.rdOpen = !this.rdOpen;
        this.worldMap(m, onContract);
        return;
      }
      const reg = el.closest<HTMLElement>('[data-region]');
      if (reg && !(reg as HTMLButtonElement).disabled) {
        this.selRegion = Number(reg.dataset.region);
        this.selTerr = -1;
        this.worldMap(m, onContract);
        return;
      }
      const row = el.closest<HTMLElement>('[data-sel]');
      if (row) {
        this.selTerr = Number(row.dataset.sel);
        this.worldMap(m, onContract);
      }
    };
    this.el.oninput = (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.tax !== undefined) {
        // update in place: a full re-render would tear the slider out mid-drag
        const terr = m.territories[Number(t.dataset.tax)]!;
        terr.taxRate = Number(t.value);
        saveMeta(m);
        syncRangeFill(t);
        const pctLabel = t.nextElementSibling;
        if (pctLabel) pctLabel.textContent = `${terr.taxRate}%`;
        const income = Math.round((terr.baseIncome * terr.taxRate) / 100);
        const dd = this.el.querySelector('[data-incval]');
        if (dd) dd.textContent = `${income}cr/cycle`;
        const sub = this.el.querySelector(`[data-inc="${terr.id}"]`);
        if (sub) sub.textContent = `${income}cr/cyc`;
        const hr = this.el.querySelector('[data-incomehr]');
        if (hr) hr.textContent = `+${incomePerCycle(m) * 2}`;
      } else if (t.dataset.split !== undefined) {
        m.researchSplit = Number(t.value);
        saveMeta(m);
        syncRangeFill(t);
        const w = this.el.querySelector('[data-wsplit]');
        const a = this.el.querySelector('[data-asplit]');
        if (w) w.textContent = `WEAPONS ${m.researchSplit}%`;
        if (a) a.textContent = `AUGMENTS ${100 - m.researchSplit}%`;
      }
    };
  }

  equip(m: MetaState, t: Territory, onLaunch: () => void, onBack: () => void, defense = false): void {
    this.show();
    const selAgent = m.agents[this.selAgent]!;
    const selFull = selAgent.alive && slotsUsed(selAgent) >= SLOT_CAP;
    const rdCell = '<span class="rd">R&amp;D REQUIRED</span>';

    const wpnRows = WEAPONS.map((w) => {
      const locked = w.tier > 1 && !weaponTierUnlocked(m, w.tier);
      const owned = m.arsenal[w.id] ?? 0;
      const actions = locked
        ? rdCell
        : `<button data-buy="${w.id}" ${m.credits < w.price ? 'disabled' : ''}>BUY ${w.price}</button>
           <button data-give="${w.id}" ${owned <= 0 || !selAgent.alive || selFull ? 'disabled' : ''}>EQUIP</button>`;
      return `<div class="srow${locked ? ' locked' : ''}">
        <span class="tier t${w.tier}">T${w.tier}</span>
        <span class="s-name">${w.name}<small>DMG ${w.damage}${w.pellets > 1 ? 'x' + w.pellets : ''} · RNG ${w.range} · MAG ${w.ammoMax}</small></span>
        <span class="s-stock">x${owned}</span>
        ${actions}
      </div>`;
    }).join('');

    const poolRows = (Object.keys(POOL_GEAR) as (keyof typeof POOL_GEAR)[])
      .map((g) => {
        const def = POOL_GEAR[g];
        const locked = def.tier > 1 && !weaponTierUnlocked(m, def.tier);
        const stock = m[def.stock];
        const carried = selAgent.alive && selAgent.gear[g] === true;
        const actions = locked
          ? rdCell
          : `<button data-buygear="${g}" ${m.credits < def.price ? 'disabled' : ''}>BUY ${def.price}</button>
             <button data-givegear="${g}" ${stock <= 0 || !selAgent.alive || selFull || carried ? 'disabled' : ''}>EQUIP</button>`;
        return `<div class="srow${locked ? ' locked' : ''}">
          <span class="tier t${def.tier}">T${def.tier}</span>
          <span class="s-name">${def.name}<small>${def.desc}</small></span>
          <span class="s-stock">x${stock}</span>
          ${actions}
        </div>`;
      })
      .join('');

    const consumableRows = (Object.keys(CONSUMABLES) as (keyof typeof CONSUMABLES)[])
      .map((g) => {
        const def = CONSUMABLES[g];
        const locked = def.tier > 1 && !weaponTierUnlocked(m, def.tier);
        const count = selAgent.alive ? selAgent.gear[def.field] : 0;
        const canBuy =
          m.credits >= def.price && selAgent.alive && (count > 0 || !selFull);
        const actions = locked
          ? rdCell
          : `<button class="wide" data-buygear="${g}" ${canBuy ? '' : 'disabled'}>BUY ${def.price}</button>`;
        return `<div class="srow${locked ? ' locked' : ''}">
          <span class="tier t${def.tier}">T${def.tier}</span>
          <span class="s-name">${def.name}<small>${def.desc}</small></span>
          <span class="s-stock">x${count}</span>
          ${actions}
        </div>`;
      })
      .join('');

    const augRows = AUG_SLOTS.map((slot) => {
      const lvl = selAgent.alive ? augLevel(selAgent, slot.key) : 0;
      const pips = `<span class="pips">${[0, 1, 2]
        .map((p) => `<i${p < lvl ? ' class="f"' : ''}></i>`)
        .join('')}</span>`;
      if (lvl >= 3) {
        return `<div class="srow">
          <span class="tier t5">V3</span>
          <span class="s-name">${slot.name}<small>fully augmented</small></span>
          <span class="s-stock">${pips}</span>
          <span class="max">MAXED</span>
        </div>`;
      }
      const def = slot.levels[lvl]!;
      const locked = !augLevelUnlocked(m, lvl + 1);
      const actions = locked
        ? rdCell
        : `<button class="wide" data-aug="${slot.key}" ${m.credits < def.price || !selAgent.alive ? 'disabled' : ''}>INSTALL ${def.price}</button>`;
      return `<div class="srow${locked ? ' locked' : ''}">
        <span class="tier${lvl + 1 >= 3 ? ' t5' : lvl + 1 === 2 ? ' t3' : ''}">V${lvl + 1}</span>
        <span class="s-name">${slot.name}<small>${def.desc}</small></span>
        <span class="s-stock">${pips}</span>
        ${actions}
      </div>`;
    }).join('');

    const gearChip = (label: string, key: string, cyan = false) =>
      `<span class="chip${cyan ? ' cyan' : ''}">${label}<b data-dropgear="${key}" title="Return to pool">x</b></span>`;
    const agents = m.agents
      .map((a, i) => {
        if (!a.alive) {
          return `<div class="acard dead ${i === this.selAgent ? 'sel' : ''}" data-agent="${i}">
            <div class="ac-h"><b class="ac-name">${a.name}</b><span class="ac-dead">ASSET WRITTEN OFF</span></div>
            <button data-recruit="${i}" ${m.credits < RECRUIT_COST ? 'disabled' : ''}>DECANT REPLACEMENT · ${RECRUIT_COST}cr</button>
          </div>`;
        }
        const spec = buildSpec(a);
        const used = slotsUsed(a);
        const load = a.loadout
          .map((wid, li) => `<span class="chip">${WEAPONS[wid]!.name}<b data-drop="${li}" title="Return to arsenal">x</b></span>`)
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
          .map((slot) => `${slot.name.toUpperCase()} <b>V${augLevel(a, slot.key)}</b>`)
          .join(' · ');
        const quirkChips = agentQuirks(a)
          .map((q) => `<span class="chip gold" title="${q.desc}">${q.name}</span>`)
          .join('');
        return `<div class="acard ${i === this.selAgent ? 'sel' : ''}" data-agent="${i}">
          <div class="ac-h"><b class="ac-name">${a.name}</b>${quirkChips}<span class="ac-hp">HP ${spec.maxHp}</span></div>
          <div class="ac-stats"><span>OPS <b>${a.missions}</b></span><span>KILLS <b>${a.kills}</b></span><span>PERSUADED <b>${a.persuasions}</b></span><span>SLOTS <b>${used}/${SLOT_CAP}</b>${slotSegments(used)}</span></div>
          <div class="chips">${load || '<span class="chip empty">UNARMED</span>'}${chips}</div>
          <div class="ac-augs">${augText ? `AUG ${augText}` : 'NO AUGMENTS INSTALLED'}</div>
        </div>`;
      })
      .join('');

    const needsPersuadertron =
      !defense && t.missionType === 1 && !m.agents.some((a) => a.alive && a.gear.persuadertron);
    const cond = missionConditions(nextMissionSeed(t, m.ngPlus));
    const condNotes: string[] = [];
    if (cond.rain === 1) condNotes.push('counterparty sensor performance degraded 25%; umbrellas are not reimbursable');
    if (cond.tod === 2) condNotes.push('low light favors cloak fields');
    const aliveN = m.agents.filter((a) => a.alive).length;
    this.el.innerHTML = `
      <div class="panel equip">
        <div class="equiphead">
          <div><h2>SQUAD PROVISIONING</h2><span class="eqsub">${t.name} · ${defense ? 'DEFENSE CONTRACT' : CONTRACT_NAMES[t.missionType]}</span></div>
          <div class="eqbal"><label>BALANCE</label><b>${m.credits}<small>cr</small></b></div>
        </div>
        <div class="condbar">
          <span class="cchip">${CONDITION_NAMES[cond.tod]}</span>${cond.rain === 1 ? '<span class="cchip">RAIN</span>' : ''}
          <span class="condnote">${condNotes.length > 0 ? condNotes.join('; ') : 'standard operating conditions'}</span>
          ${needsPersuadertron ? '<span class="alertline">COMPANY ISSUE: this contract requires a Persuadertron. Equip one before launch.</span>' : ''}
        </div>
        <div class="cols">
          <div class="col squad"><h3>SQUAD ROSTER<span class="h3tag">SELECT AN OPERATIVE TO PROVISION</span></h3>${agents}</div>
          <div class="col shop">
            <h3>ARMORY<span class="h3tag">SQUAD ARSENAL</span></h3>${wpnRows}
            <h3>EQUIPMENT<span class="h3tag">POOL STOCK</span></h3>${poolRows}
            <h3>CONSUMABLES<span class="h3tag">ISSUED TO ${selAgent.alive ? selAgent.name : 'NO ACTIVE ASSET'}</span></h3>${consumableRows}
            <h3>AUGMENTATION<span class="h3tag">INSTALL TARGET: ${selAgent.alive ? selAgent.name : 'NO ACTIVE ASSET'}</span></h3>${augRows}
          </div>
        </div>
        <div class="btnbar"><button data-act="back">BACK</button><span class="launchmeta">${aliveN}/${m.agents.length} ASSETS ACTIVE</span><button class="primary" data-act="launch">LAUNCH CONTRACT</button></div>
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
      <div class="panel debrief${info.won ? '' : ' fail'}">
        <div class="verdict ${info.won ? 'good' : 'bad'}">
          <small>CONTRACT REVIEW · ${info.territory.name}</small>
          <h2>${verdict}</h2>
        </div>
        <div class="loglines">
          ${info.lines.map((l) => `<div>&gt; ${l}</div>`).join('')}
          ${info.salvage ? `<div>&gt; Augment salvage: +${info.salvage}cr</div>` : ''}
        </div>
        <div class="dbstat"><span>BALANCE<b>${m.credits}cr</b></span><span>CYCLE<b>${m.cycle}</b></span><span>CAMPAIGN<b>ACT ${campaignAct(m)}</b></span></div>
        <div class="btnrow"><span></span><button class="primary" data-act="continue">${campaignWon(m) ? 'FINALIZE GLOBAL ACQUISITION' : 'RETURN TO OPERATIONS'}</button></div>
      </div>`;
    this.el.onclick = (e) => {
      if ((e.target as HTMLElement).dataset.act === 'continue') onContinue();
    };
  }

  victory(m: MetaState, onNgPlus: () => void, onNewGame: () => void): void {
    this.show();
    this.el.innerHTML = `
      <div class="panel menu victory">
        <div class="menustat"><span>NEXUS INTERNAL SYSTEMS</span><span class="live">BOARD SESSION ACTIVE</span></div>
        <h1>GLOBAL<span>MONOPOLY</span></h1>
        <p class="tag">All forty territories under Nexus management. Three rival boards liquidated.${m.ngPlus > 0 ? ` (NG+${m.ngPlus})` : ''} The board demands growth.</p>
        <div class="loglines">${m.log.slice(0, 6).map((l) => `<div>&gt; ${l}</div>`).join('')}</div>
        <button class="primary" data-act="ngplus">NEW GAME+ · RETAIN ASSETS, HARDER RIVALS</button>
        <button data-act="new">NEW OPERATION · CLEAN LEDGER</button>
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
