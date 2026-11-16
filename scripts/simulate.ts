// Usage: npx tsx scripts/simulate.ts [seed] [--haunt N]   (default: 20 seeds, haunt from the chart)
import { simulate } from './simbot';
const args = process.argv.slice(2); const hi = args.indexOf('--haunt');
const forceHaunt = hi >= 0 ? Number(args[hi + 1]) : undefined; if (hi >= 0) args.splice(hi, 2);
const seeds = args[0] ? [Number(args[0])] : Array.from({ length: 20 }, (_, i) => i + 1);
let ok = 0;
for (const s of seeds) {
  let r;
  try { r = simulate(s, 4 + (s % 3), { forceHaunt, maxSteps: forceHaunt ? 4000 : undefined }); } catch (e) { console.log(`seed ${s}: ERROR ${(e as Error).message}`); continue; }
  const w = r.G.haunt?.winner ?? '-';
  console.log(`seed ${s}: phases ${r.phases.join(' → ')} | haunt #${r.G.haunt?.number ?? '-'} @turn ${r.hauntStartedAtTurn ?? '-'} | winner ${w} | steps ${r.steps} | omens ${r.G.omensDrawn} | rooms ${Object.keys(r.G.rooms).length}`);
  if (r.G.phase === 'over') ok++;
  if (seeds.length === 1) console.log(r.G.log.slice(-40).map((l) => l.text).join('\n'));
}
console.log(`${ok}/${seeds.length} games finished`);
