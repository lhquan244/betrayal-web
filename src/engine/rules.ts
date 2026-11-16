// Game rules: setup, turns, movement, discovery, room/items actions, combat, haunt, monsters.
// Rule references are to the 2nd-edition rulebook (Hasbro F3148).
import type { GState, PlayerState, Trait, Dir, CardKind, CardRef, Floor, Monster, Effect, DamageKind } from './types';
import { TRAITS, PHYSICAL, MENTAL } from './types';
import { Ctx, log, pname, traitValue, shiftTrait, holds, TRAIT_VI, cardName, rollDice, diceReason, sum, DV, opp, roomAt, startValue, isHero, cardsInPlay, livingExplorers } from './core';
import { setupHouse, links, openDoorways, roomName, roomDef, tokensIn, drawTileFor, validRotations, placeTile, BARRIERS, lineOfSight, distances, tilesLeftFor, START_ROOMS, doorNeighbors } from './house';
import { CUSTOM_ROLLS, enqueue, processQueue, requestDamage, applyDamage, resolveCard, drawFromDeck, startRoll, doRoll, finishRoll, applyPreRoll, gainCard, loseCard, discardCard, CUSTOM, placeExplorer, takeSpecific } from './effects';
import { CHARACTERS } from '../data/characters';
import { ROOM_TILES } from '../data/rooms';
import { OMENS, ITEMS, EVENTS, CARD_BY_ID } from '../data/cards';
import { lookupHaunt } from '../data/hauntChart';
import { HAUNTS } from '../haunts';

export function initialState(playerIds: string[], names: Record<string, string> = {}, options: GState['options'] = {}): GState {
  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) players[id] = { id, name: names[id] ?? `Người chơi ${Number(id) + 1}`, character: null, idx: { might: 0, speed: 0, sanity: 0, knowledge: 0 }, over: {}, room: 'entrance-hall', cards: [], statuses: {}, dead: false, isTraitor: false };
  const G: GState = {
    phase: 'select', options, players, order: [...playerIds], rooms: {}, grid: {}, roomStack: [], roomDiscard: [],
    decks: { event: [], item: [], omen: [] }, discards: { event: [], item: [], omen: [] }, setAside: [], omensDrawn: 0,
    tokens: [], monsters: [], pending: [], queue: [],
    turn: { player: playerIds[0], part: 'explorer', spent: 0, moveEnded: false, drewOmen: false, attacked: false, rollsDone: [], usedItems: [] },
    turnCounter: 0, haunt: null, log: [],
  };
  setupHouse(G);
  log(G, 'Chọn nhân vật. Mỗi lá nhân vật có 2 mặt — mỗi màu chỉ được 1 người.');
  return G;
}

export function selectCharacter(c: Ctx, pid: string, charId: string, name?: string): string | null {
  const G = c.G; if (G.phase !== 'select') return 'Không ở giai đoạn chọn nhân vật';
  const ch = CHARACTERS.find((x) => x.id === charId); if (!ch) return 'Nhân vật không tồn tại';
  const taken = Object.values(G.players).some((p) => p.id !== pid && p.character && CHARACTERS.find((x) => x.id === p.character)!.color === ch.color);
  if (taken) return 'Màu này đã có người chọn (2 nhân vật cùng màu là 2 mặt của một lá)';
  const p = G.players[pid]; p.character = charId; if (name) p.name = name;
  for (const t of TRAITS) p.idx[t] = ch.traits[t].start;
  log(G, `${p.name} chọn ${ch.name}.`);
  return null;
}

/** "The explorer who has the next birthday goes first. Players take turns clockwise" (p.4). Seating = join order. */
export function startExplore(c: Ctx, today: [number, number]) {
  const G = c.G; G.phase = 'explore';
  const daysUntil = (b: [number, number]) => { const d = (m: number, dd: number) => m * 31 + dd; const x = d(b[0], b[1]) - d(today[0], today[1]); return x >= 0 ? x : x + 400; };
  const first = [...G.order].sort((a, b) => daysUntil(CHARACTERS.find((x) => x.id === G.players[a].character)!.birthday) - daysUntil(CHARACTERS.find((x) => x.id === G.players[b].character)!.birthday))[0];
  const i = G.order.indexOf(first); G.order = [...G.order.slice(i), ...G.order.slice(0, i)];
  G.roomStack = c.rng.shuffle(ROOM_TILES.map((r) => r.id));
  G.decks.omen = c.rng.shuffle(OMENS.map((x) => x.id)); G.decks.item = c.rng.shuffle(ITEMS.map((x) => x.id)); G.decks.event = c.rng.shuffle(EVENTS.map((x) => x.id));
  log(G, `Bắt đầu khám phá! ${pname(G, first)} có sinh nhật sắp tới gần nhất nên đi trước.`);
  beginTurn(c, first);
}

export function beginTurn(c: Ctx, pid: string, part: 'explorer' | 'monsters' = 'explorer') {
  const G = c.G; G.turnCounter++;
  G.turn = { player: pid, part, spent: 0, moveEnded: false, drewOmen: false, attacked: false, rollsDone: [], usedItems: [] };
  if (part === 'monsters') { startMonsterTurn(c); return; }
  const p = G.players[pid];
  log(G, `— Lượt của ${pname(G, pid)} —`);
  // ongoing event cards
  for (const k of ['buried', 'webbed'] as const) {
    const st = p.statuses[k] as { fails: number; freeNext?: boolean } | undefined;
    if (st?.freeNext) { delete p.statuses[k]; log(G, `${pname(G, pid)} tự thoát (${k === 'buried' ? 'Debris' : 'Webs'}) sau 3 lần thất bại.`); }
  }
  if (p.statuses.graveDirt) enqueue(c, pid, [{ t: 'log', text: 'Grave Dirt: chịu 1 sát thương thể chất.' }, { t: 'damage', kind: 'physical', amount: 1 }]);
  processQueue(c);
}

export const isStuck = (p: PlayerState) => !!(p.statuses.buried || p.statuses.webbed);
export function speedLimit(c: Ctx, pid: string) {
  const p = c.G.players[pid]; return p.statuses.lightsOut ? 1 : traitValue(p, 'speed');
}
const isOpponent = (G: GState, a: string, b: string) => G.phase === 'haunt' && G.players[a].isTraitor !== G.players[b].isTraitor;
export function exitCost(c: Ctx, pid: string): number {
  const G = c.G; if (G.phase !== 'haunt') return 1; const room = G.players[pid].room;
  let opp = 0;
  for (const o of livingExplorers(G)) if (o !== pid && G.players[o].room === room && isOpponent(G, pid, o)) opp++;
  if (!G.players[pid].isTraitor) for (const m of G.monsters) if (m.room === room && !m.stunned && !m.noSlow) opp++;
  return 1 + opp;
}

// ------------------------------------------------------------------ movement
export function movementOptions(c: Ctx, pid: string) {
  const G = c.G; const p = G.players[pid]; const r = G.rooms[p.room];
  const out: { room?: string; dir?: Dir; label: string; cost: number }[] = [];
  if (!r || p.dead) return out; // a dead explorer's figure can't move (it may still own the turn it died in: only "end turn")
  const bar = BARRIERS[p.room];
  const sideDoors = bar && p.barrierSide !== undefined ? [r.doors[p.barrierSide]] : r.doors;
  const h = G.phase === 'haunt' ? HAUNTS[G.haunt?.number ?? -1] : undefined;
  for (const l of links(G, p.room)) {
    if (l.via.startsWith('door:') && !sideDoors.includes(Number(l.via.slice(5)) as Dir)) continue;
    if (h?.canEnterRoom?.(c, { pid }, l.room)) continue;
    out.push({ room: l.room, label: `${roomName(l.room)}${l.via.startsWith('door') ? '' : ` (${l.via})`}`, cost: exitCost(c, pid) });
  }
  for (const d of openDoorways(G, p.room)) if (sideDoors.includes(d) && tilesLeftFor(G, r.floor)) out.push({ dir: d, label: `Khám phá phía ${['Bắc', 'Đông', 'Nam', 'Tây'][d]}`, cost: exitCost(c, pid) });
  return out;
}
export function canMove(c: Ctx, pid: string, cost: number): string | null {
  const G = c.G; const p = G.players[pid];
  if (G.turn.player !== pid || G.turn.part !== 'explorer') return 'Không phải lượt của bạn';
  if (p.dead) return 'Nhân vật của bạn đã chết';
  if (G.pending.length) return 'Đang chờ quyết định';
  if (isStuck(p)) return 'Bạn đang bị kẹt (Debris/Webs)';
  if (G.turn.moveEnded) return 'Đã hết di chuyển lượt này';
  if (G.turn.forceEnd) return 'Lượt này phải kết thúc';
  const hm = G.phase === 'haunt' ? HAUNTS[G.haunt?.number ?? -1]?.canExplorerMove?.(c, pid) : null; if (hm) return hm;
  const lim = speedLimit(c, pid);
  if (G.turn.spent > 0 && G.turn.spent + cost > lim) return `Không đủ Speed (${lim - G.turn.spent} còn lại, cần ${cost})`; // "you can always move at least 1 space" (p.17)
  return null;
}
export function moveExplorer(c: Ctx, pid: string, target: { room?: string; dir?: Dir }): string | null {
  const G = c.G; const p = G.players[pid];
  const opt = movementOptions(c, pid).find((o) => (target.room ? o.room === target.room : o.dir === target.dir));
  if (!opt) return 'Không thể đi hướng đó';
  const err = canMove(c, pid, opt.cost); if (err) return err;
  const from = p.room;
  G.turn.spent += G.turn.spent === 0 ? Math.min(opt.cost, speedLimit(c, pid)) : opt.cost;
  if (opt.room) { onExit(c, pid, from); p.room = opt.room; setBarrierSide(c, pid, from); log(G, `${pname(G, pid)} → ${roomName(opt.room)}`); enterRoom(c, pid, opt.room, false); }
  else discover(c, pid, opt.dir!);
  processQueue(c); afterChange(c);
  return null;
}
function setBarrierSide(c: Ctx, pid: string, from: string) {
  const G = c.G; const p = G.players[pid]; p.barrierSide = undefined;
  if (!BARRIERS[p.room]) return; const r = G.rooms[p.room], f = G.rooms[from];
  if (!f || f.floor !== r.floor) { p.barrierSide = 0; return; }
  const d = ([0, 1, 2, 3] as Dir[]).find((x) => { const [dx, dy] = DV[x]; return r.x + dx === f.x && r.y + dy === f.y; });
  p.barrierSide = d !== undefined && r.doors.indexOf(d) >= 0 ? (r.doors.indexOf(d) as 0 | 1) : 0;
}
function harmfulIgnored(c: Ctx, pid: string) { return c.G.phase === 'haunt' && c.G.players[pid].isTraitor; } // traitor ignores harmful room text (p.17)
function onExit(c: Ctx, pid: string, room: string) {
  const G = c.G; const p = G.players[pid]; if (harmfulIgnored(c, pid)) return;
  const exitRolls: Record<string, [Trait, number, Effect]> = {
    graveyard: ['sanity', 4, { t: 'lose', trait: 'knowledge', n: 1 }], attic: ['speed', 3, { t: 'lose', trait: 'might', n: 1 }],
    'junk-room': ['might', 3, { t: 'lose', trait: 'speed', n: 1 }], 'pentagram-chamber': ['knowledge', 4, { t: 'lose', trait: 'sanity', n: 1 }],
  };
  const er = exitRolls[room]; if (!er) return;
  if (holds(p, 'medallion') && ['graveyard', 'pentagram-chamber'].includes(room)) { log(G, 'Medallion: miễn nhiễm hiệu ứng phòng.'); return; }
  enqueue(c, pid, [{ t: 'roll', spec: { label: `Rời ${roomName(room)}`, trait: er[0], outcomes: [{ min: er[1], effects: [] }, { min: 0, max: er[1] - 1, effects: [er[2]] }] } }]);
}

