// Bots-only tournament over many seeds: round wins, points and timings per bot level, and how
// each power-up kind plays out (pickups, how often its picker wins the round, its knockouts).
//   npm run balance -w shared -- --matches 40 --lineup usor,usor,mediu,mediu,greu,greu [--powerups off] [--pufreq 1..5] [--set proteinMassPct=250,sodaGripPct=85]
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
  PU_GHOST,
  PU_PROTEIN,
  PU_SODA,
  PU_SPRINGS,
  PU_TUICA,
  TICK_RATE,
  TUNING,
  addPlayer,
  setTuning,
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
    pufreq: { type: 'string', default: '3' }, // how often power-ups appear, 1..5
    set: { type: 'string', default: '' }, // TUNING overrides: key=value,key=value
  },
});
if (values.set) {
  const overrides = Object.fromEntries(values.set.split(',').map((kv) => kv.split('=')).map(([k, v]) => [k!.trim(), Number(v)]));
  for (const key of Object.keys(overrides)) if (!(key in TUNING)) throw new Error(`cheie TUNING necunoscută: ${key}`);
  setTuning(overrides);
  console.log(`TUNING: ${JSON.stringify(overrides)}`);
}
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
  [PU_SODA]: 'Suc',
  [PU_PROTEIN]: 'Proteină',
  [PU_GHOST]: 'Fantomă',
};
const kindStats = new Map<number, { pickups: number; pairs: number; roundWins: number }>();
for (const kind of Object.keys(KIND_NAMES).map(Number)) kindStats.set(kind, { pickups: 0, pairs: 0, roundWins: 0 });
let hornKnockouts = 0;
let oilKnockouts = 0;
let saves = 0;
let confusions = 0;
let confusedSelfOuts = 0;
let racersPerRound = 0;
/** Eliminations while the victim had the effect on (own fault or not). */
const outWith = new Map<number, { self: number; knocked: number }>();
for (const kind of [PU_MICI, PU_LIFEBUOY, PU_TUICA, PU_SPRINGS, PU_SODA, PU_PROTEIN, PU_GHOST]) outWith.set(kind, { self: 0, knocked: 0 });
/** Knockouts dealt while having the effect on. */
const knockoutsWith = new Map<number, number>();

for (let m = 0; m < Number(values.matches); m++) {
  const state = createGameState({ code: 'BAL', seed: `balance-${m}` });
  lineup.forEach((level, i) => addPlayer(state, `b${i}`, `b${i}`, true, level));
  state.hostId = 'b0';
  setRounds(state, 'b0', 5);
  state.powerups = values.powerups !== 'off';
  state.puFreq = Number(values.pufreq);
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
        const vw = outWith.get(victim.effect);
        if (vw) {
          if (e.byId) vw.knocked++;
          else vw.self++;
        }
        if (e.byId) {
          const k = state.players[e.byId]!.effect;
          knockoutsWith.set(k, (knockoutsWith.get(k) ?? 0) + 1);
        }
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
  for (const [kind, o] of outWith) {
    console.log(`  ${KIND_NAMES[kind]!.padEnd(8)} cu efectul activ: a scos ${String(knockoutsWith.get(kind) ?? 0).padStart(4)}, ieșit singur ${String(o.self).padStart(4)}, scos de alții ${String(o.knocked).padStart(4)}`);
  }
  console.log(`  eliminări după Claxon ${hornKnockouts}, din Ulei ${oilKnockouts}, salvări cu Colacul ${saves}, amețiți ${confusions} (ieșiți singuri amețiți ${confusedSelfOuts})`);
}
