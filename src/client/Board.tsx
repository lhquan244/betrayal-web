import { useEffect, useMemo, useRef, useState } from 'react';
import type { BgClient } from './useBgio';
import type { GState, Floor, Pending, Trait, PlayerState } from '../engine/types';
import { TRAITS } from '../engine/types';
import type { Ctx } from '../engine/core';
import { traitValue, cardName, holds } from '../engine/core';
import * as R from '../engine/rules';
import { links, roomName, BARRIERS } from '../engine/house';
import { CHARACTERS } from '../data/characters';
import { CARD_BY_ID } from '../data/cards';
import { HAUNTS, TT_POLICY } from '../haunts';
import { MapView } from './MapView';
import { PendingDialog } from './PendingDialog';
import { CardView, HauntReveal, EndOverlay } from './Overlays';
import { DiceOverlay, LastRollPanel, RollButton, DeckPiles, CardDraw, MuteToggle, useTraitFloats, sfx, reducedMotion } from './Fx';
import { KIND_ICON, SkullIcon, OmenIcon, MummyIcon } from './Icons';
import { COLOR, charOfP, pcolor, initials } from './theme';
import { ART, ArtImg, ArtToken, Avatar } from './Art';
import { InviteBox } from './Invite';

export { COLOR, charOfP, pcolor };
export const FLOOR_VI: Record<Floor, string> = { basement: 'Tầng hầm', ground: 'Tầng trệt', upper: 'Tầng trên' };
const FLOOR_EN: Record<Floor, string> = { basement: 'Basement', ground: 'Ground', upper: 'Upper' };
const TRAIT_VI: Record<Trait, string> = { might: 'Sức mạnh', speed: 'Tốc độ', sanity: 'Tỉnh táo', knowledge: 'Hiểu biết' };
const TRAIT_EN: Record<Trait, string> = { might: 'Might', speed: 'Speed', sanity: 'Sanity', knowledge: 'Knowledge' };
const noRng = { d6: () => 1, shuffle: <T,>(a: T[]) => a };

