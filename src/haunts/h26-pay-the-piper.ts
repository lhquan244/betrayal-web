// Haunt #26 "Pay the Piper" — Betrayal at House on the Hill, 2nd edition.
// Verified from the official Traitor's Tome (Hasbro F3148 rules PDF p.27, right half) and Secrets of Survival (p.55, left half).
// Haunt chart traitor column: "Left of the haunt revealer". Text is paraphrased in Vietnamese.
import type { HauntModule } from './types';
import type { Ctx } from '../engine/core';
import { log, pname, rollDice, diceReason, sum, traitValue, livingExplorers, shiftTrait, charOf, roomAt, DV, cardName, TRAIT_VI } from '../engine/core';
import { roomName, roomDef } from '../engine/house';
import { CUSTOM, enqueue, placeExplorer, requestDamage } from '../engine/effects';
import { TRAITS, type Dir } from '../engine/types';
import { leftOfRevealer, heroes, nPlayers, monstersOf, addMonster, removeMonster, rollGroupMovement } from './common';

const PENTA = 'pentagram-chamber';
interface D { supply: number; placed: number; killed: number; ritual: number; reachedChamber: boolean; toPlace: number; extraPick: boolean }
const data = (c: Ctx) => c.G.haunt!.data as unknown as D;
const rats = (c: Ctx) => monstersOf(c, 'rat');
const needed = (c: Ctx) => (nPlayers(c) <= 4 ? 5 : 4);
/** Rooms sharing a grid edge with the Pentagram Chamber (the haunt says a connecting door isn't needed). */
function adjacentToPenta(c: Ctx): string[] {
  const r = c.G.rooms[PENTA]; if (!r) return [];
  return ([0, 1, 2, 3] as Dir[]).map((d) => roomAt(c.G, r.floor, r.x + DV[d][0], r.y + DV[d][1])?.id).filter((x): x is string => !!x);
}
const occupied = (c: Ctx, room: string) => livingExplorers(c.G).some((o) => c.G.players[o].room === room);
function eligibleRooms(c: Ctx) { return Object.keys(c.G.rooms).filter((r) => r !== PENTA && roomDef(r)?.symbol && !occupied(c, r)); }
function newRat(c: Ctx, room: string) {
  const d = data(c); d.placed++; d.supply--;
  addMonster(c, { id: `rat${d.placed}`, name: `Rat ${d.placed}`, room, traits: { speed: 3, might: 2, sanity: 1 }, kind: 'rat' });
}
const traitorInChamber = (c: Ctx) => { const t = c.G.haunt!.traitor; return !!t && !c.G.players[t].dead && c.G.players[t].room === PENTA; };