function discover(c: Ctx, pid: string, dir: Dir) {
  const G = c.G; const p = G.players[pid]; const r = G.rooms[p.room]; const [dx, dy] = DV[dir];
  const x = r.x + dx, y = r.y + dy;
  for (let tries = 0; tries < 60; tries++) {
    const t = drawTileFor(G, r.floor, c.rng.shuffle);
    if (!t) { log(G, `Không còn ô phòng nào cho tầng này.`); G.turn.spent -= 1; return; }
    const rots = validRotations(G, t, r.floor, x, y, dir);
    if (!rots.length) { G.roomDiscard.push(t); log(G, `${roomName(t)} không đặt được (bịt kín tầng), rút ô khác.`); continue; }
    if (rots.length === 1) { finishPlacement(c, pid, t, r.floor, x, y, rots[0], p.room); return; }
    G.pending.push({ type: 'rotate', player: pid, tile: t, floor: r.floor, x, y, options: rots, fromDir: dir });
    (G.turn as Record<string, unknown>).discoverFrom = p.room;
    return;
  }
}
export function finishPlacement(c: Ctx, pid: string, tile: string, f: Floor, x: number, y: number, rot: number, from: string) {
  const G = c.G; placeTile(G, tile, f, x, y, rot, pid);
  log(G, `${pname(G, pid)} khám phá ${roomName(tile)}.`);
  // A haunt may forbid entering this room (e.g. #26: heroes can't enter the Pentagram Chamber). The tile stays placed but the
  // explorer doesn't enter it (no exit roll from the old room, no card for the room symbol) — see that haunt's gaps.
  const no = G.phase === 'haunt' ? HAUNTS[G.haunt?.number ?? -1]?.canEnterRoom?.(c, { pid }, tile) : null;
  if (no) { log(G, `${pname(G, pid)} không thể vào ${roomName(tile)} (${no}) — ô phòng vẫn được đặt, explorer ở lại ${roomName(from)}.`); return; }
  onExit(c, pid, from);
  G.players[pid].room = tile; setBarrierSide(c, pid, from);
  enterRoom(c, pid, tile, true);
}
/** Entering a room: special tiles, symbols (first discoverer only), haunt hooks. */
export function enterRoom(c: Ctx, pid: string, room: string, discovered: boolean) {
  const G = c.G; const p = G.players[pid];
  // companions left by dead explorers
  for (const t of tokensIn(G, room, 'companion')) { if (p.dead) break; /* e.g. Madman's Sanity loss on gain killed them */ const id = t.data!.card as string; G.tokens = G.tokens.filter((x) => x !== t); gainCard(c, pid, { kind: 'omen', id }); log(G, `${pname(G, pid)} nhận ${cardName(id)}.`); }
  if (discovered) {
    const def = roomDef(room);
    if (def?.symbol) { G.turn.moveEnded = true; drawForSymbol(c, pid, def.symbol); }
    if (room === 'collapsed-room') enqueue(c, pid, [{ t: 'roll', spec: { label: 'Collapsed Room', trait: 'speed', outcomes: [{ min: 5, effects: [] }, { min: 0, max: 4, effects: [{ t: 'custom', fn: 'collapseFall' }] }] } }]);
  }
  if (room === 'coal-chute') { log(G, 'Coal Chute: trượt xuống Basement Landing.'); p.room = 'basement-landing'; p.barrierSide = undefined; }
  if (room === 'mystic-elevator' && !G.turn.elevatorUsed) { if (c.gate) { G.turn.elevatorUsed = true; enqueue(c, pid, [{ t: 'custom', fn: 'elevatorRoll' }], true); } else elevator(c, pid); }
  HAUNTS[G.haunt?.number ?? -1]?.onEnterRoom?.(c, pid, p.room);
}
function drawForSymbol(c: Ctx, pid: string, kind: CardKind) {
  const G = c.G;
  const rep0 = G.haunt ? HAUNTS[G.haunt.number]?.replaceDraw?.(c, pid, kind) : null;
  if (rep0 && typeof rep0 === 'object' && 'choose' in rep0) { // the rule lets the player pick which card to search for
    G.pending.push({ type: 'choice', player: pid, prompt: 'Haunt: lục chồng bài và lấy lá nào?', options: rep0.choose.map((card) => ({ label: `Lấy ${cardName(card)}`, effects: [{ t: 'custom', fn: '__takeSpecific', args: { kind, card } }] })) });
    return;
  }
  if (rep0 && typeof rep0 === 'object') {
    G.pending.push({ type: 'choice', player: pid, prompt: `Haunt: lấy ${cardName(rep0.card)} thay vì rút ngẫu nhiên?`, options: [
      { label: `Lấy ${cardName(rep0.card)}`, effects: [{ t: 'custom', fn: '__takeSpecific', args: { kind, card: rep0.card } }] },
      { label: 'Rút bình thường', effects: [{ t: 'custom', fn: 'drawOne', args: { kind } }] }] });
    return;
  }
  const rep = rep0 as string | null;
  if (rep && takeSpecific(G, kind, rep)) { log(G, `(Haunt) ${pname(G, pid)} lấy ${cardName(rep)} thay vì rút ngẫu nhiên.`); G.decks[kind] = c.rng.shuffle(G.decks[kind]); resolveCard(c, pid, kind, rep); return; }
  const id = drawFromDeck(c, kind); if (!id) { log(G, `Hết lá ${kind}.`); return; }
  resolveCard(c, pid, kind, id);
}
CUSTOM.__takeSpecific = (c, pid, a) => {
  const G = c.G; const kind = a.kind as CardKind; const id = a.card as string;
  if (!takeSpecific(G, kind, id)) { CUSTOM.drawOne(c, pid, { kind }); return; }
  log(G, `(Haunt) ${pname(G, pid)} lấy ${cardName(id)} thay vì rút ngẫu nhiên.`); G.decks[kind] = c.rng.shuffle(G.decks[kind]); resolveCard(c, pid, kind, id);
};
CUSTOM.__discoverSymbol = (c, pid, a) => { const d = roomDef(a.room as string); if (d?.symbol) drawForSymbol(c, pid, d.symbol); };
CUSTOM.__afterPlace = (c, pid, a) => { HAUNTS[c.G.haunt?.number ?? -1]?.onEnterRoom?.(c, pid, a.room as string); };
CUSTOM.collapseFall = (c, pid) => {
  const G = c.G; const t = drawTileFor(G, 'basement', c.rng.shuffle);
  let landed: string | null = null;
  if (t) {
    // "Place the new basement tile adjacent to any basement room already in play" (p.7) — first legal spot.
    for (const r of Object.values(G.rooms).filter((x) => x.floor === 'basement')) for (const d of openDoorways(G, r.id)) {
      if (landed) break; const [dx, dy] = DV[d]; const rots = validRotations(G, t, 'basement', r.x + dx, r.y + dy, d);
      if (rots.length) { placeTile(G, t, 'basement', r.x + dx, r.y + dy, rots[0], pid); landed = t; }
    }
    if (!landed) G.roomDiscard.push(t);
  }
  if (!landed) { const bs = Object.values(G.rooms).filter((r) => r.floor === 'basement').map((r) => r.id); G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Collapsed Room: chọn phòng tầng hầm để rơi xuống', rooms: bs, then: [{ t: 'damage', kind: 'physical', dice: 1 }, { t: 'custom', fn: 'belowToken' }], varName: 'room' }); return; }
  log(G, `Sàn sập! ${pname(G, pid)} rơi xuống ${roomName(landed)}.`);
  G.players[pid].room = landed; G.players[pid].barrierSide = 0;
  G.tokens.push({ id: 'below-collapsed', kind: 'belowCollapsed', room: landed });
  enqueue(c, pid, [{ t: 'damage', kind: 'physical', dice: 1 }], true);
  CUSTOM.__discoverSymbol!(c, pid, { room: landed });
};
CUSTOM.belowToken = (c, pid) => { if (!c.G.tokens.some((t) => t.kind === 'belowCollapsed')) c.G.tokens.push({ id: 'below-collapsed', kind: 'belowCollapsed', room: c.G.players[pid].room }); };

CUSTOM.elevatorRoll = (c, pid) => elevator(c, pid);
CUSTOM_ROLLS.elevatorRoll = { label: 'Mystic Elevator', reason: () => '2 xúc xắc', when: (c, pid) => !harmfulIgnored(c, pid) };
function elevator(c: Ctx, pid: string) {
  const G = c.G; G.turn.elevatorUsed = true;
  if (harmfulIgnored(c, pid)) { G.pending.push({ type: 'choice', player: pid, prompt: 'Mystic Elevator (traitor chọn tầng)', options: (['upper', 'ground', 'basement'] as Floor[]).map((f) => ({ label: f, effects: [{ t: 'custom', fn: 'elevatorTo', args: { floors: [f] } }] })) }); return; }
  const d = rollDice(c.rng, 2, { label: 'Mystic Elevator', reason: '2 xúc xắc' }); const t = sum(d); log(G, `🎲 Mystic Elevator: [${d.join(',')}] = ${t}`);
  const floors: Floor[] = t === 4 ? ['upper', 'ground', 'basement'] : t === 3 ? ['upper'] : t === 2 ? ['ground'] : ['basement'];
  CUSTOM.elevatorTo(c, pid, { floors, damage: t === 0 });
}
CUSTOM.elevatorTo = (c, pid, a) => {
  const G = c.G; const r = G.rooms['mystic-elevator']; const floors = a.floors as Floor[];
  const spots: { f: Floor; x: number; y: number; d: Dir }[] = [];
  for (const q of Object.values(G.rooms)) if (floors.includes(q.floor) && q.id !== 'mystic-elevator') for (const d of openDoorways(G, q.id)) { const [dx, dy] = DV[d]; spots.push({ f: q.floor, x: q.x + dx, y: q.y + dy, d }); }
  if (spots.length) {
    const s = spots[0]; delete G.grid[`${r.floor}:${r.x},${r.y}`];
    const rot = ((opp(s.d) - 0 + 4) % 4); // elevator's single door faces north in base orientation
    G.rooms['mystic-elevator'] = { ...r, floor: s.f, x: s.x, y: s.y, rot, doors: [opp(s.d)] }; G.grid[`${s.f}:${s.x},${s.y}`] = 'mystic-elevator';
    log(G, `Mystic Elevator di chuyển tới tầng ${s.f}, cạnh ${roomName(G.grid[`${s.f}:${s.x - DV[s.d][0]},${s.y - DV[s.d][1]}`])}.`);
  } else log(G, 'Mystic Elevator: không có cửa trống phù hợp, thang đứng yên.');
  if (a.damage) enqueue(c, pid, [{ t: 'damage', kind: 'physical', dice: 1 }], true);
};

// ------------------------------------------------------------------ actions (rooms, tokens, items)
export interface ActionInfo { id: string; label: string; args?: Record<string, unknown>; disabled?: string }
export function availableActions(c: Ctx, pid: string): ActionInfo[] {
  const G = c.G; const p = G.players[pid]; const out: ActionInfo[] = [];
  if (G.phase === 'select' || G.phase === 'over' || p.dead) return out;
  if (G.turn.player !== pid || G.turn.part !== 'explorer') {
    return out;
  }
  const room = p.room; const once = (k: string) => (G.turn.rollsDone.includes(k) ? 'Đã thử lượt này' : undefined);
  if (G.turn.forceEnd) return [{ id: 'manual', label: 'Điều chỉnh thủ công (cho phần luật chưa tự động)' }, { id: 'endTurn', label: 'Kết thúc lượt' }];
  const hh = G.phase === 'haunt' ? HAUNTS[G.haunt?.number ?? -1] : undefined;
  const stuck = isStuck(p);
  // freeing stuck explorers (self or others in room)
  for (const o of Object.values(G.players)) if (!o.dead && o.room === room && isStuck(o)) out.push({ id: 'free', label: `Giải cứu ${o.id === pid ? 'bản thân' : pname(G, o.id)} (Might 4+)`, args: { target: o.id }, disabled: once(`free:${o.id}`) });
  if (stuck) return [...out, { id: 'endTurn', label: 'Kết thúc lượt' }];
  if (BARRIERS[room]) out.push({ id: 'cross', label: `Băng qua (${TRAIT_VI[BARRIERS[room].trait]} ${BARRIERS[room].target}+)`, disabled: once('cross') || (G.turn.moveEnded ? 'Đã hết di chuyển' : undefined) });
  if (room === 'vault' && !tokensIn(G, room, 'vaultEmpty').length) out.push({ id: 'vault', label: 'Mở Vault (Knowledge 6+)', disabled: once('vault') });
  if (room === 'gallery' && G.rooms.ballroom) out.push({ id: 'galleryFall', label: 'Nhảy xuống Ballroom (1 xúc xắc thể chất)' });
  if (room === 'collapsed-room') out.push({ id: 'collapseDrop', label: 'Cố ý rơi xuống tầng hầm' });
  if (tokensIn(G, room, 'closet').length) out.push({ id: 'closet', label: 'Mở tủ Closet (2 xúc xắc)', disabled: once('closet') });
  if (tokensIn(G, room, 'safe').length) out.push({ id: 'safe', label: 'Mở két Safe (Knowledge)', disabled: once('safe') });
  if (tokensIn(G, room, 'skeletons').length) out.push({ id: 'skeletons', label: 'Lục soát Skeletons (Sanity)', disabled: once('skeletons') });
  if (tokensIn(G, room, 'slide').length) out.push({ id: 'slide', label: 'Đi Mystic Slide (Might 5+)', disabled: once('slide') });
  if (tokensIn(G, room, 'wallSwitch').length) out.push({ id: 'wallSwitch', label: 'Qua Revolving Wall (Knowledge 3+)', disabled: once('wallSwitch') });
  // item piles
  for (const t of tokensIn(G, room, 'itemPile')) for (const ref of (t.data!.cards as CardRef[])) out.push({ id: 'pickup', label: `Nhặt ${cardName(ref.id)}`, args: { pile: t.id, card: ref.id }, disabled: G.turn.usedItems.includes(ref.id) ? 'Đã dùng' : undefined });
  // usable cards
  for (const ref of p.cards) {
    const def = CARD_BY_ID[ref.id]; const used = G.turn.usedItems.includes(ref.id) ? 'Đã dùng lượt này' : undefined;
    const blk = (a: 'use' | 'drop' | 'trade') => hh?.blockCard?.(c, pid, ref.id, a) ?? undefined;
    if (def.usable === 'action' && blk('use') === undefined) {
      const afterHaunt = ['crystal-ball', 'bell', 'bottle'].includes(ref.id) && G.phase !== 'haunt' ? 'Chỉ sau khi Haunt bắt đầu' : undefined;
      out.push({ id: 'useCard', label: `Dùng ${def.name}`, args: { card: ref.id }, disabled: used || afterHaunt });
    }
    if (!def.noDrop && blk('drop') === undefined) out.push({ id: 'drop', label: `Thả ${def.name}`, args: { card: ref.id }, disabled: used });
    if (!def.noTrade && blk('trade') === undefined) for (const o of Object.values(G.players)) if (o.id !== pid && !o.dead && o.room === room) out.push({ id: 'trade', label: `Đưa ${def.name} cho ${pname(G, o.id)}`, args: { card: ref.id, to: o.id }, disabled: used });
  }
  // attacks
  if (G.phase === 'haunt') {
    for (const t of attackTargets(c, pid)) out.push({ id: 'attack', label: `Tấn công ${t.label}`, args: { target: t.id, trait: t.trait, weapon: t.weapon }, disabled: G.turn.attacked ? 'Đã tấn công lượt này' : undefined });
    out.push(...hauntActionInfos(c, pid, p.isTraitor ? 'traitor' : 'heroes'));
  }
  out.push({ id: 'manual', label: 'Điều chỉnh thủ công (cho phần luật chưa tự động)' });
  out.push({ id: 'endTurn', label: 'Kết thúc lượt' });
  return out;
}

/** Haunt-specific actions of one side as buttons (actions with options expand into one button per option). */
export function hauntActionInfos(c: Ctx, pid: string, side: 'heroes' | 'traitor' | 'monsters'): ActionInfo[] {
  const G = c.G; const h = G.haunt ? HAUNTS[G.haunt.number] : undefined; const out: ActionInfo[] = []; if (!h) return out;
  for (const a of h.actions) {
    if (a.side !== side) continue; const r = a.check(c, pid);
    if (!a.options || r) { out.push({ id: `haunt:${a.id}`, label: a.label, disabled: r ?? undefined }); continue; }
    const opts = a.options(c, pid);
    if (!opts.length) out.push({ id: `haunt:${a.id}`, label: a.label, disabled: 'Không có lựa chọn hợp lệ' });
    for (const o of opts) out.push({ id: `haunt:${a.id}`, label: `${a.label}: ${o.label}`, args: o.args });
  }
  return out;
}
export function monsterActions(c: Ctx, pid: string): ActionInfo[] {
  const G = c.G; if (G.phase !== 'haunt' || G.turn.part !== 'monsters' || G.turn.player !== pid || G.haunt?.traitor !== pid) return [];
  return hauntActionInfos(c, pid, 'monsters');
}

export function doAction(c: Ctx, pid: string, id: string, args: Record<string, unknown> = {}): string | null {
  const G = c.G; const p = G.players[pid];
  if (G.pending.length) return 'Đang chờ quyết định';
  const avail = availableActions(c, pid).find((a) => a.id === id && JSON.stringify(a.args ?? {}) === JSON.stringify(args.__match ?? a.args ?? {}) );
  if (id !== 'manual' && id !== 'endTurn' && !id.startsWith('haunt:') && !availableActions(c, pid).some((a) => a.id === id && !a.disabled && Object.entries(a.args ?? {}).every(([k, v]) => args[k] === v))) return 'Hành động không hợp lệ lúc này';
  void avail;
  const mark = (k: string) => G.turn.rollsDone.push(k);
  const room = p.room;
  switch (id) {
    case 'free': {
      const tgt = args.target as string; mark(`free:${tgt}`); const st = G.players[tgt].statuses; const k = st.buried ? 'buried' : 'webbed';
      startRoll(c, { player: pid, label: `Giải cứu (${k === 'buried' ? 'Debris' : 'Webs'})`, trait: 'might', outcomes: [
        { min: 4, effects: [{ t: 'custom', fn: 'freeStuck', args: { target: tgt, key: k } }] }, { min: 0, max: 3, effects: [{ t: 'custom', fn: 'freeFail', args: { target: tgt, key: k } }] }] });
      break;
    }
    case 'cross': { mark('cross'); const b = BARRIERS[room]; startRoll(c, { player: pid, label: `Băng qua ${roomName(room)}`, trait: b.trait, outcomes: [{ min: b.target, effects: [{ t: 'custom', fn: 'crossed' }] }, { min: 0, max: b.target - 1, effects: [{ t: 'endMove' }] }] }); break; }
    case 'vault': mark('vault'); startRoll(c, { player: pid, label: 'Vault', trait: 'knowledge', outcomes: [{ min: 6, effects: [{ t: 'token', kind: 'vaultEmpty' }, { t: 'draw', kind: 'item', n: 2 }] }, { min: 0, max: 5, effects: [] }] }); break;
    case 'galleryFall': onExit(c, pid, room); p.room = 'ballroom'; log(G, `${pname(G, pid)} nhảy xuống Ballroom.`); if (!harmfulIgnored(c, pid)) enqueue(c, pid, [{ t: 'damage', kind: 'physical', dice: 1 }]); break;
    case 'collapseDrop': { const b = G.tokens.find((t) => t.kind === 'belowCollapsed'); if (b) { p.room = b.room; log(G, `${pname(G, pid)} rơi xuống ${roomName(b.room)}.`); if (!harmfulIgnored(c, pid)) enqueue(c, pid, [{ t: 'damage', kind: 'physical', dice: 1 }]); } else CUSTOM.collapseFall(c, pid, {}); break; }
    case 'closet': mark('closet'); enqueue(c, pid, [{ t: 'roll', spec: { label: 'Closet', dice: 2, outcomes: [{ min: 4, effects: [{ t: 'draw', kind: 'item' }] }, { min: 2, max: 3, effects: [{ t: 'draw', kind: 'event' }] }, { min: 0, max: 1, effects: [{ t: 'custom', fn: 'removeToken', args: { kind: 'closet' } }, { t: 'draw', kind: 'event' }] }] } }]); break;
    case 'safe': mark('safe'); enqueue(c, pid, [{ t: 'roll', spec: { label: 'Locked Safe', trait: 'knowledge', outcomes: [{ min: 5, effects: [{ t: 'custom', fn: 'removeToken', args: { kind: 'safe' } }, { t: 'draw', kind: 'item', n: 2 }] }, { min: 2, max: 4, effects: [{ t: 'damage', kind: 'physical', dice: 1 }] }, { min: 0, max: 1, effects: [{ t: 'damage', kind: 'physical', dice: 2 }] }] } }]); break;
    case 'skeletons': mark('skeletons'); enqueue(c, pid, [{ t: 'roll', spec: { label: 'Skeletons', trait: 'sanity', outcomes: [{ min: 5, effects: [{ t: 'custom', fn: 'removeToken', args: { kind: 'skeletons' } }, { t: 'draw', kind: 'item' }] }, { min: 0, max: 4, effects: [{ t: 'damage', kind: 'mental', dice: 1 }] }] } }]); break;
    case 'slide': mark('slide'); CUSTOM.rideSlide(c, pid, {}); break;
    case 'wallSwitch': { mark('wallSwitch'); const t = tokensIn(G, room, 'wallSwitch')[0]; const o = G.tokens.find((x) => x.kind === 'wallSwitch' && x !== t && x.data?.pair === t.data?.pair);
      if (o) { if (harmfulIgnored(c, pid)) placeExplorer(c, pid, o.room); else startRoll(c, { player: pid, label: 'Revolving Wall', trait: 'knowledge', outcomes: [{ min: 3, effects: [{ t: 'moveTo', room: o.room }] }, { min: 0, max: 2, effects: [] }] }); } break; }
    case 'pickup': { const t = G.tokens.find((x) => x.id === args.pile)!; const cards = t.data!.cards as CardRef[]; const i = cards.findIndex((x) => x.id === args.card); const [ref] = cards.splice(i, 1); if (!cards.length) G.tokens = G.tokens.filter((x) => x !== t); gainCard(c, pid, ref); G.turn.usedItems.push(ref.id); log(G, `${pname(G, pid)} nhặt ${cardName(ref.id)}.`); break; }
    case 'drop': G.turn.usedItems.push(args.card as string); CUSTOM.dropItemAt(c, pid, { card: args.card, room }); log(G, `${pname(G, pid)} thả ${cardName(args.card as string)}.`); break;
    case 'trade': { const ref = loseCard(c, pid, args.card as string); if (ref) { gainCard(c, args.to as string, ref); G.turn.usedItems.push(ref.id); log(G, `${pname(G, pid)} đưa ${cardName(ref.id)} cho ${pname(G, args.to as string)}.`); } break; }
    case 'useCard': { const card = args.card as string; G.turn.usedItems.push(card); useCard(c, pid, card, args); break; }
    case 'attack': return attack(c, pid, args.target as string, args.trait as Trait, args.weapon as string | undefined);
    case 'manual': return manualAdjust(c, pid, args);
    case 'endTurn': return 'use endTurn move';
    default: {
      if (id.startsWith('haunt:')) {
        if (G.phase !== 'haunt') return 'Haunt chưa bắt đầu';
        const h = HAUNTS[G.haunt!.number]; const a = h.actions.find((x) => `haunt:${x.id}` === id); if (!a) return 'Không có';
        const side = G.turn.part === 'monsters' ? (pid === G.haunt!.traitor ? 'monsters' : '-') : p.isTraitor ? 'traitor' : 'heroes';
        if (a.side !== side) return 'Không phải phe bạn / không đúng lượt';
        if (side !== 'monsters' && (p.dead || G.turn.forceEnd)) return 'Không thể làm lúc này';
        const r = a.check(c, pid); if (r) return r;
        if (a.options && !a.options(c, pid).some((o) => Object.entries(o.args).every(([k, v]) => JSON.stringify(args[k]) === JSON.stringify(v)))) return 'Lựa chọn không hợp lệ';
        a.run(c, pid, args); break;
      }
      return 'Không rõ hành động';
    }
  }
  processQueue(c); afterChange(c);
  return null;
}
CUSTOM.crossed = (c, pid) => { const p = c.G.players[pid]; p.barrierSide = p.barrierSide === 1 ? 0 : 1; log(c.G, `${pname(c.G, pid)} đã băng qua.`); };
CUSTOM.removeToken = (c, pid, a) => { const G = c.G; const t = tokensIn(G, G.players[pid].room, a.kind as string)[0]; if (t) G.tokens = G.tokens.filter((x) => x !== t); };
CUSTOM.freeStuck = (c, _pid, a) => { const G = c.G; delete G.players[a.target as string].statuses[a.key as string]; log(G, `${pname(G, a.target as string)} đã được giải thoát.`); };
CUSTOM.freeFail = (c, pid, a) => {
  const G = c.G; const st = G.players[a.target as string].statuses[a.key as string] as { fails: number; freeNext?: boolean };
  if (!st) return; st.fails++; if (a.key === 'webbed' && pid === G.turn.player) G.turn.moveEnded = true;
  if (st.fails >= 3) { st.freeNext = true; log(G, `${pname(G, a.target as string)} sẽ tự thoát vào lượt kế tiếp.`); }
};

/** Manual adjustment (public, logged) for parts of cards/rules that are not automated. */
function manualAdjust(c: Ctx, pid: string, a: Record<string, unknown>): string | null {
  if (c.G.phase !== 'explore' && c.G.phase !== 'haunt') return 'Chỉ điều chỉnh thủ công được khi ván đang chơi'; // select: no character yet (used to throw); over: final state is frozen
  if (!c.G.players[pid]?.character) return 'Chưa có nhân vật';
  if (a.room && !c.G.rooms[a.room as string]) return 'Phòng này chưa có trong nhà';
  const G = c.G;
  if (a.trait && typeof a.delta === 'number') { log(G, `✋ [Thủ công] ${pname(G, pid)} chỉnh ${TRAIT_VI[a.trait as Trait]} ${a.delta > 0 ? '+' : ''}${a.delta}${a.reason ? ` — ${a.reason}` : ''}`); shiftTrait(G, pid, a.trait as Trait, a.delta); }
  else if (a.room) { log(G, `✋ [Thủ công] ${pname(G, pid)} tự đặt mình vào ${roomName(a.room as string)}${a.reason ? ` — ${a.reason}` : ''}`); placeExplorer(c, pid, a.room as string); }
  else return 'Thiếu tham số';
  afterChange(c); return null;
}

// ------------------------------------------------------------------ item / omen usage
function useCard(c: Ctx, pid: string, card: string, args: Record<string, unknown>) {
  const G = c.G; const p = G.players[pid];
  const T = (label: string, trait: Trait, outcomes: { min: number; max?: number; effects: Effect[] }[]) => startRoll(c, { player: pid, label, trait, outcomes });
  switch (card) {
    case 'crystal-ball': T('Crystal Ball', 'knowledge', [{ min: 4, effects: [{ t: 'custom', fn: 'crystalBall' }] }, { min: 1, max: 3, effects: [{ t: 'lose', trait: 'sanity', n: 1 }] }, { min: 0, max: 0, effects: [{ t: 'lose', trait: 'sanity', n: 2 }] }]); break;
    case 'mask': T('Mask', 'sanity', [{ min: 4, effects: [{ t: 'custom', fn: 'maskToggle' }] }, { min: 0, max: 3, effects: [] }]); break;
    case 'spirit-board': {
      log(G, `${pname(G, pid)} xem ô phòng trên cùng (riêng).`);
      log(G, `(Chỉ bạn thấy) Ô phòng trên cùng: ${G.roomStack[0] ? roomName(G.roomStack[0]) : '(hết)'}`, [pid]);
      if (G.phase === 'haunt' && !p.isTraitor) CUSTOM.traitorMayPullMonsters(c, pid, {});
      break;
    }
    case 'bell': T('Bell', 'sanity', [{ min: 5, effects: [{ t: 'custom', fn: 'bellPull' }] }, { min: 0, max: 4, effects: [{ t: 'custom', fn: 'traitorMayPullMonsters' }] }]); break;
    case 'bottle': {
      discardCard(G, loseCard(c, pid, 'bottle')!);
      const d = rollDice(c.rng, 3, { label: 'Bottle', reason: '3 xúc xắc' }); const t = sum(d); log(G, `🎲 Bottle: [${d.join(',')}] = ${t}`);
      const fx: Record<number, Effect[]> = { 6: [{ t: 'custom', fn: 'pickAnyRoom' }], 5: [{ t: 'gain', trait: 'might', n: 2 }, { t: 'gain', trait: 'speed', n: 2 }], 4: [{ t: 'gain', trait: 'knowledge', n: 2 }, { t: 'gain', trait: 'sanity', n: 2 }], 3: [{ t: 'gain', trait: 'knowledge', n: 1 }, { t: 'lose', trait: 'might', n: 1 }], 2: [{ t: 'lose', trait: 'knowledge', n: 2 }, { t: 'lose', trait: 'sanity', n: 2 }], 1: [{ t: 'lose', trait: 'might', n: 2 }, { t: 'lose', trait: 'speed', n: 2 }], 0: [{ t: 'lose', trait: 'all', n: 2 }] };
      enqueue(c, pid, fx[t], true); break;
    }
    case 'dark-dice': {
      const d = rollDice(c.rng, 3, { label: 'Dark Dice', reason: '3 xúc xắc' }); const t = sum(d); log(G, `🎲 Dark Dice: [${d.join(',')}] = ${t}`);
      const fx: Record<number, Effect[]> = { 6: [{ t: 'custom', fn: 'darkDice6' }], 5: [{ t: 'custom', fn: 'darkDice5' }], 4: [{ t: 'gain', trait: 'physical', n: 1 }], 3: [{ t: 'custom', fn: 'darkDice3' }], 2: [{ t: 'gain', trait: 'mental', n: 1 }], 1: [{ t: 'draw', kind: 'event' }], 0: [{ t: 'custom', fn: 'darkDice0' }] };
      enqueue(c, pid, fx[t], true); break;
    }
    case 'dynamite': {
      if (G.turn.attacked) { log(G, 'Đã tấn công lượt này (Dynamite thay cho đòn tấn công).'); return; }
      const adj = doorNeighbors(G, p.room).map((n) => n.room);
      if (!adj.length) { log(G, 'Dynamite: không có phòng kề (có cửa nối) để ném vào.'); G.turn.usedItems = G.turn.usedItems.filter((x) => x !== card); return; }
      G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Ném Dynamite vào phòng kề nào?', rooms: adj, then: [], varName: 'dynamite' });
      break;
    }
    case 'healing-salve': case 'smelling-salts': case 'medical-kit': {
      const cands = Object.values(G.players).filter((o) => !o.dead && o.room === p.room).map((o) => o.id);
      G.pending.push({ type: 'choice', player: pid, prompt: `${cardName(card)}: dùng cho ai?`, options: cands.map((o) => ({ label: pname(G, o), effects: [{ t: 'custom', fn: 'heal', args: { card, target: o } }] })) });
      break;
    }
    case 'puzzle-box': T('Puzzle Box', 'knowledge', [{ min: 6, effects: [{ t: 'custom', fn: 'discardOwn', args: { card: 'puzzle-box' } }, { t: 'draw', kind: 'item', n: 2 }] }, { min: 0, max: 5, effects: [] }]); break;
    case 'pickpockets-gloves': {
      const opts = Object.values(G.players).filter((o) => o.id !== pid && !o.dead && o.room === p.room).flatMap((o) => o.cards.filter((x) => x.kind === 'item').map((x) => ({ label: `${cardName(x.id)} của ${pname(G, o.id)}`, effects: [{ t: 'custom', fn: 'pickpocket', args: { from: o.id, card: x.id } }] as Effect[] })));
      if (!opts.length) { log(G, 'Không có Item nào để lấy.'); G.turn.usedItems = G.turn.usedItems.filter((x) => x !== card); return; }
      G.pending.push({ type: 'choice', player: pid, prompt: "Pickpocket's Gloves: lấy món nào?", options: opts }); break;
    }
    case 'music-box': p.statuses.musicBoxOpen = !p.statuses.musicBoxOpen; log(G, `Music Box ${p.statuses.musicBoxOpen ? 'mở' : 'đóng'}. (TODO: hiệu ứng mê hoặc chưa tự động — tự áp dụng)`); break;
    default: log(G, `${cardName(card)}: chưa có hành động.`);
  }
  void args;
}
CUSTOM.crystalBall = (c, pid) => {
  const G = c.G; const opts = (['item', 'event'] as CardKind[]).flatMap((k) => G.decks[k].map((id) => ({ label: `${k === 'item' ? 'Item' : 'Event'}: ${cardName(id)}`, effects: [{ t: 'custom', fn: 'crystalTop', args: { kind: k, card: id } }] as Effect[] })));
  G.pending.push({ type: 'choice', player: pid, prompt: 'Crystal Ball: chọn 1 lá để đặt lên đầu chồng (sau khi xáo)', options: opts });
};
CUSTOM.crystalTop = (c, _pid, a) => { const G = c.G; const k = a.kind as CardKind; G.decks[k] = [a.card as string, ...c.rng.shuffle(G.decks[k].filter((x) => x !== a.card))]; log(G, `Chồng ${k} được xáo, một lá được đặt lên trên cùng.`); };
CUSTOM.maskToggle = (c, pid) => { const p = c.G.players[pid]; if (p.statuses.maskOn) { delete p.statuses.maskOn; shiftTrait(c.G, pid, 'sanity', 2); shiftTrait(c.G, pid, 'knowledge', -2); } else { p.statuses.maskOn = true; shiftTrait(c.G, pid, 'knowledge', 2); shiftTrait(c.G, pid, 'sanity', -2); } };
CUSTOM.bellPull = (c, pid) => {
  const G = c.G; const to = G.players[pid].room;
  const hm = HAUNTS[G.haunt?.number ?? -1];
  for (const h of livingExplorers(G)) { if (h === pid || G.players[h].isTraitor || isStuck(G.players[h])) continue; if (G.phase === 'haunt' && G.players[pid].isTraitor && hm?.canAttackExplorer?.(c, pid, h)) continue; const n = nextStepOf(c, G.players[h].room, to); if (n) { G.players[h].room = n; log(G, `Bell kéo ${pname(G, h)} tới ${roomName(n)}.`); } }
};
CUSTOM.traitorMayPullMonsters = (c, pid) => {
  const G = c.G; if (G.phase !== 'haunt' || G.players[pid].isTraitor) return; const tr = G.haunt!.traitor; const to = G.players[pid].room;
  if (!tr || !G.monsters.length) return;
  G.pending.push({ type: 'choice', player: tr, prompt: `Bạn có muốn dời quái vật 1 ô về phía ${pname(G, pid)}?`, options: [{ label: 'Có', effects: [{ t: 'custom', fn: 'pullMonsters', args: { to } }] }, { label: 'Không', effects: [] }] });
};
CUSTOM.pullMonsters = (c, _pid, a) => { for (const m of c.G.monsters) { const n = nextStepOf(c, m.room, a.to as string); if (n) { m.room = n; log(c.G, `${m.name} dời tới ${roomName(n)}.`); } } };
function nextStepOf(c: Ctx, from: string, to: string) { const d = distances(c.G, to); let best: string | null = null; for (const l of links(c.G, from)) if (d[l.room] !== undefined && d[l.room] < (d[from] ?? 1e9) && (best === null || d[l.room] < d[best])) best = l.room; return best; }
CUSTOM.pickAnyRoom = (c, pid) => { c.G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Chọn phòng bất kỳ', rooms: Object.keys(c.G.rooms), then: [], varName: 'room' }); };
CUSTOM.darkDice6 = (c, pid) => { const G = c.G; const rs = [...new Set(livingExplorers(G).filter((o) => o !== pid && !G.players[o].isTraitor).map((o) => G.players[o].room))]; if (rs.length) G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Dark Dice: đến phòng của explorer nào?', rooms: rs, then: [], varName: 'room' }); };
CUSTOM.darkDice5 = (c, pid) => { const G = c.G; const others = livingExplorers(G).filter((o) => o !== pid && G.players[o].room === G.players[pid].room); const adj = doorNeighbors(G, G.players[pid].room).map((n) => n.room); if (!others.length || !adj.length) return; G.pending.push({ type: 'choice', player: pid, prompt: 'Dark Dice: đẩy ai sang phòng kề?', options: others.flatMap((o) => adj.map((r) => ({ label: `${pname(G, o)} → ${roomName(r)}`, effects: [{ t: 'custom', fn: 'pushTo', args: { who: o, room: r } }] as Effect[] }))) }); };
CUSTOM.pushTo = (c, _pid, a) => placeExplorer(c, a.who as string, a.room as string);
CUSTOM.darkDice3 = (c, pid) => { const G = c.G; const adj = doorNeighbors(G, G.players[pid].room).map((n) => n.room); if (adj.length) G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Dark Dice: sang phòng kề nào?', rooms: adj, then: [], varName: 'room' }); };
CUSTOM.darkDice0 = (c, pid) => { const G = c.G; const p = G.players[pid]; for (const t of TRAITS) shiftTrait(G, pid, t, -p.idx[t]); discardCard(G, loseCard(c, pid, 'dark-dice')!); };
CUSTOM.discardOwn = (c, pid, a) => { const r = loseCard(c, pid, a.card as string); if (r) discardCard(c.G, r); };
CUSTOM.pickpocket = (c, pid, a) => { const G = c.G; discardCard(G, loseCard(c, pid, 'pickpockets-gloves')!); const r = loseCard(c, a.from as string, a.card as string); if (r) { gainCard(c, pid, r); log(G, `${pname(G, pid)} móc túi lấy ${cardName(r.id)}.`); } };
CUSTOM.heal = (c, pid, a) => {
  const G = c.G; const card = a.card as string; const tg = a.target as string; const o = G.players[tg];
  const restore = (t: Trait) => { const ch = CHARACTERS.find((x) => x.id === o.character)!; if (o.idx[t] < ch.traits[t].start) shiftTrait(G, tg, t, ch.traits[t].start - o.idx[t]); };
  if (card === 'healing-salve') { restore('might'); restore('speed'); discardCard(G, loseCard(c, pid, card)!); }
  else if (card === 'smelling-salts') { restore('knowledge'); discardCard(G, loseCard(c, pid, card)!); }
  else startRoll(c, { player: pid, label: 'Medical Kit', trait: 'knowledge', outcomes: [8, 6, 4].map((min, i) => ({ min, max: i === 0 ? undefined : min + 1, effects: [{ t: 'custom', fn: 'medkitHeal', args: { target: tg, n: 3 - i } }] as Effect[] })).concat([{ min: 0, max: 3, effects: [] }]) });
};
CUSTOM.medkitHeal = (c, _pid, a) => {
  // "gain N points of physical traits; can't raise traits above their starting values" — applied greedily to Might then Speed.
  const G = c.G; const tg = a.target as string; const o = G.players[tg]; const ch = CHARACTERS.find((x) => x.id === o.character)!; let n = a.n as number;
  for (const t of PHYSICAL) { const room = ch.traits[t].start - o.idx[t]; const k = Math.max(0, Math.min(room, n)); if (k) { shiftTrait(G, tg, t, k); n -= k; } }
};

// ------------------------------------------------------------------ combat
export interface AttackTarget { id: string; label: string; trait: Trait; weapon?: string }
export function attackTargets(c: Ctx, pid: string): AttackTarget[] {
  const G = c.G; const p = G.players[pid]; const out: AttackTarget[] = []; if (G.phase !== 'haunt' || G.turn.part !== 'explorer') return out;
  const weapons = p.cards.filter((x) => CARD_BY_ID[x.id].weapon).map((x) => x.id);
  const add = (id: string, label: string, sameRoom: boolean, hasSanity: boolean, hasSpeed: boolean) => {
    if (sameRoom) { out.push({ id, label: `${label} (Might)`, trait: 'might' }); for (const w of weapons) if (CARD_BY_ID[w].weapon!.trait === 'might') out.push({ id, label: `${label} (Might + ${cardName(w)})`, trait: 'might', weapon: w }); if (holds(p, 'ring') && hasSanity) out.push({ id, label: `${label} (Sanity, Ring)`, trait: 'sanity' }); }
    if (holds(p, 'revolver') && hasSpeed) out.push({ id, label: `${label} (Speed, Revolver${sameRoom ? '' : ', từ xa'})`, trait: 'speed', weapon: 'revolver' });
  };
  const los = lineOfSight(G, p.room); const h = HAUNTS[G.haunt?.number ?? -1];
  for (const o of livingExplorers(G)) { if (o === pid || !isOpponent(G, pid, o)) continue; if (h?.canAttackExplorer?.(c, pid, o)) continue; const r = G.players[o].room; if (r === p.room || los.includes(r)) add(o, pname(G, o), r === p.room, true, true); }
  if (!p.isTraitor) for (const m of G.monsters) { if (m.untargetable) continue; if (m.room === p.room || los.includes(m.room)) add(`m:${m.id}`, m.name, m.room === p.room, m.traits.sanity !== undefined, m.traits.speed !== undefined); }
  return out;
}
function combatant(c: Ctx, id: string) {
  const G = c.G; if (id.startsWith('m:')) { const m = G.monsters.find((x) => `m:${x.id}` === id)!; return { m, val: (t: Trait) => m.traits[t] ?? 0, name: m.name }; }
  const p = G.players[id]; return { p, val: (t: Trait) => traitValue(p, t), name: pname(G, id) };
}
export function attack(c: Ctx, pid: string, target: string, trait: Trait, weapon?: string): string | null {
  const G = c.G; if (G.turn.attacked) return 'Đã tấn công lượt này';
  const t = attackTargets(c, pid).find((x) => x.id === target && x.trait === trait && x.weapon === weapon); if (!t) return 'Mục tiêu không hợp lệ';
  const h = HAUNTS[G.haunt!.number];
  if (target.startsWith('m:')) { const e = h.canAttackMonster?.(c, pid, target.slice(2), trait, weapon); if (e) return e; }
  G.turn.attacked = true;
  if (weapon) G.turn.usedItems.push(weapon);
  if (weapon === 'sacrificial-dagger') {
    startRoll(c, { player: pid, label: 'Sacrificial Dagger', trait: 'knowledge', outcomes: [
      { min: 6, effects: [{ t: 'custom', fn: 'resolveAttack', args: { target, trait, weapon } }] },
      { min: 3, max: 5, effects: [{ t: 'lose', trait: 'mental', n: 1 }, { t: 'custom', fn: 'resolveAttack', args: { target, trait, weapon } }] },
      { min: 0, max: 2, effects: [{ t: 'damage', kind: 'physical', dice: 2 }, { t: 'log', text: 'Dao vặn khỏi tay! Không thể tấn công lượt này.' }] }] });
  } else CUSTOM.resolveAttack(c, pid, { target, trait, weapon });
  processQueue(c); afterChange(c); return null;
}
/** Attacker rolls, then the defender (a monster's dice are rolled by the traitor). */
function attackAsks(c: Ctx, pid: string, a: Record<string, unknown>) {
  const G = c.G; const target = a.target as string; const trait = a.trait as Trait; const weapon = a.weapon as string | undefined;
  const att = combatant(c, pid); const def = combatant(c, target); const bonus = weapon ? CARD_BY_ID[weapon].weapon!.bonusDice : 0;
  return [
    { who: pid, label: `${att.name} tấn công ${def.name} (${TRAIT_VI[trait]}${weapon ? ` + ${cardName(weapon)}` : ''})`, reason: diceReason(TRAIT_VI[trait], att.val(trait) + bonus) + (bonus ? ` (gồm +${bonus} của ${cardName(weapon!)})` : '') },
    { who: def.m ? (G.haunt?.traitor ?? pid) : target, label: `${def.name} chống đỡ (${TRAIT_VI[trait]})`, reason: diceReason(TRAIT_VI[trait], def.val(trait)) },
  ];
}
CUSTOM_ROLLS.resolveAttack = { label: 'Tấn công', asks: (c, pid, a) => attackAsks(c, pid, a) };
CUSTOM.resolveAttack = (c, pid, a) => {
  const G = c.G; const target = a.target as string; const trait = a.trait as Trait; const weapon = a.weapon as string | undefined;
  const att = combatant(c, pid); const def = combatant(c, target);
  const bonus = weapon ? CARD_BY_ID[weapon].weapon!.bonusDice : 0;
  if (weapon === 'blood-dagger') shiftTrait(G, pid, 'speed', -1);
  const distance = weapon === 'revolver' && !target.startsWith('m:') ? G.players[target].room !== G.players[pid].room : target.startsWith('m:') ? G.monsters.find((m) => `m:${m.id}` === target)!.room !== G.players[pid].room : false;
  const asks = attackAsks(c, pid, a);
  const ad = rollDice(c.rng, Math.min(8, att.val(trait) + bonus), asks[0]); const dd = rollDice(c.rng, Math.min(8, def.val(trait)), asks[1]);
  const A = sum(ad), D = sum(dd);
  log(G, `⚔️ ${att.name} tấn công ${def.name} bằng ${TRAIT_VI[trait]}${weapon ? ` + ${cardName(weapon)}` : ''}: [${ad.join(',')}]=${A} vs [${dd.join(',')}]=${D}`);
  const kind: DamageKind = trait === 'sanity' || trait === 'knowledge' ? 'mental' : 'physical';
  if (A > D) {
    if (def.m) { const h = HAUNTS[G.haunt!.number]; if (!h.onMonsterDefeated?.(c, pid, def.m.id, trait)) stunMonster(c, def.m); }
    else if (kind === 'physical' && A - D >= 2 && !distance && (stealable(G, target).length || (HAUNTS[G.haunt!.number].stealExtras?.(c, pid, target) ?? []).length)) G.pending.push({ type: 'steal', player: pid, target, damage: A - D, kind, targetIsMonster: false, extras: HAUNTS[G.haunt!.number].stealExtras?.(c, pid, target) });
    else requestDamage(c, target, kind, A - D, 'attack');
  } else if (D > A) {
    if (distance) { log(G, 'Tấn công từ xa thất bại: người tấn công không bị sát thương.'); return; }
    if (def.m) { if (def.m.stunned) { log(G, 'Quái vật đang bị choáng: không gây sát thương.'); return; } monsterInflicts(c, def.m.id, pid, D - A, trait); }
    else requestDamage(c, pid, kind, D - A, 'attack');
  } else log(G, 'Hoà — không ai bị thương.');
};
export function stealable(G: GState, pid: string) { return G.players[pid].cards.filter((x) => !CARD_BY_ID[x.id].noSteal); }
export function resolveSteal(c: Ctx, pid: string, choice: string | null) {
  const G = c.G; const pd = G.pending[0]; if (pd?.type !== 'steal') return; G.pending.shift();
  if (!choice) { requestDamage(c, pd.target, pd.kind, pd.damage, 'attack'); return; }
  const h = HAUNTS[G.haunt?.number ?? -1];
  if (choice.startsWith('x:')) { const x = choice.slice(2); if (pd.extras?.some((e) => e.id === x)) h?.onStealExtra?.(c, pid, pd.target, x); else requestDamage(c, pd.target, pd.kind, pd.damage, 'attack'); return; }
  const ref = loseCard(c, pd.target, choice); if (!ref) return;
  if (h?.onCardStolen?.(c, pid, pd.target, choice)) return;
  gainCard(c, pid, ref); log(G, `${pname(G, pid)} cướp ${cardName(choice)} của ${pname(G, pd.target)}.`);
  if (choice === 'blood-dagger') enqueue(c, pd.target, [{ t: 'damage', kind: 'physical', dice: 2 }], true);
}
export function stunMonster(c: Ctx, m: Monster) {
  m.stunned = true; m.stunnedSince = c.G.turnCounter; log(c.G, `💫 ${m.name} bị choáng (stunned) và mất lượt kế tiếp.`);
  if (m.carries.length) { c.G.tokens.push({ id: `pile-m-${c.G.log.length}`, kind: 'itemPile', room: m.room, data: { cards: m.carries } }); log(c.G, `${m.name} đánh rơi: ${m.carries.map((x) => cardName(x.id)).join(', ')}`); m.carries = []; }
}
function monsterInflicts(c: Ctx, mid: string, pid: string, diff: number, trait: Trait) {
  const h = HAUNTS[c.G.haunt!.number];
  if (h.onMonsterInflicts?.(c, mid, pid, diff, trait)) return;
  requestDamage(c, pid, trait === 'sanity' || trait === 'knowledge' ? 'mental' : 'physical', diff, 'monster');
}
/** Monster attacks an explorer (traitor-controlled). */
export function monsterAttack(c: Ctx, mid: string, pid: string): string | null {
  const G = c.G; const m = G.monsters.find((x) => x.id === mid); if (!m) return 'Không có quái vật';
  if (G.turn.part !== 'monsters') return 'Không phải lượt quái vật'; if (m.stunned) return 'Quái vật đang bị choáng';
  if ((G.turn as Record<string, unknown>)[`att:${mid}`]) return 'Quái vật đã tấn công lượt này';
  const p = G.players[pid]; if (!p || p.dead || p.room !== m.room || p.isTraitor) return 'Mục tiêu không hợp lệ';
  if (m.noAttack) return `${m.name} không thể tấn công`;
  const h = HAUNTS[G.haunt!.number]; const no = h.canAttackExplorer?.(c, `m:${mid}`, pid); if (no) return no;
  if (G.pending.length) return 'Đang chờ quyết định';
  (G.turn as Record<string, unknown>)[`att:${mid}`] = true;
  let ad = rollDice(c.rng, Math.min(8, m.traits.might ?? 0), { who: G.haunt?.traitor ?? undefined, label: `${m.name} tấn công ${pname(G, pid)}`, reason: diceReason(`${m.name} Might`, m.traits.might ?? 0) }); const dd = rollDice(c.rng, Math.min(8, traitValue(p, 'might')), { who: pid, label: `${pname(G, pid)} chống đỡ`, reason: diceReason('Might', traitValue(p, 'might')) });
  if (h.onMonsterAttackRoll) ad = h.onMonsterAttackRoll(c, mid, ad);
  const A = sum(ad), D = sum(dd);
  log(G, `⚔️ ${m.name} tấn công ${pname(G, pid)}: [${ad.join(',')}]=${A} vs [${dd.join(',')}]=${D}`);
  if (A > D) monsterInflicts(c, mid, pid, A - D, 'might');
  else if (D > A) { if (!h.onMonsterLoses?.(c, mid, pid)) stunMonster(c, m); }
  else log(G, 'Hoà.');
  processQueue(c); afterChange(c); return null;
}

// ------------------------------------------------------------------ pending resolution
export function resolvePending(c: Ctx, pid: string, payload: Record<string, unknown>): string | null {
  const G = c.G; const pd = G.pending[0]; if (!pd) return 'Không có gì để quyết định';
  if (pd.player !== pid) return 'Không phải lượt quyết định của bạn';
  switch (pd.type) {
    case 'damage': {
      const p = G.players[pid]; let kind = pd.kind;
      if (payload.convert && kind === 'mental' && holds(p, 'skull')) kind = 'physical';
      const [a, b] = kind === 'physical' ? PHYSICAL : MENTAL;
      const x = Math.max(0, Math.min(pd.amount, Number(payload.first ?? pd.amount)));
      G.pending.shift(); applyDamage(c, pid, kind, { [a]: x, [b]: pd.amount - x });
      break;
    }
    case 'choice': { const o = pd.options[Number(payload.option)]; if (!o) return 'Lựa chọn không hợp lệ'; G.pending.shift(); enqueue(c, pid, o.effects, true); break; }
    case 'rotate': { const r = Number(payload.rot); if (!pd.options.includes(r)) return 'Hướng xoay không hợp lệ'; G.pending.shift(); finishPlacement(c, pid, pd.tile, pd.floor, pd.x, pd.y, r, (G.turn as Record<string, unknown>).discoverFrom as string); break; }
    case 'pickRoom': {
      const room = payload.room as string; if (!pd.rooms.includes(room)) return 'Phòng không hợp lệ'; G.pending.shift();
      if (pd.varName.startsWith('token:')) { const [, kind, pair] = pd.varName.split(':'); G.tokens.push({ id: `${pair}-b`, kind, room, data: { pair } }); log(G, `Đặt đầu kia của ${kind} ở ${roomName(room)}.`); if (kind === 'secretStairs') G.pending.push({ type: 'choice', player: pid, prompt: 'Dùng Secret Stairs ngay bây giờ (rút 1 Event ở phòng mới)?', options: [{ label: 'Có', effects: [{ t: 'moveTo', room }, { t: 'draw', kind: 'event' }] }, { label: 'Không', effects: [] }] }); }
      else if (pd.varName === 'dynamite') dynamite(c, pid, room);
      else if (pd.varName.startsWith('custom:')) { CUSTOM[pd.varName.slice(7)]?.(c, pid, { room }); enqueue(c, pid, pd.then, true); }
      else { placeExplorer(c, pid, room); enqueue(c, pid, pd.then, true); }
      break;
    }
    case 'preRoll': { G.pending.shift(); const ch = payload.choice as string | undefined; const spec = ch && pd.options.includes(ch) ? applyPreRoll(c, pd.roll, ch, Number(payload.value)) : pd.roll; doRoll(c, spec); break; }
    case 'postRoll': {
      G.pending.shift(); const ch = payload.choice as string | undefined; let dice = [...pd.dice];
      if (ch === 'lucky-stone' && pd.options.includes(ch)) { const idx = (payload.dice as number[]) ?? dice.map((_, i) => i); const nd = rollDice(c.rng, idx.length, { label: 'Lucky Stone: đổ lại', reason: `${idx.length} xúc xắc` }); idx.forEach((i, k) => (dice[i] = nd[k])); discardCard(G, loseCard(c, pid, 'lucky-stone')!); log(G, `Lucky Stone: đổ lại → [${dice.join(',')}]`); }
      if (ch === 'rabbits-foot' && pd.options.includes(ch)) { const i = Number(payload.die ?? 0); dice[i] = rollDice(c.rng, 1, { label: "Rabbit's Foot: đổ lại", reason: '1 xúc xắc' })[0]; G.turn.usedItems.push('rabbits-foot'); log(G, `Rabbit's Foot: đổ lại 1 xúc xắc → [${dice.join(',')}]`); }
      finishRoll(c, pd.roll, dice); break;
    }
    case 'steal': resolveSteal(c, pid, (payload.card as string) ?? null); break;
    case 'pickCard': G.pending.shift(); break;
    case 'roll': { // explicit dice: the roller pressed "Đổ xúc xắc"
      if (pd.src !== 'queue') return 'Đổ xúc xắc qua nút trên bàn chơi';
      G.pending.shift();
      if (G.pending[0]?.type === 'roll' && G.pending[0].src === 'queue') return null; // next roller (e.g. the defender) presses too
      const e = G.queue[0]?.effects[0]; if (e) e.__go = true;
      break;
    }
  }
  processQueue(c); afterChange(c); return null;
}
function dynamite(c: Ctx, pid: string, room: string) {
  const G = c.G; G.turn.attacked = true; discardCard(G, loseCard(c, pid, 'dynamite')!); log(G, `💥 ${pname(G, pid)} ném Dynamite vào ${roomName(room)}!`);
  const h = HAUNTS[G.haunt?.number ?? -1];
  for (const o of livingExplorers(G)) if (G.players[o].room === room) {
    const no = o !== pid && G.phase === 'haunt' ? h?.canAttackExplorer?.(c, pid, o) : null; if (no) { log(G, `${pname(G, o)} không bị ảnh hưởng: ${no}`); continue; }
    enqueue(c, o, [{ t: 'roll', spec: { label: 'Né Dynamite', trait: 'speed', outcomes: [{ min: 5, effects: [] }, { min: 0, max: 4, effects: [{ t: 'damage', kind: 'physical', amount: 4 }] }] } }]);
  }
  for (const m of [...G.monsters]) if (m.room === room && m.traits.might !== undefined && m.traits.speed !== undefined) {
    if (m.untargetable) { log(G, `${m.name} không bị ảnh hưởng.`); continue; }
    if (h?.canAttackMonster?.(c, pid, m.id, 'speed', 'dynamite')) { log(G, `${m.name} miễn nhiễm Dynamite.`); continue; }
    const d = sum(rollDice(c.rng, m.traits.speed, { who: G.haunt?.traitor ?? undefined, label: `${m.name} né Dynamite`, reason: diceReason('Speed', m.traits.speed) })); log(G, `${m.name} né Dynamite: ${d}`); if (d < 5 && !h?.onMonsterDefeated?.(c, pid, m.id, 'speed')) stunMonster(c, m);
  }
}

// ------------------------------------------------------------------ end of turn, haunt roll, turn order
export function endTurn(c: Ctx, pid: string): { next: string; part: 'explorer' | 'monsters' } | string {
  const G = c.G; if (G.turn.player !== pid) return 'Không phải lượt của bạn';
  if (G.pending.length || G.queue.length) return 'Còn hiệu ứng chưa giải quyết';
  if (G.turn.part === 'monsters') {
    const e = HAUNTS[G.haunt!.number].canEndMonsterTurn?.(c); if (e) return e;
    if (!G.turn.rollsDone.includes('__hauntEnd')) {
      G.turn.rollsDone.push('__hauntEnd'); HAUNTS[G.haunt!.number].onMonsterTurnEnd?.(c); processQueue(c); afterChange(c);
      if (G.phase === 'over') return { next: pid, part: 'monsters' };
      if (G.pending.length || G.queue.length) return 'Giải quyết hiệu ứng cuối lượt quái vật trước';
    }
    for (const m of G.monsters) if (m.stunned && m.stunnedSince !== undefined && m.stunnedSince < G.turnCounter) { m.stunned = false; log(G, `${m.name} hết choáng.`); }
    return nextAfter(c, pid, true);
  }
  const p = G.players[pid];
  if (p.room === 'coal-chute') p.room = 'basement-landing';
  if (!p.dead) {
    const harm = !harmfulIgnored(c, pid);
    const endFx: Record<string, Effect | undefined> = {
      'furnace-room': harm ? { t: 'damage', kind: 'physical', amount: 1 } : undefined,
      crypt: harm && !holds(p, 'medallion') ? { t: 'damage', kind: 'mental', amount: 1 } : undefined,
      larder: { t: 'gain', trait: 'might', n: 1 }, gymnasium: { t: 'gain', trait: 'speed', n: 1 }, library: { t: 'gain', trait: 'knowledge', n: 1 }, chapel: { t: 'gain', trait: 'sanity', n: 1 },
    };
    const fx = endFx[p.room];
    if (fx && !G.turn.rollsDone.includes('__endRoom')) { G.turn.rollsDone.push('__endRoom'); log(G, `Hiệu ứng cuối lượt: ${roomName(p.room)}.`); enqueue(c, pid, [fx]); processQueue(c); if (G.pending.length) return 'Giải quyết hiệu ứng cuối lượt trước'; }
    if (p.statuses.lightsOut && (p.room === 'furnace-room' || livingExplorers(G).some((o) => o !== pid && G.players[o].room === p.room))) { delete p.statuses.lightsOut; log(G, 'Bỏ Lights Out.'); }
    if (p.statuses.graveDirt && ['balcony', 'gardens', 'graveyard', 'gymnasium', 'larder', 'patio', 'tower'].includes(p.room)) { delete p.statuses.graveDirt; log(G, 'Bỏ Grave Dirt.'); }
  }
  if (G.phase === 'haunt' && !G.turn.rollsDone.includes('__hauntEnd')) {
    G.turn.rollsDone.push('__hauntEnd'); HAUNTS[G.haunt!.number].onExplorerTurnEnd?.(c, pid); processQueue(c); afterChange(c);
    if ((G.phase as string) === 'over') return { next: pid, part: 'explorer' };
    if (G.pending.length || G.queue.length) return 'Giải quyết hiệu ứng cuối lượt (Haunt) trước';
  }
  if (G.phase === 'explore' && G.turn.drewOmen && !G.turn.rollsDone.includes('__haunt')) {
    G.turn.rollsDone.push('__haunt');
    const d = rollDice(c.rng, 6, { label: 'Haunt roll', reason: `6 xúc xắc — Haunt bắt đầu nếu tổng < ${G.omensDrawn} (số Omen đã rút)` }); const t = sum(d);
    log(G, `🎲 Haunt roll của ${pname(G, pid)}: [${d.join(',')}] = ${t} (cần < ${G.omensDrawn} để Haunt bắt đầu)`);
    if (t < G.omensDrawn) { revealHaunt(c, pid, G.turn.lastOmen!); if (G.pending.length) return 'Chọn cách tiếp tục Haunt'; if ((G.phase as string) === 'haunt') return firstHauntTurn(c); }
  }
  afterChange(c);
  if (G.phase === 'over') return { next: pid, part: 'explorer' };
  return nextAfter(c, pid, false);
}
function nextAfter(c: Ctx, pid: string, wasMonsters: boolean): { next: string; part: 'explorer' | 'monsters' } {
  const G = c.G;
  if (G.phase === 'haunt') {
    const tr = G.haunt!.traitor;
    if (tr && pid === tr && !wasMonsters && G.monsters.length) return { next: tr, part: 'monsters' };
  }
  const i = G.order.indexOf(pid);
  for (let k = 1; k <= G.order.length; k++) {
    const n = G.order[(i + k) % G.order.length];
    // dead explorers skip, but a dead traitor still runs the monster turn (p.17)
    if (!G.players[n].dead) return { next: n, part: 'explorer' };
    if (G.phase === 'haunt' && n === G.haunt?.traitor && G.monsters.length) return { next: n, part: 'monsters' };
  }
  return { next: pid, part: 'explorer' };
}
function firstHauntTurn(c: Ctx): { next: string; part: 'explorer' | 'monsters' } {
  // "The first turn always starts with the player to the traitor's left" (p.16)
  const tr = c.G.haunt!.traitor ?? c.G.haunt!.revealer; const i = c.G.order.indexOf(tr);
  for (let k = 1; k <= c.G.order.length; k++) { const n = c.G.order[(i + k) % c.G.order.length]; if (!c.G.players[n].dead) return { next: n, part: 'explorer' }; }
  return { next: tr, part: 'explorer' };
}

/** Haunt reveal: chart lookup + the rulebook's optional "Selecting the Haunt" rule (p.16) to skip haunts not implemented. */
export function revealHaunt(c: Ctx, revealer: string, lastOmen: { card: string; room: string }) {
  const G = c.G; const chartN = lookupHaunt(lastOmen.room, lastOmen.card);
  log(G, `👻 HAUNT BẮT ĐẦU! Omen ${cardName(lastOmen.card)} tại ${roomName(lastOmen.room)} → Haunt #${chartN ?? '?'} theo bảng Haunt.`);
  let n = chartN;
  if (G.options.forceHaunt) { n = G.options.forceHaunt; log(G, `(House rule của phòng chơi: luôn dùng Haunt #${n}.)`); }
  else if (n === null || !HAUNTS[n]) {
    // Optional rule: try the next omen-symbol rooms closest to the revealer with the same omen, then the revealer's other omens.
    const dist = distances(G, G.players[revealer].room);
    const omenRooms = Object.keys(G.rooms).filter((r) => roomDef(r)?.symbol === 'omen' && r !== lastOmen.room).sort((a, b) => (dist[a] ?? 99) - (dist[b] ?? 99));
    const omens = [lastOmen.card, ...G.players[revealer].cards.filter((x) => x.kind === 'omen' && x.id !== lastOmen.card).map((x) => x.id)];
    let found: number | null = null;
    outer: for (const om of omens) for (const r of om === lastOmen.card ? omenRooms : [lastOmen.room, ...omenRooms]) { const k = lookupHaunt(r, om); if (k && HAUNTS[k]) { found = k; log(G, `Luật tuỳ chọn "Selecting the Haunt" (rulebook tr.16): Haunt #${chartN} chưa có trong bản web; dùng ${cardName(om)} + ${roomName(r)} → Haunt #${k}.`); break outer; } }
    if (found) n = found;
    else {
      log(G, `Haunt #${chartN} chưa được cài đặt trong bản web này, và luật "Selecting the Haunt" không tìm ra haunt đã cài.`);
      G.pending.push({ type: 'choice', player: revealer, prompt: `Haunt #${chartN} chưa cài đặt. Chọn cách tiếp tục:`, options: [
        { label: 'House rule: chơi Haunt #1 The Mummy Walks (không theo bảng)', effects: [{ t: 'custom', fn: 'forceHaunt', args: { n: 1, revealer, omen: lastOmen.card, room: lastOmen.room } }] },
        { label: 'Kết thúc ván (không có người thắng)', effects: [{ t: 'custom', fn: 'abortGame' }] }] });
      return;
    }
  }
  startHaunt(c, n!, revealer, lastOmen);
}
CUSTOM.forceHaunt = (c, _pid, a) => { startHaunt(c, a.n as number, a.revealer as string, { card: a.omen as string, room: a.room as string }); const f = firstHauntTurn(c); (c.G as unknown as Record<string, unknown>).__jump = f; };
CUSTOM.abortGame = (c) => { c.G.phase = 'over'; log(c.G, 'Ván chơi kết thúc vì haunt chưa được cài đặt.'); };

export function startHaunt(c: Ctx, n: number, revealer: string, lastOmen: { card: string; room: string }) {
  const G = c.G; const h = HAUNTS[n];
  G.phase = 'haunt';
  const traitor = h.traitorRule(c, revealer);
  G.haunt = { number: n, name: h.name, traitor, revealer, revealRoom: G.players[revealer].room, omen: lastOmen.card, data: {} };
  if (traitor) {
    const t = G.players[traitor]; t.isTraitor = true;
    for (const k of ['buried', 'webbed', 'lightsOut', 'graveDirt']) delete t.statuses[k]; // traitor is freed from impeding events (p.17)
  }
  log(G, `Haunt #${n}: ${h.name}. Kẻ phản bội: ${traitor ? pname(G, traitor) : 'không có'}.`);
  h.setup(c, G.haunt);
  processQueue(c);
}

// ------------------------------------------------------------------ monsters
function startMonsterTurn(c: Ctx) {
  const G = c.G; log(G, `— Lượt quái vật (do ${pname(G, G.haunt!.traitor!)} điều khiển) —`);
  HAUNTS[G.haunt!.number].onMonsterTurnStart?.(c);
  processQueue(c); afterChange(c);
}
export function monsterMove(c: Ctx, mid: string, room: string, teleport = false): string | null {
  const G = c.G; if (G.turn.part !== 'monsters') return 'Không phải lượt quái vật';
  const m = G.monsters.find((x) => x.id === mid); if (!m) return 'Không có quái vật'; if (m.stunned) return 'Quái vật đang bị choáng';
  if (m.noMove) return `${m.name} không di chuyển`;
  const ce = HAUNTS[G.haunt!.number].canEnterRoom?.(c, { mid }, room === 'coal-chute' ? 'basement-landing' : room); if (ce) return ce;
  const left = ((G.turn as Record<string, unknown>)[`mv:${mid}`] as number) ?? 0; const spent = ((G.turn as Record<string, unknown>)[`sp:${mid}`] as number) ?? 0;
  if (teleport) {
    if (!(G.turn as Record<string, unknown>)[`tp:${mid}`]) return 'Không được dùng secret passage';
    if (!G.rooms[room]) return 'Phòng không tồn tại';
    (G.turn as Record<string, unknown>)[`tp:${mid}`] = false; (G.turn as Record<string, unknown>)[`sp:${mid}`] = 999;
    m.room = room; log(G, `${m.name} dùng lối bí mật tới ${roomName(room)}.`); afterChange(c); return null;
  }
  if (!links(G, m.room).some((l) => l.room === room) && !(m.room === 'coal-chute')) return 'Không liền kề';
  const heroes = livingExplorers(G).filter((o) => !G.players[o].isTraitor && G.players[o].room === m.room).length;
  const cost = 1 + heroes;
  if (spent > 0 && spent + cost > left) return `Không đủ di chuyển (${left - spent} còn lại, cần ${cost})`;
  (G.turn as Record<string, unknown>)[`sp:${mid}`] = spent + cost; (G.turn as Record<string, unknown>)[`tp:${mid}`] = false;
  m.room = room === 'coal-chute' ? 'basement-landing' : room; log(G, `${m.name} → ${roomName(m.room)}`);
  afterChange(c); return null;
}

// ------------------------------------------------------------------ win check
export function afterChange(c: Ctx) {
  const G = c.G; if (G.phase !== 'haunt' || !G.haunt || G.haunt.winner) return;
  const h = HAUNTS[G.haunt.number]; const w = h.checkWin(c);
  if (w) { G.haunt.winner = w.winner; G.haunt.winText = w.text; G.phase = 'over'; log(G, `🏆 ${w.winner === 'traitor' ? 'KẺ PHẢN BỘI' : 'CÁC ANH HÙNG'} THẮNG! ${w.text}`); }
}
export { isHero, cardsInPlay, startValue, takeSpecific, gainCard, loseCard, discardCard, enqueue, processQueue };
export const livingHeroesIn = (G: GState, room: string) => livingExplorers(G).filter((o) => !G.players[o].isTraitor && G.players[o].room === room);
