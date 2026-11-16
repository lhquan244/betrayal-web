// Engine fuzz / invariant checker. Plays many games per haunt through the real boardgame.io move wrappers
// (Betrayal.moves) with the demo bot, mixed with random legal-or-illegal moves ("chaos"), and checks invariants after
// every move. Usage: npx tsx scripts/fuzz.ts <haunt> <games> [firstSeed] [chaos=0.25]
import { Betrayal } from '../src/engine/game';
import { decide, newMemory } from '../src/client/demoBot';
import * as R from '../src/engine/rules';
import { HAUNTS } from '../src/haunts';
import { seededRng, cardsInPlay, type Ctx } from '../src/engine/core';
import { ITEMS, OMENS } from '../src/data/cards';
import type { GState } from '../src/engine/types';
import { openDoorways } from '../src/engine/house';

type Any = any; // eslint-disable-line
const noRng = { d6: () => 1, shuffle: <T,>(a: T[]) => a };
export interface FuzzResult { seed: number; n: number; haunt: number; steps: number; presses: number; phase: string; winner?: string; turns: number; hauntAt: number; issues: string[]; ended: 'over' | 'limit' | 'stuck' | 'nomove'; rejected: number; chaos: number; tail?: string }

export function fuzzGame(haunt: number, seed: number, n: number, chaos = 0.25, maxSteps = 5000): FuzzResult {
  const rng = seededRng(seed * 7919 + haunt); const brng = seededRng(seed * 104729 + haunt * 31 + 7);
  const rnd = (k: number) => Math.floor(((brng.d6() - 1) * 6 + (brng.d6() - 1)) / 36 * k);
  const ids = Array.from({ length: n }, (_, i) => String(i));
  const G: GState = (Betrayal.setup as Any)({ ctx: { playOrder: ids, numPlayers: n } }, { forceHaunt: haunt });
  const ctx = { currentPlayer: '0' };
  const random = { D6: () => rng.d6(), Shuffle: <T,>(a: T[]) => rng.shuffle(a) };
  const events = { endTurn: (a?: { next: string }) => { if (a?.next) ctx.currentPlayer = a.next; } };
  const call = (pid: string, move: string, args: unknown[]) => { const m = (Betrayal.moves as Any)[move]; return (m.move ?? m)({ G, ctx, playerID: pid, random, events }, ...args); };
  const issues: string[] = []; const issue = (s: string) => {
    if (process.env.TRACE && new RegExp(process.env.TRACE).test(s) && !issues.includes(s)) { console.log('### ' + s + '\n' + G.log.slice(-25).map((l) => '   ' + l.text).join('\n') + '\n   pending=' + JSON.stringify(G.pending).slice(0, 400) + '\n   turn=' + JSON.stringify(G.turn).slice(0, 300)); }
    if (issues.length < 30 && !issues.includes(s)) issues.push(s); };
  const allIO = new Set([...ITEMS, ...OMENS].map((c) => c.id));
  const mem = newMemory(); let steps = 0; let presses = 0; let rejected = 0; let chaosN = 0; let idle = 0; let lastSig = ''; let hauntAt = -1; let ended: FuzzResult['ended'] = 'limit';
  const c = (): Ctx => ({ G, rng: noRng });
  const lastMoves: string[] = [];
  const sig = () => `${G.logSeq}|${G.turnCounter}|${G.pending.length}|${G.turn.player}|${G.turn.part}|${G.phase}`;

  function invariants(where: string) {
    for (const p of Object.values(G.players)) {
      if (!p.character) continue;
      for (const [t, i] of Object.entries(p.idx)) {
        if (i < -1 || i > 7 || !Number.isInteger(i)) issue(`trait out of track: ${p.id} ${t}=${i} (${where})`);
        if (i < 0 && !p.dead) issue(`skull but alive: ${p.id} ${t} (${where})`);
        if (G.phase === 'explore' && i < 0) issue(`skull before haunt: ${p.id} (${where})`);
      }
      if (G.phase === 'explore' && p.dead) issue(`dead before haunt (${where})`);
      if (!p.dead && !G.rooms[p.room]) issue(`living explorer in a room not in the house: ${p.id} ${p.room} (${where})`);
      if (p.dead && p.cards.length) issue(`dead explorer still holds cards (${where})`);
    }
    for (const m of G.monsters) {
      if (!G.rooms[m.room]) issue(`monster ${m.id} in missing room ${m.room}`);
      for (const [t, v] of Object.entries(m.traits)) if (typeof v !== 'number' || v < 0 || v > 12) issue(`monster ${m.id} ${t}=${v}`);
    }
    if (G.phase === 'select') return;
    // cards: no duplicates anywhere; items+omens conserved
    const seen = new Map<string, number>();
    const add = (id: string) => seen.set(id, (seen.get(id) ?? 0) + 1);
    for (const k of ['event', 'item', 'omen'] as const) { G.decks[k].forEach(add); G.discards[k].forEach(add); }
    G.setAside.forEach((r) => add(r.id)); cardsInPlay(G).forEach((r) => add(r.id));
    if (G.monsters.some((m) => m.companionGirl)) add('girl');
    for (const [id, k] of seen) if (k > 1) issue(`card duplicated: ${id} x${k} (${where})`);
    for (const id of allIO) if (!seen.has(id)) issue(`item/omen vanished: ${id} (${where})`);
    // rooms
    for (const r of Object.values(G.rooms)) { if (G.grid[`${r.floor}:${r.x},${r.y}`] !== r.id && !['entrance-hall', 'foyer', 'grand-staircase'].includes(r.id)) issue(`grid mismatch ${r.id}`); if (G.roomStack.includes(r.id) || G.roomDiscard.includes(r.id)) issue(`room both placed and in stack: ${r.id}`); }
    // turn owner
    // (a player who dies during their own turn still owns it until they end it — only endTurn is allowed then)
    if (where.startsWith('endTurn') && (G.phase === 'explore' || G.phase === 'haunt') && G.turn.part === 'explorer' && G.players[G.turn.player]?.dead && G.turn.spent === 0 && !G.turn.rollsDone.length && !G.pending.length && G.log.slice(-6).every((l) => !l.text.includes('đã chết'))) issue(`turn passed to a dead player (${where})`);
    if (G.turn.part === 'monsters' && G.turn.player !== G.haunt?.traitor) issue('monster turn not owned by traitor');
    for (const pd of G.pending) { if (!G.players[pd.player]) issue(`pending for unknown player`); else if (G.players[pd.player].dead && pd.type !== 'damage' && pd.player !== G.haunt?.traitor) issue(`pending ${pd.type} owned by dead player ${pd.player} (${where})`); }
    if (G.pending[0] && G.pending[0].type === 'pickRoom' && !G.pending[0].rooms.length) issue(`pickRoom with no rooms: ${G.pending[0].prompt}`);
    if (G.pending[0] && G.pending[0].type === 'choice' && !G.pending[0].options.length) issue(`choice with no options: ${G.pending[0].prompt}`);
    // win conditions fire
    if (G.phase === 'haunt' && G.haunt && !G.pending.length && !G.queue.length) {
      const cl = structuredClone(G); const w = HAUNTS[G.haunt.number].checkWin({ G: cl, rng: noRng });
      if (w) issue(`win condition true but game not over: ${w.winner} (${where})`);
    }
    if (G.phase === 'over' && G.haunt && !G.haunt.winner) issue('game over without winner');
    if (G.phase === 'haunt' && !G.haunt?.traitor) issue('haunt without traitor');
    // hidden info (#40 burial room)
    if (G.haunt?.number === 40) {
      const d = G.haunt.data as Any;
      for (const pid of ids) {
        const v = (Betrayal.playerView as Any)({ G, ctx, playerID: pid }) as GState;
        const isTr = pid === G.haunt.traitor;
        if (!isTr && !d.found && 'burial' in (v.haunt!.data as Any)) issue('#40 burial room visible to a hero');
        if (!isTr && !d.found && d.burial && v.log.some((l) => l.text.includes('Phòng chôn:'))) issue('#40 burial log visible to a hero');
        if (isTr && d.burial && !(v.haunt!.data as Any).burial) issue('#40 traitor lost burial view');
      }
    }
  }

  function randomMove(): { pid: string; move: string; args: unknown[] } | null {
    const pd = G.pending[0];
    // 10%: someone random tries something (often illegal)
    if (rnd(10) === 0) {
      const pid = ids[rnd(n)]; const kinds = ['endTurn', 'move', 'act', 'resolve', 'monsterMove', 'monsterAttack'];
      const k = kinds[rnd(kinds.length)];
      const anyRoom = Object.keys(G.rooms)[rnd(Object.keys(G.rooms).length)];
      if (k === 'move') return { pid, move: k, args: [{ room: anyRoom }] };
      if (k === 'act') { const a = R.availableActions(c(), G.turn.player).filter((x) => x.id !== 'manual'); const x = a[rnd(a.length)]; return x ? { pid, move: 'act', args: [x.id, x.args ?? {}] } : null; }
      if (k === 'resolve') return { pid, move: 'resolve', args: [{ option: 0, room: anyRoom, rot: 0, first: 0 }] };
      if (k === 'monsterMove') { const m = G.monsters[rnd(G.monsters.length)]; return m ? { pid, move: k, args: [m.id, anyRoom] } : null; }
      if (k === 'monsterAttack') { const m = G.monsters[rnd(G.monsters.length)]; return m ? { pid, move: k, args: [m.id, ids[rnd(n)]] } : null; }
      return { pid, move: k, args: [] };
    }
    if (pd) {
      const pl: Any = {};
      if (pd.type === 'damage') { pl.first = rnd(pd.amount + 1); if (rnd(3) === 0) pl.convert = true; }
      else if (pd.type === 'choice') pl.option = rnd(pd.options.length);
      else if (pd.type === 'rotate') pl.rot = pd.options[rnd(pd.options.length)];
      else if (pd.type === 'pickRoom') pl.room = pd.rooms[rnd(pd.rooms.length)];
      else if (pd.type === 'steal') { const opts = [null, ...G.players[pd.target].cards.map((x) => x.id), ...(pd.extras ?? []).map((e) => 'x:' + e.id)]; pl.card = opts[rnd(opts.length)]; }
      else if (pd.type === 'preRoll' || pd.type === 'postRoll') { const o = [undefined, ...pd.options]; pl.choice = o[rnd(o.length)]; pl.value = 1 + rnd(3); pl.die = 0; }
      if (pd.type === 'roll') return rnd(4) === 0 ? { pid: ids[rnd(n)], move: 'roll', args: [] } : { pid: pd.player, move: rnd(2) ? 'roll' : 'resolve', args: [pl] };
      return { pid: pd.player, move: 'resolve', args: [pl] };
    }
    const pid = G.turn.player;
    if (G.turn.part === 'monsters') {
      const opts: { pid: string; move: string; args: unknown[] }[] = [{ pid, move: 'endTurn', args: [] }];
      for (const m of G.monsters) {
        for (const r of Object.keys(G.rooms)) if (rnd(6) === 0) opts.push({ pid, move: 'monsterMove', args: [m.id, r] });
        for (const o of ids) if (G.players[o].room === m.room) opts.push({ pid, move: 'monsterAttack', args: [m.id, o] });
      }
      for (const a of R.monsterActions(c(), pid)) opts.push({ pid, move: 'act', args: [a.id, a.args ?? {}] });
      return opts[rnd(opts.length)];
    }
    const opts: { pid: string; move: string; args: unknown[] }[] = [{ pid, move: 'endTurn', args: [] }];
    for (const a of R.availableActions(c(), pid)) {
      if (a.id === 'endTurn') continue;
      if (a.id === 'manual') { if (rnd(8) === 0) { const tr = ['might', 'speed', 'sanity', 'knowledge'][rnd(4)]; opts.push({ pid, move: 'act', args: ['manual', { trait: tr, delta: rnd(2) ? 1 : -1, reason: 'fuzz' }] }); } continue; }
      opts.push({ pid, move: 'act', args: [a.id, a.args ?? {}] });
    }
    for (const o of R.movementOptions(c(), pid)) opts.push({ pid, move: 'move', args: [o.room ? { room: o.room } : { dir: o.dir }] });
    return opts[rnd(opts.length)];
  }

  try {
    while (steps < maxSteps) {
      if (G.phase === 'over') { ended = 'over'; break; }
      let mv: { pid: string; move: string; args: unknown[] } | null = null; let isChaos = false;
      if (G.phase !== 'select' && brng.d6() <= 6 * chaos) { mv = randomMove(); isChaos = !!mv; }
      if (!mv) mv = decide(G, mem, steps + rnd(97));
      if (!mv) { ended = 'nomove'; issue('bot found no move'); break; }
      if (isChaos) chaosN++;
      const before = JSON.stringify({ ...G, lastError: undefined }); const actor = G.players[mv.pid];
      const pd0 = G.pending[0]; const isPress = pd0?.type === 'roll' && pd0.player === mv.pid && (mv.move === 'roll' || mv.move === 'resolve'); const seq0 = G.lastRolls?.seq ?? 0;
      const wasDead = actor?.dead; const ownsTurn = G.turn.player === mv.pid || G.pending[0]?.player === mv.pid;
      call(mv.pid, mv.move, mv.args); steps++; lastMoves.push(`${isChaos ? 'C' : 'B'} p${mv.pid} ${mv.move} ${JSON.stringify(mv.args).slice(0, 70)} → ${(G as Any).lastError?.text ?? 'ok'}`); if (lastMoves.length > 8) lastMoves.shift();
      const le = (G as Any).lastError;
      const after = JSON.stringify({ ...G, lastError: undefined });
      if (le && after !== before) issue(`rejected move mutated state: ${mv.move} ${JSON.stringify(mv.args).slice(0, 80)} → "${le.text}"`);
      if (le || after === before) rejected++;
      if (!le && after !== before && G.phase !== 'select') {
        if (wasDead && !(mv.move === 'resolve' || mv.move === 'roll' || mv.move === 'endTurn' || (mv.move === 'act' && mv.args[0] === 'manual') || (G.turn.part === 'monsters' && mv.pid === G.haunt?.traitor && ['monsterMove', 'monsterAttack', 'act'].includes(mv.move)))) issue(`dead player acted: ${mv.move} ${JSON.stringify(mv.args).slice(0, 60)}`);
        if (!ownsTurn && !(mv.move === 'act' && mv.args[0] === 'manual')) issue(`non-turn player acted: ${mv.move}`);
      }
      if (isPress && !le) presses++;
      if ((G.lastRolls?.seq ?? 0) !== seq0 && !isPress) issue(`dice rolled without a "Đổ xúc xắc" press: ${mv.move} ${JSON.stringify(mv.args).slice(0, 60)} (${G.lastRolls?.items.map((i) => i.label).join(', ')})`);
      if (G.pending[0]?.type === 'roll') { const rp = G.players[G.pending[0].player]; if (!rp || (rp.dead && rp.id !== G.haunt?.traitor)) issue(`roll button for a dead/unknown player: ${G.pending[0].player} (${G.pending[0].label})`); }
      if (G.rollGate) for (const id of ids) { const v = (Betrayal.playerView as Any)({ G, playerID: id }); if (id !== G.rollGate.actor && v.rollGate?.args?.length) issue('rollGate args leaked to another player'); }
      if (G.phase === 'haunt' && hauntAt < 0) hauntAt = steps;
      invariants(`${mv.move} ${JSON.stringify(mv.args).slice(0, 60)}`);
      const s = sig(); if (s === lastSig) { idle++; if (idle > 400) { ended = 'stuck'; issue(`no progress for 400 moves; lastError=${JSON.stringify((G as Any).lastError)} pending=${JSON.stringify(G.pending[0] ?? null).slice(0, 160)} turn=${G.turn.player}/${G.turn.part} moves: ${lastMoves.join(' ; ')}`); break; } } else { idle = 0; lastSig = s; }
    }
  } catch (e) { issue(`EXCEPTION ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`); ended = 'stuck'; }
  if (process.env.DUMP) console.log(G.log.slice(-30).map((l) => l.text).join('\n'));
  if (process.env.DUMP) console.log(JSON.stringify({ omensDrawn: G.omensDrawn, omenDeck: G.decks.omen, omenDisc: G.discards.omen, rooms: Object.keys(G.rooms).length, stack: G.roomStack.length, disc: G.roomDiscard.length, held: Object.values(G.players).map((p) => p.cards.map((x) => x.id)), open: Object.keys(G.rooms).filter((r) => openDoorways(G, r).length).map((r) => `${r}:${G.rooms[r].floor}:${openDoorways(G, r)}`), left: [...G.roomStack, ...G.roomDiscard].map((t) => t), haunt: G.log.filter((l) => /Haunt roll/.test(l.text)).slice(-5).map((l) => l.text) }));
  const alive = Object.values(G.players).filter((p) => !p.dead).map((p) => `${p.id}${p.isTraitor ? 'T' : ''}@${p.room}`).join(' ');
  const st = G.haunt && HAUNTS[G.haunt.number].status ? JSON.stringify(HAUNTS[G.haunt.number].status!(G)) : '';
  (globalThis as any).__lastG = G; return { seed, n, haunt, steps, presses, phase: G.phase, winner: G.haunt?.winner, turns: G.turnCounter, hauntAt, issues, ended, rejected, chaos: chaosN, tail: `alive[${alive}] monsters=${G.monsters.length} ${st} | last: ${lastMoves.slice(-3).join(' ; ')}` };
}

