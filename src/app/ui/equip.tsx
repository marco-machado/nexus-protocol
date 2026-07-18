import { useReducer, useState, type MouseEvent, type ReactNode } from 'react';
import type { AppearanceManifest } from '../../render/appearance';
import { WEAPONS } from '../../sim/weapons';
import { briefingIntel, generateClauses, modNames } from '../clauses';
import {
  agentAppearance,
  AUG_SLOTS,
  augLevel,
  augLevelUnlocked,
  buildSpec,
  CONDITION_NAMES,
  CONTRACT_NAMES,
  missionConditions,
  newAgent,
  nextMissionSeed,
  prospectiveAgentAppearance,
  saveMeta,
  weaponTierUnlocked,
  type AugKey,
  type MetaAgent,
  type MetaState,
  type Territory,
} from '../meta';
import { ChassisPreview } from './chassisPreview';

function appearancePreview(m: AppearanceManifest): string {
  const parts: string[] = [];
  const levels = m.levels;
  if (levels.legs > 0) parts.push(`LEG STRUTS V${levels.legs}`);
  if (levels.arms > 0) parts.push(`ARM PLATE V${levels.arms}`);
  if (levels.torso > 0) parts.push(`TORSO ARMOR V${levels.torso}`);
  if (levels.eyes > 0) parts.push(`EYE GLOW V${levels.eyes}`);
  if (levels.brain > 0) parts.push(`BRAIN NODE V${levels.brain}`);
  if (levels.heart > 0) parts.push(`HEART CORE V${levels.heart}`);
  return parts.length > 0 ? parts.join(' · ') : 'NO CHASSIS DRESS';
}

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
const RECRUIT_COST = 800;
const SLOT_CAP = 8;

function slotsUsed(a: MetaAgent): number {
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

function SlotSegments({ used }: { used: number }) {
  return (
    <span className={`slots${used >= SLOT_CAP ? ' full' : ''}`}>
      {Array.from({ length: SLOT_CAP }, (_, i) => (
        <i key={i} className={i < used ? 'f' : undefined}></i>
      ))}
    </span>
  );
}

function ShopRow({
  tier,
  tierClass,
  locked,
  name,
  detail,
  stock,
  onPreview,
  previewing,
  children,
}: {
  tier: string;
  tierClass?: string;
  locked: boolean;
  name: string;
  detail: string;
  stock: ReactNode;
  onPreview?: () => void;
  previewing?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`srow${locked ? ' locked' : ''}${previewing ? ' previewing' : ''}`}
      onMouseEnter={onPreview}
      onFocusCapture={onPreview}
    >
      <span className={`tier${tierClass ? ` ${tierClass}` : ''}`}>{tier}</span>
      <span className="s-name">
        {name}
        <small>{detail}</small>
      </span>
      <span className="s-stock">{stock}</span>
      {locked ? <span className="rd">R&D REQUIRED</span> : children}
    </div>
  );
}

