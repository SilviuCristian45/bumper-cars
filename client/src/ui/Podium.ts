import Phaser from 'phaser';
import { computeAwards, computeStandings, PLAYER_COLORS, type AwardId, type GameState, type NewRecord } from '@masinute/shared';
import { firework } from '../render/fx';
import { FONT, GAME_H, GAME_W, SIDE_W, TOUCH_LAYOUT } from '../render/layout';
import { hexColor } from '../render/powerupInfo';
import { TEX } from '../render/textures';
import { reducedEffects } from '../settings';
import { TextButton } from './TextButton';

// End of the match (from Bombe și Petarde): the top three drive up onto a 2-1-3 podium one after
// the other (third, second, then the winner with fireworks in their color), then the full table
// and the awards. Records from the all-time leaderboard appear on top once the server sends them.

/** Touch screens are seen from further away: everything a bit bigger. */
const K = TOUCH_LAYOUT ? 1.3 : 1;
const BASE_Y = 480;
/** Touch: the podium sits further left, so the table gets the width up to the leave button's zone. */
const PODIUM_CX = TOUCH_LAYOUT ? 280 : Math.round(GAME_W * 0.27);
const STEP_W = 128;
/** Index = place - 1: x offset from PODIUM_CX and step height. */
const STEPS = [
  { dx: 0, h: 170 },
  { dx: -STEP_W - 8, h: 120 },
  { dx: STEP_W + 8, h: 84 },
];
const RISE_MS = 650;
/** Third place starts, then second, then first. */
const RISE_DELAYS = [2000, 1100, 300];
const TABLE_DELAY = 3000;
const TABLE_X = TOUCH_LAYOUT ? 520 : GAME_W / 2 + 30;
/** On touch the table stops before the leave button's zone on the right. */
const TABLE_W = Math.min(600, (TOUCH_LAYOUT ? GAME_W - SIDE_W - 10 : GAME_W - 60) - TABLE_X);
const TABLE_Y = 150;
const ROW_H = 34 * K;
/** The button: under the podium on touch (the awards fill the right column), bottom center on desktop. */
const BUTTON_X = TOUCH_LAYOUT ? PODIUM_CX : GAME_W / 2;
const BUTTON_Y = TOUCH_LAYOUT ? BASE_Y + 90 : GAME_H - 52;

const AWARD_TEXT: Record<AwardId, { title: string; detail: (n: number) => string }> = {
  batausul: { title: 'Bătăușul', detail: (n) => `cei mai mulți scoși din ring (${n})` },
  kamikaze: { title: 'Kamikaze', detail: (n) => `cele mai multe ieșiri singur (${n})` },
  neclintitul: { title: 'Neclintitul', detail: (n) => (n === 0 ? 'n-a ieșit niciodată din ring' : `cele mai puține ieșiri (${n})`) },
  ciocanarul: { title: 'Ciocănarul', detail: (n) => `cele mai multe lovituri (${n})` },
  colectionarul: { title: 'Colecționarul', detail: (n) => `${n} power-up-uri adunate` },
  uriasul: { title: 'Uriașul', detail: (n) => `${n} ${n === 1 ? 'scos' : 'scoși'} din ring cât era mare` },
};

export interface PodiumOptions {
  me: string;
  /** Online matches may set all-time records; offline ones get a note that they do not count. */
  online: boolean;
  /** Test URL options: no note, and the button starts a new local match. */
  testMatch: boolean;
  depth: number;
  /** Enter, a tap on the button: a new match (test) or back to the lobby (host). */
  onContinue: () => void;
}