if (process.argv[1]?.endsWith('fuzz.ts')) {
  const h = Number(process.argv[2]); const games = Number(process.argv[3] ?? 50); const first = Number(process.argv[4] ?? 1); const chaos = Number(process.argv[5] ?? 0.25);
  const sum: Record<string, number> = {}; const allIssues = new Map<string, number[]>(); const t0 = Date.now();
  for (let s = first; s < first + games; s++) {
    const n = 3 + (s % 4);
    const r = fuzzGame(h, s, n, chaos);
    sum[r.ended] = (sum[r.ended] ?? 0) + 1; sum.rollPresses = (sum.rollPresses ?? 0) + r.presses; if (r.winner) sum[r.winner] = (sum[r.winner] ?? 0) + 1;
    for (const i of r.issues) { const k = i.replace(/\(.*\)$/, '').trim(); if (!allIssues.has(k)) allIssues.set(k, []); allIssues.get(k)!.push(s); }
    if (r.ended === 'limit') console.log(`  LIMIT seed ${s} n=${n} turns=${r.turns} hauntAt=${r.hauntAt} :: ${r.tail}`);
    if (process.env.V) console.log(JSON.stringify({ s, n, steps: r.steps, ended: r.ended, winner: r.winner, turns: r.turns, hauntAt: r.hauntAt, issues: r.issues.length }));
  }
  console.log(`HAUNT #${h}: ${games} games (${((Date.now() - t0) / 1000).toFixed(0)}s)`, JSON.stringify(sum));
  for (const [k, ss] of allIssues) console.log(`  ISSUE x${ss.length} seeds ${ss.slice(0, 6).join(',')}: ${k}`);
}
