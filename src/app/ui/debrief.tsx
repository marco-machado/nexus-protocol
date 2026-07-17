import { campaignAct, campaignWon, type DebriefInfo, type MetaState } from '../meta';

export function DebriefScreen({
  info,
  meta,
  onContinue,
}: {
  info: DebriefInfo;
  meta: MetaState;
  onContinue: () => void;
}) {
  return (
    <div className={`panel debrief${info.won ? '' : ' fail'}`}>
      <div className={`verdict ${info.won ? 'good' : 'bad'}`}>
        <small>CONTRACT REVIEW · {info.territory.name}</small>
        <h2>{info.won ? 'CONTRACT FULFILLED' : 'CONTRACT UNFULFILLED'}</h2>
      </div>
      <div className="loglines">
        {info.lines.map((l, i) => (
          <div key={i}>&gt; {l}</div>
        ))}
        {info.salvage ? <div>&gt; Augment salvage: +{info.salvage}cr</div> : null}
      </div>
      <div className="dbstat">
        <span>
          BALANCE<b>{meta.credits}cr</b>
        </span>
        <span>
          CYCLE<b>{meta.cycle}</b>
        </span>
        <span>
          CAMPAIGN<b>ACT {campaignAct(meta)}</b>
        </span>
      </div>
      <div className="btnrow">
        <span></span>
        <button className="primary" onClick={onContinue}>
          {campaignWon(meta) ? 'FINALIZE GLOBAL ACQUISITION' : 'RETURN TO OPERATIONS'}
        </button>
      </div>
    </div>
  );
}
