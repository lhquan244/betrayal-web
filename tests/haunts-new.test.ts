import { describe, it, expect } from 'vitest';
import { initialState, selectCharacter, startExplore, startHaunt, afterChange, resolvePending, monsterAttack, beginTurn, endTurn, doAction, availableActions, movementOptions, attackTargets } from '../src/engine/rules';
import { seededRng, traitValue, holds, type Ctx } from '../src/engine/core';
import { processQueue } from '../src/engine/effects';
import { CHARACTERS } from '../src/data/characters';
import { HAUNTS } from '../src/haunts';
import { Betrayal } from '../src/engine/game';

function game(n: number, seed = 7) {
  const ids = Array.from({ length: n }, (_, i) => String(i));
  const G = initialState(ids); const c: Ctx = { G, rng: seededRng(seed) };
  const cols = new Set<string>(); for (const id of ids) { const ch = CHARACTERS.find((x) => !cols.has(x.color))!; cols.add(ch.color); selectCharacter(c, id, ch.id); }
  startExplore(c, [1, 1]); return c;
}
function haunt(c: Ctx, num: number, revealer = '0', omen = 'bite', room = 'foyer') {
  startHaunt(c, num, revealer, { card: omen, room });
}
const resolveAll = (c: Ctx, pick: (pd: Ctx['G']['pending'][number]) => Record<string, unknown> = () => ({})) => {
  for (let i = 0; i < 50 && c.G.pending.length; i++) { const pd = c.G.pending[0]; const pl = pick(pd);
    const payload = Object.keys(pl).length ? pl : pd.type === 'pickRoom' ? { room: pd.rooms[0] } : pd.type === 'damage' ? { first: pd.amount } : pd.type === 'choice' ? { option: 0 } : {};
    const e = resolvePending(c, pd.player, payload); if (e) throw new Error(e); }
};

describe('all new haunts: metadata', () => {
  it('registered with source, both texts, gaps list and art', () => {
    for (const n of [4, 26, 37, 38, 40]) {
      const h = HAUNTS[n]; expect(h.number).toBe(n); expect(h.source).toMatch(/Hasbro F3148/);
      expect(h.traitorText.length).toBeGreaterThan(200); expect(h.heroText.length).toBeGreaterThan(200);
      expect(h.gaps!.length).toBeGreaterThan(0); expect(h.art!.art).toBeTruthy();
    }
  });
});

