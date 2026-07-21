import type { MetaState } from '../meta';
import {
  bestOffer,
  fmtDuration,
  projectById,
  projectCost,
  projectState,
  PROJECTS,
  type ProjectDef,
  type ProjectState,
} from '../research';

const STATE_LABEL: Record<ProjectState, string> = {
  delivered: 'DELIVERED',
  active: 'IN PROGRESS',
  available: 'AVAILABLE',
  locked: 'LOCKED',
};

const GROUPS: { title: string; match: (p: ProjectDef) => boolean }[] = [
  { title: 'WEAPONS PROGRAMS', match: (p) => p.deliverable.kind === 'weapon' },
  { title: 'EQUIPMENT PROGRAMS', match: (p) => p.deliverable.kind === 'gear' },
  { title: 'AUGMENTATION PROGRAMS', match: (p) => p.deliverable.kind === 'augment' },
  { title: 'FACILITIES', match: (p) => p.deliverable.kind === 'lab' },
];

function ProjectCard({
  m,
  p,
  onStart,
}: {
  m: MetaState;
  p: ProjectDef;
  onStart: (id: string) => void;
}) {
  const state = projectState(m, p.id);
  const now = m.lastSeen;
  const offer = state === 'delivered' || state === 'active' ? null : bestOffer(m, p.id, now);
  const cost = projectCost(m, p.id, now);
  const remaining = m.active.find((a) => a.id === p.id)?.remainingMs ?? 0;
  const prereqNames = p.requires.map((r) => projectById(r)?.name ?? r);
  return (
    <div className={`prj ${state}${p.marquee ? ' marquee' : ''}`}>
      <div className="prj-h">
        <b>{p.name}</b>
        {p.marquee ? <span className="prj-marquee">MARQUEE</span> : null}
        <span className="prj-state">{state === 'active' ? `${STATE_LABEL.active} · ${fmtDuration(remaining)}` : STATE_LABEL[state]}</span>
      </div>
      <small className="prj-out">{p.output}</small>
      <div className="prj-meta">
        {offer ? (
          <span className="prj-offer">
            OFFER -{offer.pct}% · {cost}cr · closes in {fmtDuration(Math.max(0, offer.expires - now))}
          </span>
        ) : (
          <span>COST {p.cost}cr</span>
        )}
        <span>DURATION {fmtDuration(p.durationMs)}</span>
        {prereqNames.length > 0 ? <span className="prj-req">REQUIRES {prereqNames.join(' + ')}</span> : null}
      </div>
      {state === 'available' ? (
        <button disabled={m.credits < cost || m.active.length >= m.labSlots} onClick={() => onStart(p.id)}>
          COMMIT {cost}cr
        </button>
      ) : null}
    </div>
  );
}

export function ResearchScreen({
  meta: m,
  rev,
  onStart,
  onBack,
}: {
  meta: MetaState;
  rev: number;
  onStart: (id: string) => void;
  onBack: () => void;
}) {
  void rev; // live economy updates arrive as a new rev prop; render reads meta fresh
  const now = m.lastSeen;
  return (
    <div className="panel research">
      <div className="equiphead">
        <div>
          <h2>R&amp;D PROJECT BOARD</h2>
          <span className="eqsub">ALLOCATION REVIEW · EVERY PROJECT SHIPS A NAMED DELIVERABLE</span>
        </div>
        <div className="eqbal">
          <label>BALANCE</label>
          <b>
            {m.credits}
            <small>cr</small>
          </b>
        </div>
      </div>
      <div className="labrows">
        {Array.from({ length: m.labSlots }, (_, i) => {
          const a = m.active[i];
          const def = a ? projectById(a.id) : undefined;
          return (
            <div key={i} className={`labrow${a ? ' busy' : ''}`}>
              <span className="lablbl">LAB {i + 1}</span>
              {a && def ? (
                <span>
                  {def.name} · DELIVERY IN {fmtDuration(a.remainingMs)}
                </span>
              ) : (
                <span className="labidle">IDLE · CAPACITY UNALLOCATED</span>
              )}
            </div>
          );
        })}
      </div>
      {m.offers.length > 0 ? (
        <div className="offerbar">
          {m.offers.map((o, i) => {
            const def = projectById(o.project);
            return (
              <span key={i} className="offerchip">
                BREAKTHROUGH [{o.source.toUpperCase()}]: {def?.name ?? o.project} -{o.pct}% · closes in{' '}
                {fmtDuration(Math.max(0, o.expires - now))}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="prjbody">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3>{g.title}</h3>
            <div className="prjgrid">
              {PROJECTS.filter(g.match).map((p) => (
                <ProjectCard key={p.id} m={m} p={p} onStart={onStart} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="btnbar">
        <button onClick={onBack}>BACK</button>
        <span className="launchmeta">
          LAB CAPACITY {m.active.length}/{m.labSlots} COMMITTED
        </span>
      </div>
    </div>
  );
}