export function Board({ clients, me, names, conn, matchID, onLeave, demo }: { clients: BgClient[]; me: string | null; names?: Record<string, string>; conn?: Record<string, boolean>; matchID?: string; onLeave: () => void; demo?: boolean }) {
  const st = clients[0].getState();
  const [override, setOverride] = useState<string | null>(null);
  const [floor, setFloor] = useState<Floor>('ground');
  const [cardPopup, setCardPopup] = useState<string | null>(null);
  const [hauntTab, setHauntTab] = useState<'hero' | 'traitor' | null>(demo ? 'hero' : null);
  const [reveal, setReveal] = useState(false);
  const [endShown, setEndShown] = useState(true);
  const [drawFx, setDrawFx] = useState<{ id: string; player: string; n: number } | null>(null);
  const [shake, setShake] = useState(false);
  const G0 = st?.G;
  const auto = G0 ? (G0.pending[0]?.player ?? G0.turn.player) : '0';
  const actor = me ?? override ?? auto;
  const cl = me ? clients[0] : clients[Number(actor)];
  const view = cl.getState() ?? st;
  // the end screen waits for the deciding dice overlay (if any) instead of covering it
  const [endReady, setEndReady] = useState(view?.G.phase === 'over');
  useEffect(() => { if (view?.G.phase === 'over' && !endReady) { const t = setTimeout(() => setEndReady(true), reducedMotion() ? 0 : 2800); return () => clearTimeout(t); } }, [view?.G.phase]);
  const lastCardKey = view?.G.lastCard ? `${view.G.lastCard.id}:${view.G.lastCard.player}` : '';
  // Pop up a drawn card only when the draw happens while we watch (not for state that already existed when we connected).
  const prev = useRef<{ key: string; phase?: string }>({ key: '', phase: undefined });
  useEffect(() => {
    const was = prev.current; prev.current = { key: lastCardKey, phase: view?.G.phase };
    if (was.phase === 'explore' && view?.G.phase === 'haunt') { setReveal(true); setShake(true); sfx('haunt'); setTimeout(() => setShake(false), 900); }
    if (!view?.G.lastCard || lastCardKey === was.key || was.phase === undefined || (was.phase === 'select' && view.G.turnCounter > 1)) return;
    setDrawFx({ id: view.G.lastCard.id, player: view.G.lastCard.player, n: (view.G.logSeq ?? 0) });
  }, [lastCardKey, view?.G.phase]);
  useEffect(() => { if (demo && cardPopup) { const t = setTimeout(() => setCardPopup(null), 2300); return () => clearTimeout(t); } }, [cardPopup, demo]);
  useEffect(() => { setOverride(null); }, [G0?.phase]);
  const actorRoom = view?.G.players[actor]?.room;
  const monsterRoom = view?.G.turn.part === 'monsters' ? view.G.monsters[0]?.room : undefined;
  const focusRoom = monsterRoom ?? actorRoom;
  useEffect(() => { if (view && focusRoom && view.G.rooms[focusRoom]) setFloor(view.G.rooms[focusRoom].floor); }, [focusRoom, view?.G.turn.player]);
  useEffect(() => { if (!me) setOverride(null); }, [auto]);
  const offline = me !== null && (cl.getState() as { isConnected?: boolean } | null)?.isConnected === false;
  if (!view) return <div className="menu"><p>Đang kết nối tới server…</p><button onClick={onLeave}>Quay lại</button></div>;
  const G = view.G as GState; const c: Ctx = { G, rng: noRng };
  const mv = (name: string, ...args: unknown[]) => (cl.moves as Record<string, (...a: unknown[]) => void>)[name](...args);
  const err = (G as unknown as { lastError?: { player: string; text: string; t: number } }).lastError;
  const showErr = err && err.player === actor && err.t === (G.logSeq ?? 0) ? err.text : null;
  const pd: Pending | undefined = G.pending[0];
  const p = G.players[actor];
  const myTurn = G.turn.player === actor && !pd;
  const isTraitor = !!p?.isTraitor;

  if (G.phase === 'select') return <>{offline && <div className="connbar">⚠ Mất kết nối tới server — đang thử kết nối lại…</div>}<SelectScreen G={G} actor={actor} me={me} names={names} conn={conn} matchID={matchID} setOverride={setOverride} mv={mv} onLeave={onLeave} /></>;

  const moves = myTurn && G.turn.part === 'explorer' ? R.movementOptions(c, actor) : [];
  const actions = myTurn && G.turn.part === 'explorer' ? R.availableActions(c, actor) : [];
  const h = G.haunt ? HAUNTS[G.haunt.number] : null;
  const monsterTurn = G.turn.part === 'monsters' && G.turn.player === actor && !pd;
  const pickRooms = pd?.type === 'pickRoom' && pd.player === actor ? pd.rooms : undefined;
  const turnP = G.players[G.turn.player];
  const floorCount = (f: Floor) => Object.values(G.rooms).filter((r) => r.floor === f).length;
  const floorsOrder: Floor[] = ['upper', 'ground', 'basement'];

  return (
    <div className={`game phase-${G.phase} ${shake ? 'shake' : ''}`}>
      {offline && <div className="connbar">⚠ Mất kết nối tới server — đang thử kết nối lại…</div>}
      <header className="topbar">
        <div className="brand"><span className="brand-title">Betrayal</span><span className="brand-sub">at House on the Hill · 2nd ed.</span></div>
        {matchID && <span className="badge ghost">Phòng <code>{matchID}</code></span>}
        {matchID && <InviteBox matchID={matchID} compact />}
        <span className={`badge phase ph-${G.phase}`}>{G.phase === 'explore' ? 'Khám phá ngôi nhà' : G.phase === 'haunt' ? `Haunt #${G.haunt!.number} · ${G.haunt!.name}` : 'Kết thúc'}</span>
        <span className="badge omen" title="Số Omen đã rút — Haunt roll cần tổng < số này"><OmenIcon size={15} /> Omen: <b>{G.omensDrawn}</b></span>
        <span className="badge turn"><span className="dot" style={{ background: G.turn.part === 'monsters' ? '#d9c9a3' : pcolor(turnP) }} />Lượt: <b>{G.turn.part === 'monsters' ? (h?.art?.monsterName && h.art.monsterName !== '—' ? h.art.monsterName : 'Quái vật') : turnP.name}</b>{G.turn.part === 'monsters' ? <span className="muted"> (do {turnP.name} điều khiển)</span> : ''}</span>
        <div className="spacer" />
        {me === null && <span className="hot">Hotseat · điều khiển <select value={actor} onChange={(e) => setOverride(e.target.value)}>{G.order.map((id) => <option key={id} value={id}>{G.players[id].name}</option>)}</select></span>}
        <MuteToggle />
        <button className="small ghostbtn" onClick={() => { if (demo || confirm('Rời ván?')) onLeave(); }}>Rời ván</button>
      </header>
      <div className="cols">
        <aside className="players">
          {G.order.map((id) => <PlayerCard key={id} G={G} pid={id} active={G.turn.player === id && G.turn.part === 'explorer'} onCard={setCardPopup} online={conn ? conn[id] : undefined} isMe={me === id} />)}
        </aside>
        <main className="center">
          <div className="floortabs">
            {floorsOrder.map((f) => <button key={f} className={`ftab ${f} ${f === floor ? 'on' : ''}`} onClick={() => setFloor(f)}><span className="ft-vi">{FLOOR_VI[f]}</span><span className="ft-en">{FLOOR_EN[f]} · {floorCount(f)} phòng</span></button>)}
            <span className="ft-indicator" style={{ transform: `translateX(${floorsOrder.indexOf(floor) * 100}%)` }} />
          </div>
          <div className="mapframe">
            <MapView G={G} floor={floor} actor={actor} moves={moves} pickRooms={pickRooms} focusRoom={focusRoom}
              onMove={(t) => mv('move', t)} onPick={(room) => mv('resolve', { room })} />
            <DeckPiles G={G} />
          </div>
        </main>
        <aside className="side">
          {showErr && <div className="error">{showErr}</div>}
          {pd?.type === 'roll' && (pd.player === actor
            ? <RollButton label={pd.label} reason={pd.reason} onRoll={() => mv('roll')} />
            : <div className="panel waiting rollwait">🎲 Đang chờ <b>{G.players[pd.player]?.name}</b> đổ xúc xắc… <span className="muted">({pd.label})</span></div>)}
          {pd && pd.type !== 'roll' && (pd.player === actor
            ? <PendingDialog G={G} pd={pd} actor={actor} onResolve={(payload) => mv('resolve', payload)} />
            : <div className="panel waiting">Đang chờ <b>{G.players[pd.player]?.name}</b> quyết định{'prompt' in pd ? `: ${pd.prompt}` : ''}…</div>)}
          {myTurn && G.turn.part === 'explorer' && G.phase !== 'over' && (
            <div className="panel turnpanel" style={{ ['--pc' as string]: pcolor(p) }}>
              <div className="tp-head"><Avatar charId={p.character ?? undefined} name={p.name} color={pcolor(p)} size={52} /><div><div className="tp-name">{p.name}</div><div className="muted small">{charOfP(p)?.name}</div></div></div>
              <div className="tp-where">📍 <b>{roomName(p.room)}</b>{BARRIERS[p.room] ? ` (phía ${p.barrierSide ?? 0})` : ''}</div>
              <div className="speedbar" title="Số bước đã đi / Speed">{Array.from({ length: Math.max(traitValue(p, 'speed'), G.turn.spent) }, (_, i) => <span key={i} className={i < G.turn.spent ? 'used' : ''} />)}<em>{G.turn.spent}/{traitValue(p, 'speed')} bước{G.turn.moveEnded ? ' · hết di chuyển' : ''}</em></div>
              {moves.length > 0 && <><h4>Di chuyển</h4><div className="btns">{moves.map((m, i) => <button key={i} className={m.dir !== undefined ? 'explorebtn' : ''} onClick={() => mv('move', m.room ? { room: m.room } : { dir: m.dir })}>{m.label}{m.cost > 1 ? ` (tốn ${m.cost})` : ''}</button>)}</div></>}
              {actions.filter((a) => a.id !== 'manual' && a.id !== 'endTurn').length > 0 && <><h4>Hành động</h4>
                <div className="btns">{actions.filter((a) => a.id !== 'manual' && a.id !== 'endTurn').map((a, i) => <button key={i} className={a.id.startsWith('haunt:') ? 'hauntbtn' : a.id === 'attack' ? 'danger' : ''} disabled={!!a.disabled} title={a.disabled} onClick={() => mv('act', a.id, a.args ?? {})}>{a.label}{a.disabled ? <span className="why"> — {a.disabled}</span> : null}</button>)}</div></>}
              <ManualAdjust G={G} onSend={(args) => mv('act', 'manual', args)} />
              <button className="end" onClick={() => mv('endTurn')}>Kết thúc lượt ➜</button>
            </div>)}
          {monsterTurn && <MonsterPanel G={G} mv={mv} actor={actor} />}
          {!myTurn && !monsterTurn && !pd && G.phase !== 'over' && <div className="panel waiting">Đang đến lượt <b>{turnP.name}</b>…</div>}
          {G.haunt && h && (
            <div className="panel haunt">
              <div className="haunt-head"><ArtToken className="hh-art" src={ART.hauntTokenLg(h.art?.art ?? 'mummy')} title={h.name} fallback={<MummyIcon size={34} />} /><div><div className="hh-num">Haunt #{h.number}</div><div className="hh-name">{h.name}</div></div></div>
              <p className="muted small">{h.edition}. Nguồn: {h.source}.</p>
              <HauntStatus G={G} />
              {me !== null
                ? <pre className="htext">{isTraitor ? h.traitorText : h.heroText}</pre>
                : <>
                    <div className="segmented"><button className={hauntTab === 'hero' ? 'on' : ''} onClick={() => setHauntTab(hauntTab === 'hero' ? null : 'hero')}>Phe anh hùng</button><button className={hauntTab === 'traitor' ? 'on tr' : ''} onClick={() => setHauntTab(hauntTab === 'traitor' ? null : 'traitor')}>Phe phản bội</button></div>
                    {hauntTab && <pre className="htext">{hauntTab === 'traitor' ? h.traitorText : h.heroText}</pre>}
                  </>}
            </div>)}
          <LastRollPanel G={G} who={(pid) => G.players[pid]?.name ?? pid} />
          <LogView G={G} />
        </aside>
      </div>
      {drawFx && !reveal && CARD_BY_ID[drawFx.id] && <CardDraw key={drawFx.n} id={drawFx.id} G={G} drawer={drawFx.player} isDrawer={actor === drawFx.player} auto={demo ? 2300 : undefined} onClose={() => setDrawFx(null)} />}
      {cardPopup && !drawFx && !reveal && CARD_BY_ID[cardPopup] && <CardView id={cardPopup} onClose={() => setCardPopup(null)} />}
      <DiceOverlay G={G} who={(pid) => G.players[pid]?.name ?? pid} />
      {reveal && G.haunt && <HauntReveal G={G} me={me} onClose={() => setReveal(false)} />}
      {G.phase === 'over' && endShown && endReady && !reveal && <EndOverlay G={G} onClose={() => setEndShown(false)} />}
    </div>
  );
}