export const payThePiper: HauntModule = {
  number: 26,
  name: 'Pay the Piper',
  edition: '2nd edition (Avalon Hill / Hasbro, F3148 — 2020 printing)',
  source: "Traitor's Tome p.27 (R) & Secrets of Survival p.55 (L) — Hasbro F3148 rules PDF",
  traitorRule: (c, revealer) => leftOfRevealer(c, revealer),
  art: { art: 'rats', monsterName: 'Bầy Chuột' },

  traitorText: `TRẢ CÔNG NGƯỜI THỔI SÁO (bạn là kẻ phản bội)
Tiếng sột soạt trong tường không lúc nào dứt. Lũ chuột thì thầm trong đầu bạn: bạn là họ hàng của chúng — một người-chuột với sứ mệnh đặc biệt.

NGAY BÂY GIỜ
• Nhân vật của bạn vẫn trong game nhưng đã thành kẻ phản bội.
• Chỉ số nào đang thấp hơn mức khởi đầu thì đưa về mức khởi đầu, sau đó cộng 1 vào MỖI chỉ số.
• Để riêng số token Chuột bằng 2 lần số người chơi. Đặt 1 Chuột vào mỗi phòng không có ai mà có biểu tượng Event, Item hoặc Omen. Thừa Chuột thì bạn được xếp chồng vào các phòng tuỳ ý; thiếu Chuột thì bạn chọn phòng nào được đặt.
• Để riêng 5 token Sanity Roll.

ĐIỀU BẠN BIẾT VỀ CÁC ANH HÙNG: họ đang cố giết hết Chuột để ngăn nghi lễ.

BẠN THẮNG KHI… giết hết anh hùng hoặc hoàn thành nghi lễ.

LUẬT TẤN CÔNG ĐẶC BIỆT
• Chuột bị đánh bại thì bị giết thay vì bị choáng.
• Một nhóm Chuột cùng phòng có thể tấn công chung: cộng Might lại thành một đòn lớn vào 1 mục tiêu (tối đa 8 xúc xắc). Nhóm tấn công thất bại thì không bị sát thương.
• Khi ở trong Pentagram Chamber, anh hùng không thể ảnh hưởng tới bạn theo bất kỳ cách nào. Cả Chuột lẫn anh hùng đều không thể vào Pentagram Chamber.

HOÀN THÀNH NGHI LỄ
• Đi tới Pentagram Chamber. Ở đó bạn an toàn.
• Trong Pentagram Chamber, đổ Sanity 3+ để làm nghi lễ. Thành công: đặt 1 token Sanity Roll lên thẻ nhân vật và đặt 1 Chuột (nếu còn) vào một phòng kề Pentagram Chamber (không cần có cửa nối).
• Số lần thành công cần: 3–4 người chơi: 5 · 5–6 người chơi: 4.

CHUỘT — Speed 3, Might 2, Sanity 1`,

  heroText: `TRẢ CÔNG NGƯỜI THỔI SÁO (bạn là anh hùng)
Tiếng sột soạt trong tường to dần. Một người bạn nhìn bạn với vẻ sung sướng gần như đau đớn — gương mặt ấy giống chuột tới lạ. Nó rít lên: "Ăn đi!". Lũ chuột tràn ra từ chân tường!

NGAY BÂY GIỜ: trước khi kẻ phản bội đặt Chuột, explorer nào đang ở Pentagram Chamber phải sang một phòng kề nó (không cần có cửa nối).

ĐIỀU BẠN BIẾT VỀ PHE ÁC: kẻ phản bội đang làm nghi lễ trong Pentagram Chamber. Chỉ có thể ngăn nghi lễ bằng cách nhanh chóng giết hết Chuột trong nhà. Coi chừng bầy Chuột tấn công chung.

BẠN THẮNG KHI… tiêu diệt hết Chuột, hoặc giết kẻ phản bội trước khi hắn tới được Pentagram Chamber.

LUẬT TẤN CÔNG ĐẶC BIỆT
• Gây sát thương lên 1 con Chuột là giết nó.
• Anh hùng không thể ảnh hưởng kẻ phản bội khi hắn ở trong Pentagram Chamber. Cả Chuột lẫn anh hùng đều không thể vào Pentagram Chamber.`,

  gaps: [
    'Ai chọn phòng kề cho explorer đang ở Pentagram Chamber lúc Haunt bắt đầu: sách không nói — bản web cho chính explorer đó chọn.',
    'Chuột bị giết có được dùng lại cho nghi lễ hay không ("nếu còn"): bản web chỉ dùng các token Chuột chưa từng đặt lên bàn; Chuột đã chết không quay lại kho.',
    'Anh hùng mở cửa và rút trúng Pentagram Chamber (phòng chưa có trong nhà): sách chỉ nói "anh hùng không thể vào Pentagram Chamber", không nói xử lý ô phòng. Bản web: ô phòng vẫn được đặt vào nhà, anh hùng KHÔNG vào (đứng lại phòng cũ, không rút lá Omen của phòng, vẫn tính 1 bước di chuyển). Dùng "Điều chỉnh thủ công" nếu nhóm quyết định khác.',
    'Các lá bài/phòng tự đặt explorer vào một phòng (vd. Mystic Elevator, Collapsed Room, Secret Stairs, Revolving Wall, Bottle, Dark Dice) không bị chặn khỏi Pentagram Chamber: sách không nói "không thể vào" có ghi đè hiệu ứng lá bài hay không.',
    'Chuột không có lượt "mới xuất hiện không được đi"; bản web cho Chuột mới đặt di chuyển bình thường ở lượt quái vật kế tiếp.',
    'Nếu thừa Chuột: bản web tự đặt 1 con vào mỗi phòng hợp lệ trước, rồi kẻ phản bội chọn phòng (hợp lệ) cho từng con còn lại.',
  ],

  setup(c, h) {
    const G = c.G; const tr = h.traitor!; const p = G.players[tr]; const ch = charOf(p);
    for (const t of TRAITS) if (p.idx[t] < ch.traits[t].start) { p.idx[t] = ch.traits[t].start; log(G, `${pname(G, tr)}: ${TRAIT_VI[t]} về mức khởi đầu (${traitValue(p, t)}).`); }
    for (const t of TRAITS) shiftTrait(G, tr, t, 1);
    h.data = { supply: 2 * nPlayers(c), placed: 0, killed: 0, ritual: 0, reachedChamber: false, toPlace: 0, extraPick: false } as unknown as Record<string, unknown>;
    // heroes' Right Now: explorers in the Pentagram Chamber move to an adjacent room first
    const adj = adjacentToPenta(c);
    const inside = livingExplorers(G).filter((o) => G.players[o].room === PENTA);
    for (const o of inside) {
      if (adj.length) G.pending.push({ type: 'pickRoom', player: o, prompt: 'Rời Pentagram Chamber: chọn phòng kề (không cần cửa nối)', rooms: adj, then: [], varName: 'custom:h26Out' });
      else log(G, `${pname(G, o)} ở Pentagram Chamber nhưng không có phòng kề nào trong nhà (điều chỉnh thủ công).`);
    }
    enqueue(c, tr, [{ t: 'custom', fn: 'h26PlaceRats' }]);
  },

  actions: [
    {
      id: 'ritual', label: 'Làm nghi lễ (Sanity 3+)', side: 'traitor',
      check(c, pid) {
        if (c.G.players[pid].room !== PENTA) return 'Phải ở Pentagram Chamber';
        if (c.G.turn.rollsDone.includes('h26ritual')) return 'Đã thử lượt này';
        return null;
      },
      run(c, pid) {
        c.G.turn.rollsDone.push('h26ritual');
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Nghi lễ chuột', trait: 'sanity', outcomes: [{ min: 3, effects: [{ t: 'custom', fn: 'h26Ritual' }] }, { min: 0, max: 2, effects: [] }] } }]);
      },
    },
    {
      id: 'group', label: 'Bầy Chuột tấn công chung', side: 'monsters',
      options(c) {
        const G = c.G; const out: { label: string; args: Record<string, unknown> }[] = [];
        const rooms = [...new Set(rats(c).filter((m) => !m.stunned && !(G.turn as Record<string, unknown>)[`att:${m.id}`]).map((m) => m.room))];
        for (const r of rooms) {
          const n = rats(c).filter((m) => m.room === r && !m.stunned && !(G.turn as Record<string, unknown>)[`att:${m.id}`]).length; if (n < 2) continue;
          for (const o of heroes(c)) if (G.players[o].room === r) out.push({ label: `${n} Chuột ở ${roomName(r)} → ${pname(G, o)}`, args: { room: r, target: o } });
        }
        return out;
      },
      check: () => null,
      run(c, _pid, args) {
        const G = c.G; const room = args!.room as string; const target = args!.target as string;
        const group = rats(c).filter((m) => m.room === room && !m.stunned && !(G.turn as Record<string, unknown>)[`att:${m.id}`]);
        for (const m of group) (G.turn as Record<string, unknown>)[`att:${m.id}`] = true;
        const ad = rollDice(c.rng, Math.min(8, group.reduce((s, m) => s + (m.traits.might ?? 0), 0)), { who: c.G.haunt?.traitor ?? undefined, label: `Bầy ${group.length} Chuột tấn công ${pname(G, target)}`, reason: diceReason('Tổng Might', group.reduce((s, m) => s + (m.traits.might ?? 0), 0)) });
        const dd = rollDice(c.rng, Math.min(8, traitValue(G.players[target], 'might')), { who: target, label: `${pname(G, target)} chống đỡ`, reason: diceReason('Might', traitValue(G.players[target], 'might')) }); const A = sum(ad), D = sum(dd);
        log(G, `⚔️ Bầy ${group.length} Chuột tấn công ${pname(G, target)}: [${ad.join(',')}]=${A} vs [${dd.join(',')}]=${D}`);
        if (A > D) requestDamage(c, target, 'physical', A - D, 'Bầy Chuột');
        else log(G, D > A ? 'Bầy Chuột thất bại (nhóm tấn công thất bại không bị sát thương).' : 'Hoà.');
      },
    },
  ],

  onMonsterTurnStart(c) { rollGroupMovement(c, 'rat', 'Bầy Chuột'); },
  onMonsterDefeated(c, pid, mid) { removeMonster(c, mid); data(c).killed++; log(c.G, `🐀 ${pname(c.G, pid)} giết 1 con Chuột.`); return true; },
  onMonsterLoses(c, mid) { removeMonster(c, mid); data(c).killed++; log(c.G, '🐀 Con Chuột tấn công thất bại và bị giết.'); return true; },
  canEnterRoom(c, who, room) {
    if (room !== PENTA) return null;
    if (who.mid) return 'Chuột không thể vào Pentagram Chamber';
    if (who.pid && !c.G.players[who.pid].isTraitor) return 'Anh hùng không thể vào Pentagram Chamber';
    return null;
  },
  canAttackExplorer(c, attacker, target) {
    const G = c.G; const tr = G.haunt!.traitor;
    if (target === tr && G.players[target].room === PENTA && attacker !== tr && !attacker.startsWith('m:')) return 'Kẻ phản bội đang ở Pentagram Chamber: không thể bị ảnh hưởng';
    return null;
  },
  onEnterRoom(c, pid, room) {
    const G = c.G; if (pid === G.haunt!.traitor && room === PENTA && !data(c).reachedChamber) { data(c).reachedChamber = true; log(G, `${pname(G, pid)} đã tới Pentagram Chamber và được an toàn.`); }
  },
  status(G) {
    const d = G.haunt!.data as unknown as D; const alive = G.monsters.filter((m) => m.kind === 'rat').length;
    return [['Chuột còn sống', String(alive)], ['Chuột trong kho', String(d.supply)], ['Nghi lễ', `${d.ritual}/${G.order.length <= 4 ? 5 : 4}`]];
  },
  botTarget(c, pid) {
    const G = c.G; if (G.players[pid].isTraitor) return PENTA;
    const rs = rats(c); return rs.length ? rs[0].room : null;
  },
  checkWin(c) {
    const G = c.G; const d = data(c); const tr = G.haunt!.traitor!;
    if (d.toPlace > 0 || G.pending.some((p) => p.type === 'pickRoom' && p.varName.startsWith('custom:h26'))) return null; // still setting up
    const hs = heroes(c);
    if (!hs.length) return { winner: 'traitor', text: 'Lũ con đáng yêu liếm máu đổ và giành nhau những miếng to hơn. Trẻ con mà — và trẻ con thì cần ăn.' };
    if (d.ritual >= needed(c)) return { winner: 'traitor', text: 'Nghi lễ hoàn tất! Lũ con đáng yêu của bạn tràn khắp ngôi nhà.' };
    if (G.players[tr].dead && !d.reachedChamber) return { winner: 'heroes', text: 'Kẻ phản bội chết trước khi tới được Pentagram Chamber. Tiếng sột soạt tắt dần…' };
    if (d.placed > 0 && !rats(c).length) return { winner: 'heroes', text: 'Vết chuột cắn rỉ máu khắp người. Nhưng cuối cùng bầy chuột đã chết hết. Bạn mong mình đã an toàn… sột soạt, sột soạt…' };
    return null;
  },
};

