import { useState } from 'react';
import type { MetaState } from '../meta';
import { ARCHIVE, archiveDoc } from '../narrative/archive';

export function ArchiveScreen({
  meta,
  onOpen,
  onBack,
}: {
  meta: MetaState;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const h = meta.narrative;
  const [sel, setSel] = useState<string | null>(null);
  const doc = sel ? archiveDoc(sel) : undefined;
  const unlockedCount = h.archive.length;

  return (
    <div className="panel archive">
      <div className="arch-head">
        <small>NEXUS INTERNAL SYSTEMS · CLEARANCE UPHELD</small>
        <h2>CORPORATE ARCHIVE</h2>
        <span className="arch-count">
          {unlockedCount}/{ARCHIVE.length} DOCUMENTS ON FILE
        </span>
      </div>
      <div className="arch-body">
        <div className="arch-list">
          {ARCHIVE.map((d) => {
            const unlocked = h.archive.includes(d.id);
            const unread = unlocked && !h.archiveRead.includes(d.id);
            return (
              <button
                key={d.id}
                className={`arch-row${sel === d.id ? ' sel' : ''}${unlocked ? '' : ' locked'}`}
                disabled={!unlocked}
                onClick={() => {
                  setSel(d.id);
                  onOpen(d.id);
                }}
              >
                <span className="arch-kind">{d.kind}</span>
                <span className="arch-title">{unlocked ? d.title : 'ACCESS PENDING'}</span>
                {unread ? <span className="arch-new">NEW</span> : null}
                {!unlocked ? <span className="arch-lock">INTEL REQUIRED</span> : null}
              </button>
            );
          })}
        </div>
        <div className="arch-reader">
          {doc && h.archive.includes(doc.id) ? (
            <>
              <small>{doc.kind}</small>
              <h3>{doc.title}</h3>
              {doc.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </>
          ) : (
            <div className="arch-empty">
              SELECT A DOCUMENT. LOCKED FILES UNLOCK THROUGH FIELD ACTIVITY: CONTRACTS CLOSED,
              UNITS ENROLLED, COUNTERPARTIES DISPLACED.
            </div>
          )}
        </div>
      </div>
      <div className="btnrow">
        <button onClick={onBack}>RETURN TO OPERATIONS</button>
        <span></span>
      </div>
    </div>
  );
}
