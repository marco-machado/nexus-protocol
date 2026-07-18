import { useEffect, useReducer, useRef, useState } from 'react';
import { factionHex, OWNER_NEUTRAL, OWNER_NEXUS, type GlobeSnapshot } from '../../render/globe';
import {
  campaignAct,
  CONTRACT_NAMES,
  CYCLE_MS,
  DEFENSE_UNREST,
  incomePerCycle,
  REGION_UNLOCK_OWNED,
  REGIONS,
  regionUnlocked,
  saveMeta,
  type MetaState,
  type Territory,
} from '../meta';
import { unreadArchiveCount } from '../narrative/archive';
import { buyInfrastructure, fmtDuration, hasInfra, INFRA, projectById, taxCeiling } from '../research';
import type { GlobeHandle } from '../screenState';
import { RangeInput } from './controls';


function shortName(t: Territory): string {
  return t.name.replace('SECTOR ', '').replace(/"/g, '');
}

function MapHud({ m }: { m: MetaState }) {
  const nextMin = Math.max(1, Math.ceil((CYCLE_MS - m.econMs) / 60000));
  return (
    <div className="maphud">
      <div className="maphud-brand">
        <i className="glyph"></i>
        <h2>GLOBAL OPERATIONS</h2>
      </div>
      <div className="stat">
        <label>BALANCE</label>
        <b className="credits">
          {m.credits}
          <small>cr</small>
        </b>
      </div>
      <div className="stat">
        <label>INCOME</label>
        <b className="good">
          <span>+{incomePerCycle(m) * 2}</span>
          <small>cr/hr</small>
        </b>
      </div>
      <div className="stat">
        <label>R&D LABS</label>
        <b className="accentv">
          {m.active.length}
          <small>/{m.labSlots}</small>
        </b>
      </div>
      <div className="stat">
        <label>CAMPAIGN</label>
        <b>ACT {campaignAct(m)}</b>
      </div>
      <div className="stat">
        <label>CYCLE {m.cycle}</label>
        <b className="muted">next {nextMin}m</b>
      </div>
    </div>
  );
}

function TerrRow({
  m,
  t,
  selected,
  onSelect,
}: {
  m: MetaState;
  t: Territory;
  selected: boolean;
  onSelect: () => void;
}) {
  const owner = t.owned ? 'own' : t.rival >= 0 ? 'riv' : 'neu';
  const tag = t.owned ? (
    <span className="own">NEXUS</span>
  ) : t.rival >= 0 ? (
    <span className="riv">{m.syndicates[t.rival]!.name.split(' ')[0]}</span>
  ) : (
    <span className="neu">NEUTRAL</span>
  );
  const line = t.owned ? `${Math.round((t.baseIncome * t.taxRate) / 100)}cr/cyc` : `est ${t.baseIncome}cr`;
  return (
    <button className={`trow ${owner}${selected ? ' sel' : ''}`} onClick={onSelect}>
      <span className="trow-top">
        <span className="trow-nm">{shortName(t)}</span>
        {tag}
        {t.hq ? <span className="hqtag">HQ</span> : null}
        {t.siege ? <span className="sietag">SIEGE</span> : null}
      </span>
      <span className="trow-sub">{line}</span>
      <span className="trow-ub">
        {t.owned ? <i className={`ub${t.unrest > 60 ? ' hot' : ''}`} style={{ width: `${Math.min(100, t.unrest)}%` }}></i> : null}
      </span>
    </button>
  );
}

function Popover({
  m,
  t,
  onContract,
  onDeselect,
  onEdited,
}: {
  m: MetaState;
  t: Territory;
  onContract: (t: Territory, defense?: boolean) => void;
  onDeselect: () => void;
  onEdited: () => void;
}) {
  const parts = /^SECTOR (\d+) "(.*)"$/.exec(t.name);
  const title = parts ? (
    <>
      <span className="seclbl">SECTOR {parts[1]}</span>
      <h4>{parts[2]}</h4>
    </>
  ) : (
    <h4>{t.name}</h4>
  );
  const head = (
    <div className="pop-h">
      <div>{title}</div>
      <button className="pop-x" onClick={onDeselect} aria-label="Deselect">
        ×
      </button>
    </div>
  );
  if (t.owned) {
    const siegeMin = t.siege ? Math.ceil(Math.max(0, t.siege.deadline - m.lastSeen) / 60000) : 0;
    return (
      <div className="pop">
        {head}
        <div className="own">NEXUS CONTROLLED</div>
        {t.siege ? (
          <div className="siege">
            SIEGE: {m.syndicates[t.siege.rival]!.name} strikes in {Math.floor(siegeMin / 60)}h {siegeMin % 60}m
          </div>
        ) : null}
        <dl>
          <dt>Income share</dt>
          <dd>{Math.round((t.baseIncome * t.taxRate) / 100)}cr/cycle</dd>
          <dt>Unrest</dt>
          <dd className={`unrest ${t.unrest > 60 ? 'hot' : ''}`}>{t.unrest}/100</dd>
        </dl>
        <div className="taxrow">
          Tax{' '}
          <RangeInput
            value={t.taxRate}
            min={10}
            max={taxCeiling(t)}
            step={5}
            ariaLabel={`Tax rate for ${shortName(t)}`}
            onValue={(v) => {
              t.taxRate = v;
              saveMeta(m);
              onEdited();
            }}
          />{' '}
          <b>{t.taxRate}%</b>
        </div>
        <div className="infrarows">
          {INFRA.map((def) =>
            hasInfra(t, def.id) ? (
              <div key={def.id} className="infrarow installed">
                <span>{def.name}</span>
                <b>COMMISSIONED</b>
              </div>
            ) : (
              <div key={def.id} className="infrarow" title={def.capability}>
                <span>
                  {def.name}
                  <small>{def.capability}</small>
                </span>
                <button
                  disabled={m.credits < def.cost || (def.id === 'bulwark' && t.siege !== undefined)}
                  onClick={() => {
                    if (buyInfrastructure(m, t, def.id)) {
                      saveMeta(m);
                      onEdited();
                    }
                  }}
                >
                  {def.cost}cr
                </button>
              </div>
            ),
          )}
        </div>
        {t.siege ? (
          <button className="primary" onClick={() => onContract(t, true)}>
            REPEL TAKEOVER
          </button>
        ) : t.unrest >= DEFENSE_UNREST ? (
          <button onClick={() => onContract(t, true)}>DEFENSE CONTRACT</button>
        ) : (
          <div className="fine">HOLDING · NO ACTION REQUIRED</div>
        )}
      </div>
    );
  }
  return (
    <div className="pop">
      {head}
      {t.rival >= 0 ? <div className="riv">{m.syndicates[t.rival]!.name}</div> : <div className="neutral">NEUTRAL</div>}
      {t.hq ? <div className="hqtag">RIVAL HQ ARCOLOGY</div> : null}
      <dl>
        <dt>Est. income</dt>
        <dd>{t.baseIncome}cr base</dd>
        <dt>Contract</dt>
        <dd>{CONTRACT_NAMES[t.missionType]}</dd>
      </dl>
      <button className="primary" onClick={() => onContract(t)}>
        OPEN CONTRACT
      </button>
    </div>
  );
}

function Legend({ m }: { m: MetaState }) {
  const key = (color: string, label: string) => (
    <span key={label}>
      <i className="sw" style={{ color, background: color }}></i>
      {label}
    </span>
  );
  return (
    <div className="legend">
      {key(factionHex(OWNER_NEXUS), 'NEXUS')}
      {m.syndicates.map((s, i) => key(factionHex(i), s.name.split(' ')[0]!))}
      {key(factionHex(OWNER_NEUTRAL), 'NEUTRAL')}
    </div>
  );
}

function RdDrawer({
  m,
  onResearch,
  onArchive,
}: {
  m: MetaState;
  onResearch: () => void;
  onArchive: () => void;
}) {
  const unread = unreadArchiveCount(m.narrative);
  const activeTxt =
    m.active.length === 0
      ? 'ALL LABS IDLE · CAPACITY UNALLOCATED'
      : m.active
          .map((a) => {
            const def = projectById(a.id);
            return `${def?.name ?? a.id} · ${fmtDuration(a.remainingMs)}`;
          })
          .join(' · ');
  return (
    <div className="drawer">
      <span>R&D</span>
      <b>
        LABS {m.active.length}/{m.labSlots}
      </b>
      <span className="dnext">{activeTxt}</span>
      {m.offers.length > 0 ? (
        <span className="doffer">
          {m.offers.length} BREAKTHROUGH OFFER{m.offers.length > 1 ? 'S' : ''} OPEN
        </span>
      ) : null}
      <button onClick={onResearch}>OPEN PROJECT BOARD</button>
      <button onClick={onArchive}>ARCHIVE{unread > 0 ? ` · ${unread} NEW` : ''}</button>
    </div>
  );
}

export function WorldMapScreen({
  meta: m,
  rev,
  globe,
  onContract,
  onResearch,
  onArchive,
}: {
  meta: MetaState;
  rev: number;
  globe: GlobeHandle | null;
  onContract: (t: Territory, defense?: boolean) => void;
  onResearch: () => void;
  onArchive: () => void;
}) {
  const [selRegion, setSelRegion] = useState(-1);
  const [selTerr, setSelTerr] = useState(-1);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  void rev; // live economy updates arrive as a new rev prop; render reads meta fresh

  const region = selRegion < 0 || selRegion >= m.regionsUnlocked ? m.regionsUnlocked - 1 : selRegion;
  const selT = m.territories[selTerr];
  const activeTerr = selT && selT.region === region ? selTerr : -1;

  // globe picks route through a ref so the single onPick registration always
  // sees the latest meta/selection without re-wiring per render
  const pickRef = useRef<(id: number) => void>(() => {});
  useEffect(() => {
    pickRef.current = (id: number) => {
      if (id < 0) {
        if (activeTerr !== -1) setSelTerr(-1);
        return;
      }
      const t = m.territories[id];
      if (!t || t.region >= m.regionsUnlocked) return;
      setSelRegion(t.region);
      setSelTerr(id);
    };
  });
  useEffect(() => {
    globe?.onPick((id) => pickRef.current(id));
  }, [globe]);

  useEffect(() => {
    if (!globe) return;
    const snapshot: GlobeSnapshot = {
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
      focusRegion: region,
      selected: activeTerr,
    };
    globe.setData(snapshot);
  });

  // replay the detail-panel entrance only when the selection actually changes
  const lastDetailTerr = useRef(-1);
  const detailEnter = activeTerr !== -1 && activeTerr !== lastDetailTerr.current;
  useEffect(() => {
    lastDetailTerr.current = activeTerr;
  });

  const terrs = m.territories.filter((t) => t.region === region);
  const owned = terrs.filter((t) => t.owned).length;
  const nextLocked = m.regionsUnlocked < REGIONS.length;
  const detail = activeTerr !== -1 ? m.territories[activeTerr]! : null;

  return (
    <div className="mapframe">
      <div className="mapscrim top"></div>
      <div className="mapscrim bottom"></div>
      <MapHud m={m} />
      <div className="regiontabs">
        {REGIONS.map((r, i) => {
          const locked = !regionUnlocked(m, i);
          const ownedCount = m.territories.filter((t) => t.region === i && t.owned).length;
          return (
            <button
              key={r.name}
              className={`rtab${i === region ? ' primary' : ''}`}
              disabled={locked}
              onClick={() => {
                setSelRegion(i);
                setSelTerr(-1);
              }}
            >
              {r.name}
              <b>{locked ? 'LOCKED' : `${ownedCount}/5`}</b>
            </button>
          );
        })}
      </div>
      <div className="mapbody">
        <div className="leftcol">
          <div className="terrlist">
            <div className="terrlist-h">
              <span>{REGIONS[region]!.name}</span>
              <span className="terrlist-cnt">{owned}/5 SECURED</span>
            </div>
            <div className="terrlist-body">
              {terrs.map((t) => (
                <TerrRow key={t.id} m={m} t={t} selected={t.id === activeTerr} onSelect={() => setSelTerr(t.id)} />
              ))}
            </div>
          </div>
          <div className={`detailwrap${detailEnter ? ' enter' : ''}`}>
            {detail ? (
              <Popover m={m} t={detail} onContract={onContract} onDeselect={() => setSelTerr(-1)} onEdited={bump} />
            ) : null}
          </div>
        </div>
        <div className="mapcenter">
          {nextLocked ? (
            <div className="charter">
              CHARTER: secure {REGION_UNLOCK_OWNED} districts in {REGIONS[m.regionsUnlocked - 1]!.name} to open{' '}
              {REGIONS[m.regionsUnlocked]!.name}
            </div>
          ) : null}
          <div className="maphint">DRAG TO ROTATE · SELECT A BEACON</div>
        </div>
        <Legend m={m} />
      </div>
      <RdDrawer m={m} onResearch={onResearch} onArchive={onArchive} />
      <div className="ticker" title={m.log.slice(0, 4).join('\n')}>
        &gt; {m.log[0] ?? 'Awaiting first directive.'}
      </div>
    </div>
  );
}
