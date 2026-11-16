import { useEffect, useState } from 'react';
import { Client } from 'boardgame.io/client';
import { Local, SocketIO } from 'boardgame.io/multiplayer';
import { Betrayal } from '../engine/game';
import type { GState } from '../engine/types';

export type BgClient = ReturnType<typeof Client<GState>>;
export interface View { G: GState; ctx: { currentPlayer: string; gameover?: unknown; numPlayers: number }; isConnected?: boolean }

export const SERVER = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_SERVER
  ?? (location.port === '5173' ? `${location.protocol}//${location.hostname}:8000` : location.origin);

export function onlineClient(matchID: string, playerID: string, credentials: string): BgClient {
  return Client<GState>({ game: Betrayal, matchID, playerID, credentials, multiplayer: SocketIO({ server: SERVER }), debug: false });
}
export function hotseatClients(n: number, forceHaunt?: number, seed?: string): BgClient[] {
  const mp = Local();
  const game = { ...Betrayal, ...(seed ? { seed } : {}), setup: (a: Parameters<NonNullable<typeof Betrayal.setup>>[0]) => Betrayal.setup!(a, { forceHaunt }) };
  return Array.from({ length: n }, (_, i) => Client<GState>({ game, numPlayers: n, playerID: String(i), multiplayer: mp, debug: false }));
}
export function useClients(clients: BgClient[]) {
  const [, setTick] = useState(0);
  useEffect(() => {
    clients.forEach((c) => c.start());
    const uns = clients.map((c) => c.subscribe(() => setTick((t) => t + 1)));
    return () => { uns.forEach((u) => u()); clients.forEach((c) => c.stop()); };
  }, [clients]);
}
