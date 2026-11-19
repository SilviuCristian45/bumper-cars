import Phaser from 'phaser';
import './style.css';
import { DEFAULT_ROUNDS, MAX_PLAYERS, ROUND_OPTIONS } from '@masinute/shared';
import { parseBotLevel } from './botLevels';
import { restoreTuning } from './debug/TunePanel';
import { isTouch } from './device';
import { LocalTransport } from './net/LocalTransport';
import { GAME_H, GAME_W } from './render/layout';
import { GameScene, type GameSceneData } from './scenes/GameScene';
import { initRotatePrompt } from './ui/orientation';

const params = new URLSearchParams(window.location.search);

// Until the menus arrive (stage 3) every visit starts a local match against bots. Test options:
// ?debug, ?bots=1..5 (default 3), ?rounds=3|5|7, ?seed=abc, ?botlevel=usor|mediu|greu,
// ?touch / ?touch=0 (device.ts), ?tune (driving-feel sliders, local games only).
const tune = params.has('tune');
if (tune) {
  restoreTuning();
  // The panel gets its own column on wide screens, so it never covers the scores.
  document.body.classList.add('tuning');
}

function localMatch(): GameSceneData {
  const bots = Phaser.Math.Clamp(Number(params.get('bots') ?? 3) || 3, 1, MAX_PLAYERS - 1);
  const rounds = Number(params.get('rounds'));
  return {
    transport: new LocalTransport({
      name: 'Jucător',
      bots,
      botLevel: parseBotLevel(params.get('botlevel')),
      rounds: ROUND_OPTIONS.includes(rounds) ? rounds : DEFAULT_ROUNDS,
      seed: params.get('seed') ?? Math.random().toString(36).slice(2),
      autoStart: true,
    }),
    debug: params.has('debug'),
    tune,
    newMatch: localMatch,
  };
}

// Phones: no long-press menu (the CSS already stops selection and the callout).
if (isTouch) {
  document.body.classList.add('touch');
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#120a24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // The canvas only sees one finger at a time (overlay taps); the HTML touch controls track their own.
  input: { activePointers: 1 },
});
initRotatePrompt();
game.scene.add('game', GameScene, true, localMatch());