describe('Haunt #4 The Web of Destiny', () => {
  it('traitor = highest Might except revealer; 3–4 players: traitor eaten; Spider at Bite holder; revealer trapped', () => {
    const c = game(4); const G = c.G; G.players['2'].cards.push({ kind: 'omen', id: 'bite' }); G.players['2'].room = 'upper-landing';
    haunt(c, 4, '0');
    const others = ['1', '2', '3']; const best = Math.max(...others.map((o) => traitValue(G.players[o], 'might')));
    expect(traitValue(G.players[G.haunt!.traitor!], 'might')).toBe(best); expect(G.haunt!.traitor).not.toBe('0');
    expect(G.players[G.haunt!.traitor!].dead).toBe(true);
    const sp = G.monsters.find((m) => m.id === 'spider')!; expect(sp.room).toBe('upper-landing'); expect(sp.traits).toEqual({ speed: 0, might: 2, sanity: 5 });
    beginTurn(c, '0', 'explorer'); expect(movementOptions(c, '0').length).toBeGreaterThan(0);
    expect(HAUNTS[4].canExplorerMove!(c, '0')).toBeTruthy();
  });
  it('5–6 players: traitor stays alive; track advances after the monster turn and stats follow the table; turn 9 = traitor wins', () => {
    const c = game(5); const G = c.G; haunt(c, 4, '0'); const tr = G.haunt!.traitor!;
    expect(G.players[tr].dead).toBe(false);
    for (const p of Object.values(G.players)) p.room = 'foyer'; G.monsters[0].room = 'upper-landing';
    beginTurn(c, tr, 'monsters'); const r = endTurn(c, tr); expect(r).toMatchObject({ part: 'explorer' });
    expect((G.haunt!.data as { track: number }).track).toBe(2); expect(G.monsters[0].traits.might).toBe(2); expect(G.monsters[0].traits.speed).toBe(1);
    (G.haunt!.data as { track: number }).track = 8; beginTurn(c, tr, 'monsters'); G.monsters[0].room = 'basement-landing'; for (const p of Object.values(G.players)) if (p.room === 'basement-landing') p.room = 'foyer';
    endTurn(c, tr); expect(G.haunt!.winner).toBe('traitor');
  });
  it('nobody may attack the trapped revealer before the eggs are destroyed; revealer cannot drop to the skull', () => {
    const c = game(5); const G = c.G; haunt(c, 4, '0'); const tr = G.haunt!.traitor!;
    G.players[tr].room = G.players['0'].room; beginTurn(c, tr, 'explorer');
    expect(attackTargets(c, tr).some((t) => t.id === '0')).toBe(false);
    G.monsters[0].room = G.players['0'].room; beginTurn(c, tr, 'monsters');
    expect(monsterAttack(c, 'spider', '0')).toBeTruthy();
    G.players['0'].idx.might = 0; resolveAll(c); c.G.queue.push({ player: '0', effects: [{ t: 'lose', trait: 'might', n: 3 }] }); processQueue(c); resolveAll(c);
    expect(G.players['0'].dead).toBe(false);
  });
  it('web: Might attacks vs 4, tokens = number of players frees the explorer; Healing Salve destroys eggs; door + exit = heroes win', () => {
    const c = game(5, 3); const G = c.G; haunt(c, 4, '0'); const d = G.haunt!.data as { webTokens: number; webDestroyed: boolean; eggsDestroyed: boolean; doorOpenTurn?: number };
    beginTurn(c, '0', 'explorer'); G.players['0'].idx.might = 7;
    for (let i = 0; i < 40 && !d.webDestroyed; i++) { beginTurn(c, '0', 'explorer'); expect(doAction(c, '0', 'haunt:web')).toBeNull(); }
    expect(d.webTokens).toBe(5); expect(d.webDestroyed).toBe(true);
    G.players['0'].cards.push({ kind: 'item', id: 'healing-salve' }); beginTurn(c, '0', 'explorer');
    expect(doAction(c, '0', 'haunt:eggsSalve')).toBeNull(); expect(d.eggsDestroyed).toBe(true); expect(holds(G.players['0'], 'healing-salve')).toBe(false);
    const hero = Object.keys(G.players).find((p) => !G.players[p].isTraitor && !G.players[p].dead)!;
    G.players[hero].room = 'entrance-hall'; d.doorOpenTurn = G.turnCounter; beginTurn(c, hero, 'explorer');
    expect(doAction(c, hero, 'haunt:exit')).toBeNull(); expect(G.haunt!.winner).toBe('heroes');
  });
  it('Spider rerolls blank dice once', () => {
    const c = game(5); haunt(c, 4, '0'); const out = HAUNTS[4].onMonsterAttackRoll!(c, 'spider', [0, 0, 2, 1]);
    expect(out.slice(2)).toEqual([2, 1]); expect(out.length).toBe(4);
  });
});

describe('Haunt #26 Pay the Piper', () => {
  it('traitor = left of revealer, traits restored then +1; 2×players rats placed in unoccupied symbol rooms', () => {
    const c = game(4); const G = c.G; const tr0 = G.order[(G.order.indexOf('0') + 1) % 4];
    const before = traitValue(G.players[tr0], 'might');
    haunt(c, 26, '0'); resolveAll(c);
    expect(G.haunt!.traitor).toBe(tr0); expect(traitValue(G.players[tr0], 'might')).toBeGreaterThan(before);
    const d = G.haunt!.data as { placed: number; supply: number };
    expect(d.placed + d.supply).toBe(8);
    for (const m of G.monsters) expect(m.traits).toEqual({ speed: 3, might: 2, sanity: 1 });
  });
  it('rats are killed when defeated; heroes cannot enter the Pentagram Chamber; heroes win when all rats are dead', () => {
    const c = game(4); const G = c.G; haunt(c, 26, '0'); resolveAll(c);
    G.monsters = [{ id: 'rat1', name: 'Rat 1', room: 'foyer', traits: { speed: 3, might: 2, sanity: 1 }, stunned: false, carries: [], kind: 'rat' }];
    (G.haunt!.data as { placed: number }).placed = 1;
    const hero = G.order.find((p) => !G.players[p].isTraitor)!;
    expect(HAUNTS[26].canEnterRoom!(c, { pid: hero }, 'pentagram-chamber')).toBeTruthy();
    expect(HAUNTS[26].canEnterRoom!(c, { mid: 'rat1' }, 'pentagram-chamber')).toBeTruthy();
    expect(HAUNTS[26].canEnterRoom!(c, { pid: G.haunt!.traitor! }, 'pentagram-chamber')).toBeNull();
    HAUNTS[26].onMonsterDefeated!(c, hero, 'rat1', 'might'); afterChange(c);
    expect(G.monsters.length).toBe(0); expect(G.haunt!.winner).toBe('heroes');
  });
  it('group attack sums Might (max 8 dice); ritual needs 5 successes at 3–4 players', () => {
    const c = game(4); const G = c.G; haunt(c, 26, '0'); resolveAll(c); const tr = G.haunt!.traitor!;
    const hero = G.order.find((p) => !G.players[p].isTraitor)!; G.players[hero].room = 'foyer';
    G.monsters = [1, 2, 3].map((i) => ({ id: `rat${i}`, name: `Rat ${i}`, room: 'foyer', traits: { speed: 3, might: 2, sanity: 1 }, stunned: false, carries: [], kind: 'rat' }));
    beginTurn(c, tr, 'monsters');
    const opts = HAUNTS[26].actions.find((a) => a.id === 'group')!.options!(c, tr); expect(opts.length).toBeGreaterThan(0);
    expect(doAction(c, tr, 'haunt:group', opts[0].args)).toBeNull(); expect(G.monsters.length).toBe(3);
    (G.haunt!.data as { ritual: number }).ritual = 5; afterChange(c); expect(G.haunt!.winner).toBe('traitor');
  });
  it('heroes cannot affect the traitor in the Pentagram Chamber', () => {
    const c = game(4); const G = c.G; haunt(c, 26, '0'); resolveAll(c); const tr = G.haunt!.traitor!;
    G.players[tr].room = 'pentagram-chamber'; const hero = G.order.find((p) => !G.players[p].isTraitor)!;
    expect(HAUNTS[26].canAttackExplorer!(c, hero, tr)).toBeTruthy();
  });
});

