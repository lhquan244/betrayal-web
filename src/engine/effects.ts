// Effect interpreter: a queue of data-driven effects, pausing for player decisions (Pending).
import type { Effect, GState, RollSpec, Trait, DamageKind, CardKind, CardRef, Floor } from './types';
import { TRAITS, PHYSICAL, MENTAL } from './types';
import { Ctx, log, pname, rollDice, diceReason, sum, shiftTrait, traitValue, holds, TRAIT_VI, cardName, startValue } from './core';
import { CARD_BY_ID } from '../data/cards';
import { roomName, tokensIn, roomDef, START_ROOMS, distances, drawTileFor, autoPlace, openSpots, validRotations, placeTile, doorNeighbors, openDoorways } from './house';
import { DV, roomAt, opp } from './core';
import type { Dir } from './types';

export function enqueue(c: Ctx, player: string, effects: Effect[], front = false) {
  if (!effects.length) return;
  const e = { player, effects: [...effects] };
  if (front) c.G.queue.unshift(e); else c.G.queue.push(e);
}

/** Run queued effects until one needs player input. */
export function processQueue(c: Ctx) {
  const G = c.G; let guard = 0;
  // safety net: a room/option choice with nothing to choose would lock the game — drop it (logged)
  const dropEmpty = () => { const pd = G.pending[0]; if (pd && ((pd.type === 'pickRoom' && !pd.rooms.length) || (pd.type === 'choice' && !pd.options.length))) { G.pending.shift(); log(G, `(Không có lựa chọn hợp lệ: ${'prompt' in pd ? pd.prompt : ''} — bỏ qua.)`); return true; } return false; };
  while (dropEmpty()) { /* drop */ }
  while (!G.pending.length && G.queue.length && guard++ < 500) {
    const head = G.queue[0];
    const eff0 = head.effects[0];
    if (!eff0) { G.queue.shift(); continue; }
    if (G.players[head.player]?.dead && eff0.t !== 'log') { head.effects.shift(); continue; }
    if (c.gate && !eff0.__go) { // explicit dice: wait for the roller to press "Đổ xúc xắc" before an effect that rolls
      const g = rollGateFor(c, head.player, eff0); const asks = g ? (Array.isArray(g) ? g : [g]) : [];
      if (asks.length) { for (const a of asks) G.pending.push({ type: 'roll', player: a.who ?? head.player, label: a.label, reason: a.reason, src: 'queue' }); break; }
    }
    const eff = head.effects.shift()!; delete eff.__go;
    runEffect(c, head.player, eff);
    while (dropEmpty()) { /* drop */ }
    if (G.phase === 'over') { G.queue = []; return; }
  }
}

/** Custom effects that roll dice inline: label shown on the roll button (registered here and in rules.ts / haunt modules). */
export type RollAsk = { label: string; reason?: string; who?: string };
export const CUSTOM_ROLLS: Record<string, { label: string; reason?: (c: Ctx, pid: string, args: Record<string, unknown>) => string | undefined; who?: (c: Ctx, pid: string) => string;
  when?: (c: Ctx, pid: string, args: Record<string, unknown>) => boolean; /** several rollers in order (e.g. attacker then defender) */ asks?: (c: Ctx, pid: string, args: Record<string, unknown>) => RollAsk[] }> = {};
/** Does this queued effect roll dice? Returns what the roll button should say. */
export function rollGateFor(c: Ctx, pid: string, e: Effect): RollAsk | RollAsk[] | null {
  if ('who' in e && e.who && e.who !== 'self') return null; // split per target first
  const G = c.G;
  switch (e.t) {
    case 'roll': {
      if (e.spec.fixedResult !== undefined) return null;
      const spec = { ...e.spec, player: pid } as RollSpec; const n = diceFor(c, spec);
      return { label: e.spec.label, reason: spec.trait ? diceReason(TRAIT_VI[spec.trait], traitValue(G.players[pid], spec.trait), n) + (n !== Math.min(8, traitValue(G.players[pid], spec.trait)) ? ' (có cộng/trừ xúc xắc)' : '') : `${n} xúc xắc` };
    }
    case 'damage': return e.amount === undefined && e.dice ? { label: `Sát thương ${e.kind === 'physical' ? 'thể chất' : 'tinh thần'}`, reason: `${e.dice} xúc xắc` } : null;
    case 'eventAttack': return { label: `${e.source} tấn công bạn`, reason: `${e.source}: Might ${e.might} · bạn: ${diceReason('Might', traitValue(G.players[pid], 'might'))}` };
    case 'custom': { const r = CUSTOM_ROLLS[e.fn]; if (!r || (r.when && !r.when(c, pid, e.args ?? {}))) return null; if (r.asks) return r.asks(c, pid, e.args ?? {}); return { label: r.label, reason: r.reason?.(c, pid, e.args ?? {}), who: r.who?.(c, pid) }; }
  }
  return null;
}

function targets(c: Ctx, pid: string, who?: string): string[] {
  const G = c.G;
  if (!who || who === 'self') return [pid];
  const live = G.order.filter((id) => !G.players[id].dead);
  // "Each explorer" effects start with the current player and go clockwise.
  const start = live.indexOf(pid); const ordered = start >= 0 ? [...live.slice(start), ...live.slice(0, start)] : live;
  if (who === 'all') return ordered;
  if (who === 'allInBasement') return ordered.filter((id) => G.rooms[G.players[id].room]?.floor === 'basement');
  if (who === 'allOutside') return ordered.filter((id) => { const r = roomDef(G.players[id].room); const s = START_ROOMS[G.players[id].room]; return !!(r?.outside || r?.windows || s?.windows); });
  return [pid];
}