function LogView({ G }: { G: GState }) {
  const items = [...G.log].map((l, i) => ({ ...l, i })).reverse().slice(0, 200);
  const cls = (t: string) => t.startsWith('—') ? 'turn' : t.includes('🎲') ? 'dice' : t.includes('⚔') ? 'combat' : t.includes('👻') || t.includes('Haunt #') ? 'haunt' : t.includes('🏆') ? 'win' : t.includes('rút') ? 'card' : '';
  return (
    <div className="panel log">
      <h3>Nhật ký</h3>
      <ol>{items.map((l) => <li key={l.i} className={`${cls(l.text)} ${l.private ? 'priv' : ''}`}><span className="ln">{l.i + 1}</span><span>{l.private ? '🔒 ' : ''}{l.text}</span></li>)}</ol>
    </div>);
}

function TraitTrack({ ch, p, t }: { ch: NonNullable<ReturnType<typeof charOfP>>; p?: PlayerState; t: Trait }) {
  const cur = p ? p.idx[t] : ch.traits[t].start;
  return (
    <div className={`trait ${t}`}>
      <span className="tname" title={TRAIT_EN[t]}>{TRAIT_VI[t]}<em>{TRAIT_EN[t]}</em></span>
      <span className="track">
        <span className={`cell skull ${cur < 0 ? 'cur' : ''}`}><SkullIcon size={12} /></span>
        {ch.traits[t].track.map((v, i) => <span key={i} className={`cell ${i === cur ? 'cur' : ''} ${i === ch.traits[t].start ? 'start' : ''} ${i < cur ? 'below' : ''}`}>{v}</span>)}
      </span>
    </div>);
}

