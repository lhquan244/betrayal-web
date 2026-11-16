// Regression tests for bugs found by the engine fuzzer (scripts/fuzz.ts) and the rule review of 2026-11-15.
import { describe, it, expect } from 'vitest';
import { initialState, selectCharacter, startExplore, startHaunt, resolvePending, beginTurn, moveExplorer, movementOptions, canMove, doAction, enterRoom } from '../src/engine/rules';
import { seededRng, type Ctx } from '../src/engine/core';
import { autoPlace, openDoorways } from '../src/engine/house';
import { CHARACTERS } from '../src/data/characters';
import { Betrayal } from '../src/engine/game';
import type { GState } from '../src/engine/types';
import { fuzzGame } from '../scripts/fuzz';
import { HAUNTS, TT_POLICY } from '../src/haunts';

function game(n: number, seed = 7) {
  const ids = Array.from({ length: n }, (_, i) => String(i));
  const G = initialState(ids); const c: Ctx = { G, rng: seededRng(seed) };
  const cols = new Set<string>(); for (const id of ids) { const ch = CHARACTERS.find((x) => !cols.has(x.color))!; cols.add(ch.color); selectCharacter(c, id, ch.id); }
  startExplore(c, [1, 1]); return c;
}
const resolveAll = (c: Ctx) => {
  for (let i = 0; i < 80 && c.G.pending.length; i++) { const pd = c.G.pending[0];
    const payload = pd.type === 'pickRoom' ? { room: pd.rooms[0] } : pd.type === 'damage' ? { first: pd.amount } : pd.type === 'choice' ? { option: 0 } : pd.type === 'rotate' ? { rot: pd.options[0] } : {};
    const e = resolvePending(c, pd.player, payload); if (e) throw new Error(e); }
};
/** Calls a boardgame.io move through the real wrapper (game.ts), like the server does. */
function wrap(G: GState, seed = 3) {
  const rng = seededRng(seed); const ctx = { currentPlayer: G.turn.player };
  return (pid: string, move: string, ...args: unknown[]) => {
    const m = (Betrayal.moves as Record<string, { move: (...a: unknown[]) => unknown }>)[move];
    return m.move({ G, ctx, playerID: pid, random: { D6: () => rng.d6(), Shuffle: <T,>(a: T[]) => rng.shuffle(a) }, events: { endTurn: (a?: { next: string }) => { if (a?.next) ctx.currentPlayer = a.next; } } }, ...args);
  };
}

describe('regressions (fuzzer)', () => {
  it('a player who died during their own turn cannot move any more (only end the turn)', () => {
    const c = game(4); startHaunt(c, 38, '0', { card: 'skull', room: 'foyer' }); resolveAll(c);
    const hero = c.G.order.find((o) => !c.G.players[o].isTraitor)!; beginTurn(c, hero, 'explorer');
    c.G.players[hero].dead = true;
    expect(movementOptions(c, hero)).toEqual([]);
    expect(canMove(c, hero, 1)).toBeTruthy();
    expect(moveExplorer(c, hero, { room: 'foyer' })).toBeTruthy();
  });

  it('the last living explorer takes consecutive turns: ending the turn restarts it (no frozen turn)', () => {
    const c = game(3); const G = c.G; startHaunt(c, 40, '0', { card: 'spirit-board', room: 'foyer' }); resolveAll(c);
    const tr = G.haunt!.traitor!; const lone = G.order.find((o) => o !== tr)!;
    for (const o of G.order) if (o !== lone) G.players[o].dead = true;
    beginTurn(c, lone, 'explorer'); G.turn.spent = 2; const t0 = G.turnCounter;
    wrap(G)(lone, 'endTurn');
    expect(G.turn.player).toBe(lone); expect(G.turn.spent).toBe(0); expect(G.turnCounter).toBeGreaterThan(t0);
  });

  it('Haunt #40 setup only places extra rooms in the basement (a tile never ends up both placed and in the discard)', () => {
    const c = game(3); const G = c.G; const t = G.roomStack.find((x) => x === 'storeroom' || x === 'mystic-elevator' || x === 'vault') ?? G.roomStack[0];
    const doors = G.rooms['basement-landing'].doors; G.rooms['basement-landing'].doors = [];
    expect(autoPlace(G, t, 'basement', true)).toBe(null); expect(G.rooms[t]).toBeUndefined();
    G.rooms['basement-landing'].doors = doors;
    startHaunt(c, 40, '0', { card: 'spirit-board', room: 'foyer' });
    for (const r of Object.values(G.rooms)) expect(G.roomStack.includes(r.id) || G.roomDiscard.includes(r.id)).toBe(false);
  });

  it('Dynamite with no door-connected room: no empty room choice that would lock the game', () => {
    const c = game(4); const G = c.G; startHaunt(c, 38, '0', { card: 'skull', room: 'foyer' }); resolveAll(c);
    const hero = G.order.find((o) => !G.players[o].isTraitor)!; G.players[hero].room = 'basement-landing';
    G.players[hero].cards.push({ kind: 'item', id: 'dynamite' }); beginTurn(c, hero, 'explorer');
    expect(doAction(c, hero, 'useCard', { card: 'dynamite' })).toBe(null);
    expect(G.pending.some((p) => p.type === 'pickRoom' && !p.rooms.length)).toBe(false);
  });

  it('an explorer killed by picking up a companion (Madman: −1 Sanity) does not pick up the next one', () => {
    const c = game(4); const G = c.G; startHaunt(c, 38, '0', { card: 'skull', room: 'foyer' }); resolveAll(c);
    const hero = G.order.find((o) => !G.players[o].isTraitor)!; const p = G.players[hero];
    p.idx.sanity = 0; p.room = 'foyer';
    G.tokens.push({ id: 'comp-madman', kind: 'companion', room: 'foyer', data: { card: 'madman' } }, { id: 'comp-girl', kind: 'companion', room: 'foyer', data: { card: 'girl' } });
    enterRoom(c, hero, 'foyer', false);
    expect(p.dead).toBe(true); expect(p.cards).toEqual([]);
    expect(G.tokens.some((t) => t.kind === 'companion' && t.data?.card === 'girl')).toBe(true);
  });

  it('ending a turn that triggers an end-of-turn effect is not reported as an error', () => {
    const c = game(3); const G = c.G; const pid = G.turn.player;
    G.rooms['furnace-room'] = { ...G.rooms['foyer'], id: 'furnace-room', x: 99, y: 99 }; G.players[pid].room = 'furnace-room';
    wrap(G)(pid, 'endTurn');
    expect(G.pending[0]?.type).toBe('damage'); expect((G as unknown as { lastError?: unknown }).lastError).toBeUndefined();
  });
});