export function runEffect(c: Ctx, pid: string, e: Effect) {
  const G = c.G;
  const multi = 'who' in e && e.who && e.who !== 'self';
  if (multi) {
    const ts = targets(c, pid, e.who);
    if (!ts.length) log(G, 'Không có explorer nào bị ảnh hưởng.');
    // run as separate queue entries (each target resolves its own roll / damage)
    for (const t of ts.reverse()) enqueue(c, t, [{ ...e, who: 'self' } as Effect], true);
    return;
  }
  switch (e.t) {
    case 'gain': case 'lose': {
      const sign = e.t === 'gain' ? 1 : -1;
      if (e.trait === 'all') { for (const t of TRAITS) shiftTrait(G, pid, t, sign * e.n); break; }
      if (e.trait === 'choose' || e.trait === 'physical' || e.trait === 'mental') {
        const pool = e.trait === 'physical' ? PHYSICAL : e.trait === 'mental' ? MENTAL : TRAITS;
        G.pending.push({ type: 'choice', player: pid, prompt: `${sign > 0 ? 'Tăng' : 'Giảm'} ${e.n} ở chỉ số nào?`, options: pool.map((t) => ({ label: TRAIT_VI[t], effects: [{ t: e.t, trait: t, n: e.n } as Effect] })) });
        break;
      }
      shiftTrait(G, pid, e.trait, sign * e.n);
      break;
    }
    case 'damage': {
      const amount = e.amount ?? sum(rollDice(c.rng, e.dice ?? 0, { label: `Sát thương ${e.kind === 'physical' ? 'thể chất' : 'tinh thần'}`, reason: `${e.dice} xúc xắc` }));
      if (e.dice) log(G, `${pname(G, pid)} chịu ${e.dice} xúc xắc sát thương ${e.kind === 'physical' ? 'thể chất' : 'tinh thần'}: ${amount}`);
      requestDamage(c, pid, e.kind, amount, 'event');
      break;
    }
    case 'roll': startRoll(c, { ...e.spec, player: pid } as RollSpec); break;
    case 'draw': for (let i = 0; i < (e.n ?? 1); i++) enqueue(c, pid, [{ t: 'custom', fn: 'drawOne', args: { kind: e.kind } }], true); break;
    case 'moveTo': placeExplorer(c, pid, e.room); break;
    case 'token': G.tokens.push({ id: `${e.kind}-${G.tokens.length}-${G.log.length}`, kind: e.kind, room: G.players[pid].room, data: e.data }); log(G, `Đặt token ${e.kind} tại ${roomName(G.players[pid].room)}.`); break;
    case 'status': G.players[pid].statuses[e.key] = e.value; if (e.key === 'buried' || e.key === 'webbed') { G.turn.moveEnded = true; } break;
    case 'clearStatus': delete G.players[pid].statuses[e.key]; break;
    case 'choice': G.pending.push({ type: 'choice', player: pid, prompt: e.prompt, options: e.options }); break;
    case 'eventAttack': eventAttack(c, pid, e.might, e.source, e.then ?? []); break;
    case 'log': log(G, e.text); break;
    case 'endMove': G.turn.moveEnded = true; break;
    case 'custom': CUSTOM[e.fn]?.(c, pid, e.args ?? {}); if (!CUSTOM[e.fn]) log(G, `TODO: hiệu ứng ${e.fn} chưa cài đặt`); break;
  }
}

// ---------------- traits / damage ----------------
export function requestDamage(c: Ctx, pid: string, kind: DamageKind, amount: number, source: string) {
  const G = c.G; const p = G.players[pid];
  let a = amount;
  if (kind === 'physical' && holds(p, 'armor') && a > 0) { a -= 1; log(G, `Armor giảm 1 sát thương thể chất cho ${pname(G, pid)}.`); }
  if (a <= 0) return;
  G.pending.push({ type: 'damage', player: pid, kind, amount: a, source });
}
/** Apply a resolved damage split. */
export function applyDamage(c: Ctx, pid: string, kind: DamageKind, split: Record<string, number>) {
  for (const [t, n] of Object.entries(split)) if (n > 0) shiftTrait(c.G, pid, t as Trait, -n);
}

