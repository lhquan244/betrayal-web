import { describe, it, expect } from 'vitest';
import { simulate } from '../scripts/simbot';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { Betrayal } from '../src/engine/game';

describe('full-game simulation (rules engine, bots)', () => {
  it('goes select → explore → haunt → over and the haunt ends with a winner', () => {
    const results = [2, 6, 9, 10, 13].map((s) => simulate(s, 4 + (s % 3)));
    for (const r of results) {
      expect(r.phases.slice(0, 3)).toEqual(['select', 'explore', 'haunt']);
    }
    const finished = results.filter((r) => r.G.phase === 'over');
    expect(finished.length).toBeGreaterThan(0);
    for (const r of finished) expect(['heroes', 'traitor']).toContain(r.G.haunt!.winner);
  });
});

describe('bot simulation forcing each new haunt', () => {
  for (const h of [4, 26, 37, 38, 40]) it(`Haunt #${h} runs without engine errors and some games end with a winner`, () => {
    const rs = [1, 2, 4].map((s) => simulate(s, 3 + (s % 4), { forceHaunt: h, maxSteps: 3000 }));
    for (const r of rs) expect(r.G.haunt!.number).toBe(h);
    expect(rs.filter((r) => r.G.phase === 'over').length).toBeGreaterThan(0);
  });
});

describe('boardgame.io wrapper', () => {
  it('runs setup, character selection, start and movement via moves; hides deck order', () => {
    const mp = Local();
    const clients = ['0', '1', '2'].map((id) => Client({ game: Betrayal, numPlayers: 3, playerID: id, multiplayer: mp }));
    clients.forEach((c) => c.start());
    const ids = ['darrin-williams', 'belladina-zostra', 'zoe-ingstrom'];
    clients.forEach((c, i) => c.moves.selectCharacter(ids[i]));
    clients[0].moves.startGame();
    const s = clients[0].getState()!;
    expect(s.G.phase).toBe('explore');
    expect(s.G.decks.omen).toEqual([...s.G.decks.omen].sort()); // order hidden
    const cur = s.G.turn.player; const cl = clients[Number(cur)];
    expect(cl.getState()!.ctx.currentPlayer).toBe(cur);
    cl.moves.move({ room: 'foyer' });
    expect(cl.getState()!.G.players[cur].room).toBe('foyer');
    clients.forEach((c) => c.stop());
  });
});
