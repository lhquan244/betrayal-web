// Core types for the Betrayal engine (pure TypeScript, no UI).
export type Floor = 'basement' | 'ground' | 'upper';
export type Dir = 0 | 1 | 2 | 3; // 0=N 1=E 2=S 3=W
export type Trait = 'might' | 'speed' | 'sanity' | 'knowledge';
export const TRAITS: Trait[] = ['might', 'speed', 'sanity', 'knowledge'];
export const PHYSICAL: Trait[] = ['might', 'speed'];
export const MENTAL: Trait[] = ['sanity', 'knowledge'];
export type CardKind = 'event' | 'item' | 'omen';

export interface TraitTrack { track: number[]; start: number }
export interface CharacterDef {
  id: string; name: string; color: string; age: number; birthday: [number, number];
  hobbies: string[]; traits: Record<Trait, TraitTrack>;
}

export interface RoomDef {
  id: string; name: string; floors: Floor[]; doors: Dir[];
  symbol: CardKind | null; text: string; outside?: boolean; windows?: boolean;
}

/** A tile placed in the house. Multi-room starting tile is stored as 3 separate rooms. */
export interface PlacedRoom {
  id: string;            // room id (unique)
  floor: Floor; x: number; y: number;
  rot: number;           // 0..3 clockwise quarter turns
  doors: Dir[];          // rotated doors (absolute)
  frontDoor?: Dir;       // Entrance Hall's locked front door
  discoveredBy?: string;
}

export interface Token { id: string; kind: string; room: string; data?: Record<string, unknown> }

export interface CardRef { kind: CardKind; id: string }

export interface PlayerState {
  id: string;                 // boardgame.io playerID
  name: string;
  character: string | null;   // character id
  idx: Record<Trait, number>; // clip position: -1 = skull, 0..7 track index
  over: Partial<Record<Trait, number>>; // "over the top" bookkeeping (rulebook p.11)
  room: string;
  barrierSide?: 0 | 1;        // side of a barrier room
  cards: CardRef[];           // items + omens held (events with ongoing effects live in statuses)
  statuses: Record<string, unknown>; // e.g. buried, webbed, lightsOut, graveDirt, mask
  dead: boolean;
  isTraitor: boolean;
}

export interface Monster {
  id: string; name: string; room: string;
  traits: Partial<Record<Trait, number>>;
  stunned: boolean; stunnedSince?: number;
  carries: CardRef[];
  companionGirl?: boolean;
  immune?: Trait[];
  kind?: string;          // monster type (group movement: one roll per type)
  noSlow?: boolean;       // doesn't slow explorers leaving its room (e.g. Firebats, Death)
  noMove?: boolean;       // never moves (e.g. Death: no Speed trait)
  noAttack?: boolean;     // can't make normal attacks (e.g. Firebats, Death)
  untargetable?: boolean; // can't be attacked (e.g. Firebats, Death)
  bornTurn?: number;      // turnCounter of the monster turn it appeared in (can't move that turn)
}

export type DamageKind = 'physical' | 'mental';

/** A decision the engine is waiting for. Only `player` may resolve it (server-checked). */
export type Pending =
  | { type: 'damage'; player: string; kind: DamageKind; amount: number; source: string }
  | { type: 'choice'; player: string; prompt: string; options: { label: string; effects: Effect[] }[] }
  | { type: 'rotate'; player: string; tile: string; floor: Floor; x: number; y: number; options: number[]; fromDir: Dir }
  | { type: 'pickRoom'; player: string; prompt: string; rooms: string[]; then: Effect[]; varName: string }
  | { type: 'preRoll'; player: string; roll: RollSpec; options: string[] }
  | { type: 'postRoll'; player: string; roll: RollSpec; dice: number[]; options: string[] }
  | { type: 'steal'; player: string; target: string; damage: number; kind: DamageKind; targetIsMonster: boolean; extras?: { id: string; label: string }[] }
  /** The game waits for `player` to press "Đổ xúc xắc". src 'queue': the next queued effect rolls; 'gate': a move (G.rollGate) runs after every roller pressed. */
  | { type: 'roll'; player: string; label: string; reason?: string; src: 'queue' | 'gate' }
  | { type: 'pickCard'; player: string; prompt: string; cards: CardRef[]; then: string; data?: Record<string, unknown> };

export interface RollSpec {
  player: string;
  trait?: Trait;          // trait roll
  dice?: number;          // fixed number of dice
  bonusDice?: number;
  addResult?: number;     // e.g. Adrenaline Shot
  fixedResult?: number;   // Angel Feather / It Is Meant To Be
  isEvent?: boolean;      // roll caused by an event card (Candle)
  label: string;
  outcomes: Outcome[];
  key?: string;           // "same roll once per turn" key
}
export interface Outcome { min: number; max?: number; effects: Effect[] }