CUSTOM.h26Out = (c, pid, a) => placeExplorer(c, pid, a.room as string);
CUSTOM.h26PlaceRats = (c, tr) => {
  const G = c.G; const d = data(c); const el = eligibleRooms(c);
  if (d.supply >= el.length) {
    for (const r of el) newRat(c, r);
    if (el.length) log(G, `Đặt 1 Chuột vào mỗi phòng có biểu tượng mà không có ai: ${el.map(roomName).join(', ')}.`);
    d.toPlace = el.length ? d.supply : 0; d.extraPick = true;
    if (!el.length) log(G, 'Không có phòng hợp lệ để đặt Chuột.');
  } else { d.toPlace = d.supply; d.extraPick = false; }
  CUSTOM.h26NextPick(c, tr, {});
};
CUSTOM.h26NextPick = (c, tr) => {
  const G = c.G; const d = data(c); if (d.toPlace <= 0) return;
  const used = new Set(rats(c).map((m) => m.room));
  const rooms = d.extraPick ? eligibleRooms(c) : eligibleRooms(c).filter((r) => !used.has(r));
  if (!rooms.length) { d.toPlace = 0; return; }
  G.pending.push({ type: 'pickRoom', player: tr, prompt: `Đặt Chuột (còn ${d.toPlace} con${d.extraPick ? ', được xếp chồng' : ''})`, rooms, then: [], varName: 'custom:h26Rat' });
};
CUSTOM.h26Rat = (c, tr, a) => { const d = data(c); newRat(c, a.room as string); d.toPlace--; log(c.G, `Đặt Chuột tại ${roomName(a.room as string)}.`); CUSTOM.h26NextPick(c, tr, {}); };
CUSTOM.h26Ritual = (c, tr) => {
  const G = c.G; const d = data(c); d.ritual++;
  log(G, `🕯️ Nghi lễ thành công (${d.ritual}/${needed(c)}).`);
  if (d.ritual >= needed(c)) return;
  const adj = adjacentToPenta(c);
  if (d.supply > 0 && adj.length) G.pending.push({ type: 'pickRoom', player: tr, prompt: 'Đặt 1 Chuột vào phòng kề Pentagram Chamber', rooms: adj, then: [], varName: 'custom:h26RitualRat' });
  else log(G, d.supply > 0 ? 'Không có phòng kề Pentagram Chamber để đặt Chuột.' : 'Không còn Chuột trong kho.');
};
CUSTOM.h26RitualRat = (c, _tr, a) => { newRat(c, a.room as string); log(c.G, `Một con Chuột xuất hiện tại ${roomName(a.room as string)}.`); };
void cardName;
