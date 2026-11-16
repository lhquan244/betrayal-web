import { describe, it, expect } from 'vitest';
import { initialState } from '../src/engine/rules';
import { validRotations, placeTile, TILE_BY_ID, links } from '../src/engine/house';
import { rotDoors, opp } from '../src/engine/core';
import type { Dir } from '../src/engine/types';

describe('room tile door matching', () => {
  it('every valid rotation has a door facing back to the room you came from', () => {
    const G = initialState(['0', '1', '2']);
    // leaving the Foyer (ground 0,1) east → new tile at (1,1), entered from the west
    for (const id of Object.keys(TILE_BY_ID)) {
      const rots = validRotations(G, id, 'ground', 1, 1, 1 as Dir);
      for (const r of rots) expect(rotDoors(TILE_BY_ID[id].doors, r)).toContain(opp(1 as Dir));
    }
  });
  it('a one-door tile (Junk Room style dead end) can only be placed with its door to the entry', () => {
    const G = initialState(['0', '1', '2']);
    const oneDoor = Object.values(TILE_BY_ID).find((t) => t.doors.length === 1 && t.floors.includes('ground'))!;
    const rots = validRotations(G, oneDoor.id, 'ground', 1, 1, 1 as Dir);
    expect(rots.length).toBeGreaterThan(0);
    for (const r of rots) expect(rotDoors(oneDoor.doors, r)).toEqual([3]);
  });
  it('placed tiles connect only through matching doors', () => {
    const G = initialState(['0', '1', '2']);
    const t = Object.values(TILE_BY_ID).find((x) => x.doors.length === 4 && x.floors.includes('ground'))!;
    placeTile(G, t.id, 'ground', 1, 1, 0);
    expect(links(G, 'foyer').map((l) => l.room)).toContain(t.id);
    expect(links(G, t.id).map((l) => l.room)).toContain('foyer');
  });
});