export class Podium {
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  private readonly rows: { place: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; stats: Phaser.GameObjects.Text[] }[] = [];
  private readonly button: TextButton;
  private readonly waitText: Phaser.GameObjects.Text;
  /** "Ai intrat în top!" / "Record nou!" once the server has saved the match, or the offline note. */
  private readonly recordText: Phaser.GameObjects.Text;
  private recordsShown: readonly NewRecord[] | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    state: Readonly<GameState>,
    private readonly opts: PodiumOptions,
  ) {
    this.add(scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x120a24, 0.94).setInteractive());
    this.add(
      scene.add
        .text(GAME_W / 2, 48, 'Gata meciul!', { fontFamily: FONT, fontSize: `${Math.round(40 * K)}px`, fontStyle: 'bold', color: '#ffe066', stroke: '#2a0f1f', strokeThickness: 7 })
        .setOrigin(0.5),
    );
    this.recordText = this.add(
      scene.add
        .text(GAME_W / 2, 96, '', { fontFamily: FONT, fontSize: `${Math.round(20 * K)}px`, fontStyle: 'bold', color: '#ffe066', align: 'center', wordWrap: { width: GAME_W - 120 } })
        .setOrigin(0.5),
    );

    computeStandings(state as GameState)
      .slice(0, 3)
      .forEach((id, place) => this.addStep(state, id, place));
    this.addTable(state);
    this.addAwards(state);

    this.button = new TextButton(scene, BUTTON_X, BUTTON_Y, '', () => opts.onContinue(), 'primary', Math.round(22 * K));
    this.add(this.button);
    this.waitText = this.add(
      scene.add
        .text(BUTTON_X, BUTTON_Y, 'Așteaptă ca hostul să revină în lobby.', { fontFamily: FONT, fontSize: `${Math.round(17 * K)}px`, color: '#a99cc8', align: 'center', wordWrap: { width: TOUCH_LAYOUT ? 420 : 600 } })
        .setOrigin(0.5),
    );
    this.update(state, []);
  }

  /** Keeps the table and the host's button current (players may leave, the host may change). */
  update(state: Readonly<GameState>, records: readonly NewRecord[]): void {
    this.syncTable(state);
    if (records !== this.recordsShown) this.showRecords(records);
    const enter = TOUCH_LAYOUT ? '' : ' (Enter)';
    const canContinue = this.opts.testMatch || state.hostId === this.opts.me;
    this.button.setText(this.opts.testMatch ? `Încă un meci${enter}` : `Înapoi în lobby${enter}`).setVisible(canContinue);
    this.waitText.setVisible(!canContinue);
  }

  destroy(): void {
    for (const part of this.parts) part.destroy();
  }

  private add<T extends Phaser.GameObjects.GameObject & { setDepth(d: number): unknown }>(obj: T): T {
    obj.setDepth(this.opts.depth);
    this.parts.push(obj);
    return obj;
  }

  /** Mine first; offline, a note that it does not count. */
  private showRecords(records: readonly NewRecord[]): void {
    this.recordsShown = records;
    if (!this.opts.online) {
      this.recordText.setText(this.opts.testMatch ? '' : 'Meciurile offline nu intră în clasament.').setColor('#a99cc8');
      return;
    }
    const me = this.opts.me;
    const parts = [...records]
      .sort((a, b) => Number(b.playerId === me) - Number(a.playerId === me) || a.place - b.place)
      .map((r) =>
        r.playerId === me
          ? `${r.kind === 'top' ? 'Ai intrat în top!' : 'Record nou!'} Locul ${r.place}`
          : `${r.name}: ${r.kind === 'top' ? 'a intrat în top' : 'record nou'}, locul ${r.place}`,
      );
    this.recordText.setText(parts.length > 0 ? `★ ${parts.join('  ·  ')} ★` : '');
    if (parts.length > 0 && !reducedEffects()) {
      this.scene.tweens.add({ targets: this.recordText, scale: { from: 1.4, to: 1 }, duration: 400, ease: 'Back.easeOut' });
    }
  }

  private addStep(state: Readonly<GameState>, id: string, place: number): void {
    const scene = this.scene;
    const p = state.players[id]!;
    const color = PLAYER_COLORS[p.slot]!;
    const { dx, h } = STEPS[place]!;
    const x = PODIUM_CX + dx;
    const delay = RISE_DELAYS[place]!;
    const reduced = reducedEffects();

    const step = this.add(scene.add.rectangle(x, BASE_Y, STEP_W, h, 0x2a1748).setOrigin(0.5, 1).setStrokeStyle(3, color));
    const number = this.add(
      scene.add
        .text(x, BASE_Y - h / 2, String(place + 1), { fontFamily: FONT, fontSize: `${Math.round(48 * K)}px`, fontStyle: 'bold', color: '#ffe066' })
        .setOrigin(0.5)
        .setAlpha(0),
    );
    const car = this.add(scene.add.image(x, BASE_Y - h - 32, TEX.car(p.slot)).setScale(1.7).setRotation(-Math.PI / 2).setAlpha(0));
    const name = this.add(
      scene.add
        .text(x, BASE_Y - h - 84, p.name, { fontFamily: FONT, fontSize: `${Math.round(18 * K)}px`, fontStyle: 'bold', color: hexColor(color), stroke: '#120a24', strokeThickness: 4 })
        .setOrigin(0.5)
        .setAlpha(0),
    );

    step.scaleY = 0;
    scene.tweens.add({ targets: step, scaleY: 1, delay, duration: RISE_MS, ease: reduced ? 'Quad.easeOut' : 'Back.easeOut' });
    scene.tweens.add({ targets: number, alpha: 1, delay: delay + RISE_MS * 0.6, duration: 250 });
    // The car drives up onto its step (reduced effects: just fades in).
    scene.tweens.add({
      targets: car,
      alpha: 1,
      y: reduced ? car.y : { from: car.y + 40, to: car.y },
      delay: delay + RISE_MS,
      duration: 380,
      ease: reduced ? 'Linear' : 'Bounce.easeOut',
    });
    scene.tweens.add({ targets: name, alpha: 1, delay: delay + RISE_MS, duration: 300 });

    if (place === 0) {
      // The winner's fireworks, a few volleys over the podium (fewer with reduced effects).
      const volleys = reduced ? 2 : 8;
      for (let i = 0; i < volleys; i++) {
        scene.time.delayedCall(delay + RISE_MS + i * 380, () => {
          firework(scene, PODIUM_CX + Phaser.Math.Between(-200, 200), Phaser.Math.Between(150, 250), color, this.opts.depth + 0.1, 40);
        });
      }
    }
  }

  /** Every player: place, name, points, rounds won, knockouts. */
  private addTable(state: Readonly<GameState>): void {
    const scene = this.scene;
    const size = `${Math.round(18 * K)}px`;
    const cols = [TABLE_W - 150 * K, TABLE_W - 75 * K, TABLE_W];
    const items: Phaser.GameObjects.GameObject[] = [];
    const head = (x: number, text: string, origin: number) =>
      this.add(scene.add.text(TABLE_X + x, TABLE_Y, text, { fontFamily: FONT, fontSize: `${Math.round(14 * K)}px`, color: '#a99cc8' }).setOrigin(origin, 0));
    items.push(head(0, 'Loc', 0), head(44 * K, 'Mașinuța', 0), head(cols[0]!, 'Puncte', 1), head(cols[1]!, 'Runde', 1), head(cols[2]!, 'Scoși', 1));
    const count = Object.keys(state.players).length;
    for (let i = 0; i < count; i++) {
      const y = TABLE_Y + 30 * K + i * ROW_H;
      const text = (x: number, origin: number) =>
        this.add(scene.add.text(TABLE_X + x, y, '', { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color: '#fff4d6' }).setOrigin(origin, 0));
      const row = { place: text(0, 0), name: text(44 * K, 0), stats: cols.map((x) => text(x, 1)) };
      this.rows.push(row);
      items.push(row.place, row.name, ...row.stats);
    }
    for (const item of items) (item as Phaser.GameObjects.Text).setAlpha(0);
    scene.tweens.add({ targets: items, alpha: 1, delay: TABLE_DELAY, duration: 500 });
  }

  private syncTable(state: Readonly<GameState>): void {
    const ids = computeStandings(state as GameState);
    this.rows.forEach((row, i) => {
      const p = ids[i] !== undefined ? state.players[ids[i]!] : undefined;
      for (const t of [row.place, row.name, ...row.stats]) t.setVisible(!!p);
      if (!p) return;
      const color = p.id === this.opts.me ? '#ffe066' : hexColor(PLAYER_COLORS[p.slot]!);
      row.place.setText(String(i + 1));
      row.name.setText(`${p.name}${p.id === this.opts.me ? ' (tu)' : ''}${p.left ? ' · a plecat' : ''}`).setColor(color);
      [p.points, p.wins, p.knockouts].forEach((v, k) => row.stats[k]!.setText(String(v)));
    });
  }

  private addAwards(state: Readonly<GameState>): void {
    const awards = computeAwards(state);
    if (awards.length === 0) return;
    const scene = this.scene;
    const top = TABLE_Y + 30 * K + Object.keys(state.players).length * ROW_H + 30;
    const size = `${Math.round(16 * K)}px`;
    const items: Phaser.GameObjects.GameObject[] = [
      this.add(scene.add.text(TABLE_X, top, 'Premii', { fontFamily: FONT, fontSize: `${Math.round(15 * K)}px`, color: '#a99cc8' })),
    ];
    // Each row as tall as its text: a long one wraps and pushes the next one down.
    let y = top + 26 * K;
    for (const award of awards) {
      const text = AWARD_TEXT[award.id];
      const names = award.playerIds.map((id) => state.players[id]!.name).join(', ');
      const title = this.add(scene.add.text(TABLE_X, y, `★ ${text.title}`, { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color: '#ffe066' }));
      const rest = this.add(
        scene.add.text(TABLE_X + 150 * K, y, `${names} · ${text.detail(award.value)}`, {
          fontFamily: FONT,
          fontSize: size,
          color: '#fff4d6',
          wordWrap: { width: TABLE_W - 150 * K },
        }),
      );
      items.push(title, rest);
      y += Math.max(title.height, rest.height) + 6 * K;
    }
    for (const item of items) (item as Phaser.GameObjects.Text).setAlpha(0);
    scene.tweens.add({ targets: items, alpha: 1, delay: TABLE_DELAY + 300, duration: 500 });
  }
}