// ---------------- card gain / loss with passives ----------------
export function gainCard(c: Ctx, pid: string, ref: CardRef) {
  const G = c.G; const p = G.players[pid]; const def = CARD_BY_ID[ref.id];
  p.cards.push(ref);
  const applied: Record<string, number> = {};
  if (def.passive) for (const [t, n] of Object.entries(def.passive)) applied[t] = shiftTrait(G, pid, t as Trait, n!);
  (p.statuses.applied as Record<string, Record<string, number>> | undefined) ??= {};
  (p.statuses.applied as Record<string, Record<string, number>>)[ref.id] = applied;
  if (ref.kind === 'item' && p.statuses.graveDirt && def.passive && Object.values(applied).some((v) => v > 0)) { delete p.statuses.graveDirt; log(G, 'Grave Dirt được gỡ bỏ (một item khác làm tăng chỉ số).'); }
  if (ref.id === 'candle' && p.statuses.lightsOut) { delete p.statuses.lightsOut; log(G, 'Có Candle: bỏ Lights Out.'); }
  checkBellBookCandle(c, pid);
}
/** Remove a card from a player and apply loss effects ("if you lose X, lose ..."). */
export function loseCard(c: Ctx, pid: string, cardId: string): CardRef | null {
  const G = c.G; const p = G.players[pid]; const i = p.cards.findIndex((x) => x.id === cardId);
  if (i < 0) return null;
  const [ref] = p.cards.splice(i, 1); const def = CARD_BY_ID[cardId];
  const applied = ((p.statuses.applied as Record<string, Record<string, number>>) ?? {})[cardId] ?? {};
  if (def.lossPenalty) {
    for (const [t, n] of Object.entries(def.lossPenalty)) { const over = (def.passive?.[t as Trait] ?? 0) - (applied[t] ?? 0); shiftTrait(G, pid, t as Trait, -(n! - Math.max(0, over))); }
  } else if (def.passive) for (const t of Object.keys(def.passive)) shiftTrait(G, pid, t as Trait, -(applied[t] ?? 0));
  if (['bell', 'book', 'candle'].includes(cardId) && p.statuses.bbc === 'on') { p.statuses.bbc = 'lost'; for (const t of TRAITS) shiftTrait(G, pid, t, -2); log(G, 'Mất một trong Bell/Book/Candle: giảm mọi chỉ số 2.'); }
  return ref;
}
function checkBellBookCandle(c: Ctx, pid: string) {
  const p = c.G.players[pid];
  if (!p.statuses.bbc && holds(p, 'bell') && holds(p, 'book') && holds(p, 'candle')) { p.statuses.bbc = 'on'; for (const t of TRAITS) shiftTrait(c.G, pid, t, 2); log(c.G, 'Bell + Book + Candle: tăng mọi chỉ số 2!'); }
}
export function discardCard(G: GState, ref: CardRef) { G.discards[ref.kind].push(ref.id); }

// ---------------- drawing cards ----------------
export function drawFromDeck(c: Ctx, kind: CardKind): string | null {
  const G = c.G;
  if (!G.decks[kind].length && G.discards[kind].length) { G.decks[kind] = c.rng.shuffle(G.discards[kind]); G.discards[kind] = []; }
  return G.decks[kind].shift() ?? null;
}
export function takeSpecific(G: GState, kind: CardKind, id: string): boolean {
  const i = G.decks[kind].indexOf(id); if (i >= 0) { G.decks[kind].splice(i, 1); return true; }
  const j = G.discards[kind].indexOf(id); if (j >= 0) { G.discards[kind].splice(j, 1); return true; }
  const k = G.setAside.findIndex((r) => r.id === id); if (k >= 0) { G.setAside.splice(k, 1); return true; }
  return false;
}
/** Resolve a drawn card for a player. */
export function resolveCard(c: Ctx, pid: string, kind: CardKind, id: string) {
  const G = c.G; const def = CARD_BY_ID[id];
  G.lastCard = { kind, id, player: pid };
  log(G, `${pname(G, pid)} rút ${kind === 'event' ? 'Event' : kind === 'item' ? 'Item' : 'Omen'}: ${def.name}`);
  if (kind === 'event') {
    if (['debris', 'webs', 'lights-out', 'grave-dirt'].includes(id)) { /* kept as status when applicable */ }
    G.discards.event.push(id);
    enqueue(c, pid, def.onDraw ?? [], true);
    return;
  }
  gainCard(c, pid, { kind, id });
  if (kind === 'omen') { G.omensDrawn++; if (G.phase !== 'haunt') { G.turn.drewOmen = true; G.turn.lastOmen = { card: id, room: G.players[pid].room }; } }
  enqueue(c, pid, def.onDraw ?? [], true);
}

