// Bots-only tournament over many seeds: round wins, points and timings per bot level.
//   npm run balance -w shared -- --matches 40 --lineup usor,usor,mediu,mediu,greu,greu
import { parseArgs } from 'node:util';
import {
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  TICK_RATE,
  addPlayer,
  createGameState,
  fightTicks,
  runTick,
  setRounds,
  startMatch,
} from '../src';

const LEVELS: Record<string, number> = { usor: BOT_EASY, mediu: BOT_MEDIUM, greu: BOT_HARD };
const NAMES = ['Ușor', 'Mediu', 'Greu'];
const { values } = parseArgs({
  options: {
    matches: { type: 'string', default: '40' },
    lineup: { type: 'string', default: 'usor,usor,mediu,mediu,greu,greu' },
  },
});
const lineup = values.lineup.split(',').map((s) => LEVELS[s.trim()]!);

const wins = [0, 0, 0];
const points = [0, 0, 0];
const selfOuts = [0, 0, 0];
const knockouts = [0, 0, 0];
const outcomes: Record<string, number> = { win: 0, draw: 0, timeout: 0 };
let roundTicks = 0;
let rounds = 0;
let firstOutTicks = 0;
let firstOuts = 0;

for (let m = 0; m < Number(values.matches); m++) {
  const state = createGameState({ code: 'BAL', seed: `balance-${m}` });
  lineup.forEach((level, i) => addPlayer(state, `b${i}`, `b${i}`, true, level));
  state.hostId = 'b0';
  setRounds(state, 'b0', 5);
  startMatch(state, 'b0');
  let sawOut = false;
  while (state.phase !== 'finished') {
    const rt = state.roundTick;
    for (const e of runTick(state, [])) {
      if (e.type === 'out' && !sawOut) {
        sawOut = true;
        firstOutTicks += fightTicks(rt);
        firstOuts++;
      }
      if (e.type === 'roundStart') sawOut = false;
      if (e.type === 'roundEnd') {
        outcomes[e.outcome]!++;
        roundTicks += fightTicks(rt);
        rounds++;
        if (e.winnerId) wins[state.players[e.winnerId]!.botLevel]!++;
      }
    }
  }
  for (const p of Object.values(state.players)) {
    if (!p.isBot) continue;
    points[p.botLevel]! += p.points;
    selfOuts[p.botLevel]! += p.selfOuts;
    knockouts[p.botLevel]! += p.knockouts;
  }
}

const count = [0, 0, 0];
for (const l of lineup) count[l]!++;
for (let l = 0; l < 3; l++) {
  if (!count[l]) continue;
  const per = (v: number) => (v / count[l]!).toFixed(1).padStart(6);
  console.log(`${NAMES[l]!.padEnd(6)} victorii ${per(wins[l]!)}  puncte ${per(points[l]!)}  scoși ${per(knockouts[l]!)}  singur ${per(selfOuts[l]!)}   (per bot)`);
}
console.log(`runde ${rounds}: ${JSON.stringify(outcomes)}, durată medie ${(roundTicks / rounds / TICK_RATE).toFixed(1)}s, prima eliminare ${(firstOutTicks / Math.max(1, firstOuts) / TICK_RATE).toFixed(1)}s`);
