import { useEffect, useLayoutEffect, useRef } from 'react';
import type { GState, Floor, Dir } from '../engine/types';
import { roomName, roomDef, tokensIn, START_ROOMS } from '../engine/house';
import { HAUNTS } from '../haunts';
import { cardName } from '../engine/core';
import { pcolor, initials } from './theme';
import { ART, ArtImg, ArtToken } from './Art';
import { EventIcon, ItemIcon, OmenIcon, MummyIcon, SarcophagusIcon, GirlIcon, StairsIcon } from './Icons';

const S = 124; // grid cell px (tile + gutter)
const T = 116; // tile size
const SYM = { event: EventIcon, item: ItemIcon, omen: OmenIcon };
const TOKEN_VI: Record<string, string> = { holySeal: 'Holy Seal', mightRoll: 'Token Might Roll', itemPile: 'Đồ rơi', smoke: 'Khói (Smoke)', blessing: 'Blessing', secretPassage: 'Lối bí mật', secretStairs: 'Cầu thang bí mật', drip: 'Drip', slide: 'Mystic Slide', wallSwitch: 'Wall Switch', closet: 'Closet', safe: 'Két sắt', skeletons: 'Skeletons', vaultEmpty: 'Vault trống', belowCollapsed: 'Dưới Collapsed Room' };
const TOKEN_ICON: Record<string, string> = { holySeal: '🔯', mightRoll: '▲', itemPile: '📦', smoke: '💨', blessing: '✨', secretPassage: '🚪', secretStairs: '🪜', drip: '💧', slide: '🌀', wallSwitch: '🔄', closet: '🚪', safe: '🔐', skeletons: '💀', vaultEmpty: '∅', belowCollapsed: '⇣' };
const SLOTS: [number, number][] = [[22, 74], [50, 74], [78, 74], [22, 50], [50, 50], [78, 50], [36, 96], [64, 96]];
const STAIR_ROOMS = new Set(['grand-staircase', 'upper-landing', 'stairs-from-basement', 'basement-landing', 'foyer']);

