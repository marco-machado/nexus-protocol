import { clearSave, type MetaState } from '../meta';

export function VictoryScreen({
  meta,
  onNgPlus,
  onNewGame,
}: {
  meta: MetaState;
  onNgPlus: () => void;
  onNewGame: () => void;
}) {
  return (
    <div className="panel menu victory">
      <div className="menustat">
        <span>NEXUS INTERNAL SYSTEMS</span>
        <span className="live">BOARD SESSION ACTIVE</span>
      </div>
      <h1>
        GLOBAL<span>MONOPOLY</span>
      </h1>
      <p className="tag">
        All forty territories under Nexus management. Three rival boards liquidated.
        {meta.ngPlus > 0 ? ` (NG+${meta.ngPlus})` : ''} The board demands growth.
      </p>
      <div className="loglines">
        {meta.log.slice(0, 6).map((l, i) => (
          <div key={i}>&gt; {l}</div>
        ))}
      </div>
      <button className="primary" onClick={onNgPlus}>
        NEW GAME+ · RETAIN ASSETS, HARDER RIVALS
      </button>
      <button
        onClick={() => {
          clearSave();
          onNewGame();
        }}
      >
        NEW OPERATION · CLEAN LEDGER
      </button>
    </div>
  );
}