/** Data-driven card/room effects. Interpreted by effects.ts. */
export type Effect = { who?: Who; /** dice already requested by the roller (explicit-roll gate) */ __go?: boolean } & (
  | { t: 'gain'; trait: Trait | 'all' | 'choose' | 'physical' | 'mental'; n: number; who?: Who }
  | { t: 'lose'; trait: Trait | 'all' | 'choose' | 'physical' | 'mental'; n: number; who?: Who }
  | { t: 'damage'; kind: DamageKind; dice?: number; amount?: number; who?: Who }
  | { t: 'roll'; spec: Omit<RollSpec, 'player'>; who?: Who }
  | { t: 'draw'; kind: CardKind; n?: number; who?: Who }
  | { t: 'moveTo'; room: string; who?: Who }
  | { t: 'token'; kind: string; data?: Record<string, unknown> }
  | { t: 'status'; key: string; value: unknown; who?: Who }
  | { t: 'clearStatus'; key: string; who?: Who }
  | { t: 'choice'; prompt: string; options: { label: string; effects: Effect[] }[] }
  | { t: 'eventAttack'; might: number; then?: Effect[]; source: string }
  | { t: 'log'; text: string }
  | { t: 'endMove' }
  | { t: 'custom'; fn: string; args?: Record<string, unknown> });
export type Who = 'self' | 'all' | 'allInBasement' | 'allOutside';

export interface CardDef {
  id: string; kind: CardKind; name: string; text: string; // Vietnamese paraphrase
  onDraw?: Effect[];
  passive?: Partial<Record<Trait, number>>; // trait gain when gained, lost when lost (e.g. Book +2 Knowledge)
  lossPenalty?: Partial<Record<Trait, number>>; // extra/other change on loss if different from passive (e.g. Amulet -3)
  weapon?: { trait: Trait; bonusDice: number; distance?: boolean };
  noTrade?: boolean; noDrop?: boolean; noSteal?: boolean; companion?: boolean;
  usable?: 'action' | 'preRoll' | 'postRoll' | 'passive';
  todo?: string; // part of the official text not automated -> manual adjust
}

export interface LogEntry { t: number; s?: number; text: string; private?: string[] }

export interface HauntState {
  number: number; name: string; traitor: string | null; revealer: string;
  revealRoom: string; omen: string; data: Record<string, unknown>;
  winner?: 'traitor' | 'heroes'; winText?: string;
}

export interface GState {
  phase: 'select' | 'explore' | 'haunt' | 'over';
  options: { forceHaunt?: number };
  players: Record<string, PlayerState>;
  order: string[];              // seating order (clockwise) = boardgame.io player order after birthday sort
  rooms: Record<string, PlacedRoom>;
  grid: Record<string, string>; // `${floor}:${x},${y}` -> room id
  roomStack: string[]; roomDiscard: string[];
  decks: Record<CardKind, string[]>; discards: Record<CardKind, string[]>;
  setAside: CardRef[];
  omensDrawn: number;
  tokens: Token[];
  monsters: Monster[];
  pending: Pending[];
  queue: { player: string; effects: Effect[]; vars?: Record<string, unknown> }[];
  turn: {
    player: string; part: 'explorer' | 'monsters'; spent: number; moveEnded: boolean;
    drewOmen: boolean; lastOmen?: { card: string; room: string }; attacked: boolean;
    rollsDone: string[]; usedItems: string[]; exitedFrom?: string; monsterMoves?: number; elevatorUsed?: boolean;
    taskDone?: boolean; mummyAttacked?: boolean;
    forceEnd?: boolean; // a haunt rule ended this turn (only "end turn" is allowed)
  };
  turnCounter: number;
  haunt: HauntState | null;
  log: LogEntry[];
  logSeq?: number;
  lastRoll?: { player: string; label: string; dice: number[]; total: number };
  /** Every dice roll of the last move that rolled (shown to all clients by the dice overlay). Log lines with s in (logFrom, logTo] are its outcome. */
  lastRolls?: { seq: number; by: string; items: { who: string; label: string; reason?: string; dice: number[]; total: number }[]; logFrom: number; logTo: number };
  /** A move that will roll dice, waiting for the rollers' "Đổ xúc xắc" presses (args hidden from other players). */
  rollGate?: { move: string; args: unknown[]; actor: string };
  lastCard?: { kind: CardKind; id: string; player: string };
}
