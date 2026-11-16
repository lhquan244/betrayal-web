import { useEffect, useMemo, useState } from 'react';
import { HAUNTS, implementedHaunts } from '../haunts';
import { LobbyClient } from 'boardgame.io/client';
import { Board } from './Board';
import { MoonHouse } from './Icons';
import { decide, newMemory } from './demoBot';
import type { GState } from '../engine/types';
import { SERVER, onlineClient, hotseatClients, useClients, type BgClient } from './useBgio';

type Seat = { kind: 'online'; matchID: string; playerID: string; credentials: string; name?: string };
type Mode = { kind: 'menu' } | { kind: 'hotseat'; n: number; forceHaunt?: number; seed?: string } | Seat;
const lobby = new LobbyClient({ server: SERVER });
/** Demo mode (?demo=SEED): hotseat game with a fixed boardgame.io seed, auto-played by the demo bot with pauses. */
const DEMO_SEED = new URLSearchParams(location.search).get('demo');

// ---- invite links + seat persistence -------------------------------------------------------------
/** Invite link format: <origin>/?match=<matchID>. Opening it goes straight to the join form for that room. */
const urlMatch = () => new URLSearchParams(location.search).get('match')?.trim() || null;
/** Accepts a bare match ID or a pasted invite link. */
const parseMatchInput = (v: string) => { const t = v.trim(); try { const u = new URL(t); return u.searchParams.get('match') ?? t; } catch { return t; } };
const SEATS_KEY = 'betrayal-seats';
const loadSeats = (): Record<string, Seat> => { try { return JSON.parse(localStorage.getItem(SEATS_KEY) ?? '{}'); } catch { return {}; } };
const saveSeat = (s: Seat) => { localStorage.setItem(SEATS_KEY, JSON.stringify({ ...loadSeats(), [s.matchID]: s })); localStorage.setItem('betrayal-seat', JSON.stringify(s)); };
const dropSeat = (matchID: string) => { const all = loadSeats(); delete all[matchID]; localStorage.setItem(SEATS_KEY, JSON.stringify(all)); const last = localStorage.getItem('betrayal-seat'); if (last && JSON.parse(last).matchID === matchID) localStorage.removeItem('betrayal-seat'); };
const setUrlMatch = (matchID: string | null) => { const u = new URL(location.href); if (matchID) u.searchParams.set('match', matchID); else u.searchParams.delete('match'); history.replaceState(null, '', u.toString()); };

function initialMode(): Mode {
  if (DEMO_SEED) return { kind: 'menu' };
  const m = urlMatch();
  if (m) return loadSeats()[m] ?? { kind: 'menu' }; // invite link: rejoin our seat if we already have one, else join form
  const s = localStorage.getItem('betrayal-seat'); return s ? JSON.parse(s) : { kind: 'menu' };
}

export function App() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (mode.kind === 'online') setUrlMatch(mode.matchID); }, [mode]);
  // Voluntary leave keeps the seat (re-open the invite link to return); a gone match/seat drops it.
  const leave = (msg?: string) => { if (mode.kind === 'online') { if (msg) dropSeat(mode.matchID); else localStorage.removeItem('betrayal-seat'); } setUrlMatch(null); setNotice(msg ?? ''); setMode({ kind: 'menu' }); };
  if (mode.kind === 'hotseat') return <Hotseat n={mode.n} forceHaunt={mode.forceHaunt} seed={mode.seed} onLeave={() => leave()} />;
  if (mode.kind === 'online') return <Online {...mode} onLeave={leave} />;
  return <Menu notice={notice} onMode={(m) => { if (m.kind === 'online') saveSeat(m); setMode(m); }} />;
}

type MatchInfo = { matchID: string; players: { id: number; name?: string; isConnected?: boolean }[]; setupData?: { forceHaunt?: number } };