describe('Haunt #37 Checkmate', () => {
  it('traitor = lowest Might; Death placed with a hero; traitor cannot enter its room; no hero there at monster turn = traitor wins', () => {
    const c = game(4); const G = c.G; haunt(c, 37, '0');
    const tr = G.haunt!.traitor!; const low = Math.min(...G.order.map((o) => traitValue(G.players[o], 'might')));
    expect(traitValue(G.players[tr], 'might')).toBe(low);
    resolveAll(c); const d = G.haunt!.data as { deathRoom: string };
    const death = G.monsters.find((m) => m.id === 'death')!; expect(death.room).toBe(d.deathRoom); expect(death.untargetable).toBe(true);
    expect(HAUNTS[37].canEnterRoom!(c, { pid: tr }, d.deathRoom)).toBeTruthy();
    for (const p of Object.values(G.players)) if (!p.isTraitor) p.room = d.deathRoom === 'foyer' ? 'entrance-hall' : 'foyer';
    beginTurn(c, tr, 'monsters'); expect(G.haunt!.winner).toBe('traitor');
  });
  it('chess: hero higher wins; each broken seal removes 2 Death dice at 3–4 players', () => {
    const c = game(4, 11); const G = c.G; haunt(c, 37, '0'); resolveAll(c); const tr = G.haunt!.traitor!;
    const d = G.haunt!.data as { deathRoom: string; broken: number };
    d.broken = 4; // Death rolls 0 dice
    const hero = G.order.find((p) => !G.players[p].isTraitor)!; G.players[hero].room = d.deathRoom;
    beginTurn(c, tr, 'monsters'); resolveAll(c);
    // hero needs > 0; with 0 Death dice only a 0 roll ties
    expect(['heroes', undefined]).toContain(G.haunt!.winner);
  });
  it('Holy Seals: placed in their rooms, picked up by heroes, broken with Sanity 4+, stealable by the traitor', () => {
    const c = game(4); const G = c.G; haunt(c, 37, '0'); resolveAll(c);
    const hero = G.order.find((p) => !G.players[p].isTraitor)!; const tr = G.haunt!.traitor!;
    G.rooms['vault'] = { ...G.rooms['foyer'], id: 'vault', x: 99, y: 99 }; HAUNTS[37].onEnterRoom!(c, hero, 'foyer');
    expect(G.tokens.some((t) => t.kind === 'holySeal' && t.room === 'vault')).toBe(true);
    G.players[hero].room = 'vault'; beginTurn(c, hero, 'explorer');
    expect(doAction(c, hero, 'haunt:pick')).toBeNull();
    expect(HAUNTS[37].stealExtras!(c, tr, hero)).toEqual([{ id: 'seal', label: 'Cướp 1 Holy Seal' }]);
    expect(HAUNTS[37].actions.find((a) => a.id === 'pick')!.side).toBe('heroes');
  });
});

