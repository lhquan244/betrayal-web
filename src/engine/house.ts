// House map: tile placement with door matching, connections, distances, line of sight.
import type { GState, Floor, Dir, PlacedRoom, RoomDef } from './types';
import { key, DV, opp, rotDoors, roomAt } from './core';
import { ROOM_TILES } from '../data/rooms';

export const START_ROOMS: Record<string, { name: string; floor: Floor; text: string; windows?: boolean }> = {
  'entrance-hall': { name: 'Entrance Hall', floor: 'ground', text: 'Cửa chính (front door) ở phía Nam luôn khoá; không thể rời nhà trừ khi Haunt cho phép.' },
  foyer: { name: 'Foyer', floor: 'ground', text: 'Stairs from Basement (nếu đã khám phá) nối với Foyer qua một cửa bí mật.' },
  'grand-staircase': { name: 'Grand Staircase', floor: 'ground', text: 'Luôn nối với Upper Landing.', windows: true },
  'upper-landing': { name: 'Upper Landing', floor: 'upper', text: 'Nối với Grand Staircase.' },
  'basement-landing': { name: 'Basement Landing', floor: 'basement', text: '' },
};
export const TILE_BY_ID: Record<string, RoomDef> = Object.fromEntries(ROOM_TILES.map((r) => [r.id, r]));
export function roomName(id: string) { return START_ROOMS[id]?.name ?? TILE_BY_ID[id]?.name ?? id; }
export function roomDef(id: string): RoomDef | undefined { return TILE_BY_ID[id]; }

function put(G: GState, r: PlacedRoom) { G.rooms[r.id] = r; G.grid[key(r.floor, r.x, r.y)] = r.id; }
export function setupHouse(G: GState) {
  // Entrance Hall / Foyer / Grand Staircase share one tile (three rooms stacked south->north). Rulebook p.7 & p.6 example:
  // Entrance Hall and Foyer have side doorways; the front door (Entrance Hall) is locked.
  put(G, { id: 'entrance-hall', floor: 'ground', x: 0, y: 0, rot: 0, doors: [0, 1, 3], frontDoor: 2 });
  put(G, { id: 'foyer', floor: 'ground', x: 0, y: 1, rot: 0, doors: [0, 1, 2, 3] });
  put(G, { id: 'grand-staircase', floor: 'ground', x: 0, y: 2, rot: 0, doors: [2] });
  put(G, { id: 'upper-landing', floor: 'upper', x: 0, y: 0, rot: 0, doors: [0, 1, 2, 3] });
  put(G, { id: 'basement-landing', floor: 'basement', x: 0, y: 0, rot: 0, doors: [0, 1, 2, 3] });
}

/** Rooms connected by matching doors on the same floor. */
export function doorNeighbors(G: GState, id: string): { dir: Dir; room: string }[] {
  const r = G.rooms[id]; if (!r) return [];
  const out: { dir: Dir; room: string }[] = [];
  for (const d of r.doors) {
    const [dx, dy] = DV[d]; const n = roomAt(G, r.floor, r.x + dx, r.y + dy);
    if (n && n.doors.includes(opp(d))) out.push({ dir: d, room: n.id });
  }
  return out;
}
/** Doorways leading to empty grid cells (can be explored). */
export function openDoorways(G: GState, id: string): Dir[] {
  const r = G.rooms[id]; if (!r) return [];
  return r.doors.filter((d) => { const [dx, dy] = DV[d]; return !roomAt(G, r.floor, r.x + dx, r.y + dy); });
}
export function tokensIn(G: GState, room: string, kind?: string) { return G.tokens.filter((t) => t.room === room && (!kind || t.kind === kind)); }

/** All one-space links out of a room (doors, stairs, secret passages...). `oneWayOk` includes Coal Chute style links. */
export function links(G: GState, id: string): { room: string; via: string }[] {
  const out = doorNeighbors(G, id).map((n) => ({ room: n.room, via: `door:${n.dir}` }));
  if (id === 'grand-staircase') out.push({ room: 'upper-landing', via: 'stairs' });
  if (id === 'upper-landing') out.push({ room: 'grand-staircase', via: 'stairs' });
  if (id === 'stairs-from-basement' && G.rooms[id]) out.push({ room: 'foyer', via: 'stairs' });
  if (id === 'foyer' && G.rooms['stairs-from-basement']) out.push({ room: 'stairs-from-basement', via: 'stairs' });
  for (const kind of ['secretPassage', 'secretStairs']) {
    for (const t of tokensIn(G, id, kind)) {
      const other = G.tokens.find((o) => o.kind === kind && o.id !== t.id && o.data?.pair === t.data?.pair);
      if (other) out.push({ room: other.room, via: kind });
    }
  }
  return out;
}

/** BFS distance in spaces over links (ignores barriers/opponents). */
export function distances(G: GState, from: string): Record<string, number> {
  const dist: Record<string, number> = { [from]: 0 }; const q = [from];
  while (q.length) { const c = q.shift()!; for (const l of links(G, c)) if (dist[l.room] === undefined) { dist[l.room] = dist[c] + 1; q.push(l.room); } }
  return dist;
}
export function nextStepToward(G: GState, from: string, to: string): string | null {
  const d = distances(G, to); let best: string | null = null;
  for (const l of links(G, from)) if (d[l.room] !== undefined && (best === null || d[l.room] < d[best])) best = l.room;
  return best && d[best] < (d[from] ?? Infinity) ? best : null;
}
/** Tile-count distance on the same floor (used e.g. for "at least 5 tiles away"). */
export function tileDistance(G: GState, a: string, b: string) { return distances(G, a)[b] ?? Infinity; }

