// Haunt #40 "Buried Alive" — Betrayal at House on the Hill, 2nd edition.
// Verified from the official Traitor's Tome (Hasbro F3148 rules PDF p.34, right half) and Secrets of Survival (p.62, right half).
// Haunt chart traitor column: "Left of the haunt revealer". Text is paraphrased in Vietnamese.
// Hidden information: the burial room is only in the traitor's view (playerView below + private log + redacted resolve move).
import type { HauntModule } from './types';
import type { Ctx } from '../engine/core';
import { log, pname, rollDice, sum, holds, livingExplorers } from '../engine/core';
import { roomName, distances, drawTileFor, autoPlace } from '../engine/house';
import { CUSTOM_ROLLS, CUSTOM, enqueue, loseCard, gainCard, discardCard, placeExplorer } from '../engine/effects';
import type { Effect } from '../engine/types';
import { leftOfRevealer, heroes, nPlayers, taskBlocked } from './common';

interface D { track: number; damage: number; burial?: string; found: boolean; digs: number; entered: { turn: number; rooms: string[] }; searched: string[]; boardGone: boolean; moveWho?: string }
const data = (c: Ctx) => c.G.haunt!.data as unknown as D;
const DEATH_AT = 12;
const basementRooms = (c: Ctx) => Object.values(c.G.rooms).filter((r) => r.floor === 'basement').map((r) => r.id);

