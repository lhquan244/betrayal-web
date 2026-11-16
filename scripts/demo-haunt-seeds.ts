// Seed search for per-haunt demo videos: forces a haunt (like the lobby selector) and reports seeds that end the game.
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { Betrayal } from '../src/engine/game';
import type { GState } from '../src/engine/types';
import { decide, newMemory } from '../src/client/demoBot';

export function runSeed(seed: string, forceHaunt: number, n = 4) {
  const mp = Local(); const game = { ...Betrayal, seed, setup: (a: Parameters<NonNullable<typeof Betrayal.setup>>[0]) => Betrayal.setup!(a, { forceHaunt }) };
  const cl = Array.from({ length: n }, (_, i) => Client<GState>({ game, numPlayers: n, playerID: String(i), multiplayer: mp }));
  cl.forEach((c) => c.start());
  const mem = newMemory(); let step = 0; let hauntStep = -1; const errors: string[] = []; let rejected = 0;
  let lastLen = 0; let same = 0;
  while (step < 1200) {
    const G = cl[0].getState()!.G; if (G.phase === 'over') break;
    const mv = decide(G, mem, step); if (!mv) break;
    (cl[Number(mv.pid)].moves as Record<string, (...a: unknown[]) => void>)[mv.move](...mv.args); step++;
    const H = cl[0].getState()!.G;
    if (JSON.stringify(H) === JSON.stringify(G)) { rejected++; same++; if (same > 30) { errors.push(`stuck: ${mv.move} ${JSON.stringify(mv.args)}`); break; } } else same = 0;
    if (H.phase === 'haunt' && hauntStep < 0) hauntStep = step;
    void lastLen; lastLen = H.log.length;
  }
  const G = cl[0].getState()!.G; cl.forEach((c) => c.stop());
  return { seed, steps: step, hauntStep, phase: G.phase, winner: G.haunt?.winner, turns: G.turnCounter, rejected, errors, G };
}
if (!process.argv[1]?.includes("hlog") && process.argv[2] !== "--lib") {
  const h = Number(process.argv[2]); const from = Number(process.argv[3] ?? 1), to = Number(process.argv[4] ?? 40); const kw = process.argv[5] ? new RegExp(process.argv[5]) : null;
  for (let s = from; s <= to; s++) {
    const r = runSeed(`demo-${s}`, h);
    const hits = kw ? r.G.log.filter((l) => kw.test(l.text)).length : 0;
    console.log(JSON.stringify({ seed: r.seed, steps: r.steps, hauntStep: r.hauntStep, phase: r.phase, winner: r.winner, rejected: r.rejected, hits, errors: r.errors }));
  }
}