export function EquipScreen({
  meta: m,
  territory: t,
  defense,
  onLaunch,
  onBack,
}: {
  meta: MetaState;
  territory: Territory;
  defense: boolean;
  onLaunch: () => void;
  onBack: () => void;
}) {
  const [selAgent, setSelAgent] = useState(0);
  const [previewAug, setPreviewAug] = useState<{
    agent: number;
    slot: AugKey;
    next: number;
  } | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const commit = () => {
    saveMeta(m);
    bump();
  };
  const sel = m.agents[selAgent]!;
  const selFull = sel.alive && slotsUsed(sel) >= SLOT_CAP;
  // field trim is keyed by launch order among living assets, so previews must
  // index the deploy slot rather than the roster row
  const deploySlot = (idx: number) => m.agents.slice(0, idx).filter((a) => a.alive).length;
  const activePreview =
    previewAug?.agent === selAgent &&
    sel.alive &&
    augLevel(sel, previewAug.slot) + 1 === previewAug.next
      ? previewAug
      : null;
  const selectedLook = sel.alive ? agentAppearance(sel, deploySlot(selAgent)) : null;
  const previewLook =
    selectedLook && activePreview
      ? prospectiveAgentAppearance(sel, activePreview.slot, activePreview.next, deploySlot(selAgent))
      : selectedLook;

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const needsPersuadertron = !defense && t.missionType === 1 && !m.agents.some((a) => a.alive && a.gear.persuadertron);
  const seed = nextMissionSeed(t, m.ngPlus);
  const cond = missionConditions(seed);
  const condNotes: string[] = [];
  if (cond.rain === 1) condNotes.push('counterparty sensor performance degraded 25%; umbrellas are not reimbursable');
  if (cond.tod === 2) condNotes.push('low light favors cloak fields');
  const rivalId = defense && t.siege ? t.siege.rival : t.rival;
  const intel = briefingIntel(cond, rivalId >= 0 ? m.syndicates[rivalId]!.doctrine : -1, defense ? -1 : t.missionType);
  const clauses = generateClauses(seed, t.baseIncome);
  const aliveN = m.agents.filter((a) => a.alive).length;

  return (
    <div className="panel equip">
      <div className="equiphead">
        <div>
          <h2>SQUAD PROVISIONING</h2>
          <span className="eqsub">
            {t.name} · {defense ? 'DEFENSE CONTRACT' : CONTRACT_NAMES[t.missionType]}
          </span>
        </div>
        <div className="eqbal">
          <label>BALANCE</label>
          <b>
            {m.credits}
            <small>cr</small>
          </b>
        </div>
      </div>
      <div className="condbar">
        <span className="cchip">{CONDITION_NAMES[cond.tod]}</span>
        {cond.rain === 1 ? <span className="cchip">RAIN</span> : null}
        {modNames(cond.mods).map((name) => (
          <span key={name} className="cchip">
            {name}
          </span>
        ))}
        <span className="condnote">{condNotes.length > 0 ? condNotes.join('; ') : 'standard operating conditions'}</span>
        {needsPersuadertron ? (
          <span className="alertline">COMPANY ISSUE: this contract requires a Persuadertron. Equip one before launch.</span>
        ) : null}
      </div>
      <div className="intelbar">
        <div className="intelrow">
          <label>DOCTRINE READ</label>
          <span>
            FAVORED: <b>{intel.favored.join(' · ')}</b>
            {intel.resisted.length > 0 ? (
              <>
                {' '}
                · RESISTED: <b>{intel.resisted.join(' · ')}</b>
              </>
            ) : null}
          </span>
        </div>
        {intel.counters.map((line, i) => (
          <div key={i} className="intelrow">
            <label>COUNTER INTEL</label>
            <span>{line}</span>
          </div>
        ))}
        <div className="intelrow">
          <label>OPTIONAL CLAUSES</label>
          <span>
            {clauses.map((c, i) => (
              <span key={c.kind}>
                {i > 0 ? ' · ' : ''}
                {c.label} ({c.desc}) <b>+{c.rider}cr</b>
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="cols">
        <div className="col squad">
          <h3>
            SQUAD ROSTER<span className="h3tag">SELECT AN OPERATIVE TO PROVISION</span>
          </h3>
          {m.agents.map((a, i) => {
            if (!a.alive) {
              return (
                <div key={i} className={`acard dead ${i === selAgent ? 'sel' : ''}`}>
                  <div className="ac-h">
                    <button type="button" className="ac-name" aria-label={`Select ${a.name}`} onClick={() => setSelAgent(i)}>
                      {a.name}
                    </button>
                    <span className="ac-dead">ASSET WRITTEN OFF</span>
                  </div>
                  <button
                    disabled={m.credits < RECRUIT_COST}
                    onClick={stop(() => {
                      if (m.credits >= RECRUIT_COST) {
                        m.credits -= RECRUIT_COST;
                        m.agents[i] = newAgent(i + m.cycle);
                        commit();
                      }
                    })}
                  >
                    DECANT REPLACEMENT · {RECRUIT_COST}cr
                  </button>
                </div>
              );
            }
            const spec = buildSpec(a);
            const used = slotsUsed(a);
            const gearChip = (label: string, key: keyof typeof POOL_GEAR, cyan = false) =>
              a.gear[key] ? (
                <span key={key} className={`chip${cyan ? ' cyan' : ''}`}>
                  {label}
                  <button
                    type="button"
                    className="chipx"
                    title="Return to pool"
                    aria-label={`Return ${label} to pool`}
                    onClick={stop(() => {
                      if (a.gear[key]) {
                        a.gear[key] = false;
                        m[POOL_GEAR[key].stock]++;
                        commit();
                      }
                    })}
                  >
                    x
                  </button>
                </span>
              ) : null;
            return (
              <div key={i} className={`acard ${i === selAgent ? 'sel' : ''}`}>
                <div className="ac-h">
                  <button type="button" className="ac-name" aria-label={`Select ${a.name}`} onClick={() => setSelAgent(i)}>
                    {a.name}
                  </button>
                  <span className="chip" title="Cosmetic chassis variant">
                    {a.variant === 'female' ? 'FEMALE' : 'MALE'}
                  </span>
                  <span className="ac-hp">HP {spec.maxHp}</span>
                </div>
                <div className="ac-stats">
                  <span>
                    OPS <b>{a.missions}</b>
                  </span>
                  <span>
                    KILLS <b>{a.kills}</b>
                  </span>
                  <span>
                    PERSUADED <b>{a.persuasions}</b>
                  </span>
                  <span>
                    SLOTS{' '}
                    <b>
                      {used}/{SLOT_CAP}
                    </b>
                    <SlotSegments used={used} />
                  </span>
                </div>
                <div className="chips">
                  {a.loadout.length === 0 ? <span className="chip empty">UNARMED</span> : null}
                  {a.loadout.map((wid, li) => (
                    <span key={li} className="chip">
                      {WEAPONS[wid]!.name}
                      <button
                        type="button"
                        className="chipx"
                        title="Return to arsenal"
                        aria-label={`Return ${WEAPONS[wid]!.name} to arsenal`}
                        onClick={stop(() => {
                          a.loadout.splice(li, 1);
                          m.arsenal[wid] = (m.arsenal[wid] ?? 0) + 1;
                          commit();
                        })}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  {gearChip('Persuadertron', 'persuadertron', true)}
                  {gearChip('Armor', 'armor')}
                  {gearChip('Scanner', 'scanner', true)}
                  {gearChip('Cloak', 'cloak', true)}
                  {gearChip('Drone', 'drone', true)}
                  {gearChip('Shield', 'shield')}
                  {gearChip('MedBay', 'medbay', true)}
                  <span className="chip">Medkit x{a.gear.medkits}</span>
                  {a.gear.charges > 0 ? <span className="chip">Charge x{a.gear.charges}</span> : null}
                  {a.gear.emps > 0 ? <span className="chip">EMP x{a.gear.emps}</span> : null}
                </div>
                <div className="ac-augs">
                  {(() => {
                    const installed = AUG_SLOTS.filter((slot) => augLevel(a, slot.key) > 0);
                    if (installed.length === 0) return 'NO AUGMENTS INSTALLED';
                    return (
                      <>
                        AUG{' '}
                        {installed.map((slot, k) => (
                          <span key={slot.key}>
                            {k > 0 ? ' · ' : ''}
                            {slot.name.toUpperCase()} <b>V{augLevel(a, slot.key)}</b>
                          </span>
                        ))}
                      </>
                    );
                  })()}
                </div>
                <div className="ac-augs ac-dress" title="Chassis dress from installed augments">
                  CHASSIS · {appearancePreview(agentAppearance(a, deploySlot(i)))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="col shop">
          <h3>
            ARMORY<span className="h3tag">SQUAD ARSENAL</span>
          </h3>
          {WEAPONS.map((w) => {
            const locked = w.tier > 1 && !weaponTierUnlocked(m, w.tier);
            const owned = m.arsenal[w.id] ?? 0;
            return (
              <ShopRow
                key={w.id}
                tier={`T${w.tier}`}
                tierClass={`t${w.tier}`}
                locked={locked}
                name={w.name}
                detail={`DMG ${w.damage}${w.pellets > 1 ? `x${w.pellets}` : ''} · RNG ${w.range} · MAG ${w.ammoMax}`}
                stock={`x${owned}`}
              >
                <button
                  disabled={m.credits < w.price}
                  onClick={() => {
                    if (m.credits >= w.price) {
                      m.credits -= w.price;
                      m.arsenal[w.id] = (m.arsenal[w.id] ?? 0) + 1;
                      commit();
                    }
                  }}
                >
                  BUY {w.price}
                </button>
                <button
                  disabled={owned <= 0 || !sel.alive || selFull}
                  onClick={() => {
                    if ((m.arsenal[w.id] ?? 0) > 0 && sel.alive && slotsUsed(sel) < SLOT_CAP) {
                      m.arsenal[w.id]!--;
                      sel.loadout.push(w.id);
                      commit();
                    }
                  }}
                >
                  EQUIP
                </button>
              </ShopRow>
            );
          })}
          <h3>
            EQUIPMENT<span className="h3tag">POOL STOCK</span>
          </h3>
          {(Object.keys(POOL_GEAR) as (keyof typeof POOL_GEAR)[]).map((g) => {
            const def = POOL_GEAR[g];
            const locked = def.tier > 1 && !weaponTierUnlocked(m, def.tier);
            const stock = m[def.stock];
            const carried = sel.alive && sel.gear[g] === true;
            return (
              <ShopRow key={g} tier={`T${def.tier}`} tierClass={`t${def.tier}`} locked={locked} name={def.name} detail={def.desc} stock={`x${stock}`}>
                <button
                  disabled={m.credits < def.price}
                  onClick={() => {
                    if (m.credits >= def.price) {
                      m.credits -= def.price;
                      m[def.stock]++;
                      commit();
                    }
                  }}
                >
                  BUY {def.price}
                </button>
                <button
                  disabled={stock <= 0 || !sel.alive || selFull || carried}
                  onClick={() => {
                    if (m[def.stock] > 0 && sel.alive && slotsUsed(sel) < SLOT_CAP && !sel.gear[g]) {
                      m[def.stock]--;
                      sel.gear[g] = true;
                      commit();
                    }
                  }}
                >
                  EQUIP
                </button>
              </ShopRow>
            );
          })}
          <h3>
            CONSUMABLES<span className="h3tag">ISSUED TO {sel.alive ? sel.name : 'NO ACTIVE ASSET'}</span>
          </h3>
          {(Object.keys(CONSUMABLES) as (keyof typeof CONSUMABLES)[]).map((g) => {
            const def = CONSUMABLES[g];
            const locked = def.tier > 1 && !weaponTierUnlocked(m, def.tier);
            const count = sel.alive ? sel.gear[def.field] : 0;
            const canBuy = m.credits >= def.price && sel.alive && (count > 0 || !selFull);
            return (
              <ShopRow key={g} tier={`T${def.tier}`} tierClass={`t${def.tier}`} locked={locked} name={def.name} detail={def.desc} stock={`x${count}`}>
                <button
                  className="wide"
                  disabled={!canBuy}
                  onClick={() => {
                    if (m.credits < def.price || !sel.alive) return;
                    if (sel.gear[def.field] === 0 && slotsUsed(sel) >= SLOT_CAP) return;
                    m.credits -= def.price;
                    sel.gear[def.field]++;
                    commit();
                  }}
                >
                  BUY {def.price}
                </button>
              </ShopRow>
            );
          })}
          <h3>
            AUGMENTATION<span className="h3tag">INSTALL TARGET: {sel.alive ? sel.name : 'NO ACTIVE ASSET'}</span>
          </h3>
          {previewLook ? (
            <ChassisPreview
              manifest={previewLook}
              label={
                activePreview
                  ? `PROSPECTIVE ${activePreview.slot.toUpperCase()} V${activePreview.next}`
                  : 'INSTALLED CONFIGURATION'
              }
              detail={appearancePreview(previewLook)}
            />
          ) : (
            <div className="chassis-preview empty">NO ACTIVE ASSET AVAILABLE FOR CHASSIS REVIEW</div>
          )}
          {AUG_SLOTS.map((slot) => {
            const lvl = sel.alive ? augLevel(sel, slot.key) : 0;
            const pips = (
              <span className="pips">
                {[0, 1, 2].map((p) => (
                  <i key={p} className={p < lvl ? 'f' : undefined}></i>
                ))}
              </span>
            );
            if (lvl >= 3) {
              return (
                <ShopRow key={slot.key} tier="V3" tierClass="t5" locked={false} name={slot.name} detail="fully augmented" stock={pips}>
                  <span className="max">MAXED</span>
                </ShopRow>
              );
            }
            const def = slot.levels[lvl]!;
            const locked = !augLevelUnlocked(m, lvl + 1);
            const prospective = sel.alive
              ? prospectiveAgentAppearance(sel, slot.key, lvl + 1, deploySlot(selAgent))
              : null;
            const preview = prospective ? appearancePreview(prospective) : '';
            const showPreview = () =>
              setPreviewAug({ agent: selAgent, slot: slot.key, next: lvl + 1 });
            return (
              <ShopRow
                key={slot.key}
                tier={`V${lvl + 1}`}
                tierClass={lvl + 1 >= 3 ? 't5' : lvl + 1 === 2 ? 't3' : undefined}
                locked={locked}
                name={slot.name}
                detail={`${def.desc}${preview ? ` · reads: ${preview}` : ''}`}
                stock={pips}
                onPreview={showPreview}
                previewing={activePreview?.slot === slot.key}
              >
                <button
                  type="button"
                  onClick={showPreview}
                >
                  PREVIEW
                </button>
                <button
                  disabled={m.credits < def.price || !sel.alive}
                  onClick={() => {
                    const cur = augLevel(sel, slot.key);
                    const level = slot.levels[cur];
                    if (sel.alive && level && m.credits >= level.price && augLevelUnlocked(m, cur + 1)) {
                      m.credits -= level.price;
                      sel.augments[slot.key] = cur + 1;
                      commit();
                    }
                  }}
                >
                  INSTALL {def.price}
                </button>
              </ShopRow>
            );
          })}
        </div>
      </div>
      <div className="btnbar">
        <button onClick={onBack}>BACK</button>
        <span className="launchmeta">
          {aliveN}/{m.agents.length} ASSETS ACTIVE
        </span>
        <button className="primary" onClick={onLaunch}>
          LAUNCH CONTRACT
        </button>
      </div>
    </div>
  );
}
