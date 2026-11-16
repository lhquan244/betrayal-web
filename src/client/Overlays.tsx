import { useEffect, useRef, useState } from 'react';
import type { GState } from '../engine/types';
import { CARD_BY_ID } from '../data/cards';
import { cardName } from '../engine/core';
import { roomName } from '../engine/house';
import { KIND_ICON, KIND_VI, SkullIcon, MummyIcon } from './Icons';
import { HAUNTS } from '../haunts';
import { ART, ArtImg, Avatar } from './Art';
import { pcolor } from './theme';
import { sfx } from './Fx';

export function CardView({ id, onClose }: { id: string; onClose: () => void }) {
  const def = CARD_BY_ID[id]; if (!def) return null; const Icon = KIND_ICON[def.kind];
  return (
    <div className="modal" onClick={onClose}>
      <div className={`gcard ${def.kind}`} onClick={(e) => e.stopPropagation()}>
        <div className="gcard-inner">
          <div className="gcard-kind">{KIND_VI[def.kind]}</div>
          <div className="gcard-icon"><Icon size={54} /></div>
          <h2>{def.name}</h2>
          <div className="gcard-rule" />
          <p>{def.text}</p>
          {def.todo && <p className="todo">⚠ Chưa tự động: {def.todo} — dùng “Điều chỉnh thủ công”.</p>}
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>);
}

export function HauntReveal({ G, me, onClose }: { G: GState; me?: string | null; onClose: () => void }) {
  const h = G.haunt!; const tr = h.traitor ? G.players[h.traitor] : null; const art = HAUNTS[h.number]?.art;
  useEffect(() => { const t = setTimeout(onClose, 7000); return () => clearTimeout(t); }, []);
  return (
    <div className="haunt-reveal" onClick={onClose}>
      <div className="hr-flash" />
      <div className="hr-fog" aria-hidden /><div className="hr-fog f2" aria-hidden /><div className="hr-lightning" aria-hidden />
      <div className="hr-content">
        <div className="hr-small">Haunt roll thất bại — ngôi nhà đã thức giấc</div>
        <div className="hr-title">HAUNT BẮT ĐẦU</div>
        <div className="hr-num">Haunt #{h.number}</div>
        <div className="hr-name">{h.name}</div>
        <div className="hr-icon hr-art"><i className="fb"><MummyIcon size={96} /></i><ArtImg src={ART.haunt(art?.art ?? 'mummy')} alt={art?.monsterName ?? h.name} /></div>
        <div className="hr-line">Omen <b>{cardName(h.omen)}</b> tại <b>{roomName(h.revealRoom)}</b></div>
        {tr && <div className="hr-traitor"><SkullIcon size={18} /> Kẻ phản bội: <b>{tr.name}</b></div>}
        {me != null && G.players[me] && <div className={`hr-side ${G.players[me].isTraitor ? 'tr' : 'hero'}`}>{G.players[me].isTraitor ? 'Bạn là KẺ PHẢN BỘI — đọc Traitor\'s Tome (chỉ bạn thấy)' : 'Bạn thuộc PHE ANH HÙNG — đọc Secrets of Survival (chỉ phe bạn thấy)'}</div>}
        <div className="hr-hint">Mỗi phe đọc hướng dẫn của mình (Traitor's Tome / Secrets of Survival)</div>
      </div>
    </div>);
}

export function EndOverlay({ G, onClose }: { G: GState; onClose: () => void }) {
  const h = G.haunt; const heroes = h?.winner === 'heroes'; const art = h ? HAUNTS[h.number]?.art : undefined;
  useEffect(() => { sfx(heroes ? 'ping' : 'haunt'); }, []);
  return (
    <div className={`end-overlay ${heroes ? 'heroes' : 'traitor'}`}>
      <div className="eo-fx" aria-hidden>{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ ['--i' as string]: i, ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${(i % 7) * 0.45}s` }} />)}</div>
      <div className="eo-rays" aria-hidden />
      <div className="eo-card">
        {art && <div className={`eo-art ${heroes ? 'defeated' : 'victor'}`}><i className="fb"><MummyIcon size={80} /></i><ArtImg src={ART.haunt(art.art)} alt={art.monsterName} /></div>}
        <div className="eo-small">Kết thúc ván</div>
        <div className="eo-title">{h?.winner ? (heroes ? 'CÁC ANH HÙNG THẮNG' : 'KẺ PHẢN BỘI THẮNG') : 'VÁN CHƠI KẾT THÚC'}</div>
        {h && <div className="eo-haunt">Haunt #{h.number} · {h.name}</div>}
        {h?.winText && <p className="eo-text">“{h.winText}”</p>}
        <div className="eo-players">{G.order.map((id) => { const p = G.players[id]; return <span key={id} className={`eo-p ${p.dead ? 'dead' : ''} ${p.isTraitor ? 'tr' : ''}`}><Avatar charId={p.character ?? undefined} name={p.name} color={pcolor(p)} size={26} small />{p.dead ? '☠ ' : ''}{p.name}{p.isTraitor ? ' (phản bội)' : ''}</span>; })}</div>
        <button onClick={onClose}>Xem lại bàn chơi</button>
      </div>
    </div>);
}