export function MapView({ G, floor, actor, moves, pickRooms, onMove, onPick, focusRoom }: {
  G: GState; floor: Floor; actor: string; moves: { room?: string; dir?: Dir; label: string }[]; pickRooms?: string[];
  onMove: (t: { room?: string; dir?: Dir }) => void; onPick: (room: string) => void; focusRoom?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const rooms = Object.values(G.rooms).filter((r) => r.floor === floor);
  if (seen.current === null) seen.current = new Set(Object.keys(G.rooms));
  const fresh = rooms.filter((r) => !seen.current!.has(r.id)).map((r) => r.id);
  useEffect(() => { fresh.forEach((id) => seen.current!.add(id)); });

  const xs = rooms.map((r) => r.x), ys = rooms.map((r) => r.y);
  const minX = Math.min(0, ...xs) - 1, maxX = Math.max(0, ...xs) + 1, minY = Math.min(0, ...ys) - 1, maxY = Math.max(0, ...ys) + 1;
  const pos = (x: number, y: number) => ({ left: (x - minX) * S, top: (maxY - y) * S });
  const focus = focusRoom && G.rooms[focusRoom]?.floor === floor ? G.rooms[focusRoom] : undefined;
  useLayoutEffect(() => {
    const el = wrap.current; if (!el || !focus) return;
    const p = pos(focus.x, focus.y); const mapEl = el.querySelector('.map') as HTMLElement | null;
    const z = mapEl ? parseFloat(getComputedStyle(mapEl).zoom || '1') || 1 : 1;
    el.scrollTo({ left: (p.left + T / 2 + 40) * z - el.clientWidth / 2, top: (p.top + T / 2 + 40) * z - el.clientHeight / 2, behavior: 'smooth' });
  }, [focus?.id, floor, rooms.length]);

  const me = G.players[actor]; const myRoom = me ? G.rooms[me.room] : undefined;
  const reach = new Set(moves.filter((m) => m.room).map((m) => m.room!));
  const DV: Record<number, [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };
  // pawns (players + monsters) rendered in one layer so they can glide between tiles
  const pawns: { key: string; left: number; top: number; el: JSX.Element }[] = [];
  const monsterArt = (G.haunt && HAUNTS[G.haunt.number]?.art?.art) || 'mummy';
  for (const r of rooms) {
    const occ = [
      ...G.order.map((id) => G.players[id]).filter((p) => p.room === r.id && !p.dead && p.character).map((p) => ({ key: `p${p.id}`, el: <span className={`pawn ${G.turn.player === p.id && G.turn.part === 'explorer' && G.phase !== 'over' ? 'active' : ''} ${p.isTraitor ? 'traitor' : ''}`} style={{ ['--pc' as string]: pcolor(p) }} title={p.name}><b>{initials(p.name)}</b>{p.character && <ArtImg src={ART.portraitSm(p.character)} />}</span> })),
      ...G.monsters.filter((m) => m.room === r.id).map((m) => ({ key: `m${m.id}`, el: <span className={`pawn monster ${m.stunned ? 'stun' : ''} ${G.turn.part === 'monsters' ? 'active' : ''}`} title={m.name}><i className="fb"><MummyIcon size={30} /></i><ArtImg src={ART.hauntToken(monsterArt)} /></span> })),
    ];
    const p = pos(r.x, r.y);
    occ.forEach((o, i) => { const [sx, sy] = SLOTS[i % SLOTS.length]; pawns.push({ key: o.key, left: p.left + (sx / 100) * T, top: p.top + (sy / 100) * T, el: o.el }); });
  }
  if (!rooms.length) return <div className="mapwrap" ref={wrap}><div className="map empty">Chưa khám phá phòng nào ở tầng này.</div></div>;
  return (
    <div className={`mapwrap floor-${floor}`} ref={wrap}>
      <div className="map" key={floor} style={{ width: (maxX - minX + 1) * S, height: (maxY - minY + 1) * S }}>
        {rooms.map((r) => {
          const def = roomDef(r.id); const sym = def?.symbol as keyof typeof SYM | null | undefined; const Sym = sym ? SYM[sym] : null;
          const toks = tokensIn(G, r.id);
          const isPick = pickRooms?.includes(r.id); const isReach = reach.has(r.id);
          return (
            <div key={r.id} className={`tile ${floor} ${def?.outside ? 'outside' : ''} ${isReach ? 'reach' : ''} ${isPick ? 'pick' : ''} ${myRoom?.id === r.id ? 'mine' : ''} ${fresh.includes(r.id) ? 'appear' : ''}`}
              style={pos(r.x, r.y)} title={`${roomName(r.id)}\n${def?.text ?? START_ROOMS[r.id]?.text ?? ''}`}
              onClick={() => { if (isPick) onPick(r.id); else if (isReach) onMove({ room: r.id }); }}>
              <div className="floorfx" />
              {r.doors.map((d) => <span key={d} className={`door d${d}`} />)}
              {r.frontDoor !== undefined && <span className={`door front d${r.frontDoor}`} />}
              <div className="plaque">{roomName(r.id)}</div>
              {STAIR_ROOMS.has(r.id) && r.id !== 'foyer' && <span className="stairs"><StairsIcon /></span>}
              {Sym && <span className={`sym ${sym}`} title={sym ?? undefined}><Sym size={15} /></span>}
              <div className="toks">
                {toks.map((t) => t.kind === 'sarcophagus' ? <ArtToken key={t.id} className="maptok sarc" title="Sarcophagus" src={ART.sarcophagus} fallback={<SarcophagusIcon size={20} />} />
                  : t.kind === 'girlToken' || (t.kind === 'companion' && t.data?.card === 'girl') ? <ArtToken key={t.id} className="maptok girl" title="Girl" src={ART.girl} fallback={<GirlIcon size={20} />} />
                  : t.kind === 'companion' ? <span key={t.id} className="tok" title={cardName(t.data!.card as string)}>{t.data!.card === 'dog' ? '🐕' : '🧍'}</span>
                  : <span key={t.id} className="tok" title={t.kind === 'itemPile' ? (t.data!.cards as { id: string }[]).map((x) => cardName(x.id)).join(', ') : TOKEN_VI[t.kind] ?? t.kind}>{TOKEN_ICON[t.kind] ?? '•'}</span>)}
              </div>
            </div>);
        })}
        {myRoom && myRoom.floor === floor && moves.filter((m) => m.dir !== undefined).map((m) => {
          const [dx, dy] = DV[m.dir!]; const p = pos(myRoom.x + dx, myRoom.y + dy);
          return <button key={m.dir} className="explore" style={p} onClick={() => onMove({ dir: m.dir })}><span className="plus">+</span>Khám phá<br />phòng mới</button>;
        })}
        {pawns.sort((a, b) => a.key.localeCompare(b.key)).map((p) => <div key={p.key} className="pawnpos" style={{ left: p.left, top: p.top }}>{p.el}</div>)}
      </div>
    </div>);
}