export const buriedAlive: HauntModule = {
  number: 40,
  name: 'Buried Alive',
  edition: '2nd edition (Avalon Hill / Hasbro, F3148 — 2020 printing)',
  source: "Traitor's Tome p.34 (R) & Secrets of Survival p.62 (R) — Hasbro F3148 rules PDF",
  traitorRule: (c, revealer) => leftOfRevealer(c, revealer),
  art: { art: 'buried', monsterName: '—' },

  traitorText: `CHÔN SỐNG (bạn là kẻ phản bội)
Tấm Spirit Board tự trượt qua lại trên các chữ cái: C-H-Ô-N-S-Ố-N-G. Cái bảng ngu ngốc vừa phá vỡ bùa phép bạn dùng để khiến cả nhóm quên mất một người — nạn nhân bạn đã chôn sống ngay trước khi vào nhà.

NGAY BÂY GIỜ
• Nhân vật của bạn vẫn trong game nhưng đã thành kẻ phản bội.
• Đặt thanh Turn/Damage ở 0 để đếm thời gian.
• Chọn một phòng tầng hầm đã được khám phá và bí mật ghi lại: người bị chôn ở đó. Nếu tầng hầm có ít hơn 5 phòng (tính cả Basement Landing), rút và đặt thêm phòng tầng hầm cho đủ 5 rồi mới ghi phòng chôn.

ĐIỀU BẠN BIẾT VỀ CÁC ANH HÙNG: họ đang cố giải cứu người bị chôn.

BẠN THẮNG KHI… người bị chôn chết.

BẠN PHẢI LÀM: cuối lượt của bạn, đẩy thanh Turn/Damage lên số kế tiếp (bắt đầu từ 1), rồi đổ số xúc xắc bằng số đó: người bị chôn chịu chừng ấy sát thương thể chất. Người bị chôn chịu được 12 điểm sát thương trước khi chết.

SPIRIT BOARD
• Spirit Board sẽ giúp anh hùng. Người đang giữ không thể trao đổi hay bỏ nó.
• Nếu bạn thắng người giữ Spirit Board cách biệt từ 2 trở lên bằng đòn Might, bạn có thể cướp Spirit Board thay vì gây sát thương: Spirit Board bị phá huỷ ngay và lá bị bỏ.`,

  heroText: `CHÔN SỐNG (bạn là anh hùng)
Tấm Spirit Board tự trượt: C-H-Ô-N-S-Ố-N-G. Bạn chợt nhận ra từ lúc vào nhà chưa thấy một người bạn đâu! Một thứ ma thuật méo mó đã khiến bạn quên. Nếu bạn ấy thật sự bị chôn sống, phải tìm ra ngay.

NGAY BÂY GIỜ: để riêng số token Might Roll bằng số người chơi.

ĐIỀU BẠN BIẾT VỀ PHE ÁC: kẻ phản bội đã chôn một người bạn (không phải người chơi) trong một phòng tầng hầm và bí mật ghi lại. Bạn không biết phòng nào, nhưng biết phòng đó đã có trong nhà khi Haunt bắt đầu.

BẠN THẮNG KHI… tìm ra và đào được người bị chôn trước khi người đó chết. Spirit Board sẽ giúp bạn.

CÁCH GIẢI CỨU
• Mỗi khi đi vào một phòng, bạn có thể lục soát nó bằng Knowledge 3+ ở phòng đó. Thành công: hỏi kẻ phản bội đây có phải phòng chôn không (phải trả lời thật). Mỗi phòng chỉ lục soát được 1 lần trong lượt của bạn.
• Khi đã tìm ra phòng chôn, đổ Might 4+ ở phòng đó để đào (mỗi lượt 1 lần). Mỗi lần thành công đặt 1 token Might Roll. Cần số lần thành công bằng số người chơi.

SPIRIT BOARD
• Sau khi Haunt bắt đầu, không dùng Spirit Board để xem ô phòng trên cùng nữa; thay vào đó dùng để tìm người bị chôn.
• Người giữ Spirit Board không thể tự ý đưa, trao đổi hay bỏ nó. Nếu người đó chết, Spirit Board rơi cùng các Item khác như thường; ai cũng nhặt được.
• Người giữ có thể dùng nó mỗi lượt 1 lần cho tới khi phòng chôn được tìm ra (khi đó bỏ lá Spirit Board).
• Khi dùng Spirit Board, lượt đó bạn không thể di chuyển hay làm hành động nào khác. Đổ Sanity và xem bảng:
 0–2: không có gì · 3–4: di chuyển một explorer bất kỳ 3 ô · 5–6: chữa cho người bị chôn — đổ 2 xúc xắc, trừ kết quả khỏi sát thương của người đó · 7+: kẻ phản bội phải công bố phòng chôn.`,

  gaps: [
    'Mốc chết của người bị chôn: sách ghi "chịu được 12 điểm sát thương trước khi chết" — bản web coi tổng sát thương đạt 12 là chết.',
    'Phòng chôn có được là Basement Landing hay không: sách đếm Basement Landing là một phòng tầng hầm — bản web cho phép chọn.',
    'Việc rút và đặt thêm phòng tầng hầm cho đủ 5 được làm tự động (đặt vào chỗ hợp lệ đầu tiên) thay vì cho kẻ phản bội tự đặt.',
    'Nếu kẻ phản bội chết: không còn "cuối lượt của bạn" — bản web ngừng đẩy thanh Turn/Damage (sách không nói).',
    '"Mỗi phòng chỉ lục soát được 1 lần trong lượt": bản web hiểu là mỗi phòng 1 lần/lượt (có thể lục soát nhiều phòng khác nhau trong cùng lượt nếu đi vào chúng).',
    'Kết quả 3–4 của Spirit Board ("di chuyển một explorer bất kỳ 3 ô"): bản web cho chọn một phòng cách đúng tối đa 3 ô theo lối đi, không áp hiệu ứng phòng đi qua. Sách không nói có được dừng sớm hay không.',
    'Nếu chính kẻ phản bội đang giữ Spirit Board: sách không nói — bản web không cho kẻ phản bội dùng chức năng Haunt của Spirit Board.',
    'Chỉ khi dùng house rule "luôn dùng Haunt #40" (ngoài bảng Haunt): nếu không anh hùng nào giữ Spirit Board thì bản web giao nó cho người lật Haunt (theo bảng Haunt, haunt này luôn do Spirit Board lật nên người lật Haunt đã giữ sẵn).',
  ],

  setup(c, h) {
    const G = c.G; const tr = h.traitor!;
    h.data = { track: 0, damage: 0, found: false, digs: 0, entered: { turn: -1, rooms: [] }, searched: [], boardGone: false } as unknown as Record<string, unknown>;
    let guard = 0;
    while (basementRooms(c).length < 5 && guard++ < 20) {
      const t = drawTileFor(G, 'basement', c.rng.shuffle); if (!t) break;
      if (autoPlace(G, t, 'basement', true) === 'basement') /* basement spots only */ log(G, `Rút thêm phòng tầng hầm: ${roomName(t)}.`); else { G.roomDiscard.push(t); break; }
    }
    if (basementRooms(c).length < 5) log(G, 'Không thể đặt đủ 5 phòng tầng hầm (hết ô phòng / hết chỗ).');
    // Played from the haunt chart, this haunt is revealed by the Spirit Board, so a hero (the revealer) holds it.
    // Only with the non-chart house rule "always use Haunt #40" can it be elsewhere: hand it to the revealer (logged deviation).
    const heroHasBoard = livingExplorers(G).some((o) => !G.players[o].isTraitor && holds(G.players[o], 'spirit-board'));
    if (!heroHasBoard && G.options.forceHaunt && !G.players[h.revealer].isTraitor && !G.players[h.revealer].dead) {
      const holder = Object.values(G.players).find((p) => holds(p, 'spirit-board'));
      let ok = false;
      if (holder) ok = !!loseCard(c, holder.id, 'spirit-board');
      else for (const pile of [G.decks.omen, G.discards.omen]) { const i = pile.indexOf('spirit-board'); if (i >= 0) { pile.splice(i, 1); ok = true; break; } }
      if (ok) { gainCard(c, h.revealer, { kind: 'omen', id: 'spirit-board' }); log(G, `(House rule ép Haunt #40 — ngoài bảng Haunt) Spirit Board được giao cho người lật Haunt ${pname(G, h.revealer)}.`); }
    }
    G.pending.push({ type: 'pickRoom', player: tr, prompt: '(Bí mật) Chọn phòng tầng hầm nơi bạn đã chôn nạn nhân', rooms: basementRooms(c), then: [], varName: 'custom:h40Bury' });
  },

  actions: [
    {
      id: 'search', label: 'Lục soát phòng này (Knowledge 3+)', side: 'heroes',
      check(c, pid) {
        const G = c.G; const d = data(c); const room = G.players[pid].room;
        if (d.found) return 'Đã tìm ra phòng chôn';
        if (d.entered.turn !== G.turnCounter || !d.entered.rooms.includes(room)) return 'Chỉ lục soát được phòng vừa đi vào trong lượt này';
        if (G.turn.rollsDone.includes(`h40s:${room}`)) return 'Đã lục soát phòng này lượt này';
        return null;
      },
      run(c, pid) {
        const room = c.G.players[pid].room; c.G.turn.rollsDone.push(`h40s:${room}`);
        enqueue(c, pid, [{ t: 'roll', spec: { label: `Lục soát ${roomName(room)}`, trait: 'knowledge', outcomes: [{ min: 3, effects: [{ t: 'custom', fn: 'h40Ask', args: { room } }] }, { min: 0, max: 2, effects: [] }] } }]);
      },
    },
    {
      id: 'dig', label: 'Đào người bị chôn (Might 4+)', side: 'heroes',
      check(c, pid) {
        const d = data(c); if (!d.found) return 'Chưa tìm ra phòng chôn';
        if (c.G.players[pid].room !== d.burial) return 'Phải ở phòng chôn';
        if (c.G.turn.rollsDone.includes('h40dig')) return 'Mỗi lượt chỉ đào 1 lần';
        return null;
      },
      run(c, pid) {
        c.G.turn.rollsDone.push('h40dig');
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Đào bới', trait: 'might', outcomes: [{ min: 4, effects: [{ t: 'custom', fn: 'h40Dig' }] }, { min: 0, max: 3, effects: [] }] } }]);
      },
    },
    {
      id: 'board', label: 'Dùng Spirit Board tìm người bị chôn (Sanity, kết thúc lượt)', side: 'heroes',
      check(c, pid) {
        const G = c.G; const d = data(c);
        if (!holds(G.players[pid], 'spirit-board')) return 'Cần giữ Spirit Board';
        if (d.found) return 'Đã tìm ra phòng chôn';
        if (G.turn.spent > 0 || G.turn.attacked || G.turn.rollsDone.length || G.turn.usedItems.length || G.turn.taskDone) return 'Chỉ dùng được khi chưa di chuyển hay làm gì khác trong lượt';
        return null;
      },
      run(c, pid) {
        const G = c.G; G.turn.forceEnd = true; G.turn.moveEnded = true; G.turn.usedItems.push('spirit-board'); G.turn.rollsDone.push('h40board');
        log(G, `🔮 ${pname(G, pid)} dùng Spirit Board (không thể di chuyển hay làm gì khác lượt này).`);
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Spirit Board', trait: 'sanity', outcomes: [
          { min: 7, effects: [{ t: 'custom', fn: 'h40Reveal' }] },
          { min: 5, max: 6, effects: [{ t: 'custom', fn: 'h40Heal' }] },
          { min: 3, max: 4, effects: [{ t: 'custom', fn: 'h40MoveWho' }] },
          { min: 0, max: 2, effects: [{ t: 'log', text: 'Spirit Board: không có gì.' }] }] } }]);
      },
    },
  ],

  blockCard(c, pid, card, action) {
    if (card !== 'spirit-board') return null;
    if (action === 'use') return 'Sau khi Haunt bắt đầu, Spirit Board chỉ dùng để tìm người bị chôn';
    return c.G.players[pid].isTraitor ? null : 'Không thể trao đổi hay bỏ Spirit Board';
  },
  onCardStolen(c, thief, victim, card) {
    if (card !== 'spirit-board') return false;
    discardCard(c.G, { kind: 'omen', id: card }); data(c).boardGone = true;
    log(c.G, `${pname(c.G, thief)} cướp Spirit Board của ${pname(c.G, victim)} — Spirit Board bị phá huỷ.`); return true;
  },
  onEnterRoom(c, pid, room) {
    const G = c.G; const d = data(c); if (d.entered.turn !== G.turnCounter) d.entered = { turn: G.turnCounter, rooms: [] };
    if (pid === G.turn.player) d.entered.rooms.push(room);
  },
  onExplorerTurnEnd(c, pid) {
    const G = c.G; const d = data(c); if (pid !== G.haunt!.traitor || !d.burial) return;
    d.track++; const dice = rollDice(c.rng, Math.min(8, d.track), { who: c.G.haunt?.traitor ?? undefined, label: 'Người bị chôn chịu sát thương', reason: `Turn/Damage ${d.track} → ${Math.min(8, d.track)} xúc xắc` }); const t = sum(dice); d.damage += t;
    log(G, `⏳ Thanh Turn/Damage → ${d.track}. Người bị chôn chịu [${dice.join(',')}] = ${t} sát thương (tổng ${d.damage}/${DEATH_AT}).`);
  },
  playerView(data0, G, playerID) {
    const d = data0 as unknown as D; if (d.found || (playerID != null && playerID === G.haunt?.traitor)) return data0;
    const { burial: _b, ...rest } = d; void _b; return rest as unknown as Record<string, unknown>;
  },
  status(G) {
    const d = G.haunt!.data as unknown as D;
    return [['Turn/Damage', String(d.track)], ['Sát thương người bị chôn', `${d.damage}/${DEATH_AT}`], ['Phòng chôn', d.found && d.burial ? roomName(d.burial) : d.burial ? `${roomName(d.burial)} (bí mật)` : 'chưa biết'], ['Đã đào', `${d.digs}/${G.order.length}`]];
  },
  botTarget(c, pid) {
    const G = c.G; const d = data(c); if (G.players[pid].isTraitor) return null;
    if (d.found) return d.burial ?? null;
    const dist = distances(G, G.players[pid].room); const here = G.players[pid].room;
    // (bot hint) unsearched basement rooms; not the room it already stands in (a search needs a room entered this turn)
    const b = basementRooms(c).filter((r) => !d.searched.includes(r) && r !== here && Number.isFinite(dist[r]));
    return b.sort((a, x) => (dist[a] ?? 99) - (dist[x] ?? 99))[0] ?? null;
  },
  checkWin(c) {
    const d = data(c); if (!d.burial) return null;
    if (d.damage >= DEATH_AT) return { winner: 'traitor', text: 'Ahhh… những người bạn hoảng loạn đã đến quá muộn. Bữa tối muộn này… có cả món tráng miệng.' };
    if (d.digs >= nPlayers(c)) return { winner: 'heroes', text: 'Đào điên cuồng, cuối cùng bạn cũng giải thoát được người bạn. Móng tay cô ấy gãy nát vì cào nắp quan tài, đôi tay rớm máu run rẩy. Bạn dìu cô ra khỏi nhà — rồi sẽ ổn… một ngày nào đó.' };
    if (!heroes(c).length) return { winner: 'traitor', text: 'Mọi anh hùng đã chết; không còn ai để đào người bị chôn lên.' };
    return null;
  },
};

