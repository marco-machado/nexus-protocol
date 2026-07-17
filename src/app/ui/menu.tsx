import { clearSave } from '../meta';

export function MenuScreen({
  hasSave,
  onStart,
  onSettings,
}: {
  hasSave: boolean;
  onStart: (fresh: boolean) => void;
  onSettings: () => void;
}) {
  return (
    <div className="panel menu">
      <div className="menustat">
        <span>NEXUS INTERNAL SYSTEMS</span>
        <span className="live">LINK ACTIVE</span>
      </div>
      <img className="logo" src="/logos/nexus-orbital-variant-02.png" alt="" />
      <h1>
        NEXUS<span>PROTOCOL</span>
      </h1>
      <p className="tag">Corporate acquisitions. Kinetic division.</p>
      {hasSave ? (
        <button className="primary" onClick={() => onStart(false)}>
          RESUME OPERATIONS
        </button>
      ) : null}
      <button
        className={hasSave ? undefined : 'primary'}
        onClick={() => {
          clearSave();
          onStart(true);
        }}
      >
        NEW OPERATION
      </button>
      <button onClick={onSettings}>SETTINGS</button>
      <p className="fine">Nexus Corp is an equal-opportunity employer. Asset attrition figures available on request.</p>
    </div>
  );
}
