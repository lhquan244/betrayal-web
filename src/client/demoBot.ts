// Scripted "demo bot": picks one legal move at a time from the visible game state (read-only use of the rules engine).
// Used only by the demo mode (?demo=SEED) and the seed-search script; it never changes rules.
import type { GState } from '../engine/types';
import type { Ctx } from '../engine/core';
import { holds } from '../engine/core';
import * as R from '../engine/rules';
import { nextStepToward, distances, openDoorways, tilesLeftFor } from '../engine/house';
import { HAUNTS } from '../haunts';

export interface BotMove { pid: string; move: string; args: unknown[]; note?: string }
export interface BotMemory { turn: number; moves: number; acted: boolean; attacked: boolean; done?: string[] }
export const newMemory = (): BotMemory => ({ turn: -1, moves: 0, acted: false, attacked: false, done: [] });
const DEMO_CHARS = ['darrin-williams', 'belladina-zostra', 'zoe-ingstrom', 'peter-akimoto', 'reginald-rhinehardt', 'heather-granville'];
export const DEMO_NAMES = ['Quân', 'Minh', 'Lan', 'Hùng', 'Vy', 'Tú'];
const noRng = { d6: () => 1, shuffle: <T,>(a: T[]) => a };

export function decide(G: GState, mem: BotMemory, step: number, maxMovesPerTurn = 3): BotMove | null {
  const c: Ctx = { G, rng: noRng };
  if (G.phase === 'over') return null;
  if (G.phase === 'select') {
    const p = G.order.map((id) => G.players[id]).find((x) => !x.character);
    if (p) return { pid: p.id, move: 'selectCharacter', args: [DEMO_CHARS[Number(p.id)], DEMO_NAMES[Number(p.id)]] };
    return { pid: '0', move: 'startGame', args: [] };
  }
  if (mem.turn !== G.turnCounter) { mem.turn = G.turnCounter; mem.moves = 0; mem.acted = false; mem.attacked = false; mem.done = []; }
  const pd = G.pending[0];
  if (pd) {
    let payload: Record<string, unknown> = {};
    if (pd.type === 'roll') return { pid: pd.player, move: 'roll', args: [] }; // press "Đổ xúc xắc"
    if (pd.type === 'damage') payload = { first: Math.ceil(pd.amount / 2) };
    else if (pd.type === 'choice') payload = { option: 0 };
    else if (pd.type === 'rotate') payload = { rot: pd.options[0] };
    else if (pd.type === 'pickRoom') payload = { room: pd.rooms[step % pd.rooms.length] };
    return { pid: pd.player, move: 'resolve', args: [payload] };
  }
  const pid = G.turn.player; const p = G.players[pid]; const t = G.turn as Record<string, unknown>;
  if (G.turn.part === 'monsters') {
    const m = G.monsters.find((x) => x.id === 'mummy');
    if (m && !m.stunned) {
      const tr = G.players[G.haunt!.traitor!]; const d = G.haunt!.data as { sarcophagus: string };
      const heroes = R.livingHeroesIn(G, m.room);
      if (heroes.length && !t['att:mummy']) return { pid, move: 'monsterAttack', args: ['mummy', heroes[0]] };
      const hasPrize = m.companionGirl && m.carries.some((x) => x.id === 'ring' || x.id === 'holy-symbol');
      const girlHolder = Object.values(G.players).find((x) => !x.dead && holds(x, 'girl'));
      // goal: back to the Sarcophagus with the prize; else whoever has the Girl; else the nearest living hero
      const dist = distances(G, m.room);
      const nearest = Object.values(G.players).filter((x) => !x.dead && !x.isTraitor).sort((a, b) => (dist[a.room] ?? 99) - (dist[b.room] ?? 99))[0];
      void tr;
      const goal = hasPrize ? d.sarcophagus : girlHolder && !girlHolder.isTraitor ? girlHolder.room : nearest?.room ?? m.room;
      if (!t['att:mummy'] || !heroes.length) {
        if (t['tp:mummy'] && goal !== m.room) return { pid, move: 'monsterMove', args: ['mummy', goal, true] };
        const left = (t['mv:mummy'] as number) ?? 0; const spent = (t['sp:mummy'] as number) ?? 0; const cost = 1 + heroes.length;
        if (!heroes.length && (spent === 0 || spent + cost <= left) && spent < left) {
          let s = nextStepToward(G, m.room, goal);
          if (!s) { const h = Object.values(G.players).filter((x) => !x.dead && !x.isTraitor && Number.isFinite(dist[x.room])).sort((a, b) => dist[a.room] - dist[b.room])[0]; if (h) s = nextStepToward(G, m.room, h.room); }
          if (s && s !== m.room) return { pid, move: 'monsterMove', args: ['mummy', s] };
        }
      }
    }
    // other haunts: each monster walks toward the nearest hero it may affect and attacks; then haunt monster actions
    const hm = HAUNTS[G.haunt!.number]; const done = (mem.done ??= []);
    // group attacks (e.g. Rats) before single attacks
    const ga = R.monsterActions(c, pid).filter((a) => !a.disabled && !done.includes(`${a.id}${JSON.stringify(a.args)}`));
    if (ga.length) { done.push(`${ga[0].id}${JSON.stringify(ga[0].args)}`); return { pid, move: 'act', args: [ga[0].id, ga[0].args ?? {}] }; }
    for (const mo of G.monsters) {
      if (mo.id === 'mummy' || mo.stunned) continue;
      const here = R.livingHeroesIn(G, mo.room).filter((o) => !hm.canAttackExplorer?.(c, `m:${mo.id}`, o));
      // (bot choice) a lone Rat (Might 2) does not attack on its own — it waits for the swarm
      const lone = mo.kind === 'rat' && G.monsters.filter((x) => x.kind === 'rat' && x.room === mo.room).length < 2;
      if (here.length && !mo.noAttack && !t[`att:${mo.id}`] && !lone) return { pid, move: 'monsterAttack', args: [mo.id, here[0]] };
      const left = ((t[`mv:${mo.id}`] as number) ?? 0) - ((t[`sp:${mo.id}`] as number) ?? 0);
      if (!mo.noMove && !here.length && left > 0 && !done.includes(`mv:${mo.id}:${mo.room}`)) {
        done.push(`mv:${mo.id}:${mo.room}`);
        const dist = distances(G, mo.room);
        const goal = Object.values(G.players).filter((x) => !x.dead && !x.isTraitor && Number.isFinite(dist[x.room])).sort((a, b) => dist[a.room] - dist[b.room])[0]?.room;
        const s2 = goal ? nextStepToward(G, mo.room, goal) : null;
        if (s2 && s2 !== mo.room && !hm.canEnterRoom?.(c, { mid: mo.id }, s2)) return { pid, move: 'monsterMove', args: [mo.id, s2] };
      }
    }
    const ma = R.monsterActions(c, pid).filter((a) => !a.disabled && !done.includes(`${a.id}${JSON.stringify(a.args)}`));
    if (ma.length) { done.push(`${ma[0].id}${JSON.stringify(ma[0].args)}`); return { pid, move: 'act', args: [ma[0].id, ma[0].args ?? {}] }; }
    return { pid, move: 'endTurn', args: [] };
  }
  if (G.phase === 'haunt' && !mem.acted) {
    const acts = R.availableActions(c, pid).filter((a) => a.id.startsWith('haunt:') && !a.disabled && a.id !== 'haunt:give'
      && !(a.id === 'haunt:search' && G.rooms[p.room]?.floor !== 'basement')); // (bot choice) the burial room is in the basement
    if (acts.length) { mem.acted = true; return { pid, move: 'act', args: [acts[0].id, acts[0].args ?? {}] }; }
  }
  if (G.phase === 'haunt' && p.isTraitor && !G.turn.attacked && !mem.attacked) {
    const atk = R.attackTargets(c, pid).filter((x) => x.trait === 'might');
    if (atk.length) { mem.attacked = true; return { pid, move: 'act', args: ['attack', { target: atk[0].id, trait: atk[0].trait, weapon: atk[0].weapon }] }; }
  }
  if (!G.turn.moveEnded && !R.isStuck(p) && !p.dead && mem.moves < maxMovesPerTurn) {
    const opts = R.movementOptions(c, pid).filter((o) => !R.canMove(c, pid, o.cost));
    let choice: (typeof opts)[number] | undefined = opts.find((o) => o.dir !== undefined) ?? opts[step % Math.max(1, opts.length)];
    if (G.phase === 'haunt' && (!p.isTraitor || G.haunt!.number !== 1)) {
      let tgt: string | undefined;
      if (G.haunt!.number === 1) {
        const d = G.haunt!.data as { sarcophagus: string; tokens: number }; const m = G.monsters.find((x) => x.id === 'mummy');
        tgt = d.tokens >= 2 ? (holds(p, 'book') ? m?.room : Object.values(G.players).find((x) => holds(x, 'book'))?.room) : d.tokens === 0 ? (G.rooms.library ? 'library' : G.rooms['research-laboratory'] ? 'research-laboratory' : d.sarcophagus) : undefined;
      } else { const b = HAUNTS[G.haunt!.number].botTarget?.(c, pid); tgt = b && G.rooms[b] && Number.isFinite(distances(G, p.room)[b]) ? b : undefined; }
      if (tgt && tgt !== p.room) { const s = nextStepToward(G, p.room, tgt); const o = opts.find((x) => x.room === s); if (o) choice = o; }
      else if (tgt === p.room) choice = undefined;
      if (!tgt && choice && choice.dir === undefined) {
        const dist = distances(G, p.room);
        const frontier = Object.keys(G.rooms).filter((r) => openDoorways(G, r).length && tilesLeftFor(G, G.rooms[r].floor) && Number.isFinite(dist[r])).sort((a, b) => dist[a] - dist[b])[0];
        if (frontier) { const s2 = nextStepToward(G, p.room, frontier); const o = opts.find((x) => x.room === s2); if (o) choice = o; }
      }
    }
    if (choice) { mem.moves++; return { pid, move: 'move', args: [choice.room ? { room: choice.room } : { dir: choice.dir }] }; }
  }
  const free = R.availableActions(c, pid).find((a) => a.id === 'free' && !a.disabled);
  if (free && !mem.acted) { mem.acted = true; return { pid, move: 'act', args: ['free', free.args] }; }
  return { pid, move: 'endTurn', args: [] };
}
