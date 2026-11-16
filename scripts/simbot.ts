// Headless bot used by the simulation script and tests: plays a whole game through the pure rules engine.
import type { GState } from '../src/engine/types';
import type { Ctx } from '../src/engine/core';
import { seededRng, holds } from '../src/engine/core';
import * as R from '../src/engine/rules';
import { nextStepToward, distances, openDoorways, tilesLeftFor } from '../src/engine/house';
import { CHARACTERS } from '../src/data/characters';
import { HAUNTS } from '../src/haunts';

/** Heroes a monster may attack right now (same room, allowed by the haunt). */
function heroTargets(c: Ctx, mid: string): string[] {
  const G = c.G; const m = G.monsters.find((x) => x.id === mid)!; const h = HAUNTS[G.haunt!.number];
  return R.livingHeroesIn(G, m.room).filter((o) => !h.canAttackExplorer?.(c, `m:${mid}`, o));
}
/** The original Mummy bot (Haunt #1). */
function mummyBot(c: Ctx) {
  const G = c.G; const m = G.monsters.find((x) => x.id === 'mummy')!;
  const tr = G.players[G.haunt!.traitor!]; const d = G.haunt!.data as { sarcophagus: string };
  const hasPrize = m.companionGirl && m.carries.some((x) => x.id === 'ring' || x.id === 'holy-symbol');
  const girlHolder = Object.values(G.players).find((x) => !x.dead && holds(x, 'girl'));
  const anyHero = Object.values(G.players).find((x) => !x.dead && !x.isTraitor);
  const goal = hasPrize ? d.sarcophagus : girlHolder && !girlHolder.isTraitor ? girlHolder.room : !tr.dead && tr.room !== m.room ? tr.room : anyHero?.room ?? m.room;
  for (let k = 0; k < 8; k++) {
    const heroHere = R.livingHeroesIn(G, m.room);
    if (heroHere.length) { R.monsterAttack(c, 'mummy', heroHere[0]); return; }
    if ((G.turn as Record<string, unknown>)['tp:mummy'] && goal !== m.room) { R.monsterMove(c, 'mummy', goal, true); continue; }
    let step = nextStepToward(G, m.room, goal);
    if (!step) { const dist = distances(G, m.room); const h = Object.values(G.players).filter((x) => !x.dead && !x.isTraitor && Number.isFinite(dist[x.room])).sort((a, b) => dist[a.room] - dist[b.room])[0]; if (h) step = nextStepToward(G, m.room, h.room); }
    if (!step || step === m.room) break;
    if (R.monsterMove(c, 'mummy', step)) break;
  }
  if ((G.phase as string) === 'over' || G.pending.length) return;
  const heroHere = R.livingHeroesIn(G, m.room);
  if (heroHere.length && !(G.turn as Record<string, unknown>)['att:mummy']) R.monsterAttack(c, 'mummy', heroHere[0]);
}

export interface SimResult { G: GState; steps: number; hauntStartedAtTurn?: number; phases: string[] }

