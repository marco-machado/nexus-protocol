import { createRenderer } from './render/renderer';
import { Game } from './app/game';
import { Screens } from './app/screens';

async function main(): Promise<void> {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const hud = document.getElementById('hud') as HTMLElement;
  const screenEl = document.getElementById('screen') as HTMLElement;
  const renderer = await createRenderer(canvas);
  const game = new Game(renderer, new Screens(screenEl), hud);
  game.start();
}

main();
