// boardgame.io game definition. All randomness comes from boardgame.io's server-side PRNG (ctx.random),
// so dice are server-authoritative in online play.
import type { Game, Ctx as BgCtx } from 'boardgame.io';
import { INVALID_MOVE, ActivePlayers } from 'boardgame.io/core';
import type { GState, Dir } from './types';
import type { Ctx, Rng, RollMeta } from './core';
import { pname, sum } from './core';
import * as R from './rules';
import { HAUNTS } from '../haunts';

type MoveArgs = { G: GState; ctx: BgCtx; playerID: string; random: { D6(): number; Shuffle<T>(a: T[]): T[] }; events: { endTurn(arg?: { next: string }): void }; __rec?: RollRec[] };
type RollRec = { dice: number[]; meta?: RollMeta };
// gate: dice rolls wait for the roller's "Đổ xúc xắc" press (explicit, visible dice). __rec records every roll of the move for the dice overlay.
const mk = (a: MoveArgs): Ctx => ({ G: a.G, gate: true, rng: { d6: () => a.random.D6(), shuffle: <T,>(x: T[]) => a.random.Shuffle(x), onRoll: a.__rec ? (r) => a.__rec!.push(r) : undefined } as Rng });
// Rule violations are reported back through G.lastError (shown in the UI) instead of INVALID_MOVE, which would discard the message.
// Every engine entry point validates before mutating, so an error return leaves the game state unchanged apart from lastError.
const err = (G: GState, pid: string, e: string | null) => { const g = G as unknown as { lastError?: unknown }; if (e) g.lastError = { player: pid, text: e, t: G.logSeq ?? 0 }; else delete g.lastError; return undefined; };

function passTurn(a: MoveArgs, res: { next: string; part: 'explorer' | 'monsters' }) {
  const c = mk(a);
  if (a.G.phase === 'over') return; // game ended during this move: no new turn
  // (next may be the same player: the last living explorer takes consecutive turns — the turn still restarts)
  R.beginTurn(c, res.next, res.part);
  if (res.next !== a.ctx.currentPlayer) a.events.endTurn({ next: res.next });
}
function afterPending(a: MoveArgs) {
  const j = (a.G as unknown as { __jump?: { next: string; part: 'explorer' | 'monsters' } }).__jump;
  if (j) { delete (a.G as unknown as { __jump?: unknown }).__jump; passTurn(a, j); }
}

/** The rule engine entry points (unchanged rules); wrapped below by the explicit-dice gate. */
const IMPL: Record<string, (a: MoveArgs, ...args: any[]) => unknown> = {
  selectCharacter: (a, charId: string, name?: string) => err(a.G, a.playerID, R.selectCharacter(mk(a), a.playerID, charId, name)),
  startGame: (a) => {
    const G = a.G; if (G.phase !== 'select') return INVALID_MOVE; err(G, a.playerID, null);
    if (Object.values(G.players).some((p) => !p.character)) return err(G, a.playerID, 'Mọi người chơi phải chọn nhân vật trước');
    const d = new Date(); R.startExplore(mk(a), [d.getMonth() + 1, d.getDate()]);
    if (G.turn.player !== a.ctx.currentPlayer) a.events.endTurn({ next: G.turn.player });
  },
  move: (a, target: { room?: string; dir?: Dir }) => err(a.G, a.playerID, R.moveExplorer(mk(a), a.playerID, target)),
  act: (a, id: string, args?: Record<string, unknown>) => err(a.G, a.playerID, a.G.turn.player === a.playerID || id === 'manual' ? R.doAction(mk(a), a.playerID, id, args ?? {}) : 'Không phải lượt của bạn'),
  resolve: (a, payload: Record<string, unknown>) => { const e = err(a.G, a.playerID, R.resolvePending(mk(a), a.playerID, payload ?? {})); if (!e) afterPending(a); return e; },
  monsterMove: (a, mid: string, room: string, teleport?: boolean) => err(a.G, a.playerID, a.G.haunt?.traitor === a.playerID ? R.monsterMove(mk(a), mid, room, teleport) : 'Chỉ kẻ phản bội điều khiển quái vật'),
  monsterAttack: (a, mid: string, pid: string) => err(a.G, a.playerID, a.G.haunt?.traitor === a.playerID ? R.monsterAttack(mk(a), mid, pid) : 'Chỉ kẻ phản bội điều khiển quái vật'),
  endTurn: (a) => {
    const pend0 = a.G.pending.length; const res = R.endTurn(mk(a), a.playerID);
    // a string together with a NEW pending decision = end-of-turn effects to resolve first (progress, not an error)
    if (typeof res === 'string') return err(a.G, a.playerID, pend0 === 0 && a.G.pending.length > 0 ? null : res);
    err(a.G, a.playerID, null); passTurn(a, res);
  },
};

