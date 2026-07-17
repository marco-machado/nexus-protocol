import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { audio } from '../audio';
import type { ScreenStore } from '../screenState';
import { DebriefScreen } from './debrief';
import { EquipScreen } from './equip';
import { MenuScreen } from './menu';
import { SettingsScreen } from './settingsScreen';
import { VictoryScreen } from './victory';
import { WorldMapScreen } from './worldMap';

function ScreenRoot({ el, store }: { el: HTMLElement; store: ScreenStore }) {
  const screen = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => {
    el.style.display = screen.kind === 'hidden' ? 'none' : 'flex';
    el.classList.toggle('mapmode', screen.kind === 'worldMap');
  }, [el, screen]);
  switch (screen.kind) {
    case 'hidden':
      return null;
    case 'menu':
      return <MenuScreen hasSave={screen.hasSave} onStart={screen.onStart} onSettings={screen.onSettings} />;
    case 'settings':
      return <SettingsScreen onBack={screen.onBack} />;
    case 'worldMap':
      return <WorldMapScreen meta={screen.meta} rev={screen.rev} globe={screen.globe} onContract={screen.onContract} />;
    case 'equip':
      return (
        <EquipScreen
          meta={screen.meta}
          territory={screen.territory}
          defense={screen.defense}
          onLaunch={screen.onLaunch}
          onBack={screen.onBack}
        />
      );
    case 'debrief':
      return <DebriefScreen info={screen.info} meta={screen.meta} onContinue={screen.onContinue} />;
    case 'victory':
      return <VictoryScreen meta={screen.meta} onNgPlus={screen.onNgPlus} onNewGame={screen.onNewGame} />;
  }
}

// mounts the React screen tree on the #screen overlay; the Game controller
// never touches React — it only writes to the ScreenStore
export function mountScreenRoot(el: HTMLElement, store: ScreenStore): void {
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) audio.uiClick();
  });
  createRoot(el).render(<ScreenRoot el={el} store={store} />);
}
