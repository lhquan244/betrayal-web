import { useState } from 'react';
import type { GState, Pending } from '../engine/types';
import { cardName, holds } from '../engine/core';
import { roomName } from '../engine/house';
import { CARD_BY_ID } from '../data/cards';

const TR: Record<string, string> = { might: 'Might', speed: 'Speed', sanity: 'Sanity', knowledge: 'Knowledge' };
const DIRS = ['Bắc', 'Đông', 'Nam', 'Tây'];

export function PendingDialog({ G, pd, actor, onResolve }: { G: GState; pd: Pending; actor: string; onResolve: (p: Record<string, unknown>) => void }) {
  const [first, setFirst] = useState(0); const [convert, setConvert] = useState(false); const [val, setVal] = useState(8); const [sel, setSel] = useState<number[]>([]);
  const p = G.players[actor];
  switch (pd.type) {
    case 'damage': {
      const kind = convert ? 'physical' : pd.kind; const [a, b] = kind === 'physical' ? ['might', 'speed'] : ['sanity', 'knowledge'];
      const x = Math.min(first, pd.amount);
      return <div className="panel pending"><h3>Chịu {pd.amount} sát thương {pd.kind === 'physical' ? 'thể chất (physical)' : 'tinh thần (mental)'}</h3>
        <p className="small muted">Chia tuỳ ý giữa hai chỉ số.</p>
        {pd.kind === 'mental' && holds(p, 'skull') && <label className="chk"><input type="checkbox" checked={convert} onChange={(e) => setConvert(e.target.checked)} /> Dùng Skull: nhận thành sát thương thể chất</label>}
        <input type="range" min={0} max={pd.amount} value={x} onChange={(e) => setFirst(Number(e.target.value))} />
        <p>{TR[a]}: −{x} · {TR[b]}: −{pd.amount - x}</p>
        <button onClick={() => onResolve({ first: x, convert })}>Xác nhận</button></div>;
    }
    case 'choice': return <div className="panel pending"><h3>{pd.prompt}</h3><div className="btns">{pd.options.map((o, i) => <button key={i} onClick={() => onResolve({ option: i })}>{o.label}</button>)}</div></div>;
    case 'rotate': return <div className="panel pending"><h3>Xoay phòng {roomName(pd.tile)}</h3><p className="small muted">Chọn hướng xoay (cửa phải nối với phòng bạn vừa rời).</p>
      <div className="btns">{pd.options.map((r) => { const doors = (G.rooms[pd.tile]?.doors ?? []); void doors; return <button key={r} onClick={() => onResolve({ rot: r })}>Xoay {r * 90}°</button>; })}</div>
      <RotPreview tile={pd.tile} options={pd.options} onPick={(r) => onResolve({ rot: r })} /></div>;
    case 'pickRoom': return <div className="panel pending"><h3>{pd.prompt}</h3><p className="small muted">Bấm phòng sáng trên bản đồ hoặc chọn dưới đây.</p><div className="btns">{pd.rooms.map((r) => <button key={r} onClick={() => onResolve({ room: r })}>{roomName(r)}</button>)}</div></div>;
    case 'preRoll': return <div className="panel pending"><h3>Trước khi đổ: {pd.roll.label}</h3><div className="btns">
      {pd.options.map((o) => <button key={o} onClick={() => onResolve({ choice: o, value: val })}>{o === 'saved-roll' ? 'Dùng kết quả đã lưu' : `Dùng ${cardName(o)}`}</button>)}
      <button onClick={() => onResolve({})}>Đổ bình thường</button></div>
      {pd.options.includes('angel-feather') && <label>Angel Feather — chọn kết quả 0–8: <input type="number" min={0} max={8} value={val} onChange={(e) => setVal(Number(e.target.value))} /></label>}</div>;
    case 'postRoll': return <div className="panel pending"><h3>Kết quả {pd.roll.label}: [{pd.dice.join(', ')}] = {pd.dice.reduce((a, b) => a + b, 0)}</h3>
      <p className="small muted">Chọn xúc xắc để đổ lại (Lucky Stone: bao nhiêu cũng được; Rabbit's Foot: 1 viên).</p>
      <div className="dice">{pd.dice.map((d, i) => <button key={i} className={sel.includes(i) ? 'on' : ''} onClick={() => setSel(sel.includes(i) ? sel.filter((k) => k !== i) : [...sel, i])}>{d}</button>)}</div>
      <div className="btns">{pd.options.includes('lucky-stone') && <button disabled={!sel.length} onClick={() => onResolve({ choice: 'lucky-stone', dice: sel })}>Lucky Stone: đổ lại các viên đã chọn</button>}
        {pd.options.includes('rabbits-foot') && <button disabled={sel.length !== 1} onClick={() => onResolve({ choice: 'rabbits-foot', die: sel[0] })}>Rabbit's Foot: đổ lại 1 viên</button>}
        <button onClick={() => onResolve({})}>Giữ kết quả</button></div></div>;
    case 'steal': {
      const cards = G.players[pd.target].cards.filter((x) => !CARD_BY_ID[x.id].noSteal);
      return <div className="panel pending"><h3>Thắng cách biệt {pd.damage}: cướp đồ thay vì gây sát thương?</h3><div className="btns">
        {cards.map((x) => <button key={x.id} onClick={() => onResolve({ card: x.id })}>Cướp {cardName(x.id)}</button>)}
        {(pd.extras ?? []).map((x) => <button key={x.id} onClick={() => onResolve({ card: `x:${x.id}` })}>{x.label}</button>)}
        <button onClick={() => onResolve({})}>Gây {pd.damage} sát thương</button></div></div>;
    }
    case 'pickCard': return <div className="panel pending"><h3>{pd.prompt}</h3><ul>{pd.cards.map((x, i) => <li key={i}>{cardName(x.id)}</li>)}</ul><button onClick={() => onResolve({})}>OK</button></div>;
  }
  return null;
}

import { TILE_BY_ID } from '../engine/house';
import { rotDoors } from '../engine/core';
function RotPreview({ tile, options, onPick }: { tile: string; options: number[]; onPick: (r: number) => void }) {
  const def = TILE_BY_ID[tile]; if (!def) return null;
  return <div className="rotprev">{options.map((r) => <div key={r} className="tile mini" onClick={() => onPick(r)} title={`Xoay ${r * 90}°`}>
    {rotDoors(def.doors, r).map((d) => <span key={d} className={`door d${d}`} />)}<div className="rname">{def.name}</div><div className="small">{rotDoors(def.doors, r).map((d) => DIRS[d]).join(', ')}</div></div>)}</div>;
}
