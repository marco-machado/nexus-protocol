import { campaignAct, campaignWon, type DebriefInfo, type MetaState } from '../meta';
import { fmtTicks } from '../contractCard';

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
      {info.review ? (
        <div className="review">
          <h3>PERFORMANCE REVIEW</h3>
          <div className="dbstat">
            <span>
              DURATION<b>{fmtTicks(info.review.ticks)}</b>
            </span>
            <span>
              ROUNDS FIRED<b>{info.review.roundsFired}</b>
            </span>
            <span>
              STIM EXPENDITURE<b>{info.review.stimSpent}</b>
            </span>
            <span>
              PERSUASIONS<b>{info.review.persuaded}</b>
            </span>
            <span>
              KILLS<b>{info.review.kills}</b>
            </span>
            <span>
              COLLATERAL<b>{info.review.civKills}</b>
            </span>
            <span>
              ALERT RAISED<b>{info.review.alarmRaised ? 'YES' : 'NO'}</b>
            </span>
          </div>
          <div className="clauses">
            {info.review.outcomes.map((o) => (
              <span key={o.clause.kind} className={`clausechip ${o.met ? 'met' : 'missed'}`}>
                {o.clause.label} · {o.met ? (info.won ? `+${o.clause.rider}cr` : 'NOT PAYABLE') : 'LAPSED'} [
                {o.met ? 'MET' : 'MISSED'}]
              </span>
            ))}
            {info.review.riderTotal > 0 ? (
              <span className="clausechip total">RIDERS BOOKED +{info.review.riderTotal}cr</span>
            ) : null}
          </div>
        </div>
      ) : null}
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