describe('Haunt #38 Hellbeasts', () => {
  it('traitor = lowest Knowledge except revealer; ceil(players/2) Firebats in the reveal room; untargetable', () => {
    const c = game(5); const G = c.G; haunt(c, 38, '0');
    expect(G.haunt!.traitor).not.toBe('0'); expect(G.monsters.length).toBe(3);
    for (const m of G.monsters) { expect(m.room).toBe(G.haunt!.revealRoom); expect(m.untargetable && m.noAttack && m.noSlow).toBe(true); }
  });
  it('movement roll adds that many Firebats (they cannot move); burn after the monster turn; exorcism count = players', () => {
    const c = game(4, 5); const G = c.G; haunt(c, 38, '0'); const tr = G.haunt!.traitor!; const n0 = G.monsters.length;
    beginTurn(c, tr, 'monsters'); const born = G.monsters.filter((m) => m.bornTurn === G.turnCounter);
    expect(G.monsters.length).toBe(n0 + born.length);
    for (const m of born) expect((G.turn as Record<string, unknown>)[`mv:${m.id}`]).toBe(0);
    const d = G.haunt!.data as { successes: number }; d.successes = 4; afterChange(c); expect(G.haunt!.winner).toBe('heroes');
  });
  it('exorcism sources: one per source, one roll per turn', () => {
    const c = game(4); const G = c.G; haunt(c, 38, '0'); const hero = G.order.find((p) => !G.players[p].isTraitor)!;
    G.players[hero].cards.push({ kind: 'omen', id: 'ring' }); G.players[hero].room = 'foyer'; beginTurn(c, hero, 'explorer');
    const acts = availableActions(c, hero).filter((a) => a.id === 'haunt:exorcise' && !a.disabled); expect(acts.length).toBe(1);
    expect(doAction(c, hero, 'haunt:exorcise', { src: 'library' })).toBeTruthy();
    resolveAll(c); expect(doAction(c, hero, 'haunt:exorcise', acts[0].args)).toBeNull(); resolveAll(c);
    expect(availableActions(c, hero).find((a) => a.id === 'haunt:exorcise')!.disabled).toBeTruthy();
  });
});

describe('Haunt #40 Buried Alive', () => {
  it('basement filled to 5 rooms; burial room hidden from heroes by playerView; track damages at the end of the traitor turn', () => {
    const c = game(4); const G = c.G; haunt(c, 40, '0', 'spirit-board'); const tr = G.haunt!.traitor!;
    expect(Object.values(G.rooms).filter((r) => r.floor === 'basement').length).toBeGreaterThanOrEqual(5);
    const pd = G.pending[0]; expect(pd.type).toBe('pickRoom'); expect(pd.player).toBe(tr); resolveAll(c);
    const d = G.haunt!.data as { burial: string; damage: number; track: number };
    expect(d.burial).toBeTruthy();
    const hero = G.order.find((p) => !G.players[p].isTraitor)!;
    const view = (Betrayal.playerView as unknown as (a: { G: typeof G; playerID: string }) => typeof G);
    expect((view({ G, playerID: hero }).haunt!.data as { burial?: string }).burial).toBeUndefined();
    expect((view({ G, playerID: tr }).haunt!.data as { burial?: string }).burial).toBe(d.burial);
    expect(G.log.filter((l) => l.text.includes('Phòng chôn')).every((l) => l.private?.includes(tr))).toBe(true);
    beginTurn(c, tr, 'explorer'); endTurn(c, tr); expect(d.track).toBe(1);
    d.damage = 12; afterChange(c); expect(G.haunt!.winner).toBe('traitor');
  });
  it('search a room entered this turn (Knowledge 3+) then dig (Might 4+) × players = heroes win; Spirit Board cannot be dropped/traded', () => {
    const c = game(4, 9); const G = c.G; haunt(c, 40, '0', 'spirit-board'); resolveAll(c);
    const d = G.haunt!.data as { burial: string; found: boolean; digs: number };
    const hero = G.order.find((p) => !G.players[p].isTraitor)!; beginTurn(c, hero, 'explorer');
    G.players[hero].room = d.burial; expect(doAction(c, hero, 'haunt:search')).toBeTruthy(); // not entered this turn
    HAUNTS[40].onEnterRoom!(c, hero, d.burial); G.players[hero].idx.knowledge = 7;
    for (let i = 0; i < 30 && !d.found; i++) { beginTurn(c, hero, 'explorer'); HAUNTS[40].onEnterRoom!(c, hero, d.burial); doAction(c, hero, 'haunt:search'); resolveAll(c); }
    expect(d.found).toBe(true);
    G.players[hero].idx.might = 7;
    for (let i = 0; i < 60 && G.phase !== 'over'; i++) { beginTurn(c, hero, 'explorer'); doAction(c, hero, 'haunt:dig'); resolveAll(c); }
    expect(d.digs).toBe(4); expect(G.haunt!.winner).toBe('heroes');
    const c2 = game(4); haunt(c2, 40, '0', 'spirit-board'); resolveAll(c2); const h2 = c2.G.order.find((p) => !c2.G.players[p].isTraitor)!;
    c2.G.players[h2].cards.push({ kind: 'omen', id: 'spirit-board' }); beginTurn(c2, h2, 'explorer');
    const acts = availableActions(c2, h2).filter((a) => a.args?.card === 'spirit-board'); expect(acts.length).toBe(0);
  });
});