function SelectScreen({ G, actor, me, names, conn, matchID, setOverride, mv, onLeave }: { G: GState; actor: string; me: string | null; names?: Record<string, string>; conn?: Record<string, boolean>; matchID?: string; setOverride: (s: string) => void; mv: (n: string, ...a: unknown[]) => void; onLeave: () => void }) {
  const takenBy = (color: string) => Object.values(G.players).find((p) => p.character && charOfP(p)!.color === color);
  const all = Object.values(G.players).every((p) => p.character);
  const myName = me !== null ? names?.[me] : undefined;
  return (
    <div className="selectscreen">
      <div className="ss-head">
        <h1>Chọn nhà thám hiểm</h1>
        <p className="muted">Mỗi màu là một lá nhân vật hai mặt — chỉ một người được chọn mỗi màu. Người có sinh nhật gần nhất đi trước.</p>
        {matchID && <InviteBox matchID={matchID} />}
        {matchID && me !== null && <p className="seatinfo">Bạn là <b>{names?.[me] ?? G.players[me]?.name}</b> · {G.order.filter((id) => names?.[id]).length}/{G.order.length} người đã vào phòng{G.order.some((id) => !names?.[id]) ? ' — gửi link mời cho bạn bè' : ''}</p>}
        {me === null && <p>Đang chọn cho: <select value={actor} onChange={(e) => setOverride(e.target.value)}>{G.order.map((id) => <option key={id} value={id}>{G.players[id].name}{G.players[id].character ? ' ✓' : ''}</option>)}</select></p>}
      </div>
      <div className="chars">
        {CHARACTERS.map((ch) => {
          const t = takenBy(ch.color); const mine = G.players[actor].character === ch.id;
          return (
            <div key={ch.id} className={`char ${mine ? 'mine' : ''} ${t && !mine ? 'taken' : ''}`} style={{ ['--pc' as string]: COLOR[ch.color] }}>
              <div className="char-art"><b className="fb">{initials(ch.name)}</b><ArtImg src={ART.portrait(ch.id)} alt={ch.name} /></div>
              <div className="char-head">
                <div><h3>{ch.name}</h3><p className="small muted">{ch.age} tuổi · sinh nhật {ch.birthday[1]}/{ch.birthday[0]}</p></div></div>
              <p className="small muted hobby">Sở thích: {ch.hobbies.join(', ')}</p>
              <div className="traits">{TRAITS.map((tr) => <TraitTrack key={tr} ch={ch} t={tr} />)}</div>
              <button disabled={!!t && t.id !== actor} onClick={() => mv('selectCharacter', ch.id, myName ?? (me === null ? G.players[actor].name : undefined))}>{t ? (t.id === actor ? '✓ Đã chọn' : `${t.name} đã chọn`) : 'Chọn'}</button>
            </div>);
        })}
      </div>
      <div className="ss-foot">
        {G.order.map((id) => <span key={id} className={`chip ${G.players[id].character ? 'ok' : ''} ${conn && !conn[id] ? 'off' : ''}`} title={conn ? (conn[id] ? 'đang online' : names?.[id] ? 'mất kết nối' : 'ghế trống') : undefined} style={{ ['--pc' as string]: G.players[id].character ? pcolor(G.players[id]) : '#555' }}>{matchID && !names?.[id] ? <i>ghế trống</i> : G.players[id].character ? G.players[id].name : names?.[id] ?? G.players[id].name}{id === me ? ' (bạn)' : ''}: {G.players[id].character ? charOfP(G.players[id])!.name : '…'}</span>)}
        <div className="spacer" />
        <button onClick={onLeave} className="ghostbtn">Quay lại</button>
        <button className="primary" disabled={!all} onClick={() => mv('startGame')}>Bắt đầu khám phá ngôi nhà ➜</button>
      </div>
      {(G as unknown as { lastError?: { player: string; text: string } }).lastError?.player === actor && <p className="error">{(G as unknown as { lastError: { text: string } }).lastError.text}</p>}
    </div>
  );
}