/** Runs a move for real and records its dice for the overlay shown to every client. */
function runReal(name: string, a: MoveArgs, args: unknown[], actor: string) {
  const G = a.G; const rec: RollRec[] = []; const from = G.logSeq ?? 0;
  const ra: MoveArgs = { G: a.G, ctx: a.ctx, playerID: actor, random: a.random, events: a.events, __rec: rec };
  const out = IMPL[name](ra, ...args);
  if (rec.length) G.lastRolls = { seq: (G.lastRolls?.seq ?? 0) + 1, by: a.playerID, items: rec.map((r) => ({ who: r.meta?.who ?? actor, label: r.meta?.label ?? 'Đổ xúc xắc', reason: r.meta?.reason, dice: r.dice, total: sum(r.dice) })), logFrom: from, logTo: G.logSeq ?? 0 };
  return out;
}
/** Plays the move on a throw-away copy with dummy dice to find out whether (and who) it would roll. */
function dryRun(name: string, a: MoveArgs, args: unknown[]): RollRec[] {
  const rec: RollRec[] = [];
  try {
    const G2 = JSON.parse(JSON.stringify(a.G)) as GState;
    IMPL[name]({ G: G2, ctx: a.ctx, playerID: a.playerID, random: { D6: () => 3, Shuffle: <T,>(x: T[]) => [...x] }, events: { endTurn: () => {} }, __rec: rec }, ...args);
  } catch { return []; }
  return rec;
}
/** The roller pressed "Đổ xúc xắc". */
function pressRoll(a: MoveArgs) {
  const G = a.G; const pd = G.pending[0];
  if (!pd || pd.type !== 'roll') return err(G, a.playerID, 'Không có gì để đổ');
  if (pd.player !== a.playerID) return err(G, a.playerID, `Đang chờ ${pname(G, pd.player)} đổ xúc xắc`);
  if (pd.src === 'queue') return runReal('resolve', a, [{}], a.playerID);
  G.pending.shift(); err(G, a.playerID, null);
  if (G.pending[0]?.type === 'roll' && G.pending[0].src === 'gate') return; // the next roller (e.g. the defender) presses too
  const g = G.rollGate; delete G.rollGate; if (!g) return;
  return runReal(g.move, a, g.args, g.actor);
}
function gated(name: string) {
  return (a: MoveArgs, ...args: unknown[]): any => {
    const G = a.G; const pd = G.pending[0];
    if (pd?.type === 'roll') return name === 'resolve' || name === 'roll' ? pressRoll(a) : err(G, a.playerID, `Đang chờ ${pname(G, pd.player)} đổ xúc xắc`);
    if (name === 'roll') return err(G, a.playerID, 'Không có gì để đổ');
    if (G.phase === 'explore' || G.phase === 'haunt') {
      const rolls = dryRun(name, a, args);
      if (rolls.length) { // pause: every roller presses "Đổ xúc xắc" in order, then the move runs with the real server dice
        const order: string[] = []; const by: Record<string, RollRec[]> = {};
        for (const r of rolls) { const w = r.meta?.who ?? a.playerID; if (!by[w]) { by[w] = []; order.push(w); } by[w].push(r); }
        G.rollGate = { move: name, args, actor: a.playerID };
        G.pending.unshift(...order.map((w) => ({ type: 'roll' as const, player: w, label: [...new Set(by[w].map((r) => r.meta?.label ?? 'Đổ xúc xắc'))].slice(0, 3).join(' · '), reason: by[w][0].meta?.reason, src: 'gate' as const })));
        return err(G, a.playerID, null);
      }
    }
    return runReal(name, a, args, a.playerID);
  };
}

export const Betrayal: Game<GState> = {
  name: 'betrayal',
  minPlayers: 3, maxPlayers: 6,
  setup: ({ ctx }, setupData?: { forceHaunt?: number }) => R.initialState(ctx.playOrder, {}, { forceHaunt: setupData?.forceHaunt }),
  turn: { activePlayers: ActivePlayers.ALL },
  moves: {
    selectCharacter: { move: gated('selectCharacter'), client: false },
    startGame: { move: gated('startGame'), client: false },
    move: { move: gated('move'), client: false },
    act: { move: gated('act'), client: false },
    // redact: the payload (e.g. a secretly chosen room) is not sent to the other players in the move log.
    resolve: { move: gated('resolve'), client: false, redact: true },
    /** "Đổ xúc xắc": the dice are rolled on the server (boardgame.io random), never by the client. */
    roll: { move: gated('roll'), client: false },
    monsterMove: { move: gated('monsterMove'), client: false },
    monsterAttack: { move: gated('monsterAttack'), client: false },
    endTurn: { move: gated('endTurn'), client: false },
  },
  endIf: ({ G }) => (G.phase === 'over' ? { winner: G.haunt?.winner ?? null } : undefined),
  /** Hidden information: stack orders are never sent to clients; private log lines only to their owner. */
  playerView: ({ G, playerID }) => ({
    ...G,
    // haunt secrets (e.g. Haunt #40's burial room) only go to the side allowed to know them
    haunt: G.haunt && HAUNTS[G.haunt.number]?.playerView ? { ...G.haunt, data: HAUNTS[G.haunt.number].playerView!(G.haunt.data, G, playerID) } : G.haunt,
    // Order is secret; the *set* of remaining tiles/cards is public knowledge (every placed tile and drawn card is face up),
    // so clients get the contents sorted alphabetically.
    roomStack: [...G.roomStack].sort(), roomDiscard: [...G.roomDiscard].sort(),
    decks: { event: [...G.decks.event].sort(), item: [...G.decks.item].sort(), omen: [...G.decks.omen].sort() },
    log: G.log.filter((l) => !l.private || (playerID != null && l.private.includes(playerID))),
    queue: [],
    // a gated move's arguments (e.g. a secret room) stay with the player who made it
    rollGate: G.rollGate && G.rollGate.actor !== playerID ? { ...G.rollGate, args: [] } : G.rollGate,
  }),
};
