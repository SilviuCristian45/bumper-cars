import {
  BOOST_COOLDOWN_TICKS,
  COUNTDOWN_TICKS,
  PLAYER_COLORS,
  PU_NONE,
  TICK_RATE,
  sortedPlayers,
  type GameEvent,
  type GameState,
} from '@masinute/shared';
import { isTouch } from '@client/device';
import { el } from '@client/ui/el';
import { POWERUP_INFO, hexColor } from '@client/render/powerupInfo';

const START_SECONDS = 0.8;

/** Minimal HTML HUD: round, countdown/banner, scores, own boost and power-up. Text is touched only when it changes. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly round: HTMLElement;
  private readonly effect: HTMLElement;
  private readonly scores: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly boost: HTMLElement;
  private readonly boostFill: HTMLElement;
  private readonly cache = new Map<HTMLElement, string>();
  private startShownFor = 0;

  constructor(
    private readonly meId: string,
    private readonly showBoostBar: boolean,
  ) {
    this.round = el('div', { class: 'hud-round' });
    this.effect = el('div', { class: 'hud-effect' });
    this.scores = el('div', { class: 'hud-scores' });
    this.banner = el('div', { class: 'hud-banner' });
    this.sub = el('div', { class: 'hud-sub' });
    this.boostFill = el('div', { class: 'fill' });
    this.boost = el('div', { class: 'hud-boost' }, [this.boostFill, el('span', { text: 'BOOST' })]);
    this.boost.hidden = !showBoostBar;
    this.root = el('div', { class: 'hud' }, [
      this.scores,
      el('div', { class: 'hud-top' }, [this.round, this.effect]),
      el('div', { class: 'hud-center' }, [this.banner, this.sub]),
      this.boost,
    ]);
    document.body.append(this.root);
  }

  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) if (e.type === 'go') this.startShownFor = START_SECONDS;
  }

  /** Boost fill 0..1 (1 = ready), also wanted by the touch button. */
  boostReady(state: Readonly<GameState>): number {
    const me = state.players[this.meId];
    return me ? 1 - me.boostCooldown / BOOST_COOLDOWN_TICKS : 1;
  }

  update(state: Readonly<GameState>, dt: number, paused: boolean): void {
    const me = state.players[this.meId];
    this.text(this.round, state.phase === 'lobby' ? '' : `Runda ${state.round}/${state.roundsTotal}`);

    const info = me && me.effect !== PU_NONE ? POWERUP_INFO[me.effect] : undefined;
    this.text(this.effect, info && me ? `${info.name} · ${Math.ceil(me.effectTicks / TICK_RATE)} s` : '');
    if (info) this.effect.style.color = hexColor(info.color);

    this.startShownFor = Math.max(0, this.startShownFor - dt);
    let banner = '';
    let sub = '';
    if (paused) {
      banner = 'PAUZĂ';
      sub = isTouch ? 'Atinge „Continuă”' : 'P ca să continui';
    } else if (state.phase === 'playing' && state.roundTick < COUNTDOWN_TICKS) {
      banner = String(Math.ceil((COUNTDOWN_TICKS - state.roundTick) / TICK_RATE));
    } else if (state.phase === 'playing' && this.startShownFor > 0) {
      banner = 'START!';
    } else if (state.phase === 'playing' && me && !me.alive) {
      sub = 'Ai ieșit din ring. Aștepți runda următoare…';
    } else if (state.phase === 'intermission') {
      const winner = state.players[state.roundWinner];
      banner =
        state.roundOutcome === 'win' && winner
          ? winner.id === this.meId
            ? 'Ai câștigat runda!'
            : `${winner.name} câștigă runda`
          : state.roundOutcome === 'timeout'
            ? 'Timpul a expirat'
            : 'Remiză';
    }
    // Once the match is over the podium (Podium3D) says the rest.
    this.text(this.banner, banner);
    this.text(this.sub, sub);

    this.updateScores(state);
    const ready = this.boostReady(state);
    this.boostFill.style.transform = `scaleX(${ready.toFixed(3)})`;
    this.boost.classList.toggle('ready', ready >= 1);
    this.boost.hidden = !this.showBoostBar || state.phase === 'finished';
  }

  dispose(): void {
    this.root.remove();
  }

  private updateScores(state: Readonly<GameState>): void {
    const rows = sortedPlayers(state as GameState)
      .filter((p) => !p.left)
      .sort((a, b) => b.points - a.points || a.slot - b.slot);
    const key = rows.map((p) => `${p.id}:${p.points}:${p.alive ? 1 : 0}`).join('|');
    if (this.cache.get(this.scores) === key) return;
    this.cache.set(this.scores, key);
    this.scores.replaceChildren(
      ...rows.map((p) =>
        el('div', { class: `row${p.alive || state.phase !== 'playing' ? '' : ' out'}${p.id === this.meId ? ' me' : ''}` }, [
          el('span', { class: 'dot', attrs: { style: `background:${hexColor(PLAYER_COLORS[p.slot % PLAYER_COLORS.length]!)}` } }),
          el('span', { class: 'name', text: p.name }),
          el('span', { class: 'pts', text: String(p.points) }),
        ]),
      ),
    );
  }

  private text(node: HTMLElement, value: string): void {
    if (this.cache.get(node) === value) return;
    this.cache.set(node, value);
    node.textContent = value;
  }
}
