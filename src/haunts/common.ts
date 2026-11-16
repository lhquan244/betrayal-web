// Small helpers shared by haunt plugins (traitor selection from the haunt chart, monster groups, task rolls).
import type { Ctx } from '../engine/core';
import { log, pname, traitValue, livingExplorers, rollDice, diceReason, sum } from '../engine/core';
import type { Trait, Monster, Effect } from '../engine/types';
import { enqueue } from '../engine/effects';

/** Players clockwise starting with the explorer to the left of `from` ("left" = next in turn order). */
export function leftOf(c: Ctx, from: string): string[] {
  const o = c.G.order; const i = o.indexOf(from);
  return Array.from({ length: o.length - 1 }, (_, k) => o[(i + 1 + k) % o.length]);
}
/** Chart: "Left of the haunt revealer". */
export const leftOfRevealer = (c: Ctx, revealer: string) => leftOf(c, revealer).find((id) => !c.G.players[id].dead) ?? null;
/**
 * Chart: "Highest/Lowest <trait>* (except for the haunt revealer)".
 * Tie rule printed under the chart: if one of the tied explorers is the haunt revealer, choose the revealer;
 * otherwise the one closest to the left of the haunt revealer.
 */
export function byTrait(c: Ctx, revealer: string, trait: Trait, which: 'highest' | 'lowest', exceptRevealer: boolean): string | null {
  const G = c.G; const cands = [revealer, ...leftOf(c, revealer)].filter((id) => !G.players[id].dead && !(exceptRevealer && id === revealer));
  if (!cands.length) return null;
  const v = (id: string) => traitValue(G.players[id], trait);
  const best = which === 'highest' ? Math.max(...cands.map(v)) : Math.min(...cands.map(v));
  return cands.find((id) => v(id) === best)!; // cands are ordered: revealer first, then clockwise from the revealer's left
}
/** Chart: "<Character> (<hobby>) or <fallback>". */
export function characterOr(c: Ctx, charId: string, fallback: () => string | null): string | null {
  const p = Object.values(c.G.players).find((x) => x.character === charId && !x.dead);
  return p ? p.id : fallback();
}
export const heroes = (c: Ctx) => livingExplorers(c.G).filter((id) => !c.G.players[id].isTraitor);
export const heroesIn = (c: Ctx, room: string) => heroes(c).filter((id) => c.G.players[id].room === room);
/** "Number of players" (the rulebook counts explorers who died too). */
export const nPlayers = (c: Ctx) => c.G.order.length;
export const monstersOf = (c: Ctx, kind: string) => c.G.monsters.filter((m) => m.kind === kind);
export function addMonster(c: Ctx, m: Omit<Monster, 'stunned' | 'carries'> & Partial<Pick<Monster, 'stunned' | 'carries'>>): Monster {
  const full: Monster = { stunned: false, carries: [], ...m }; c.G.monsters.push(full); return full;
}
export function removeMonster(c: Ctx, id: string) { c.G.monsters = c.G.monsters.filter((m) => m.id !== id); }
/** "Roll once for the whole group" movement for a monster type (rulebook p.18). A monster can always move at least 1 space. */
export function rollGroupMovement(c: Ctx, kind: string, label: string): number {
  const G = c.G; const ms = monstersOf(c, kind); if (!ms.length) return 0;
  const speed = ms[0].traits.speed ?? 0; const d = rollDice(c.rng, Math.min(8, speed), { who: c.G.haunt?.traitor ?? undefined, label: `${label}: di chuyển`, reason: diceReason('Speed', speed) }); const t = sum(d);
  for (const m of ms) {
    const can = !m.stunned && !m.noMove && m.bornTurn !== G.turnCounter;
    (G.turn as Record<string, unknown>)[`mv:${m.id}`] = can ? Math.max(1, t) : 0;
  }
  log(G, `🎲 ${label} tung di chuyển (${speed} xúc xắc): [${d.join(',')}] = ${t}`);
  return t;
}
/** One task roll per turn (rulebook glossary "task roll"). */
export function taskRoll(c: Ctx, pid: string, label: string, trait: Trait, target: number, onSuccess: Effect[], onFail: Effect[] = [], bonusDice = 0) {
  c.G.turn.taskDone = true;
  enqueue(c, pid, [{ t: 'roll', spec: { label, trait, ...(bonusDice ? { bonusDice } : {}), outcomes: [{ min: target, effects: onSuccess }, { min: 0, max: target - 1, effects: onFail }] } }]);
}
export const taskBlocked = (c: Ctx) => (c.G.turn.taskDone ? 'Mỗi lượt chỉ được thử 1 task roll' : null);
export const say = (c: Ctx, pid: string, text: string) => log(c.G, `${pname(c.G, pid)} ${text}`);