// ---------------- rolls ----------------
export function diceFor(c: Ctx, spec: RollSpec): number {
  const G = c.G; const p = G.players[spec.player];
  let n = spec.trait ? traitValue(p, spec.trait) : spec.dice ?? 0;
  n += spec.bonusDice ?? 0;
  if (spec.trait) {
    const room = p.room;
    if (tokensIn(G, room, 'drip').length) n -= 1;
    if (tokensIn(G, room, 'smoke').length) n -= 2;
    if (G.phase === 'haunt' && !p.isTraitor && tokensIn(G, room, 'blessing').length) n += 1;
    if (spec.isEvent && holds(p, 'candle')) n += 1;
    n = Math.max(1, n);
  }
  return Math.max(0, Math.min(8, n));
}
export function startRoll(c: Ctx, spec: RollSpec) {
  const G = c.G; const p = G.players[spec.player];
  const opts: string[] = [];
  if (holds(p, 'angel-feather')) opts.push('angel-feather');
  if (spec.trait && holds(p, 'adrenaline-shot')) opts.push('adrenaline-shot');
  if ((spec.trait || spec.isEvent) && holds(p, 'idol') && !G.turn.usedItems.includes('idol')) opts.push('idol');
  if (p.statuses.savedRoll !== undefined) opts.push('saved-roll');
  if (opts.length) { G.pending.push({ type: 'preRoll', player: spec.player, roll: spec, options: opts }); return; }
  doRoll(c, spec);
}
export function applyPreRoll(c: Ctx, spec: RollSpec, choice: string, value?: number): RollSpec {
  const G = c.G; const pid = spec.player; const s = { ...spec };
  if (choice === 'adrenaline-shot') { discardCard(G, loseCard(c, pid, 'adrenaline-shot')!); s.addResult = (s.addResult ?? 0) + 4; log(G, 'Dùng Adrenaline Shot: +4 vào kết quả.'); }
  if (choice === 'angel-feather') { discardCard(G, loseCard(c, pid, 'angel-feather')!); s.fixedResult = Math.max(0, Math.min(8, value ?? 8)); log(G, `Dùng Angel Feather: chọn kết quả ${s.fixedResult}.`); }
  if (choice === 'idol') { G.turn.usedItems.push('idol'); s.bonusDice = (s.bonusDice ?? 0) + 2; shiftTrait(G, pid, 'sanity', -1); log(G, 'Xoa Idol: +2 xúc xắc, mất 1 Sanity.'); }
  if (choice === 'saved-roll') { const v = G.players[pid].statuses.savedRoll as number; delete G.players[pid].statuses.savedRoll; s.fixedResult = Math.min(v, diceFor(c, s) * 2); log(G, `Dùng kết quả đã lưu (It Is Meant to Be): ${s.fixedResult}.`); }
  return s;
}
export function doRoll(c: Ctx, spec: RollSpec) {
  const G = c.G; const p = G.players[spec.player];
  let dice: number[] = [];
  if (spec.fixedResult === undefined) { const n = diceFor(c, spec); dice = rollDice(c.rng, n, { who: spec.player, label: spec.label, reason: spec.trait ? diceReason(TRAIT_VI[spec.trait], traitValue(p, spec.trait), n) : `${n} xúc xắc` }); }
  const opts: string[] = [];
  if (spec.fixedResult === undefined && dice.length) {
    if (holds(p, 'lucky-stone')) opts.push('lucky-stone');
    if (holds(p, 'rabbits-foot') && !G.turn.usedItems.includes('rabbits-foot')) opts.push('rabbits-foot');
  }
  if (opts.length) { G.pending.push({ type: 'postRoll', player: spec.player, roll: spec, dice, options: opts }); G.lastRoll = { player: spec.player, label: spec.label, dice, total: sum(dice) }; return; }
  finishRoll(c, spec, dice);
}
export function finishRoll(c: Ctx, spec: RollSpec, dice: number[]) {
  const G = c.G;
  const total = spec.fixedResult ?? sum(dice) + (spec.addResult ?? 0);
  G.lastRoll = { player: spec.player, label: spec.label, dice, total };
  log(G, `🎲 ${pname(G, spec.player)} — ${spec.label}${spec.trait ? ` (${TRAIT_VI[spec.trait]})` : ''}: [${dice.join(',')}] = ${total}`);
  const o = spec.outcomes.find((x) => total >= x.min && (x.max === undefined || total <= x.max));
  if (o) enqueue(c, spec.player, o.effects, true);
}

// ---------------- event monster attacks (Bite, Creepy Puppet, Groundskeeper, Burial...) ----------------
export function eventAttack(c: Ctx, pid: string, might: number, source: string, then: Effect[]) {
  const G = c.G; const p = G.players[pid];
  if (G.phase === 'haunt' && p.isTraitor && source !== 'Bite') { /* traitor may ignore events: handled by ignore choice upstream */ }
  const a = sum(rollDice(c.rng, might, { who: pid, label: `${source} tấn công`, reason: diceReason(`${source} Might`, might) })); const dDice = rollDice(c.rng, Math.min(8, traitValue(p, 'might')), { who: pid, label: `${pname(G, pid)} chống đỡ`, reason: diceReason('Might', traitValue(p, 'might')) }); const d = sum(dDice);
  log(G, `⚔️ ${source} tấn công ${pname(G, pid)}: ${a} vs Might ${d} [${dDice.join(',')}]`);
  if (a > d) { requestDamage(c, pid, 'physical', a - d, source); enqueue(c, pid, then, true); (G.turn as Record<string, unknown>).lastEventHurt = true; }
  else (G.turn as Record<string, unknown>).lastEventHurt = false;
}

// ---------------- moving explorers by effects ----------------
export function placeExplorer(c: Ctx, pid: string, room: string) {
  const G = c.G; if (!G.rooms[room]) { log(G, `${roomName(room)} chưa có trong nhà.`); return; }
  G.players[pid].room = room; G.players[pid].barrierSide = undefined;
  log(G, `${pname(G, pid)} được đặt vào ${roomName(room)}.`);
  CUSTOM.__afterPlace?.(c, pid, { room });
}

/** Draw room tiles until one for floor f; place it at a legal spot of that floor and return its id. */
function drawAndPlace(c: Ctx, f: Floor): string | null {
  const G = c.G;
  const t = drawTileFor(G, f, c.rng.shuffle); if (!t) return null;
  for (const s of openSpots(G, f)) { const rots = validRotations(G, t, f, s.x, s.y, s.fromDir); if (rots.length) { placeTile(G, t, f, s.x, s.y, rots[0]); log(G, `Ô phòng mới: ${roomName(t)} (${f}).`); return t; } }
  G.roomDiscard.push(t); return null;
}

