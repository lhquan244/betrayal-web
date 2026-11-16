// Haunt plugin interface. A haunt = one file implementing HauntModule + one line in ./index.ts.
import type { Ctx } from '../engine/core';
import type { GState, HauntState, Trait } from '../engine/types';

export interface HauntAction {
  id: string;
  label: string;                          // Vietnamese button label
  /** 'monsters' = used by the traitor during the monster turn (shown in the monster panel). */
  side: 'heroes' | 'traitor' | 'monsters';
  /** Return null if available, otherwise a reason (shown greyed out). */
  check(c: Ctx, pid: string): string | null;
  run(c: Ctx, pid: string, args?: Record<string, unknown>): void;
  /** Optional variants: one button per option; the chosen option's args are passed to run(). */
  options?(c: Ctx, pid: string): { label: string; args: Record<string, unknown> }[];
}

export interface HauntArt {
  /** Base name of the artwork in /public/art (reveal picture `${art}.webp`, tokens `${art}-token(-sm).webp`). */
  art: string;
  /** Name shown for the monster turn ("Lượt: …"). */
  monsterName: string;
}

export interface HauntModule {
  number: number;                         // number in the haunt chart / books
  name: string;
  edition: string;                        // e.g. "2nd edition (Avalon Hill/Hasbro F3148)"
  source: string;                         // where the rules were verified
  /** Who becomes the traitor (the "Traitor" column of the haunt chart). */
  traitorRule(c: Ctx, revealer: string): string | null;
  /** Instruction text (Vietnamese paraphrase). Each side only sees its own text in the UI. */
  traitorText: string;
  heroText: string;
  /** Rule details that could not be verified from the source and how the web version handles them (shown to everyone). */
  gaps?: string[];
  /** Points where Traitor's Tome and Secrets of Survival disagree; the web version always follows Traitor's Tome. */
  ttConflicts?: string[];
  art?: HauntArt;
  /** "Right Now" setup. */
  setup(c: Ctx, h: HauntState): void;
  /** Extra moves available during the haunt. */
  actions: HauntAction[];
  // ---- optional hooks ----
  /** Called whenever an explorer enters a room (after movement). */
  onEnterRoom?(c: Ctx, pid: string, room: string): void;
  /** Before an explorer draws a card because of a room symbol. Return a card id to take instead (searched from the deck),
   *  or { card, optional: true } to let the explorer choose between that card and a normal draw. */
  replaceDraw?(c: Ctx, pid: string, kind: 'event' | 'item' | 'omen'): string | { card: string; optional: true } | { choose: string[] } | null;
  /** Start of the monster turn (e.g. roll movement). */
  onMonsterTurnStart?(c: Ctx): void;
  /** Called when the traitor ends the monster turn (after canEndMonsterTurn passed). */
  onMonsterTurnEnd?(c: Ctx): void;
  /** Called at the end of an explorer's turn during the haunt (before the next turn starts). May enqueue effects. */
  onExplorerTurnEnd?(c: Ctx, pid: string): void;
  /** A monster defeated an explorer by `diff` in combat; return true if the haunt handled the damage itself. */
  onMonsterInflicts?(c: Ctx, monsterId: string, pid: string, diff: number, trait: Trait): boolean;
  /** A monster attacked and lost; return true if the haunt handled it (otherwise the monster is stunned). */
  onMonsterLoses?(c: Ctx, monsterId: string, pid: string): boolean;
  /** Change a monster's attack dice (e.g. reroll blanks). */
  onMonsterAttackRoll?(c: Ctx, monsterId: string, dice: number[]): number[];
  /** Validate an attack against a monster; return an error string to forbid it. */
  canAttackMonster?(c: Ctx, pid: string, monsterId: string, trait: Trait, weapon?: string): string | null;
  /** Can `attacker` (player id or `m:<monsterId>`) attack or otherwise affect explorer `target`? Return a reason to forbid. */
  canAttackExplorer?(c: Ctx, attacker: string, target: string): string | null;
  /** Can this explorer / monster enter `room`? Return a reason to forbid. */
  canEnterRoom?(c: Ctx, who: { pid?: string; mid?: string }, room: string): string | null;
  /** Can this explorer move at all this turn? */
  canExplorerMove?(c: Ctx, pid: string): string | null;
  /** Called after an explorer beats a monster in combat (or Dynamite); return true to override the default "stun". */
  onMonsterDefeated?(c: Ctx, pid: string, monsterId: string, trait: Trait): boolean;
  /** Monster must-do checks before the traitor ends the monster turn (return error to block ending). */
  canEndMonsterTurn?(c: Ctx): string | null;
  /** Forbid using / dropping / trading a card (return reason). */
  blockCard?(c: Ctx, pid: string, card: string, action: 'use' | 'drop' | 'trade'): string | null;
  /** A card was stolen in combat; return true if the haunt handled where it goes. */
  onCardStolen?(c: Ctx, thief: string, victim: string, card: string): boolean;
  /** Extra things (not cards) that can be stolen from `victim` instead of inflicting damage. */
  stealExtras?(c: Ctx, thief: string, victim: string): { id: string; label: string }[];
  onStealExtra?(c: Ctx, thief: string, victim: string, id: string): void;
  /** Hide secret haunt data from a player's view (return the data that player may see). */
  playerView?(data: Record<string, unknown>, G: GState, playerID: string | null | undefined): Record<string, unknown>;
  /** Public status lines for the haunt panel: [label, value]. */
  status?(G: GState): [string, string][];
  /** Hint for the headless test bot / demo bot only (never used by the rules): room the explorer should head to. */
  botTarget?(c: Ctx, pid: string): string | null;
  /** Win check, called after every state change. */
  checkWin(c: Ctx): { winner: 'traitor' | 'heroes'; text: string } | null;
}