function Menu({ onMode, notice }: { onMode: (m: Mode) => void; notice?: string }) {
  const invited = urlMatch();
  const [name, setName] = useState(localStorage.getItem('betrayal-name') ?? '');
  const [n, setN] = useState(4); const [force, setForce] = useState(false); const [forceN, setForceN] = useState(1);
  const [code, setCode] = useState(invited ?? '');
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [err, setErr] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);
  const refresh = () => lobby.listMatches('betrayal').then((r) => setMatches((r.matches as never as MatchInfo[]).filter((m) => m.players.length >= 3 && m.players.some((p) => !p.name)))).catch((e) => setErr('Không kết nối được server: ' + e.message));
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, []);
  const join = async (rawID: string) => {
    const matchID = parseMatchInput(rawID);
    if (!matchID) { setErr('Nhập mã phòng hoặc dán link mời'); return; }
    if (!name.trim()) { setErr('Nhập tên trước đã'); return; }
    localStorage.setItem('betrayal-name', name.trim()); setErr(''); setBusy(true);
    try {
      const mine = loadSeats()[matchID]; if (mine) { onMode(mine); return; } // already seated here (e.g. other tab / earlier visit)
      // Two people can click "Vào" at the same moment; if our seat gets taken, retry the next free one.
      for (let attempt = 0; attempt < 6; attempt++) {
        let m: MatchInfo;
        try { m = await lobby.getMatch('betrayal', matchID) as never; } catch { setErr(`Không tìm thấy phòng "${matchID}" — sai mã, hoặc server đã khởi động lại (phòng chỉ lưu trong bộ nhớ).`); return; }
        // a socket reconnecting to a vanished match makes boardgame.io re-create an empty 2-seat stub; treat as missing
        if (m.players.length < 3) { setErr(`Không tìm thấy phòng "${matchID}" — sai mã, hoặc server đã khởi động lại (phòng chỉ lưu trong bộ nhớ).`); return; }
        const seat = m.players.find((p) => !p.name);
        if (!seat) { setErr(`Phòng ${matchID} đã đủ người (${m.players.length}/${m.players.length}).`); return; }
        try {
          const r = await lobby.joinMatch('betrayal', matchID, { playerID: String(seat.id), playerName: name.trim() });
          onMode({ kind: 'online', matchID, playerID: String(seat.id), credentials: r.playerCredentials, name: name.trim() }); return;
        } catch { /* seat raced away: loop */ }
      }
      setErr('Không vào được phòng, thử lại nhé.');
    } finally { setBusy(false); }
  };
  const create = async () => {
    if (!name.trim()) { setErr('Nhập tên trước đã'); return; }
    try { const r = await lobby.createMatch('betrayal', { numPlayers: n, setupData: force ? { forceHaunt: forceN } : {} }); await join(r.matchID); refresh(); } catch (e) { setErr(String((e as Error).message)); }
  };
  return (
    <div className="menu-page">
      <div className="fog" />
      <div className="menu">
        <div className="hero">
          <MoonHouse size={260} />
          <h1><span>Betrayal</span><small>at House on the Hill</small></h1>
          <p className="sub">Bản web chơi riêng với bạn bè — theo <b>phiên bản 2 (2nd edition)</b>. Haunt đã cài ({implementedHaunts().length}): <b>{implementedHaunts().map((k) => `#${k} ${HAUNTS[k].name}`).join(' · ')}</b>.</p>
        </div>
        {invited && <div className="panel invited">💌 Bạn được mời vào phòng <code>{invited}</code>. Nhập tên rồi bấm <b>Vào phòng</b>.</div>}
        <div className="menu-grid">
          <div className="panel">
            <h2>🌐 Chơi online</h2>
            <label className="field">Tên của bạn <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Quân" maxLength={24} /></label>
            <div className="row joinrow">
              <label className="field grow">Mã phòng / link mời <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Dán link mời hoặc mã phòng" onKeyDown={(e) => { if (e.key === 'Enter') join(code); }} /></label>
              <button className={invited ? 'primary' : ''} disabled={busy} onClick={() => join(code)}>Vào phòng</button>
            </div>
            <div className="row">
              <label className="field">Số người chơi <select value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 4, 5, 6].map((k) => <option key={k}>{k}</option>)}</select></label>
              <button className={invited ? '' : 'primary'} disabled={busy} onClick={create}>Tạo phòng mới</button>
            </div>
            <div className="row forcerow"><label className="chk"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> House rule: luôn dùng Haunt</label>
              <select value={forceN} onChange={(e) => { setForceN(Number(e.target.value)); setForce(true); }} title="Bỏ qua bảng Haunt, luôn dùng haunt này">{implementedHaunts().map((k) => <option key={k} value={k}>#{k} {HAUNTS[k].name}</option>)}</select></div>
            <p className="small muted">Mặc định Haunt được chọn theo bảng Haunt (Omen + phòng). Haunt chưa cài sẽ dùng luật tuỳ chọn "Selecting the Haunt".</p>
            {Object.values(loadSeats()).length > 0 && <><h3>Phòng của bạn</h3><ul className="matches">{Object.values(loadSeats()).slice(-3).map((st) => <li key={st.matchID}><code>{st.matchID}</code><em>ghế #{Number(st.playerID) + 1}</em><button onClick={() => onMode(st)}>Quay lại</button></li>)}</ul></>}
            <h3>Phòng đang chờ</h3>
            {matches.length === 0 && <p className="muted">Chưa có phòng nào còn chỗ.</p>}
            <ul className="matches">{matches.map((m) => (
              <li key={m.matchID}><code>{m.matchID}</code> <span>{m.players.filter((p) => p.name).map((p) => p.name).join(', ') || '(trống)'}</span> <em>{m.players.filter((p) => p.name).length}/{m.players.length}{m.setupData?.forceHaunt ? ` · luôn Haunt #${m.setupData.forceHaunt}` : ''}</em>
                <button disabled={busy} onClick={() => join(m.matchID)}>Vào</button></li>))}</ul>
          </div>
          <div className="panel">
            <h2>🕯️ Chơi chung một máy</h2>
            <p className="muted small">Hotseat: mọi người ngồi cùng một máy, giao diện tự chuyển sang người đang phải quyết định.</p>
            <div className="row">
              <label className="field">Số người chơi <select value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 4, 5, 6].map((k) => <option key={k}>{k}</option>)}</select></label>
              <button className="primary" onClick={() => onMode({ kind: 'hotseat', n: DEMO_SEED ? 4 : n, forceHaunt: force ? forceN : undefined, seed: DEMO_SEED ?? undefined })}>Bắt đầu hotseat</button>
            </div>
            <div className="rules-mini">
              <div><b>Khám phá</b> — đi theo Speed, lật phòng mới, rút Event / Item / Omen.</div>
              <div><b>Haunt roll</b> — sau mỗi Omen tung 6 xúc xắc; tổng nhỏ hơn số Omen thì Haunt bắt đầu.</div>
              <div><b>Haunt</b> — một người thành kẻ phản bội; mỗi phe có mục tiêu bí mật.</div>
            </div>
          </div>
        </div>
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}

function Hotseat({ n, forceHaunt, seed, onLeave }: { n: number; forceHaunt?: number; seed?: string; onLeave: () => void }) {
  const clients = useMemo(() => hotseatClients(n, forceHaunt, seed), [n, forceHaunt, seed]);
  useClients(clients);
  useEffect(() => { if (DEMO_SEED) return runDemo(clients); }, [clients]);
  return <Board clients={clients} me={null} onLeave={onLeave} demo={!!DEMO_SEED} />;
}
function Online({ matchID, playerID, credentials, name, onLeave }: Seat & { onLeave: (msg?: string) => void }) {
  const clients = useMemo(() => [onlineClient(matchID, playerID, credentials)] as BgClient[], [matchID, playerID, credentials]);
  useClients(clients);
  const [names, setNames] = useState<Record<string, string>>(name ? { [playerID]: name } : {});
  const [conn, setConn] = useState<Record<string, boolean>>({});
  useEffect(() => { (window as unknown as { __bg?: BgClient }).__bg = clients[0]; }, [clients]); // handle for automated browser tests
  useEffect(() => {
    let misses = 0;
    const f = () => lobby.getMatch('betrayal', matchID).then((m) => {
      misses = 0;
      const ps = m.players as MatchInfo['players'];
      if (ps.find((p) => String(p.id) === playerID)?.name === undefined) { onLeave(`Phòng ${matchID} không còn trên server (server đã khởi động lại?) — hãy tạo phòng mới và gửi lại link.`); return; }
      setNames(Object.fromEntries(ps.filter((p) => p.name).map((p) => [String(p.id), p.name!])));
      setConn(Object.fromEntries(ps.map((p) => [String(p.id), !!p.isConnected])));
    }).catch((e: Error) => { if (/404/.test(e.message) && ++misses >= 1) onLeave(`Phòng ${matchID} không còn trên server (server đã khởi động lại?). Hãy tạo phòng mới.`); });
    f(); const t = setInterval(f, 3000); return () => clearInterval(t);
  }, [matchID]);
  return <Board clients={clients} me={playerID} names={names} conn={conn} matchID={matchID} onLeave={() => onLeave()} />;
}

/** Plays the game with the demo bot, pausing so viewers can follow (card popups, dice, haunt reveal). */
function runDemo(clients: BgClient[]) {
  let stop = false; const mem = newMemory(); let step = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const speed = Number(new URLSearchParams(location.search).get('speed') ?? 1);
  (async () => {
    await sleep(1800);
    while (!stop) {
      const G = clients[0].getState()?.G as GState | undefined; if (!G) { await sleep(200); continue; }
      const mv = decide(G, mem, step); if (!mv) break;
      (clients[Number(mv.pid)].moves as Record<string, (...a: unknown[]) => void>)[mv.move](...mv.args); step++;
      const H = clients[0].getState()!.G as GState;
      let wait = H.phase === 'select' ? 1100 : mv.move === 'monsterMove' ? 600 : 520;
      if (H.lastCard && JSON.stringify(H.lastCard) !== JSON.stringify(G.lastCard)) wait = Math.max(wait, 2700);
      const rolled = (H.lastRolls?.seq ?? 0) !== (G.lastRolls?.seq ?? 0);
      if (H.pending[0]?.type === 'roll') wait = Math.max(wait, 700); // the bot "presses" the roll button after a short pause
      if (rolled) wait = Math.max(wait, 2600); // let viewers watch the dice overlay
      if (H.lastCard && JSON.stringify(H.lastCard) !== JSON.stringify(G.lastCard) && rolled) wait = 3800;
      if (G.phase === 'explore' && H.phase === 'haunt') wait = 7800;
      if (G.phase === 'select' && H.phase === 'explore') wait = 2200;
      if (H.phase === 'over') break;
      await sleep(wait / speed);
    }
    (window as unknown as { __demoDone?: boolean }).__demoDone = true;
  })();
  return () => { stop = true; };
}
