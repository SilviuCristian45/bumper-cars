// Bots-only tournament over many seeds: round wins, points and timings per bot level, and how
// each power-up kind plays out (pickups, how often its picker wins the round, its knockouts).
//   npm run balance -w shared -- --matches 40 --lineup usor,usor,mediu,mediu,greu,greu [--powerups off]
import { parseArgs } from 'node:util';
import {
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  HIT_CREDIT_TICKS,
  PU_HORN,
  PU_LIFEBUOY,
  PU_MICI,
  PU_OIL,
  PU_SPRINGS,
  PU_TUICA,
  TICK_RATE,
  TUNING,
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
    powerups: { type: 'string', default: 'on' }, // on | off
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

const KIND_NAMES: Record<number, string> = {
  [PU_HORN]: 'Claxon',
  [PU_MICI]: 'Mici',
  [PU_LIFEBUOY]: 'Colac',
  [PU_OIL]: 'Ulei',
  [PU_TUICA]: 'Țuică',
  [PU_SPRINGS]: 'Arcuri',
};
const kindStats = new Map<number, { pickups: number; pairs: number; roundWins: number }>();
for (const kind of Object.keys(KIND_NAMES).map(Number)) kindStats.set(kind, { pickups: 0, pairs: 0, roundWins: 0 });
let hornKnockouts = 0;
let oilKnockouts = 0;
let saves = 0;
let confusions = 0;
let confusedSelfOuts = 0;
let racersPerRound = 0;

for (let m = 0; m < Number(values.matches); m++) {
  const state = createGameState({ code: 'BAL', seed: `balance-${m}` });
  lineup.forEach((level, i) => addPlayer(state, `b${i}`, `b${i}`, true, level));
  state.hostId = 'b0';
  setRounds(state, 'b0', 5);
  state.powerups = values.powerups !== 'off';
  startMatch(state, 'b0');
  let sawOut = false;
  /** Who picked up each kind this round. */
  let pickers = new Map<number, Set<string>>();
  const lastHorn = new Map<string, number>();
  while (state.phase !== 'finished') {
    const rt = state.roundTick;
    for (const e of runTick(state, [])) {
      if (e.type === 'pickup') {
        kindStats.get(e.kind)!.pickups++;
        if (!pickers.has(e.kind)) pickers.set(e.kind, new Set());
        pickers.get(e.kind)!.add(e.playerId);
      }
      if (e.type === 'horn') lastHorn.set(e.playerId, state.tick);
      if (e.type === 'saved') saves++;
      if (e.type === 'confused') confusions++;
      if (e.type === 'out') {
        const victim = state.players[e.playerId]!;
        if (!e.byId && victim.confusedTicks > 0) confusedSelfOuts++;
        if (e.byId && state.tick - (lastHorn.get(e.byId) ?? -1e9) <= HIT_CREDIT_TICKS) hornKnockouts++;
        else if (e.byId) {
          const owner = state.players[e.byId]!;
          // Knocked out by someone with a live puddle, near that puddle: the oil did it.
          const r = 3 * TUNING.oilRadius;
          const dx = victim.x - owner.oilX;
          const dy = victim.y - owner.oilY;
          if (owner.oilTicks > 0 && dx * dx + dy * dy < r * r) oilKnockouts++;
        }
      }
      if (e.type === 'out' && !sawOut) {
        sawOut = true;
        firstOutTicks += fightTicks(rt);
        firstOuts++;
      }
      if (e.type === 'roundStart') {
        sawOut = false;
        pickers = new Map();
      }
      if (e.type === 'roundEnd') {
        racersPerRound += Object.values(state.players).filter((p) => !p.left).length;
        for (const [kind, ids] of pickers) {
          for (const id of ids) {
            kindStats.get(kind)!.pairs++;
            if (e.winnerId === id) kindStats.get(kind)!.roundWins++;
          }
        }
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
if (values.powerups !== 'off') {
  const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(0) : '-'}%`.padStart(4);
  console.log(`power-up-uri (o mașină oarecare câștigă runda în ${pct(rounds, racersPerRound)} din cazuri):`);
  for (const [kind, st] of kindStats) {
    console.log(`  ${KIND_NAMES[kind]!.padEnd(7)} luate ${String(st.pickups).padStart(4)}  cine l-a luat câștigă runda ${pct(st.roundWins, st.pairs)}`);
  }
  console.log(`  eliminări după Claxon ${hornKnockouts}, din Ulei ${oilKnockouts}, salvări cu Colacul ${saves}, amețiți ${confusions} (ieșiți singuri amețiți ${confusedSelfOuts})`);
}
