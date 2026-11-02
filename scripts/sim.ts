/**
 * Monte Carlo balance simulator: fresh crews at a power level vs Fortress regions.
 *   node scripts/sim.ts [runs] [level] [zone] [difficulty]
 * Use `finale` as the zone to simulate the Heart of the Fortress.
 */
import { newGame, quickDynasty } from '../src/meta/town.ts';
import { dispatch } from '../src/app/commands.ts';
import { autoExpedition } from '../src/app/autoplay.ts';
import { autoSpend } from '../src/rules/advance.ts';
import { fullRestore } from '../src/rules/character.ts';
import { START_XP, XP_PER_LEVEL } from '../src/content/careers.ts';
import type { ZoneId, CareerId, Difficulty } from '../src/engine/types.ts';

const runs = Number(process.argv[2] ?? 30);
const level = Number(process.argv[3] ?? 1);
const finale = process.argv[4] === 'finale';
const biome = (finale ? 'core' : process.argv[4] ?? 'docks') as ZoneId;
const diff = (process.argv[5] ?? 'standard') as Difficulty;
const comps: CareerId[][] = [
  ['archMilitant', 'missionary', 'voidMaster'], ['astropath', 'explorator', 'seneschal'], ['navigator', 'archMilitant', 'missionary'],
  ['explorator', 'voidMaster', 'astropath'], ['seneschal', 'missionary', 'navigator'], ['archMilitant', 'astropath', 'explorator'],
];
const tally: Record<string, number> = {};
let best = 0, totalTurns = 0, deaths = 0, fights = 0, capLost = 0; const bossRounds: number[] = [];
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const g = newGame(1, 'legacy', `SIM-${i}`);
  quickDynasty(g, comps[i % comps.length]);
  g.profile.unlockedBiomes = ['docks', 'gardens', 'reliquary', 'labyrinth', 'core'];
  if (finale) for (const z of g.profile.unlockedBiomes) g.profile.sigils[z] = 1;
  for (const h of g.roster) { h.xp = START_XP + (level - 1) * XP_PER_LEVEL; autoSpend(h); fullRestore(h); }
  const r = dispatch(g, { type: 'startExpedition', partyIds: g.roster.map((h) => h.id), biome, difficulty: diff, seed: `SIM-${biome}-${i}`, finale });
  if (!r.ok) { console.log('start failed', r.error); continue; }
  const rep = autoExpedition(g);
  tally[rep.result] = (tally[rep.result] ?? 0) + 1;
  tally[`${comps[i % comps.length].join('/')}:${rep.result}`] = (tally[`${comps[i % comps.length].join('/')}:${rep.result}`] ?? 0) + 1;
  best = Math.max(best, rep.bestScore);
  totalTurns += rep.turns;
  fights += g.lastResult?.fights ?? 0;
  if (g.lastResult?.bossRounds) bossRounds.push(g.lastResult.bossRounds);
  deaths += g.roster.filter((h) => h.status === 'dead').length;
  if (g.phase === 'over') capLost++;
}
console.log(`L${level} ${finale ? 'FINALE' : biome} ${diff}: ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${k.padEnd(48)} ${v}`);
console.log(`  boss rounds avg ${(bossRounds.reduce((a, b) => a + b, 0) / Math.max(1, bossRounds.length)).toFixed(1)}, fights/run ${(fights / runs).toFixed(1)}, turns/fight ${(totalTurns / Math.max(1, fights)).toFixed(1)}, deaths ${deaths}, captain lost ${capLost}, best hand ${best}`);
