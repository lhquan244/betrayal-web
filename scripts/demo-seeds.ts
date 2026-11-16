// Searches boardgame.io seeds for a demo game: haunt reasonably early, game ends, estimated video length.
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { Betrayal } from '../src/engine/game';
import type { GState } from '../src/engine/types';
import { decide, newMemory } from '../src/client/demoBot';

export function runSeed(seed: string, n = 4) {
  const mp = Local(); const game = { ...Betrayal, seed };
  const cl = Array.from({ length: n }, (_, i) => Client<GState>({ game, numPlayers: n, playerID: String(i), multiplayer: mp }));
  cl.forEach((c) => c.start());
  const mem = newMemory(); let step = 0; let est = 6000; let lastCard = ''; let lastRoll = ''; let hauntStep = -1; let cards = { event: 0, item: 0, omen: 0 }; let tiles = 0; let lastLog = 0;
  const kinds: string[] = [];
  while (step < 1500) {
    const G = cl[0].getState()!.G; if (G.phase === 'over') break;
    const mv = decide(G, mem, step); if (!mv) break;
    (cl[Number(mv.pid)].moves as Record<string, (...a: unknown[]) => void>)[mv.move](...mv.args); step++;
    const H = cl[0].getState()!.G;
    est += H.phase === 'select' ? 900 : 700;
    const lc = H.lastCard ? `${H.lastCard.id}:${H.log.length}` : ''; if (H.lastCard && H.lastCard.id + H.lastCard.player !== lastCard) { lastCard = H.lastCard.id + H.lastCard.player; est += 2800; cards[H.lastCard.kind]++; kinds.push(H.lastCard.id); }
    void lc;
    const lr = H.lastRoll ? JSON.stringify(H.lastRoll) + H.log.length : ''; if (H.lastRoll && lr !== lastRoll && H.log.length !== lastLog) { lastRoll = lr; est += 1700; }
    lastLog = H.log.length;
    if (H.phase !== 'explore' && H.phase !== 'select' && hauntStep < 0) { hauntStep = step; est += 7000; }
    tiles = Object.keys(H.rooms).length;
  }
  const G = cl[0].getState()!.G; cl.forEach((c) => c.stop());
  const fallback = G.log.some((l) => l.text.includes('chưa được cài đặt'));
  return { seed, steps: step, hauntStep, phase: G.phase, winner: G.haunt?.winner, est: Math.round((est + 10000) / 1000), cards, tiles, fallback, turns: G.turnCounter, hauntTurn: G.log.findIndex((l) => l.text.includes('HAUNT BẮT ĐẦU')) };
}
if (process.argv[2] !== "--lib") {
const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? 60);
for (let s = from; s <= to; s++) { const r = runSeed(`demo-${s}`); if (r.phase === "over" && !r.fallback && r.steps < 190 && r.hauntStep > 30 && r.steps - r.hauntStep > 30) console.log(JSON.stringify(r)); }
}