CUSTOM.h40Bury = (c, tr, a) => {
  const d = data(c); d.burial = a.room as string;
  log(c.G, `${pname(c.G, tr)} đã bí mật ghi lại phòng chôn.`);
  log(c.G, `(Chỉ bạn thấy) Phòng chôn: ${roomName(d.burial)}`, [tr]);
};
function found(c: Ctx, why: string) {
  const G = c.G; const d = data(c); d.found = true;
  log(G, `📍 ${why}: người bị chôn ở ${roomName(d.burial!)}!`);
  for (const p of livingExplorers(G)) if (holds(G.players[p], 'spirit-board')) { const ref = loseCard(c, p, 'spirit-board'); if (ref) discardCard(G, ref); log(G, 'Bỏ lá Spirit Board (đã tìm ra phòng chôn).'); }
}
CUSTOM.h40Ask = (c, pid, a) => {
  const d = data(c); const room = a.room as string; if (!d.searched.includes(room)) d.searched.push(room);
  if (room === d.burial) found(c, `${pname(c.G, pid)} lục soát và kẻ phản bội xác nhận`);
  else log(c.G, `${pname(c.G, pid)} lục soát ${roomName(room)}: kẻ phản bội trả lời KHÔNG phải phòng chôn.`);
};
CUSTOM.h40Dig = (c, pid) => {
  const d = data(c); d.digs++; c.G.tokens.push({ id: `dig-${d.digs}`, kind: 'mightRoll', room: d.burial! });
  log(c.G, `⛏️ ${pname(c.G, pid)} đào thành công (${d.digs}/${nPlayers(c)}).`);
};
CUSTOM.h40Reveal = (c) => found(c, 'Spirit Board 7+ — kẻ phản bội phải công bố');
CUSTOM_ROLLS.h40Heal = { label: 'Spirit Board: hồi máu người bị chôn', reason: () => '2 xúc xắc' };
CUSTOM.h40Heal = (c) => {
  const d = data(c); const dice = rollDice(c.rng, 2, { label: 'Spirit Board: hồi máu người bị chôn', reason: '2 xúc xắc' }); const t = sum(dice); d.damage = Math.max(0, d.damage - t);
  log(c.G, `💗 Spirit Board 5–6: chữa cho người bị chôn [${dice.join(',')}] = ${t} (sát thương còn ${d.damage}/${DEATH_AT}).`);
};
CUSTOM.h40MoveWho = (c, pid) => {
  const G = c.G; const opts = livingExplorers(G);
  G.pending.push({ type: 'choice', player: pid, prompt: 'Spirit Board 3–4: di chuyển explorer nào 3 ô?', options: opts.map((o) => ({ label: pname(G, o), effects: [{ t: 'custom', fn: 'h40MoveWhere', args: { who: o } }] as Effect[] })) });
};
CUSTOM.h40MoveWhere = (c, pid, a) => {
  const G = c.G; const who = a.who as string; const dist = distances(G, G.players[who].room);
  const rooms = Object.keys(dist).filter((r) => dist[r] >= 1 && dist[r] <= 3);
  if (!rooms.length) { log(G, 'Không có phòng nào trong 3 ô.'); return; }
  data(c).moveWho = who;
  G.pending.push({ type: 'pickRoom', player: pid, prompt: `Di chuyển ${pname(G, who)} tới phòng nào (tối đa 3 ô)?`, rooms, then: [], varName: 'custom:h40MoveTo' });
};
CUSTOM.h40MoveTo = (c, _pid, a) => {
  const d = data(c); const who = d.moveWho!; d.moveWho = undefined;
  placeExplorer(c, who, a.room as string);
};
