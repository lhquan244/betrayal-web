import { describe, it, expect } from 'vitest';
import { initialState, selectCharacter, startExplore, startHaunt, afterChange, resolvePending, monsterAttack, beginTurn } from '../src/engine/rules';
import { seededRng, type Ctx } from '../src/engine/core';
import { CHARACTERS } from '../src/data/characters';
import { mummyWalks } from '../src/haunts/h01-mummy-walks';

function hauntGame() {
  const G = initialState(['0', '1', '2', '3']); const c: Ctx = { G, rng: seededRng(7) };
  const cols = new Set<string>(); for (const id of ['0', '1', '2', '3']) { const ch = CHARACTERS.find((x) => !cols.has(x.color))!; cols.add(ch.color); selectCharacter(c, id, ch.id); }
  startExplore(c, [1, 1]);
  G.players['0'].cards.push({ kind: 'omen', id: 'girl' }); G.decks.omen = G.decks.omen.filter((x) => x !== 'girl');
  startHaunt(c, 1, '0', { card: 'girl', room: 'foyer' });
  const pd = G.pending[0]; if (pd?.type === 'pickRoom') resolvePending(c, '0', { room: pd.rooms[0] });
  return c;
}
describe('Haunt #1 The Mummy Walks', () => {
  it('setup: revealer is traitor, Mummy + Sarcophagus in the traitor room, traitor loses the Girl', () => {
    const c = hauntGame(); const G = c.G;
    expect(G.haunt!.traitor).toBe('0');
    expect(G.monsters[0]).toMatchObject({ id: 'mummy', traits: { speed: 3, might: 8, sanity: 5 } });
    expect(G.tokens.find((t) => t.kind === 'sarcophagus')!.room).toBe(G.players['0'].room);
    expect(G.players['0'].cards.some((x) => x.id === 'girl')).toBe(false);
    expect(G.tokens.some((t) => t.kind === 'girlToken')).toBe(true);
  });
  it('traitor wins: Mummy has the Girl, carries the Ring or Holy Symbol, and is back in the Sarcophagus room', () => {
    const c = hauntGame(); const G = c.G; const m = G.monsters[0];
    m.companionGirl = true; afterChange(c); expect(G.phase).toBe('haunt');
    m.carries.push({ kind: 'omen', id: 'holy-symbol' }); m.room = 'foyer'; G.tokens.find((t) => t.kind === 'sarcophagus')!.room;
    (G.haunt!.data as { sarcophagus: string }).sarcophagus = 'upper-landing'; afterChange(c); expect(G.phase).toBe('haunt');
    m.room = 'upper-landing'; afterChange(c);
    expect(G.phase).toBe('over'); expect(G.haunt!.winner).toBe('traitor');
  });
  it('heroes win when the Mummy is banished while a hero survives', () => {
    const c = hauntGame(); (c.G.haunt!.data as { banished: boolean }).banished = true; afterChange(c);
    expect(c.G.haunt!.winner).toBe('heroes');
  });
  it('Mummy is immune to Speed attacks (Revolver / Dynamite)', () => {
    const c = hauntGame(); expect(mummyWalks.canAttackMonster!(c, '1', 'mummy', 'speed', 'revolver')).toBeTruthy();
    expect(mummyWalks.canAttackMonster!(c, '1', 'mummy', 'might')).toBeNull();
  });
  it('Mummy damage goes to Speed until its lowest value (never the skull), then Might', () => {
    const c = hauntGame(); const G = c.G; const p = G.players['1'];
    p.idx.speed = 1; const might0 = p.idx.might; p.cards = [];
    mummyWalks.onMonsterInflicts!(c, 'mummy', '1', 3, 'might'); // diff ≥ 2 but nothing to steal → damage
    expect(p.idx.speed).toBe(0); expect(p.idx.might).toBe(might0 - 2);
  });
  it('step 1 needs Knowledge 6+ in Sarcophagus room / Research Laboratory / Library', () => {
    const c = hauntGame(); const a = mummyWalks.actions.find((x) => x.id === 'name')!;
    c.G.players['1'].room = 'foyer'; c.G.turn.player = '1'; c.G.turn.taskDone = false;
    expect(a.check(c, '1')).toBeTruthy();
    c.G.players['1'].room = (c.G.haunt!.data as { sarcophagus: string }).sarcophagus; expect(a.check(c, '1')).toBeNull();
  });
  it('Mummy must attack a hero in its room before ending its turn', () => {
    const c = hauntGame(); const G = c.G; beginTurn(c, '0', 'monsters'); G.players['1'].room = G.monsters[0].room;
    expect(mummyWalks.canEndMonsterTurn!(c)).toBeTruthy();
    monsterAttack(c, 'mummy', '1'); expect(mummyWalks.canEndMonsterTurn!(c)).toBeNull();
  });
});