function PlayerCard({ G, pid, active, onCard, online, isMe }: { G: GState; pid: string; active: boolean; onCard: (id: string) => void; online?: boolean; isMe?: boolean }) {
  const p = G.players[pid]; const ch = charOfP(p); if (!ch) return null;
  const STATUS_VI: Record<string, string> = { buried: 'bị vùi (Debris)', webbed: 'mắc mạng nhện (Webs)', graveDirt: 'Grave Dirt', lightsOut: 'Lights Out', maskOn: 'đeo Mask', musicBoxOpen: 'Music Box đang mở', savedRoll: 'có kết quả đã lưu' };
  const statuses = Object.keys(p.statuses).filter((k) => p.statuses[k] && STATUS_VI[k]).map((k) => STATUS_VI[k]);
  const floats = useTraitFloats(pid, Object.fromEntries(TRAITS.map((t) => [t, p.dead ? 0 : traitValue(p, t)])));
  const hurt = floats.some((f) => f.d < 0); const healed = floats.some((f) => f.d > 0);
  return (
    <div className={`pcard ${active ? 'active' : ''} ${hurt ? 'fx-hurt' : healed ? 'fx-heal' : ''} ${p.dead ? 'dead' : ''} ${p.isTraitor ? 'is-traitor' : ''}`} style={{ ['--pc' as string]: pcolor(p) }}>
      <div className="pc-head">
        <Avatar charId={p.character ?? undefined} name={p.name} color={pcolor(p)} small />
        <div className="pc-names"><div className="pc-name">{online !== undefined && <span className={`netdot ${online ? 'on' : 'off'}`} title={online ? 'đang online' : 'mất kết nối'} />}{p.name}{isMe ? <span className="me-tag">bạn</span> : null} {p.isTraitor && <span className="traitor-tag">PHẢN BỘI</span>}{p.dead && <span className="dead-tag">☠ đã chết</span>}</div>
          <div className="pc-char">{ch.name}</div></div>
      </div>
      <div className="pc-room">📍 {roomName(p.room)}</div>
      <div className="traits">{TRAITS.map((t) => <div key={t} className="trait-wrap"><TraitTrack ch={ch} p={p} t={t} />{floats.filter((f) => f.trait === t).map((f) => <span key={f.id} className={`tfloat ${f.d < 0 ? 'neg' : 'pos'}`}>{f.d > 0 ? `+${f.d}` : `−${-f.d}`}</span>)}</div>)}</div>
      {p.cards.length > 0 && <div className="cards">{p.cards.map((x, i) => { const I = KIND_ICON[x.kind]; return <button key={i} className={`mini ${x.kind}`} onClick={() => onCard(x.id)}><I size={12} /> {cardName(x.id)}</button>; })}</div>}
      {statuses.length > 0 && <div className="small muted">Trạng thái: {statuses.join(', ')}</div>}
    </div>
  );
}

