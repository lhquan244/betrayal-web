// Shared helpers: RNG, dice, logging, trait math. Pure functions over GState.
import type { GState, Trait, PlayerState, CardRef, Floor, Dir, PlacedRoom } from './types';
import { TRAITS } from './types';
import { CHARACTERS } from '../data/characters';
import { CARD_BY_ID } from '../data/cards';

/** Who physically rolls a set of dice and why (shown in the dice overlay). `who` defaults to the player making the move. */
export interface RollMeta { who?: string; label?: string; reason?: string }
export interface Rng { d6(): number; shuffle<T>(a: T[]): T[]; onRoll?: (r: { dice: number[]; meta?: RollMeta }) => void }
/** Context passed to every engine function. `gate`: pause before dice rolls so the roller presses "Đổ xúc xắc" (online/hotseat play). */
export interface Ctx { G: GState; rng: Rng; gate?: boolean }

/** Betrayal dice: 6 faces with 0,0,1,1,2,2 dots (rulebook: "Each die has faces with 0, 1, or 2 dots"). */
export const FACE = [0, 0, 1, 1, 2, 2];
export function rollDice(rng: Rng, n: number, meta?: RollMeta): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(FACE[rng.d6() - 1]);
  rng.onRoll?.({ dice: out, meta });
  return out;
}
/** "Might 4 → 4 xúc xắc" */
export const diceReason = (what: string, value: number, n = Math.max(0, Math.min(8, value))) => `${what} ${value} → ${n} xúc xắc`;
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return {
    d6: () => 1 + Math.floor(next() * 6),
    shuffle: <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; },
  };
}

export function log(G: GState, text: string, priv?: string[]) {
  G.logSeq = (G.logSeq ?? G.log.length) + 1; // monotonic counter (log is capped at 400 and filtered per player)
  G.log.push({ t: G.log.length, s: G.logSeq, text, ...(priv ? { private: priv } : {}) });
  if (G.log.length > 400) G.log.splice(0, G.log.length - 400);
}

export const charOf = (p: PlayerState) => CHARACTERS.find((c) => c.id === p.character)!;
export const pname = (G: GState, id: string) => {
  const p = G.players[id]; if (!p) return id;
  const c = p.character ? charOf(p) : null; return c ? `${p.name} (${c.name})` : p.name;
};
export function traitValue(p: PlayerState, t: Trait): number {
  const c = charOf(p); const i = p.idx[t];
  return i < 0 ? 0 : c.traits[t].track[Math.min(i, 7)];
}
export function startValue(p: PlayerState, t: Trait): number { const c = charOf(p); return c.traits[t].track[c.traits[t].start]; }
export const TRAIT_VI: Record<Trait, string> = { might: 'Might', speed: 'Speed', sanity: 'Sanity', knowledge: 'Knowledge' };

/** Move a trait clip by `delta` spaces. Before the haunt no trait can go below the lowest value. Returns spaces actually moved. */
export function shiftTrait(G: GState, pid: string, t: Trait, delta: number): number {
  const p = G.players[pid]; if (!p || p.dead) return 0;
  const before = p.idx[t];
  // Some haunts protect an explorer from dropping to the skull (e.g. Haunt #4: the trapped explorer while the eggs live).
  const noSkull = ((G.haunt?.data as { noSkull?: string[] } | undefined)?.noSkull ?? []).includes(pid);
  const minIdx = G.phase === 'haunt' && !noSkull ? -1 : 0;
  p.idx[t] = Math.max(minIdx, Math.min(7, before + delta));
  const moved = p.idx[t] - before;
  if (moved !== 0) log(G, `${pname(G, pid)}: ${TRAIT_VI[t]} ${moved > 0 ? '+' : ''}${moved} → ${traitValue(p, t) || '💀'}`);
  if (p.idx[t] < 0) killPlayer(G, pid);
  return moved;
}

export function killPlayer(G: GState, pid: string) {
  const p = G.players[pid]; if (p.dead) return;
  p.dead = true;
  log(G, `☠️ ${pname(G, pid)} đã chết.`);
  // Companions stay in the room (set aside, re-taken by next explorer entering); other items drop as an Item Pile.
  const companions = p.cards.filter((c) => CARD_BY_ID[c.id].companion);
  const items = p.cards.filter((c) => !CARD_BY_ID[c.id].companion);
  for (const c of companions) G.tokens.push({ id: `comp-${c.id}`, kind: 'companion', room: p.room, data: { card: c.id } });
  if (items.length) G.tokens.push({ id: `pile-${pid}-${G.log.length}`, kind: 'itemPile', room: p.room, data: { cards: items } });
  p.cards = [];
}

export const key = (f: Floor, x: number, y: number) => `${f}:${x},${y}`;
export const DV: Record<Dir, [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };
export const opp = (d: Dir) => ((d + 2) % 4) as Dir;
export const rotDoors = (doors: Dir[], rot: number) => doors.map((d) => ((d + rot) % 4) as Dir);
export const DIR_VI = ['Bắc', 'Đông', 'Nam', 'Tây'];

export function roomAt(G: GState, f: Floor, x: number, y: number): PlacedRoom | undefined {
  const id = G.grid[key(f, x, y)]; return id ? G.rooms[id] : undefined;
}
export const holds = (p: PlayerState, cardId: string) => p.cards.some((c) => c.id === cardId);
export const cardName = (id: string) => CARD_BY_ID[id]?.name ?? id;
export const livingExplorers = (G: GState) => G.order.filter((id) => !G.players[id].dead);
export const isHero = (G: GState, pid: string) => G.phase === 'haunt' && !G.players[pid].isTraitor;
export function cardsInPlay(G: GState): CardRef[] {
  const out: CardRef[] = [];
  for (const p of Object.values(G.players)) out.push(...p.cards);
  for (const m of G.monsters) out.push(...m.carries);
  for (const t of G.tokens) if (t.kind === 'itemPile') out.push(...((t.data?.cards as CardRef[]) ?? []));
  for (const t of G.tokens) if (t.kind === 'companion') out.push({ kind: 'omen', id: t.data!.card as string });
  return out;
}
export { TRAITS };
