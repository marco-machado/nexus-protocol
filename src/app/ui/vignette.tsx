import { useCallback, useEffect, useRef, useState } from 'react';
import { castMember } from '../narrative/cast';
import type { Vignette } from '../narrative/vignettes';

export function VignetteScreen({ vignette, onDone }: { vignette: Vignette; onDone: () => void }) {
  const total = vignette.lines.length;
  const [shown, setShown] = useState(1);
  const shownRef = useRef(1);

  const advance = useCallback(() => {
    if (shownRef.current >= total) {
      onDone();
      return;
    }
    shownRef.current += 1;
    setShown(shownRef.current);
  }, [onDone, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDone();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, onDone]);

  return (
    <div className="panel vignette" onClick={advance}>
      <div className="vig-head">
        <small>SECURE CHANNEL · TRANSCRIPT LIVE</small>
        <h2>{vignette.title}</h2>
      </div>
      <div className="vig-lines">
        {vignette.lines.slice(0, shown).map((l, i) => (
          <div key={i} className="vig-line">
            <span className="vig-speaker">{castMember(l.speaker)?.name ?? l.speaker}</span>
            <span className="vig-text">{l.text}</span>
          </div>
        ))}
      </div>
      <div className="btnrow">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
        >
          SKIP TRANSCRIPT
        </button>
        <button
          className="primary"
          onClick={(e) => {
            e.stopPropagation();
            advance();
          }}
        >
          {shown >= total ? 'CLOSE CHANNEL' : 'NEXT'}
        </button>
      </div>
    </div>
  );
}