function HauntStatus({ G }: { G: GState }) {
  const hm = HAUNTS[G.haunt!.number];
  if (G.haunt!.number !== 1) {
    const rows = hm?.status?.(G) ?? [];
    return (
      <>
        {rows.length > 0 && <div className="hstatus">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
        {hm && <details className="hgaps"><summary>⚠ Chỗ sách chưa nói rõ / bản web xử lý thế nào ({(hm.gaps?.length ?? 0) + (hm.ttConflicts?.length ?? 0)})</summary><p className="hgaps-policy">{TT_POLICY}</p>{(hm.ttConflicts?.length ?? 0) > 0 && <ul className="ttc">{hm.ttConflicts!.map((g, i) => <li key={'c' + i}><b>TT ≠ SoS:</b> {g}</li>)}</ul>}{(hm.gaps?.length ?? 0) > 0 && <ul>{hm.gaps!.map((g, i) => <li key={i}>{g}</li>)}</ul>}</details>}
      </>);
  }
  const d = G.haunt!.data as { sarcophagus?: string; tokens?: number; nameFoundTurn?: number };
  const m = G.monsters.find((x) => x.id === 'mummy'); const girl = G.tokens.find((t) => t.kind === 'girlToken' || (t.kind === 'companion' && t.data?.card === 'girl'));
  const girlHolder = Object.values(G.players).find((p) => holds(p, 'girl'));
  if (G.haunt!.number !== 1) return null;
  return (
    <div className="hstatus">
      <div><span>⚰️ Sarcophagus</span><b>{d.sarcophagus ? roomName(d.sarcophagus) : '?'}</b></div>
      <div><span>🧟 Mummy</span><b>{m ? roomName(m.room) : '—'}{m?.stunned ? ' · choáng' : ''}</b></div>
      <div><span>👧 Girl</span><b>{m?.companionGirl ? 'ở với Mummy' : girlHolder ? girlHolder.name : girl ? `${girl.kind === 'companion' ? 'bị bỏ lại ở ' : ''}${roomName(girl.room)}` : 'chưa đặt'}</b></div>
      {m && (m.carries.length > 0) && <div><span>🎒 Mummy mang</span><b>{m.carries.map((x) => cardName(x.id)).join(', ')}</b></div>}
      <div><span>📜 Token Knowledge</span><b className="tokens">{[0, 1].map((i) => <i key={i} className={(d.tokens ?? 0) > i ? 'on' : ''} />)} {d.tokens ?? 0}/2</b></div>
    </div>);
}

function MonsterPanel({ G, mv, actor }: { G: GState; mv: (n: string, ...a: unknown[]) => void; actor: string }) {
  const [tp, setTp] = useState('');
  const t = G.turn as Record<string, unknown>;
  const hm = HAUNTS[G.haunt!.number]; const art = hm?.art?.art ?? 'mummy';
  const extra = R.monsterActions({ G, rng: { d6: () => 1, shuffle: (a) => a } }, actor);
  // group identical monsters standing in the same room (e.g. many Firebats / Rats) to keep the panel short
  const shown = G.monsters.filter((m) => !m.kind || G.monsters.findIndex((x) => x.kind === m.kind && x.room === m.room && x.stunned === m.stunned && (t[`mv:${x.id}`] ?? 0) === (t[`mv:${m.id}`] ?? 0) && (t[`sp:${x.id}`] ?? 0) === (t[`sp:${m.id}`] ?? 0)) === G.monsters.indexOf(m));
  const same = (m: (typeof G.monsters)[number]) => G.monsters.filter((x) => x.kind && x.kind === m.kind && x.room === m.room && x.stunned === m.stunned && (t[`mv:${x.id}`] ?? 0) === (t[`mv:${m.id}`] ?? 0) && (t[`sp:${x.id}`] ?? 0) === (t[`sp:${m.id}`] ?? 0)).length;
  return (
    <div className="panel monsterpanel">
      <h3><ArtToken className="mp-art" src={ART.hauntToken(art)} title={hm?.art?.monsterName ?? ''} fallback={<MummyIcon size={24} />} /> Lượt quái vật</h3>
      {extra.length > 0 && <div className="btns">{extra.map((a, i) => <button key={i} className="hauntbtn" disabled={!!a.disabled} title={a.disabled} onClick={() => mv('act', a.id, a.args ?? {})}>{a.label}</button>)}</div>}
      {shown.map((m) => {
        const k = m.kind ? same(m) : 1;
        const left = ((t[`mv:${m.id}`] as number) ?? 0) - ((t[`sp:${m.id}`] as number) ?? 0);
        const heroes = R.livingHeroesIn(G, m.room);
        return (
          <div key={m.id}>
            <p><b>{k > 1 ? `${k} × ${m.name.replace(/ \d+$/, '')}` : m.name}</b> tại {roomName(m.room)} {m.stunned ? '— đang choáng' : m.noMove ? '— không di chuyển' : `— còn ${Math.max(0, left)} bước`}</p>
            {!m.stunned && <>
              {!m.noMove && left > 0 && <div className="btns">{links(G, m.room).map((l) => <button key={l.room} onClick={() => mv('monsterMove', m.id, l.room)}>→ {roomName(l.room)}</button>)}</div>}
              {!!t[`tp:${m.id}`] && <div className="row"><select value={tp} onChange={(e) => setTp(e.target.value)}><option value="">— lối bí mật tới… —</option>{Object.keys(G.rooms).map((r) => <option key={r} value={r}>{roomName(r)}</option>)}</select><button disabled={!tp} onClick={() => mv('monsterMove', m.id, tp, true)}>Dùng lối bí mật</button></div>}
              {!m.noAttack && <div className="btns">{heroes.map((h) => <button key={h} className="danger" disabled={!!t[`att:${m.id}`]} onClick={() => mv('monsterAttack', m.id, h)}>⚔ Tấn công {G.players[h].name}</button>)}</div>}
            </>}
          </div>);
      })}
      <button className="end" onClick={() => mv('endTurn')}>Kết thúc lượt quái vật ➜</button>
    </div>);
}

function ManualAdjust({ G, onSend }: { G: GState; onSend: (a: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false); const [trait, setTrait] = useState<Trait>('might'); const [reason, setReason] = useState(''); const [room, setRoom] = useState('');
  const rooms = useMemo(() => Object.keys(G.rooms), [G.rooms]);
  if (!open) return <button className="small ghostbtn manualbtn" onClick={() => setOpen(true)}>✋ Điều chỉnh thủ công…</button>;
  return (
    <div className="manual">
      <p className="small muted">Chỉ dùng cho phần luật đánh dấu TODO (vd. Dog, Music Box). Mọi điều chỉnh được ghi công khai vào nhật ký.</p>
      <input placeholder="Lý do (bắt buộc ghi rõ)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="row"><select value={trait} onChange={(e) => setTrait(e.target.value as Trait)}>{TRAITS.map((t) => <option key={t} value={t}>{TRAIT_VI[t]} ({TRAIT_EN[t]})</option>)}</select>
        <button onClick={() => onSend({ trait, delta: -1, reason })}>−1</button><button onClick={() => onSend({ trait, delta: 1, reason })}>+1</button></div>
      <div className="row"><select value={room} onChange={(e) => setRoom(e.target.value)}><option value="">— đặt mình vào phòng —</option>{rooms.map((r) => <option key={r} value={r}>{roomName(r)}</option>)}</select><button disabled={!room} onClick={() => onSend({ room, reason })}>Đặt</button></div>
      <button className="small ghostbtn" onClick={() => setOpen(false)}>Đóng</button>
    </div>);
}