describe('manual adjustment outside play', () => {
  it('is rejected (not a crash) during character select and after the game ended', () => {
    const G = initialState(['0', '1', '2']); const c: Ctx = { G, rng: seededRng(1) };
    expect(doAction(c, '0', 'manual', { trait: 'might', delta: 1 })).toBeTruthy();
    const c2 = game(3); c2.G.phase = 'over'; expect(doAction(c2, '0', 'manual', { trait: 'might', delta: 1 })).toBeTruthy();
  });
});

describe('Haunt #26: heroes cannot enter the Pentagram Chamber, even by discovering it', () => {
  it('the tile is placed but the hero stays in the old room and draws no card', () => {
    const c = game(4); const G = c.G; startHaunt(c, 26, '0', { card: 'skull', room: 'foyer' }); resolveAll(c);
    const hero = G.order.find((o) => !G.players[o].isTraitor)!; G.players[hero].room = 'basement-landing';
    beginTurn(c, hero, 'explorer');
    G.roomStack = ['pentagram-chamber', ...G.roomStack.filter((x) => x !== 'pentagram-chamber')]; G.roomDiscard = G.roomDiscard.filter((x) => x !== 'pentagram-chamber');
    const dir = openDoorways(G, 'basement-landing')[0]; const cards0 = G.players[hero].cards.length;
    expect(moveExplorer(c, hero, { dir })).toBe(null); resolveAll(c);
    expect(G.rooms['pentagram-chamber']).toBeTruthy();
    expect(G.players[hero].room).toBe('basement-landing'); expect(G.players[hero].cards.length).toBe(cards0);
  });
});

describe('engine fuzz smoke (invariants after every move, random + bot moves)', () => {
  for (const h of [1, 4, 26, 37, 38, 40]) it(`Haunt #${h}: 12 games, 3–6 players, no invariant violations`, () => {
    for (let s = 1; s <= 12; s++) { const r = fuzzGame(h, 900 + s, 3 + (s % 4), 0.3); expect(r.issues, `seed ${900 + s}`).toEqual([]); expect(r.ended).not.toBe('stuck'); }
  });
});