export function simulate(seed: number, nPlayers = 4, opts: { forceHaunt?: number; maxSteps?: number } = {}): SimResult {
  const rng = seededRng(seed); const ids = Array.from({ length: nPlayers }, (_, i) => String(i));
  const G = R.initialState(ids, {}, { forceHaunt: opts.forceHaunt }); const c: Ctx = { G, rng };
  const phases: string[] = [G.phase]; const mark = () => { if (phases[phases.length - 1] !== G.phase) phases.push(G.phase); };
  const colors = new Set<string>();
  for (const id of ids) { const ch = CHARACTERS.find((x) => !colors.has(x.color))!; colors.add(ch.color); const e = R.selectCharacter(c, id, ch.id, `Bot ${id}`); if (e) throw new Error(e); }
  R.startExplore(c, [1, 1]); mark();
  const botDone = new Set<string>(); let stuck = 0;
  let steps = 0; let hauntStartedAtTurn: number | undefined; const max = opts.maxSteps ?? 20000;
  const pick = <T,>(a: T[]) => a[Math.floor(((rng.d6() - 1) + 6 * (rng.d6() - 1)) / 36 * a.length)];
  const advance = (res: ReturnType<typeof R.endTurn>) => {
    if (typeof res === 'string') { if (G.pending.length) return; throw new Error('endTurn: ' + res); }
    if (G.phase !== 'over') R.beginTurn(c, res.next, res.part);
  };
  while (G.phase !== 'over' && steps++ < max) {
    if (G.pending.length) {
      const pd = G.pending[0]; let payload: Record<string, unknown> = {};
      if (pd.type === 'damage') payload = { first: Math.ceil(pd.amount / 2) };
      else if (pd.type === 'choice') payload = { option: 0 };
      else if (pd.type === 'rotate') payload = { rot: pd.options[0] };
      else if (pd.type === 'pickRoom') payload = { room: pick(pd.rooms) };
      const e = R.resolvePending(c, pd.player, payload); if (e) throw new Error(`resolve ${pd.type}: ${e}`);
      const j = (G as unknown as { __jump?: { next: string; part: 'explorer' | 'monsters' } }).__jump;
      if (j) { delete (G as unknown as { __jump?: unknown }).__jump; R.beginTurn(c, j.next, j.part); }
      mark(); if (G.phase === 'haunt' && hauntStartedAtTurn === undefined) hauntStartedAtTurn = G.turnCounter; continue;
    }
    const pid = G.turn.player; const p = G.players[pid];
    if (G.turn.part === 'monsters') {
      const h = HAUNTS[G.haunt!.number];
      const k = `m${G.turnCounter}`;
      if (!botDone.has(k)) {
        botDone.add(k);
        for (const m of [...G.monsters]) {
          if (m.stunned || !G.monsters.includes(m)) continue;
          if (m.id === 'mummy') { mummyBot(c); continue; }
          // generic monster: walk toward the nearest hero it may affect, attack if it can
          const dist = () => distances(G, m.room);
          for (let s = 0; s < 10 && !m.noMove; s++) {
            if (heroTargets(c, m.id).length && !m.noAttack) break;
            const d = dist(); const goal = Object.values(G.players).filter((x) => !x.dead && !x.isTraitor && Number.isFinite(d[x.room])).sort((a, b) => d[a.room] - d[b.room])[0]?.room;
            if (!goal || goal === m.room) break;
            const step = nextStepToward(G, m.room, goal); if (!step || step === m.room) break;
            if (R.monsterMove(c, m.id, step)) break;
          }
          if ((G.phase as string) === 'over' || G.pending.length) break;
          const t = heroTargets(c, m.id); if (t.length && !m.noAttack) R.monsterAttack(c, m.id, t[0]);
          if ((G.phase as string) === 'over' || G.pending.length) break;
        }
        if ((G.phase as string) === 'over') break;
      }
      if (G.pending.length) continue;
      // haunt-specific monster actions (e.g. a group attack), each at most once
      const ma = R.monsterActions(c, pid).filter((a) => !a.disabled && !botDone.has(`${k}:${a.id}:${JSON.stringify(a.args)}`));
      if (ma.length) { botDone.add(`${k}:${ma[0].id}:${JSON.stringify(ma[0].args)}`); R.doAction(c, pid, ma[0].id, ma[0].args ?? {}); continue; }
      if (!h) throw new Error('no haunt');
      const res = R.endTurn(c, pid);
      if (typeof res === 'string' && !G.pending.length) { stuck++; if (stuck > 5) throw new Error('monster endTurn: ' + res); continue; }
      stuck = 0; advance(res); mark(); continue;
    }
    // explorer turn
    if (G.phase === 'haunt') {
      const acts = R.availableActions(c, pid).filter((a) => a.id.startsWith('haunt:') && !a.disabled && !botDone.has(`${G.turnCounter}:${a.id}:${JSON.stringify(a.args)}`));
      if (acts.length) { const a = acts[0]; botDone.add(`${G.turnCounter}:${a.id}:${JSON.stringify(a.args)}`); const e = R.doAction(c, pid, a.id, a.args ?? {}); if (e) throw new Error(`${a.id}: ${e}`); continue; }
      if ((G.phase as string) === 'over') break;
      const atk = R.attackTargets(c, pid).filter((t) => t.trait === 'might' && !G.turn.attacked && (p.isTraitor || t.id.startsWith('m:')));
      if (atk.length && !G.turn.forceEnd) { R.attack(c, pid, atk[0].id, atk[0].trait, atk[0].weapon); continue; }
    }
    if (!G.turn.moveEnded && !R.isStuck(p) && !p.dead) {
      const opts2 = R.movementOptions(c, pid);
      // heroes after the haunt head for a target room; otherwise explore
      let choice = opts2.find((o) => o.dir !== undefined) ?? pick(opts2);
      if (G.phase === 'haunt') {
        const tgt0 = HAUNTS[G.haunt!.number].botTarget?.(c, pid) ?? undefined; const tgt = tgt0 && G.rooms[tgt0] && Number.isFinite(distances(G, p.room)[tgt0]) ? tgt0 : undefined;
        if (tgt && tgt !== p.room) { const s = nextStepToward(G, p.room, tgt); const o = opts2.find((x) => x.room === s); if (o) choice = o; else if (!Number.isFinite(distances(G, p.room)[tgt])) choice = opts2[0]; }
        else if (tgt === p.room) choice = undefined as never;
        if (!tgt && choice && choice.dir === undefined) { // walk toward the nearest room with an unexplored doorway
          const dist = distances(G, p.room);
          const frontier = Object.keys(G.rooms).filter((r) => openDoorways(G, r).length && tilesLeftFor(G, G.rooms[r].floor) && Number.isFinite(dist[r])).sort((a, b) => dist[a] - dist[b])[0];
          if (frontier) { const s2 = nextStepToward(G, p.room, frontier); const o = opts2.find((x) => x.room === s2); if (o) choice = o; }
        }
      }
      if (choice) { const e = R.moveExplorer(c, pid, choice.room ? { room: choice.room } : { dir: choice.dir }); if (!e) { mark(); continue; } }
    }
    if (G.pending.length) continue;
    // free self if stuck
    const free = R.availableActions(c, pid).find((a) => a.id === 'free' && !a.disabled);
    if (free) { R.doAction(c, pid, 'free', free.args); continue; }
    advance(R.endTurn(c, pid)); mark();
    if (G.phase === 'haunt' && hauntStartedAtTurn === undefined) hauntStartedAtTurn = G.turnCounter;
  }
  mark(); return { G, steps, hauntStartedAtTurn, phases };
}
