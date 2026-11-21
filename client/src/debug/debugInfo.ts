import {
  botThink,
  countdownSeconds,
  fightTicks,
  FP,
  forwardSpeed,
  livePowerups,
  sortedPlayers,
  TICK_RATE,
  type BotIntent,
  type BotThought,
  type GameState,
} from '@masinute/shared';
import type { NetStats } from '../net/GameTransport';
import { POWERUP_INFO } from '../render/powerupInfo';

// What ?debug shows, without Phaser: shared by the 2D overlay (DebugOverlay) and the 3D one.

export const INTENTS: Record<BotIntent, { label: string; color: number }> = {
  wait: { label: 'așteaptă', color: 0xaaaaaa },
  retreat: { label: 'fuge spre centru', color: 0x4cc9f0 },
  flee: { label: 'fuge de uriaș', color: 0xb388ff },
  fetch: { label: 'după power-up', color: 0xffd166 },
  hunt: { label: 'vânează', color: 0xff4d6d },
  cruise: { label: 'plimbare', color: 0x80ed99 },
};

/** Velocity vectors are drawn this many ticks long. */
export const VELOCITY_SCALE = 8;

/** Each bot's decision for this state (bot thinking is pure, so it can be recomputed from any state, local or remote). */
export function botThoughts(state: Readonly<GameState>): Map<string, BotThought> {
  const thoughts = new Map<string, BotThought>();
  for (const p of sortedPlayers(state as GameState)) {
    if (!p.isBot) continue;
    const t = botThink(state as GameState, p.id);
    if (t) thoughts.set(p.id, t);
  }
  return thoughts;
}

/** "vânează s40 t100 B": a bot's intent and the input it holds. */
export function thoughtLabel(thought: BotThought): string {
  const i = thought.input;
  return `${INTENTS[thought.intent].label} s${i.steer} t${i.throttle}${i.boost ? ' B' : ''}`;
}

/** The info lines: ticks, fps, ring, the own car's numbers, power-ups, the network. */
export function debugLines(state: Readonly<GameState>, meId: string, fps: number, paused: boolean, net?: NetStats): string[] {
  const me = state.players[meId];
  const lines = [
    `tick ${state.tick}  round tick ${state.roundTick}  fight ${(fightTicks(state.roundTick) / TICK_RATE).toFixed(1)}s  countdown ${countdownSeconds(state.roundTick)}`,
    `fps ${fps.toFixed(0)}  ring ${(state.ringRadius / FP).toFixed(0)} px  phase ${state.phase}${paused ? ' (pauză)' : ''}`,
  ];
  if (me) {
    const speed = Math.hypot(me.vx, me.vy);
    lines.push(
      `eu: viteză ${((speed * TICK_RATE) / FP).toFixed(0)} px/s (înainte ${((forwardSpeed(me) * TICK_RATE) / FP).toFixed(0)})  steer ${me.steer} throttle ${me.throttle}  boost ${me.boostTicks}/${me.boostCooldown}  alunecare ${me.slideTicks}  seq ${me.lastSeq}`,
    );
  }
  lines.push(
    state.powerups
      ? `power-ups: următorul în ${(state.puTimer / TICK_RATE).toFixed(1)}s  pe ring ${livePowerups(state).length}/2${me?.effect ? `  eu: ${POWERUP_INFO[me.effect]?.name} ${(me.effectTicks / TICK_RATE).toFixed(1)}s` : ''}${me?.confusedTicks ? `  amețit ${(me.confusedTicks / TICK_RATE).toFixed(1)}s` : ''}`
      : 'power-ups: oprite',
  );
  if (net) {
    const sim = net.lagMs || net.jitterMs ? `  (simulat +${net.lagMs}±${net.jitterMs} ms)` : '';
    lines.push(
      `net: ping ${net.pingMs} ms${sim}  eroare predicție ${net.predictionErrorPx.toFixed(1)} px  neconfirmate ${net.unconfirmed}  corecții mari ${net.bigCorrectionsPerSecond}/s`,
    );
  }
  return lines;
}