describe("Traitor's Tome policy", () => {
  it('#1: with neither Ring nor Holy Symbol in play, the traitor chooses which one to take from the omen stack (TT p.15 "draw either card")', () => {
    const c = game(3); const G = c.G; startHaunt(c, 1, '0', { card: 'girl', room: 'foyer' }); resolveAll(c);
    const tr = G.haunt!.traitor!; for (const p of Object.values(G.players)) p.cards = p.cards.filter((x) => x.id !== 'ring' && x.id !== 'holy-symbol');
    for (const id of ['ring', 'holy-symbol']) if (!G.decks.omen.includes(id)) G.decks.omen.push(id);
    const r = HAUNTS[1].replaceDraw!(c, tr, 'omen'); expect(r).toEqual({ choose: ['ring', 'holy-symbol'] });
  });
  it('#37: Death always plays the hero with the highest Knowledge in its room (TT p.33), not a hero of the players\' choice', () => {
    const c = game(4); const G = c.G; startHaunt(c, 37, '0', { card: 'book', room: 'foyer' }); resolveAll(c);
    const d = G.haunt!.data as { deathRoom: string; placed: boolean; opponent?: string };
    const hs = G.order.filter((o) => !G.players[o].isTraitor && !G.players[o].dead).slice(0, 2);
    for (const o of hs) G.players[o].room = d.deathRoom;
    G.players[hs[0]].idx.knowledge = 1; G.players[hs[1]].idx.knowledge = 6;
    HAUNTS[37].onMonsterTurnStart!(c);
    expect(d.opponent).toBe(hs[1]); expect(G.pending.some((p) => p.type === 'choice')).toBe(false);
  });
  it('every haunt panel shows the TT policy; #37 lists its TT≠SoS conflict', () => {
    expect(TT_POLICY).toMatch(/Traitor's Tome/); expect(HAUNTS[37].ttConflicts!.length).toBe(1);
  });
});

describe('explicit dice: every roll waits for the roller to press "Đổ xúc xắc" (no rule change)', () => {
  it('the Haunt roll after drawing an omen pauses for the active player; wrong player is rejected; then the overlay data is set', () => {
    const c = game(3); const G = c.G; const pid = G.turn.player; const other = G.order.find((o) => o !== pid)!;
    G.turn.drewOmen = true; G.omensDrawn = 1; const m = wrap(G);
    m(pid, 'endTurn');
    expect(G.pending[0]).toMatchObject({ type: 'roll', player: pid, src: 'gate' });
    expect(G.log.some((l) => l.text.includes('Haunt roll'))).toBe(false); expect(G.turn.player).toBe(pid);
    m(other, 'roll');
    expect((G as unknown as { lastError?: { text: string } }).lastError?.text).toMatch(/Đang chờ/); expect(G.pending[0]?.type).toBe('roll');
    m(pid, 'roll');
    expect(G.pending.some((p) => p.type === 'roll')).toBe(false); expect(G.rollGate).toBeUndefined();
    expect(G.log.some((l) => l.text.includes('Haunt roll'))).toBe(true);
    expect(G.lastRolls!.items[0]).toMatchObject({ who: pid, label: 'Haunt roll' }); expect(G.lastRolls!.items[0].dice).toHaveLength(6);
    expect(G.lastRolls!.items[0].reason).toMatch(/6 xúc xắc/);
  });

  it('combat: the attacker presses, then the defender presses; no dice before both', () => {
    const c = game(3); const G = c.G; startHaunt(c, 40, '0', { card: 'spirit-board', room: 'foyer' }); resolveAll(c);
    const tr = G.haunt!.traitor!; const hero = G.order.find((o) => o !== tr)!;
    G.players[hero].room = G.players[tr].room; beginTurn(c, hero, 'explorer');
    const seq0 = G.lastRolls?.seq ?? 0; const m = wrap(G);
    m(hero, 'act', 'attack', { target: tr, trait: 'might' });
    expect(G.pending[0]).toMatchObject({ type: 'roll', player: hero });
    m(hero, 'roll');
    expect(G.pending[0]).toMatchObject({ type: 'roll', player: tr }); expect(G.lastRolls?.seq ?? 0).toBe(seq0);
    m(tr, 'roll');
    expect(G.pending.some((p) => p.type === 'roll')).toBe(false);
    const items = G.lastRolls!.items; expect(items.map((i) => i.who)).toEqual([hero, tr]);
    for (const i of items) { expect(i.dice.length).toBeGreaterThan(0); expect(i.total).toBe(i.dice.reduce((a, b) => a + b, 0)); expect(i.reason).toMatch(/xúc xắc/); }
  });

  it("a gated move's arguments are hidden from other players in playerView", () => {
    const c = game(3); const G = c.G; G.rollGate = { move: 'move', args: [{ room: 'secret' }], actor: '0' };
    const pv = (pid: string) => (Betrayal.playerView as (a: unknown) => GState)({ G, ctx: {}, playerID: pid }).rollGate!;
    expect(pv('0').args).toEqual([{ room: 'secret' }]); expect(pv('1').args).toEqual([]);
  });
});
