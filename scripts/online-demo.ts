// Drives a real online match over socket.io (3 bot players) until the haunt has started, then prints
// player 0's seat so a browser can open the same match. Usage: npx tsx scripts/online-demo.ts [server]
import { LobbyClient, Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { Betrayal } from '../src/engine/game';
import type { GState } from '../src/engine/types';
import * as R from '../src/engine/rules';
import { writeFileSync } from 'node:fs';

const server = process.argv[2] ?? 'http://localhost:8000';
const lobby = new LobbyClient({ server });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { matchID } = await lobby.createMatch('betrayal', { numPlayers: 3, setupData: { forceHaunt: 1 } });
const names = ['Quân', 'Minh', 'Lan'];
const seats = [] as { playerID: string; credentials: string }[];
for (let i = 0; i < 3; i++) { const r = await lobby.joinMatch('betrayal', matchID, { playerID: String(i), playerName: names[i] }); seats.push({ playerID: String(i), credentials: r.playerCredentials }); }
const clients = seats.map((s) => Client<GState>({ game: Betrayal, matchID, playerID: s.playerID, credentials: s.credentials, multiplayer: SocketIO({ server }) }));
clients.forEach((c) => c.start()); await sleep(1500);
const st = () => clients[0].getState()!.G;
const call = async (pid: string, move: string, ...args: unknown[]) => { (clients[Number(pid)].moves as Record<string, (...a: unknown[]) => void>)[move](...args); await sleep(120); };
const chars = ['darrin-williams', 'belladina-zostra', 'zoe-ingstrom'];
for (let i = 0; i < 3; i++) await call(String(i), 'selectCharacter', chars[i], names[i]);
await call('0', 'startGame');
let n = 0; let hauntTurns = 0;
while (n++ < 3000) {
  const G = st(); if (G.phase === 'over') break;
  if (G.phase === 'haunt' && !G.pending.length && ++hauntTurns > 1) break;
  const pd = G.pending[0];
  if (pd) {
    const payload = pd.type === 'damage' ? { first: Math.ceil(pd.amount / 2) } : pd.type === 'choice' ? { option: 0 } : pd.type === 'rotate' ? { rot: pd.options[0] } : pd.type === 'pickRoom' ? { room: pd.rooms[pd.rooms.length - 1] } : {};
    await call(pd.player, 'resolve', payload); continue;
  }
  const pid = G.turn.player; const c = { G, rng: { d6: () => 1, shuffle: <T,>(a: T[]) => a } };
  if (G.turn.part === 'explorer' && !G.turn.moveEnded) {
    const o = R.movementOptions(c, pid); const pick = o.find((x) => x.dir !== undefined) ?? o[n % Math.max(1, o.length)];
    if (pick && !R.canMove(c, pid, pick.cost)) { await call(pid, 'move', pick.room ? { room: pick.room } : { dir: pick.dir }); continue; }
  }
  await call(pid, 'endTurn');
}
const G = st();
console.log(JSON.stringify({ matchID, phase: G.phase, haunt: G.haunt?.number, traitor: G.haunt?.traitor, seats }));
writeFileSync('/tmp/betrayal-demo-seat.json', JSON.stringify({ matchID, seats, traitor: G.haunt?.traitor }));
clients.forEach((c) => c.stop()); process.exit(0);