// ---------------- custom handlers for cards whose text is procedural ----------------
type Handler = (c: Ctx, pid: string, args: Record<string, unknown>) => void;
export const CUSTOM: Record<string, Handler> = {
  drawOne(c, pid, args) {
    const kind = args.kind as CardKind; const id = drawFromDeck(c, kind);
    if (!id) { log(c.G, `Hết lá ${kind}.`); return; }
    resolveCard(c, pid, kind, id);
  },
  bloodyVision(c, pid) { log(c.G, `${pname(c.G, pid)}: Bloody Vision 0-1 — nếu có explorer/quái vật ở cùng phòng hoặc phòng kề, phải tấn công nó (ưu tiên Might thấp nhất). (Tự thực hiện bằng nút Tấn công nếu áp dụng.)`); },
  puppetSpear(c, pid) {
    const G = c.G; if (holds(G.players[pid], 'spear')) return;
    const owner = Object.values(G.players).find((p) => holds(p, 'spear')); if (owner) shiftTrait(G, owner.id, 'might', 2);
  },
  disquietingSounds(c, pid) {
    const G = c.G; const d = rollDice(c.rng, 6, { label: 'Disquieting Sounds', reason: '6 xúc xắc' }); const t = sum(d);
    log(G, `🎲 Disquieting Sounds: [${d.join(',')}] = ${t} (Omen đã rút: ${G.omensDrawn})`);
    if (t >= G.omensDrawn) shiftTrait(G, pid, 'sanity', 1); else enqueue(c, pid, [{ t: 'damage', kind: 'mental', dice: 1 }], true);
  },
  footsteps(c, pid) {
    const G = c.G; const n = 1 + (G.players[pid].room === 'chapel' ? 1 : 0);
    const d = rollDice(c.rng, n, { label: 'Footsteps', reason: `${n} xúc xắc` }); const t = sum(d); log(G, `🎲 Footsteps: [${d.join(',')}] = ${t}`);
    const dist = distances(G, G.players[pid].room);
    const others = G.order.filter((id) => id !== pid && !G.players[id].dead).sort((a, b) => (dist[G.players[a].room] ?? 99) - (dist[G.players[b].room] ?? 99));
    const nearest = others[0];
    if (t >= 4) { shiftTrait(G, pid, 'might', 1); if (nearest) shiftTrait(G, nearest, 'might', 1); }
    else if (t === 3) { shiftTrait(G, pid, 'might', 1); if (nearest) shiftTrait(G, nearest, 'sanity', -1); }
    else if (t === 2) shiftTrait(G, pid, 'sanity', -1);
    else if (t === 1) shiftTrait(G, pid, 'speed', -1);
    else for (const id of G.order.filter((x) => !G.players[x].dead)) enqueue(c, id, [{ t: 'lose', trait: 'choose', n: 1 }]);
  },
  funeralMove(c, pid) {
    const G = c.G; const rs = ['graveyard', 'crypt'].filter((r) => G.rooms[r]);
    if (rs.length === 1) placeExplorer(c, pid, rs[0]);
    else if (rs.length === 2) G.pending.push({ type: 'choice', player: pid, prompt: 'Funeral: đến phòng nào?', options: rs.map((r) => ({ label: roomName(r), effects: [{ t: 'moveTo', room: r }] })) });
  },
  groundskeeper(c, pid) {
    const inGardens = c.G.players[pid].room === 'gardens';
    startRoll(c, { player: pid, label: 'Groundskeeper', trait: 'knowledge', isEvent: true, bonusDice: inGardens ? -2 : 0, outcomes: [{ min: 4, effects: [{ t: 'draw', kind: 'item' }] }, { min: 0, max: 3, effects: [{ t: 'eventAttack', might: 4, source: 'Groundskeeper' }] }] });
  },
  hangedMen(c, pid) {
    const G = c.G; let allOk = true;
    for (const t of TRAITS) {
      const n = Math.max(1, Math.min(8, traitValue(G.players[pid], t) + (holds(G.players[pid], 'candle') ? 1 : 0)));
      const d = rollDice(c.rng, n, { label: `Hanged Men — ${TRAIT_VI[t]}`, reason: diceReason(TRAIT_VI[t], traitValue(G.players[pid], t), n) }); const s = sum(d); log(G, `🎲 Hanged Men ${TRAIT_VI[t]}: [${d.join(',')}] = ${s}`);
      if (s <= 1) { allOk = false; shiftTrait(G, pid, t, -1); }
    }
    if (allOk) enqueue(c, pid, [{ t: 'gain', trait: 'choose', n: 1 }], true);
  },
  mirrorGive(c, pid) {
    const G = c.G; const idx = G.order.indexOf(pid);
    const seq = [...G.order.slice(idx), ...G.order.slice(0, idx)];
    const who = seq.find((id) => !G.players[id].dead && G.players[id].cards.some((x) => x.kind === 'item'));
    if (!who) { log(G, 'Image in the Mirror: chưa ai có Item, bỏ lá này.'); return; }
    const items = G.players[who].cards.filter((x) => x.kind === 'item');
    G.pending.push({ type: 'choice', player: who, prompt: 'Image in the Mirror: chọn 1 Item để trả về chồng Item', options: items.map((it) => ({ label: cardName(it.id), effects: [{ t: 'custom', fn: 'mirrorReturn', args: { card: it.id } }] })) });
  },
  mirrorReturn(c, pid, a) {
    const G = c.G; const r = loseCard(c, pid, a.card as string); if (!r) return;
    G.decks.item = c.rng.shuffle([...G.decks.item, r.id]); shiftTrait(G, pid, 'knowledge', 1);
  },
  peekStack(c, pid, a) {
    const G = c.G; const st = a.stack as string;
    const top = (st === 'room' ? G.roomStack : G.decks[st as CardKind]).slice(0, 3);
    log(G, `${pname(G, pid)} xem riêng 3 lá trên cùng của chồng ${st}.`);
    log(G, `(Chỉ bạn thấy) 3 lá trên cùng chồng ${st}: ${top.map((x) => (st === 'room' ? roomName(x) : cardName(x))).join(', ') || '(trống)'}`, [pid]);
  },
  saveRoll(c, pid) { const d = rollDice(c.rng, 4, { label: 'It Is Meant to Be (lưu kết quả)', reason: '4 xúc xắc' }); const s = sum(d); c.G.players[pid].statuses.savedRoll = s; log(c.G, `🎲 It Is Meant to Be: lưu kết quả [${d.join(',')}] = ${s}`); },
  jonahsTurn(c, pid) {
    const G = c.G; const owner = Object.values(G.players).find((p) => !p.dead && holds(p, 'puzzle-box'));
    if (owner) { discardCard(G, loseCard(c, owner.id, 'puzzle-box')!); enqueue(c, owner.id, [{ t: 'draw', kind: 'item' }], true); shiftTrait(G, pid, 'sanity', 1); }
    else enqueue(c, pid, [{ t: 'damage', kind: 'mental', dice: 1 }], true);
  },
  mists(c, pid) {
    const G = c.G;
    for (const id of targets(c, pid, 'allInBasement')) {
      const ev = roomDef(G.players[id].room)?.symbol === 'event';
      startRollQueued(c, id, { label: 'Mists from the Walls', trait: 'sanity', isEvent: true, outcomes: [
        { min: 4, effects: [] }, { min: 1, max: 3, effects: [{ t: 'damage', kind: 'mental', dice: ev ? 2 : 1 }] }, { min: 0, max: 0, effects: [{ t: 'damage', kind: 'mental', dice: ev ? 3 : 1 }] }] });
    }
  },
  mysticSlide(c, pid) {
    const G = c.G; let who = pid;
    if (G.rooms[G.players[pid].room].floor === 'basement') {
      const idx = G.order.indexOf(pid); const seq = [...G.order.slice(idx + 1), ...G.order.slice(0, idx)];
      const o = seq.find((id) => !G.players[id].dead && G.rooms[G.players[id].room].floor !== 'basement');
      if (!o) { log(G, 'Mystic Slide: mọi người đều ở tầng hầm, bỏ lá này.'); return; }
      who = o;
    }
    G.tokens.push({ id: `slide-${G.log.length}`, kind: 'slide', room: G.players[who].room });
    log(G, `Đặt token Mystic Slide tại ${roomName(G.players[who].room)}.`);
    CUSTOM.rideSlide(c, who, { fromEvent: who !== pid });
  },
  rideSlide(c, pid, a) {
    startRoll(c, { player: pid, label: 'Mystic Slide', trait: 'might', isEvent: true, outcomes: [
      { min: 5, effects: [{ t: 'custom', fn: 'slideControl' }] }, { min: 0, max: 4, effects: [{ t: 'custom', fn: 'slideFall', args: a }] }] });
  },
  slideControl(c, pid) {
    const G = c.G; const f = G.rooms[G.players[pid].room].floor;
    const lower: Floor[] = f === 'upper' ? ['ground', 'basement'] : f === 'ground' ? ['basement'] : [];
    const rooms = Object.values(G.rooms).filter((r) => lower.includes(r.floor)).map((r) => r.id);
    if (!rooms.length) { log(G, 'Không có phòng nào ở tầng thấp hơn.'); return; }
    G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Mystic Slide: chọn phòng ở tầng thấp hơn', rooms, then: [], varName: 'room' });
  },
  slideFall(c, pid) {
    const G = c.G; let room = drawAndPlace(c, 'basement');
    if (!room) { const bs = Object.values(G.rooms).filter((r) => r.floor === 'basement').map((r) => r.id); G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Mystic Slide: hết ô tầng hầm, chọn phòng tầng hầm để rơi xuống', rooms: bs, then: [{ t: 'damage', kind: 'physical', dice: 1 }], varName: 'room' }); return; }
    placeExplorer(c, pid, room); enqueue(c, pid, [{ t: 'damage', kind: 'physical', dice: 1 }], true);
    // "If this does not happen on your turn, do not draw a card in the room you fall into." Symbols of tiles placed by effects
    // are resolved by the explorer who discovers them on their own turn:
    if (G.turn.player === pid) CUSTOM.__discoverSymbol?.(c, pid, { room });
  },
  revolvingWall(c, pid) {
    const G = c.G; const r = G.rooms[G.players[pid].room];
    const walls = ([0, 1, 2, 3] as Dir[]).filter((d) => !r.doors.includes(d) && !(r.frontDoor === d));
    if (!walls.length) { log(G, 'Revolving Wall: phòng này không có bức tường trống.'); return; }
    G.pending.push({ type: 'choice', player: pid, prompt: 'Revolving Wall: đặt Wall Switch lên bức tường nào?', options: walls.map((d) => ({ label: `Tường ${['Bắc', 'Đông', 'Nam', 'Tây'][d]}`, effects: [{ t: 'custom', fn: 'revolvingWallAt', args: { dir: d } }] })) });
  },
  revolvingWallAt(c, pid, a) {
    const G = c.G; const r = G.rooms[G.players[pid].room]; const d = a.dir as Dir; const [dx, dy] = DV[d];
    let other = roomAt(G, r.floor, r.x + dx, r.y + dy)?.id;
    if (!other) {
      const t = drawTileFor(G, r.floor, c.rng.shuffle);
      if (!t) { log(G, 'Revolving Wall: hết ô phòng cho tầng này, bỏ lá.'); return; }
      // place it on the other side of the wall; choose a rotation that does not seal the floor, preferring matched doors
      let rot = 0, best = -1;
      for (let k = 0; k < 4; k++) { const ds = roomDef(t)!.doors.map((x) => ((x + k) % 4) as Dir); let sc = 0; for (const q of ds) { const [ex, ey] = DV[q]; const n = roomAt(G, r.floor, r.x + dx + ex, r.y + dy + ey); if (n && n.doors.includes(opp(q))) sc++; } if (sc > best) { best = sc; rot = k; } }
      placeTile(G, t, r.floor, r.x + dx, r.y + dy, rot); other = t; log(G, `Ô phòng mới phía sau tường: ${roomName(t)}.`);
    }
    const pair = `rw-${G.log.length}`;
    G.tokens.push({ id: `${pair}-a`, kind: 'wallSwitch', room: r.id, data: { pair } }, { id: `${pair}-b`, kind: 'wallSwitch', room: other!, data: { pair } });
    placeExplorer(c, pid, other!);
  },
  secretPassage(c, pid) {
    const G = c.G; const here = G.players[pid].room; const d = rollDice(c.rng, 3, { label: 'Secret Passage', reason: '3 xúc xắc' }); const t = sum(d);
    const f: Floor | null = t >= 6 ? null : t >= 4 ? 'upper' : t >= 2 ? 'ground' : 'basement';
    log(G, `🎲 Secret Passage: [${d.join(',')}] = ${t} → ${f ?? 'phòng bất kỳ'}`);
    const rooms = Object.values(G.rooms).filter((r) => r.id !== here && (!f || r.floor === f)).map((r) => r.id);
    const pair = `sp-${G.log.length}`;
    G.tokens.push({ id: `${pair}-a`, kind: 'secretPassage', room: here, data: { pair } });
    if (!rooms.length) { log(G, 'Không có phòng hợp lệ cho đầu kia.'); return; }
    G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Secret Passage: đặt đầu kia ở phòng nào?', rooms, then: [], varName: `token:secretPassage:${pair}` });
  },
  secretStairs(c, pid) {
    const G = c.G; const here = G.players[pid].room; const f = G.rooms[here].floor;
    const rooms = Object.values(G.rooms).filter((r) => r.floor !== f).map((r) => r.id);
    const pair = `ss-${G.log.length}`;
    G.tokens.push({ id: `${pair}-a`, kind: 'secretStairs', room: here, data: { pair } });
    G.pending.push({ type: 'pickRoom', player: pid, prompt: 'Secret Stairs: đặt đầu kia ở phòng (tầng khác) nào?', rooms, then: [], varName: `token:secretStairs:${pair}` });
  },
  itemToEntrance(c, pid) {
    const G = c.G; const items = G.players[pid].cards.filter((x) => x.kind === 'item');
    if (!items.length) return;
    G.pending.push({ type: 'choice', player: pid, prompt: 'Shrieking Wind: chọn 1 Item bị thổi tới Entrance Hall', options: items.map((it) => ({ label: cardName(it.id), effects: [{ t: 'custom', fn: 'dropItemAt', args: { card: it.id, room: 'entrance-hall' } }] })) });
  },
  dropItemAt(c, pid, a) {
    const G = c.G; const ref = loseCard(c, pid, a.card as string); if (!ref) return;
    let pile = G.tokens.find((t) => t.kind === 'itemPile' && t.room === a.room);
    if (!pile) { pile = { id: `pile-${G.log.length}`, kind: 'itemPile', room: a.room as string, data: { cards: [] } }; G.tokens.push(pile); }
    (pile.data!.cards as CardRef[]).push(ref);
  },
  jumpToPatio(c, pid) {
    const G = c.G;
    if (!G.rooms.patio) {
      if (!G.roomStack.includes('patio') && !G.roomDiscard.includes('patio')) return;
      const f = autoPlace(G, 'patio', 'ground'); G.roomStack = c.rng.shuffle(G.roomStack);
      if (!f) { log(G, 'Không có chỗ đặt Patio.'); return; }
      log(G, 'Patio được tìm ra và đặt vào nhà.');
    }
    placeExplorer(c, pid, 'patio');
  },
  lostOne(c, pid) {
    const G = c.G; const d = rollDice(c.rng, 3, { label: 'The Lost One', reason: '3 xúc xắc' }); const t = sum(d); log(G, `🎲 The Lost One: [${d.join(',')}] = ${t}`);
    if (t >= 6) return placeExplorer(c, pid, 'entrance-hall');
    if (t >= 4) return placeExplorer(c, pid, 'upper-landing');
    const f: Floor = t >= 2 ? 'upper' : 'basement';
    const room = drawAndPlace(c, f);
    placeExplorer(c, pid, room ?? 'entrance-hall');
    if (room && G.turn.player === pid) CUSTOM.__discoverSymbol?.(c, pid, { room });
  },
  theWalls(c, pid) {
    const G = c.G; const t = G.roomStack.shift();
    if (!t) { log(G, 'The Walls: hết ô phòng.'); return; }
    const f = autoPlace(G, t, G.rooms[G.players[pid].room].floor);
    if (!f) { G.roomDiscard.push(t); log(G, 'The Walls: không đặt được ô phòng.'); return; }
    log(G, `The Walls: ô mới ${roomName(t)}.`); placeExplorer(c, pid, t);
    CUSTOM.__discoverSymbol?.(c, pid, { room: t });
  },
  whatThe(c, pid) {
    const G = c.G; const id = G.players[pid].room; const r = G.rooms[id];
    if (START_ROOMS[id]) { log(G, 'What the...?: không thể nhấc ô khởi đầu.'); return; }
    const def = roomDef(id)!; delete G.grid[`${r.floor}:${r.x},${r.y}`]; delete G.rooms[id];
    const floors = [r.floor, ...def.floors.filter((f) => f !== r.floor)];
    for (const f of floors) for (const s of openSpots(G, f)) { const rots = validRotations(G, id, f, s.x, s.y, s.fromDir); if (rots.length) { placeTile(G, id, f, s.x, s.y, rots[0], r.discoveredBy); log(G, `What the...?: ${roomName(id)} chuyển đến chỗ mới (${f}).`); return; } }
    G.rooms[id] = r; G.grid[`${r.floor}:${r.x},${r.y}`] = id; log(G, 'What the...?: không có chỗ hợp lệ, phòng giữ nguyên.');
  },
  whoops(c, pid) {
    const G = c.G; const items = G.players[pid].cards.filter((x) => x.kind === 'item');
    if (!items.length) { log(G, 'Whoops!: không có Item nào.'); return; }
    const pick = c.rng.shuffle(items)[0]; discardCard(G, loseCard(c, pid, pick.id)!); log(G, `Whoops!: mất ${cardName(pick.id)}.`);
  },
  possession(c, pid) {
    G_choice(c, pid, 'Possession: chọn chỉ số để đổ', TRAITS.map((t) => ({ label: TRAIT_VI[t], effects: [{ t: 'roll', spec: { label: 'Possession', trait: t, isEvent: true, outcomes: [{ min: 4, effects: [{ t: 'gain', trait: t, n: 1 }] }, { min: 0, max: 3, effects: [{ t: 'custom', fn: 'possessionDrop', args: { trait: t } }] }] } } as Effect] })));
  },
  possessionDrop(c, pid, a) {
    const G = c.G; const p = G.players[pid]; const t = a.trait as Trait;
    if (p.idx[t] > 0) { shiftTrait(G, pid, t, -p.idx[t]); return; }
    const others = TRAITS.filter((x) => x !== t && p.idx[x] > 0);
    if (others.length) G_choice(c, pid, 'Possession: chỉ số đó đã thấp nhất, chọn chỉ số khác để hạ xuống thấp nhất', others.map((x) => ({ label: TRAIT_VI[x], effects: [{ t: 'custom', fn: 'possessionDrop', args: { trait: x } }] as Effect[] })));
  },
};
function G_choice(c: Ctx, pid: string, prompt: string, options: { label: string; effects: Effect[] }[]) { c.G.pending.push({ type: 'choice', player: pid, prompt, options }); }
/** Who rides the Mystic Slide placed by the event (same rule as CUSTOM.mysticSlide); null = card discarded. */
function slideRider(c: Ctx, pid: string): string | null {
  const G = c.G; if (G.rooms[G.players[pid].room].floor !== 'basement') return pid;
  const idx = G.order.indexOf(pid); const seq = [...G.order.slice(idx + 1), ...G.order.slice(0, idx)];
  return seq.find((id) => !G.players[id].dead && G.rooms[G.players[id].room].floor !== 'basement') ?? null;
}
function startRollQueued(c: Ctx, pid: string, spec: Omit<RollSpec, 'player'>) { enqueue(c, pid, [{ t: 'roll', spec }]); }
export { startValue, doorNeighbors, openDoorways, opp };

Object.assign(CUSTOM_ROLLS, {
  disquietingSounds: { label: 'Disquieting Sounds', reason: () => '6 xúc xắc' },
  footsteps: { label: 'Footsteps', reason: (c: Ctx, pid: string) => `${1 + (c.G.players[pid].room === 'chapel' ? 1 : 0)} xúc xắc` },
  groundskeeper: { label: 'Groundskeeper (Knowledge)' },
  hangedMen: { label: 'Hanged Men (đổ cả 4 chỉ số)' },
  saveRoll: { label: 'It Is Meant to Be (lưu kết quả)', reason: () => '4 xúc xắc' },
  lostOne: { label: 'The Lost One', reason: () => '3 xúc xắc' },
  secretPassage: { label: 'Secret Passage', reason: () => '3 xúc xắc' },
  mysticSlide: { label: 'Mystic Slide (Might 5+)', who: (c: Ctx, pid: string) => slideRider(c, pid) ?? pid, when: (c: Ctx, pid: string) => !!slideRider(c, pid),
    reason: (c: Ctx, pid: string) => { const w = slideRider(c, pid) ?? pid; const v = traitValue(c.G.players[w], 'might'); return diceReason('Might', v, Math.min(8, v)); } },
});
