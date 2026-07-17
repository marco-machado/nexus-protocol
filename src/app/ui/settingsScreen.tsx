import { useSyncExternalStore } from 'react';
import { PALETTES, type PaletteName } from '../../render/palette';
import {
  SIM_SPEED_FAST,
  SIM_SPEED_NORMAL,
  saveSettings,
  settings,
  settingsVersion,
  snapSimSpeed,
  subscribeSettings,
} from '../settings';
import { RangeInput, ToggleRow } from './controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function VolumeRow({ label, note, volKey }: { label: string; note: string; volKey: 'masterVol' | 'musicVol' | 'sfxVol' }) {
  return (
    <div className="setrow">
      <span className="setlbl">
        {label}
        {note ? <small>{note}</small> : null}
      </span>
      <RangeInput
        value={Math.round(settings[volKey] * 100)}
        min={0}
        max={100}
        step={5}
        ariaLabel={`${label} volume`}
        onValue={(v) => {
          settings[volKey] = v / 100;
          saveSettings();
        }}
      />
      <b className="setval">{pct(settings[volKey])}</b>
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeSettings, settingsVersion);
  const setToggle = (key: 'postFx' | 'rain' | 'shadows') => (v: boolean) => {
    settings[key] = v;
    saveSettings();
  };
  return (
    <div className="panel">
      <h2>OPERATOR SETTINGS</h2>
      <p className="tag">Terminal preferences. Applied immediately.</p>
      <h3>ACCESSIBILITY</h3>
      <div className="setrow">
        <span className="setlbl">
          Simulation speed<small>NORMAL runs contracts at half tempo for readability</small>
        </span>
        <span className="seg">
          {[
            { v: SIM_SPEED_NORMAL, label: 'NORMAL' },
            { v: SIM_SPEED_FAST, label: 'FAST' },
          ].map((s) => (
            <button
              key={s.label}
              className={settings.simSpeed === s.v ? 'on' : ''}
              aria-pressed={settings.simSpeed === s.v}
              onClick={() => {
                settings.simSpeed = snapSimSpeed(s.v);
                saveSettings();
              }}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>
      <div className="setrow">
        <span className="setlbl">
          Color palette<small>faction state is always paired with text and shape</small>
        </span>
        <span className="seg">
          {(Object.keys(PALETTES) as PaletteName[]).map((p) => (
            <button
              key={p}
              className={p === settings.palette ? 'on' : ''}
              aria-pressed={p === settings.palette}
              onClick={() => {
                // applied by the PaletteBinding in the canvas host tree,
                // which reacts to the settings notification
                settings.palette = p;
                saveSettings();
              }}
            >
              {PALETTES[p].label}
            </button>
          ))}
        </span>
      </div>
      <h3>AUDIO</h3>
      <VolumeRow label="Master bus" note="" volKey="masterVol" />
      <VolumeRow label="Score" note="adaptive stems follow the district alarm state" volKey="musicVol" />
      <VolumeRow label="Effects" note="weapons, comms, and city one-shots" volKey="sfxVol" />
      <h3>VIDEO</h3>
      <ToggleRow label="Neon post-processing" note="bloom and vignette over the night palette" on={settings.postFx} onToggle={setToggle('postFx')} />
      <ToggleRow label="Weather effects" note="rain renders when the contract forecast calls it" on={settings.rain} onToggle={setToggle('rain')} />
      <ToggleRow label="Dynamic shadows" note="gates the shadow pass immediately; casters bake at deployment" on={settings.shadows} onToggle={setToggle('shadows')} />
      <div className="btnrow">
        <button onClick={onBack}>BACK</button>
      </div>
      <p className="fine">Settings persist independently of operation saves.</p>
    </div>
  );
}
