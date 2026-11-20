// Runs a bots-only match headless and prints the outcome, to check the simulation without the client.
//   npm run sim -- --bots usor,mediu,greu,greu --rounds 5 --seed abc --verbose [--powerups off]
import { parseArgs } from 'node:util';
import {
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  FP,
  TICK_RATE,
  addPlayer,
  computeStandings,
  createGameState,
  fightTicks,
  runTick,
  setRounds,
  startMatch,
  type GameState,
} from '../src';

const LEVELS: Record<string, number> = { usor: BOT_EASY, mediu: BOT_MEDIUM, greu: BOT_HARD };
const LEVEL_NAMES = ['Ușor', 'Mediu', 'Greu'];

const { values } = parseArgs({
  options: {
    bots: { type: 'string', default: 'usor,mediu,greu' },
    rounds: { type: 'string', default: '3' },
    seed: { type: 'string', default: 'balci' },
    powerups: { type: 'string', default: 'on' }, // on | off
    verbose: { type: 'boolean', short: 'v', default: false },
  },
});

const levels = values.bots.split(',').map((s) => {
  const level = LEVELS[s.trim().toLowerCase()];
  if (level === undefined) throw new Error(`Nivel necunoscut: "${s}" (usor, mediu, greu)`);
  return level;
});
if (levels.length < 2 || levels.length > 6) throw new Error('Între 2 și 6 boți.');

const state: GameState = createGameState({ code: 'CLI', seed: values.seed });
levels.forEach((level, i) => addPlayer(state, `b${i + 1}`, `${LEVEL_NAMES[level]} #${i + 1}`, true, level));
// Bots never become host on their own; here one acts as host so the lobby functions accept the setup.
state.hostId = 'b1';
if (!setRounds(state, 'b1', Number(values.rounds))) throw new Error('Runde: 3, 5 sau 7.');
state.powerups = values.powerups !== 'off';
startMatch(state, 'b1');

const name = (id: string) => state.players[id]?.name ?? '-';
const secs = (ticks: number) => (ticks / TICK_RATE).toFixed(1);

const t0 = performance.now();
while (state.phase !== 'finished') {
  const roundTick = state.roundTick;
  for (const e of runTick(state, [])) {
    if (values.verbose && e.type === 'out') {
      const by = e.byId ? `scos de ${name(e.byId)} (+1)` : 'a ieșit singur (-1)';
      console.log(`  ${secs(fightTicks(roundTick))}s  ${name(e.playerId)} ${by}`);
    }
    if (e.type === 'roundEnd') {
      const what =
        e.outcome === 'win' ? `câștigă ${name(e.winnerId)} (+3)` : e.outcome === 'draw' ? 'egal (ultimii au ieșit deodată)' : 'timpul a expirat';
      console.log(
        `Runda ${e.round}: ${what} după ${secs(fightTicks(roundTick))}s, ring ${Math.round(state.ringRadius / FP)} px`,
      );
    }
  }
}
const ms = performance.now() - t0;

console.log('\nClasament:');
computeStandings(state).forEach((id, i) => {
    const p = state.players[id]!;
    console.log(
      `${i + 1}. ${p.name.padEnd(9)} ${String(p.points).padStart(3)} p  victorii ${p.wins}  scoși ${p.knockouts}  singur ${p.selfOuts}  lovituri ${p.bumps}`,
    );
  });
console.log(`\n${state.tick} tick-uri simulate în ${ms.toFixed(0)} ms`);
