import { describe, it, expect } from 'vitest';
import { initialState, selectCharacter, startExplore, endTurn } from '../src/engine/rules';
import type { Ctx, Rng } from '../src/engine/core';
import { CHARACTERS } from '../src/data/characters';

/** rng whose d6 always returns `face` (faces 1-2 → 0 pips, 3-4 → 1 pip, 5-6 → 2 pips). */
const fixed = (face: number): Rng => ({ d6: () => face, shuffle: (a) => [...a] });
function setup(rng: Rng) {
  const G = initialState(['0', '1', '2']); const c: Ctx = { G, rng };
  const cols = new Set<string>(); for (const id of ['0', '1', '2']) { const ch = CHARACTERS.find((x) => !cols.has(x.color))!; cols.add(ch.color); selectCharacter(c, id, ch.id); }
  startExplore(c, [1, 1]); return c;
}
describe('haunt roll (6 dice after drawing an omen; haunt starts if total < omens drawn)', () => {
  it('does not start when total >= omen count', () => {
    const c = setup(fixed(3)); // 6 dice × 1 pip = 6
    c.G.omensDrawn = 6; c.G.turn.drewOmen = true; c.G.turn.lastOmen = { card: 'girl', room: 'gymnasium' };
    endTurn(c, c.G.turn.player); expect(c.G.phase).toBe('explore');
  });
  it('starts when total < omen count and uses the haunt chart (Girl + Gymnasium → Haunt 1)', () => {
    const c = setup(fixed(3));
    c.G.omensDrawn = 7; c.G.turn.drewOmen = true; c.G.turn.lastOmen = { card: 'girl', room: 'gymnasium' };
    const p = c.G.turn.player; c.G.players[p].cards.push({ kind: 'omen', id: 'girl' });
    const res = endTurn(c, p);
    expect(c.G.phase).toBe('haunt'); expect(c.G.haunt?.number).toBe(1); expect(c.G.haunt?.traitor).toBe(p);
    expect(typeof res).toBe('string'); // traitor must first place the Girl token
  });
  it('no roll when no omen was drawn this turn', () => {
    const c = setup(fixed(1)); c.G.omensDrawn = 13; endTurn(c, c.G.turn.player); expect(c.G.phase).toBe('explore');
  });
});