/** Line of sight: uninterrupted straight line of doors (rulebook glossary). Smoke blocks LoS. */
export function lineOfSight(G: GState, from: string): string[] {
  const out: string[] = []; const r = G.rooms[from]; if (!r) return out;
  for (const d of [0, 1, 2, 3] as Dir[]) {
    let cur = r;
    while (cur.doors.includes(d)) {
      const [dx, dy] = DV[d]; const n = roomAt(G, cur.floor, cur.x + dx, cur.y + dy);
      if (!n || !n.doors.includes(opp(d))) break;
      if (tokensIn(G, n.id, 'smoke').length) break;
      out.push(n.id); cur = n;
    }
  }
  return out;
}

export function floorHasOpenDoorway(G: GState, f: Floor) {
  return Object.values(G.rooms).some((r) => r.floor === f && openDoorways(G, r.id).length > 0);
}
export function tilesLeftFor(G: GState, f: Floor) {
  return [...G.roomStack, ...G.roomDiscard].some((id) => TILE_BY_ID[id].floors.includes(f));
}

/** Rotations of `tileId` that connect a door to the doorway `fromDir` of the neighbor, without sealing off the floor.
 *  Only rotations matching the maximum number of adjacent doors are offered ("as logically as you can", p.6). */
export function validRotations(G: GState, tileId: string, f: Floor, x: number, y: number, fromDir: Dir): number[] {
  const def = TILE_BY_ID[tileId]; const res: { rot: number; score: number }[] = [];
  for (let rot = 0; rot < 4; rot++) {
    const doors = rotDoors(def.doors, rot);
    if (!doors.includes(opp(fromDir))) continue;
    let score = 0;
    for (const d of doors) { const [dx, dy] = DV[d]; const n = roomAt(G, f, x + dx, y + dy); if (n && n.doors.includes(opp(d))) score++; }
    // seal check: simulate placement
    const id = tileId; G.rooms[id] = { id, floor: f, x, y, rot, doors }; G.grid[key(f, x, y)] = id;
    const stack = G.roomStack; G.roomStack = G.roomStack.filter((t) => t !== id);
    const seals = !floorHasOpenDoorway(G, f) && tilesLeftFor(G, f);
    G.roomStack = stack; delete G.rooms[id]; delete G.grid[key(f, x, y)];
    if (!seals) res.push({ rot, score });
  }
  const max = Math.max(-1, ...res.map((r) => r.score));
  return res.filter((r) => r.score === max).map((r) => r.rot);
}
export function placeTile(G: GState, tileId: string, f: Floor, x: number, y: number, rot: number, by?: string) {
  const doors = rotDoors(TILE_BY_ID[tileId].doors, rot);
  put(G, { id: tileId, floor: f, x, y, rot, doors, discoveredBy: by });
  G.roomStack = G.roomStack.filter((t) => t !== tileId); G.roomDiscard = G.roomDiscard.filter((t) => t !== tileId);
}

/** Draw room tiles until one fits floor `f` (non-fitting ones go to the discard). Reshuffles the discard once if needed. */
export function drawTileFor(G: GState, f: Floor, shuffle: <T>(a: T[]) => T[]): string | null {
  for (let pass = 0; pass < 2; pass++) {
    while (G.roomStack.length) {
      const t = G.roomStack.shift()!;
      if (TILE_BY_ID[t].floors.includes(f)) return t;
      G.roomDiscard.push(t);
    }
    if (!G.roomDiscard.length) return null;
    G.roomStack = shuffle(G.roomDiscard); G.roomDiscard = [];
  }
  return null;
}

/** Every empty cell adjacent to an open doorway on floor f, with the doorway direction (for effects that place a tile "anywhere"). */
export function openSpots(G: GState, f: Floor): { x: number; y: number; fromDir: Dir; from: string }[] {
  const out: { x: number; y: number; fromDir: Dir; from: string }[] = [];
  for (const r of Object.values(G.rooms)) if (r.floor === f) for (const d of openDoorways(G, r.id)) { const [dx, dy] = DV[d]; out.push({ x: r.x + dx, y: r.y + dy, fromDir: d, from: r.id }); }
  return out;
}
/** Place a tile at the first legal open spot of its floor (preferring `prefer`). Returns placed floor or null. */
export function autoPlace(G: GState, tileId: string, prefer?: Floor, only = false): Floor | null {
  const floors = [...TILE_BY_ID[tileId].floors].filter((f) => !only || f === prefer).sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : 0));
  for (const f of floors) for (const s of openSpots(G, f)) {
    const rots = validRotations(G, tileId, f, s.x, s.y, s.fromDir);
    if (rots.length) { placeTile(G, tileId, f, s.x, s.y, rots[0]); return f; }
  }
  return null;
}
export const BARRIERS: Record<string, { trait: 'sanity' | 'speed' | 'might'; target: number }> = {
  catacombs: { trait: 'sanity', target: 6 }, chasm: { trait: 'speed', target: 3 }, tower: { trait: 'might', target: 3 },
};
