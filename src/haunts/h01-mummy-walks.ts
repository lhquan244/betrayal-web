// Haunt #1 "The Mummy Walks" — Betrayal at House on the Hill, 2nd edition.
// Verified from the official 2nd-ed Traitor's Tome (Hasbro F3148 PDF p.15) and Secrets of Survival (PDF p.42),
// cross-checked with the 1st-ed text in the Esoteric Order of Gamers rules compilation (v4.2). Text is paraphrased.
import type { HauntModule } from './types';
import type { Ctx } from '../engine/core';
import { log, pname, rollDice, diceReason, sum, traitValue, holds, cardName, livingExplorers, cardsInPlay, killPlayer } from '../engine/core';
import { roomName, distances, tokensIn } from '../engine/house';
import { CUSTOM, enqueue, gainCard, loseCard, takeSpecific, requestDamage } from '../engine/effects';
import { CARD_BY_ID } from '../data/cards';
import type { Monster, CardRef, Effect } from '../engine/types';

const MUMMY = 'mummy';
const mummy = (c: Ctx) => c.G.monsters.find((m) => m.id === MUMMY);
const data = (c: Ctx) => c.G.haunt!.data as { sarcophagus: string; tokens: number; nameFoundTurn?: number; banished?: boolean; girlPlaced?: boolean };
const bookInRoom = (c: Ctx, room: string) => Object.values(c.G.players).some((p) => !p.dead && p.room === room && holds(p, 'book'))
  || tokensIn(c.G, room, 'itemPile').some((t) => (t.data!.cards as CardRef[]).some((x) => x.id === 'book'));
const inPlay = (c: Ctx, id: string) => cardsInPlay(c.G).some((x) => x.id === id);

export const mummyWalks: HauntModule = {
  number: 1,
  name: 'The Mummy Walks',
  edition: '2nd edition (Avalon Hill / Hasbro, F3148 — 2020 printing)',
  source: "Traitor's Tome & Secrets of Survival, Haunt 1 (Hasbro F3148 rules PDF, pp. 15 & 42)",
  traitorRule: (_c, revealer) => revealer, // haunt chart: "1 — Haunt revealer"
  art: { art: 'mummy', monsterName: 'The Mummy' },

  traitorText: `XÁC ƯỚP THỨC GIẤC (bạn là kẻ phản bội)
Bức tường trượt ra để lộ một cỗ quan tài cổ phủ chữ tượng hình. Một giọng khàn khàn vang trong đầu: nó đã mất cô dâu từ ngàn xưa, và giờ người yêu ấy tái sinh. Bạn mỉm cười: bạn bè phải chết để đôi tình nhân đoàn tụ.

NGAY BÂY GIỜ
• Nhân vật của bạn vẫn trong game nhưng đã thành kẻ phản bội.
• Đặt token Mummy (quái vật lớn) và token Sarcophagus (quan tài) vào phòng bạn đang đứng.
• Bạn mất lá Girl và mọi điểm cộng từ nó (lá Girl được để riêng). Đặt token Girl vào một phòng cùng tầng với phòng nơi Haunt bắt đầu, cách Mummy ít nhất 5 ô; nếu không có phòng nào đủ xa thì đặt xa nhất có thể trên tầng đó.
• Khi một explorer bước vào phòng có token Girl, người đó nhận lá Girl.
• Nếu bạn có Girl, bạn có thể giao Girl cho Mummy khi ở cùng phòng; khi đó Mummy giữ Girl.

ĐIỀU BẠN BIẾT VỀ CÁC ANH HÙNG: họ đang tìm cách đày Mummy về cõi chết.

BẠN THẮNG KHI… Mummy giữ Girl, mang theo Ring hoặc Holy Symbol, và quay về phòng có Sarcophagus. Bạn cũng thắng nếu mọi anh hùng đều chết. Nếu cả Ring lẫn Holy Symbol chưa có trên bàn, lần tới bạn khám phá phòng có biểu tượng Omen, hãy lục chồng Omen lấy một trong hai lá (rồi xáo chồng).

THE MUMMY — Speed 3, Might 8, Sanity 5
• Nếu Mummy đổ ra 0 hoặc 1 khi tung di chuyển, nó có thể dùng lối bí mật để tới bất kỳ ô nào trong nhà.
• Mummy có thể mang Item và giữ Girl, nhưng chúng không ảnh hưởng chỉ số của nó. Bạn có thể giao Item và Girl cho Mummy khi ở cùng ô.
• Trong lượt của mình, Mummy BẮT BUỘC tấn công một explorer cùng phòng (nếu có thể).
• Mummy tấn công bằng Might nhưng gây sát thương vào Speed cho đến khi Speed của đối thủ ở mức thấp nhất (không thể hạ xuống đầu lâu bằng cách này); sau đó sát thương chuyển sang Might cho đến khi đối thủ chết.
• Khi Mummy thắng đối thủ cách biệt từ 2 trở lên, nó có thể cướp một Item thay vì gây sát thương; nó cũng có thể cướp Girl theo cách này.
• Mummy miễn nhiễm đòn tấn công Speed (như Revolver và Dynamite).`,

  heroText: `XÁC ƯỚP THỨC GIẤC (bạn là anh hùng)
Bụi cuộn vào phòng, một bóng tối lướt qua tim bạn. Một người bạn hét lên vừa sung sướng vừa kinh hoàng. Một giọng nói lạnh lẽo: nó đã mất cô dâu, giờ nàng tái sinh, và không gì có thể chia cắt họ.

NGAY BÂY GIỜ
• Để riêng 2 token Knowledge Roll (tam giác).
• Khi một explorer bước vào phòng có token Girl, người đó nhận lá Girl.

ĐIỀU BẠN BIẾT VỀ PHE ÁC: kẻ phản bội muốn Mummy cưới Girl.

BẠN THẮNG KHI… bạn đày Mummy về cõi chết trước khi nó cưới Girl.

CÁCH ĐÀY MUMMY
• Nếu Book chưa có trên bàn, anh hùng kế tiếp khám phá phòng có biểu tượng Omen sẽ lục chồng Omen lấy Book thay vì rút bình thường (rồi xáo chồng).
• Phải xướng tên thật của Mummy từ cuốn Book. Làm theo đúng thứ tự; mỗi anh hùng chỉ được thử 1 bước mỗi lượt:
 1. Đổ Knowledge 6+ để tìm ra tên thật của Mummy ở một trong các phòng: phòng có Sarcophagus (đọc chữ tượng hình), Research Laboratory (đọc ghi chép của đoàn khảo cổ), hoặc Library (tra cứu lịch sử Mummy). Thành công: lấy 1 token Knowledge Roll.
 2. Ở một lượt SAU lượt có anh hùng tìm ra tên, nếu bạn đang giữ Book, đổ Knowledge 6+ để tra tên Mummy và học câu thần chú đày nó. Thành công: lấy 1 token Knowledge Roll.
 3. Khi các anh hùng có đủ 2 token, một anh hùng phải mang Book tới cùng phòng với Mummy. Bất kỳ anh hùng nào ở cùng phòng với cả Book và Mummy có thể thử đánh bại Mummy trong một trận Sanity combat để hoàn tất câu thần chú, đày nó vĩnh viễn.
• Mummy miễn nhiễm đòn tấn công Speed (như Revolver và Dynamite).`,

  setup(c, h) {
    const G = c.G; const tr = h.traitor!; const room = G.players[tr].room;
    const m: Monster = { id: MUMMY, name: 'The Mummy', room, traits: { speed: 3, might: 8, sanity: 5 }, stunned: false, carries: [], immune: ['speed'] };
    G.monsters.push(m);
    G.tokens.push({ id: 'sarcophagus', kind: 'sarcophagus', room });
    h.data = { sarcophagus: room, tokens: 0 };
    log(G, `Mummy và Sarcophagus xuất hiện tại ${roomName(room)}.`);
    // the traitor loses the Girl card and its bonuses; the card is set aside
    if (holds(G.players[tr], 'girl')) loseCard(c, tr, 'girl');
    else {
      // Only reachable via the non-chart house rule: Girl elsewhere. Holder loses it / it is pulled from the deck. (deviation)
      const holder = Object.values(G.players).find((p) => holds(p, 'girl'));
      if (holder) loseCard(c, holder.id, 'girl'); else takeSpecific(G, 'omen', 'girl');
    }
    G.setAside.push({ kind: 'omen', id: 'girl' });
    // Girl token: any room on the reveal floor at least 5 tiles from the Mummy, else as far as possible (traitor chooses)
    const floor = G.rooms[h.revealRoom].floor; const dist = distances(G, room);
    const sameFloor = Object.values(G.rooms).filter((r) => r.floor === floor && r.id !== room).map((r) => r.id);
    let cands = sameFloor.filter((r) => (dist[r] ?? Infinity) >= 5);
    if (!cands.length) { const max = Math.max(...sameFloor.map((r) => (Number.isFinite(dist[r]) ? dist[r] : -1))); cands = sameFloor.filter((r) => dist[r] === max); }
    if (!cands.length) cands = [room];
    G.pending.push({ type: 'pickRoom', player: tr, prompt: 'Đặt token Girl (cùng tầng, cách Mummy ≥ 5 ô hoặc xa nhất có thể)', rooms: cands, then: [], varName: 'custom:mummyPlaceGirl' });
  },

  actions: [
    {
      id: 'name', label: 'Bước 1: Tìm tên thật của Mummy (Knowledge 6+)', side: 'heroes',
      check(c, pid) {
        const d = data(c); const p = c.G.players[pid];
        if (d.nameFoundTurn !== undefined) return 'Đã tìm ra tên';
        if (c.G.turn.taskDone) return 'Mỗi lượt chỉ 1 bước';
        if (![d.sarcophagus, 'research-laboratory', 'library'].includes(p.room)) return 'Phải ở phòng có Sarcophagus, Research Laboratory hoặc Library';
        return null;
      },
      run(c, pid) {
        c.G.turn.taskDone = true;
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Tìm tên Mummy', trait: 'knowledge', outcomes: [{ min: 6, effects: [{ t: 'custom', fn: 'mummyToken', args: { step: 1 } }] }, { min: 0, max: 5, effects: [] }] } }]);
      },
    },
    {
      id: 'spell', label: 'Bước 2: Tra tên trong Book, học thần chú (Knowledge 6+)', side: 'heroes',
      check(c, pid) {
        const d = data(c);
        if (d.nameFoundTurn === undefined) return 'Chưa ai tìm ra tên Mummy';
        if (d.tokens >= 2) return 'Đã học thần chú';
        if (d.nameFoundTurn === c.G.turnCounter) return 'Phải ở một lượt sau lượt tìm ra tên';
        if (!holds(c.G.players[pid], 'book')) return 'Cần giữ Book';
        if (c.G.turn.taskDone) return 'Mỗi lượt chỉ 1 bước';
        return null;
      },
      run(c, pid) {
        c.G.turn.taskDone = true;
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Học thần chú', trait: 'knowledge', outcomes: [{ min: 6, effects: [{ t: 'custom', fn: 'mummyToken', args: { step: 2 } }] }, { min: 0, max: 5, effects: [] }] } }]);
      },
    },
    {
      id: 'banish', label: 'Bước 3: Sanity combat để đày Mummy', side: 'heroes',
      check(c, pid) {
        const d = data(c); const m = mummy(c); const p = c.G.players[pid];
        if (d.tokens < 2) return 'Cần đủ 2 token Knowledge Roll';
        if (!m || m.room !== p.room) return 'Phải ở cùng phòng với Mummy';
        if (!bookInRoom(c, p.room)) return 'Book phải ở trong phòng';
        if (c.G.turn.taskDone) return 'Mỗi lượt chỉ 1 bước';
        if (c.G.turn.attacked) return 'Đã tấn công lượt này';
        return null;
      },
      run(c, pid) {
        const G = c.G; G.turn.taskDone = true; G.turn.attacked = true; const m = mummy(c)!;
        const ad = rollDice(c.rng, Math.min(8, traitValue(G.players[pid], 'sanity')), { who: pid, label: `${pname(G, pid)} niệm chú đày Mummy`, reason: diceReason('Sanity', traitValue(G.players[pid], 'sanity')) }); const dd = rollDice(c.rng, m.traits.sanity!, { who: c.G.haunt?.traitor ?? undefined, label: 'Mummy chống đỡ (Sanity)', reason: diceReason('Mummy Sanity', m.traits.sanity!) });
        const A = sum(ad), D = sum(dd);
        log(G, `✨ ${pname(G, pid)} niệm chú (Sanity combat): [${ad.join(',')}]=${A} vs Mummy Sanity [${dd.join(',')}]=${D}`);
        if (A > D) { data(c).banished = true; log(G, 'Mummy bị đày về cõi chết!'); }
        else if (D > A) { if (m.stunned) log(G, 'Mummy đang choáng: không gây sát thương.'); else requestDamage(c, pid, 'mental', D - A, 'Mummy'); }
        else log(G, 'Hoà.');
      },
    },
    {
      id: 'give', label: 'Giao Item / Girl cho Mummy', side: 'traitor',
      check(c, pid) { const m = mummy(c); const p = c.G.players[pid]; if (!m || m.room !== p.room) return 'Phải ở cùng phòng với Mummy'; if (!p.cards.length) return 'Không có gì để giao'; return null; },
      run(c, pid) {
        const p = c.G.players[pid];
        c.G.pending.push({ type: 'choice', player: pid, prompt: 'Giao cho Mummy:', options: p.cards.map((x) => ({ label: cardName(x.id), effects: [{ t: 'custom', fn: 'mummyReceive', args: { card: x.id } }] as Effect[] })) });
      },
    },
  ],

  onEnterRoom(c, pid, room) {
    const G = c.G; const t = G.tokens.find((x) => x.kind === 'girlToken' && x.room === room);
    if (!t || G.players[pid].dead) return;
    G.tokens = G.tokens.filter((x) => x !== t); G.setAside = G.setAside.filter((x) => x.id !== 'girl');
    gainCard(c, pid, { kind: 'omen', id: 'girl' }); log(G, `${pname(G, pid)} tìm thấy Girl và nhận lá Girl.`);
  },

  replaceDraw(c, pid, kind) {
    if (kind !== 'omen') return null; const G = c.G; const p = G.players[pid];
    if (!p.isTraitor && !inPlay(c, 'book') && (G.decks.omen.includes('book') || G.discards.omen.includes('book'))) return 'book';
    if (p.isTraitor && !inPlay(c, 'ring') && !inPlay(c, 'holy-symbol')) { const avail = (id: string) => G.decks.omen.includes(id) || G.discards.omen.includes(id); const ids = ['ring', 'holy-symbol'].filter(avail); return ids.length > 1 ? { choose: ids } : ids[0] ?? null; } // TT p.15: "search through the omen stack and draw either card" — the traitor chooses
    return null;
  },

  onMonsterTurnStart(c) {
    const G = c.G; const m = mummy(c); if (!m) return;
    if (m.stunned) { log(G, 'Mummy đang choáng, bỏ lượt.'); (G.turn as Record<string, unknown>)[`mv:${MUMMY}`] = 0; return; }
    const d = rollDice(c.rng, m.traits.speed!, { who: c.G.haunt?.traitor ?? undefined, label: 'Mummy: di chuyển', reason: diceReason('Speed', m.traits.speed!) }); const t = sum(d);
    (G.turn as Record<string, unknown>)[`mv:${MUMMY}`] = Math.max(1, t); // a monster can always move at least 1 space (p.17)
    (G.turn as Record<string, unknown>)[`tp:${MUMMY}`] = t <= 1;
    log(G, `🎲 Mummy tung di chuyển: [${d.join(',')}] = ${t}${t <= 1 ? ' → có thể dùng lối bí mật tới bất kỳ ô nào' : ''}`);
  },

  onMonsterInflicts(c, _mid, pid, diff) {
    const G = c.G; const p = G.players[pid];
    const steal = p.cards.filter((x) => x.id === 'girl' || !CARD_BY_ID[x.id].noSteal); // haunt text lets the Mummy take the Girl
    if (diff >= 2 && steal.length) {
      G.pending.push({ type: 'choice', player: G.haunt!.traitor!, prompt: `Mummy thắng cách biệt ${diff}: cướp đồ hay gây sát thương?`, options: [
        { label: `Gây ${diff} sát thương`, effects: [{ t: 'custom', fn: 'mummyDamage', args: { pid, diff } }] },
        ...steal.map((x) => ({ label: `Cướp ${cardName(x.id)}`, effects: [{ t: 'custom', fn: 'mummySteal', args: { pid, card: x.id } }] as Effect[] }))] });
    } else CUSTOM.mummyDamage(c, pid, { pid, diff });
    return true;
  },

  canAttackMonster(_c, _pid, mid, trait) { return mid === MUMMY && trait === 'speed' ? 'Mummy miễn nhiễm đòn tấn công Speed (Revolver, Dynamite)' : null; },

  canEndMonsterTurn(c) {
    const G = c.G; const m = mummy(c); if (!m || m.stunned) return null;
    const heroHere = livingExplorers(G).some((o) => !G.players[o].isTraitor && G.players[o].room === m.room);
    if (heroHere && !(G.turn as Record<string, unknown>)[`att:${MUMMY}`]) return 'Mummy bắt buộc phải tấn công một explorer cùng phòng';
    return null;
  },

  status(G) {
    const d = G.haunt!.data as { sarcophagus: string; tokens: number; nameFoundTurn?: number };
    return [['Sarcophagus', roomName(d.sarcophagus)], ['Token Knowledge Roll', `${d.tokens}/2`], ['Tên Mummy', d.nameFoundTurn !== undefined ? 'đã tìm ra' : 'chưa']];
  },
  botTarget(c, pid) {
    const d = data(c); const p = c.G.players[pid]; if (p.isTraitor) return null;
    if (d.tokens >= 2) return mummy(c)?.room ?? null;
    if (d.nameFoundTurn === undefined) return d.sarcophagus;
    return null;
  },
  checkWin(c) {
    const G = c.G; const d = data(c); const m = mummy(c);
    const heroes = livingExplorers(G).filter((o) => !G.players[o].isTraitor);
    if (d.banished && heroes.length) return { winner: 'heroes', text: 'Gió nóng thổi qua khi cuốn sách gập lại. Lớp vải quấn của Mummy tan rã, nó vỡ vụn và bay theo gió. "Cô dâu của ta… không…". Gió lặng. Các bạn còn lại một mình.' };
    if (!heroes.length) return { winner: 'traitor', text: 'Mọi anh hùng đã chết.' };
    if (m && m.companionGirl && m.carries.some((x) => x.id === 'ring' || x.id === 'holy-symbol') && m.room === d.sarcophagus)
      return { winner: 'traitor', text: 'Mummy bế cô gái trên đôi tay quấn vải và thổi vào miệng cô. Nước mắt cô phát sáng màu hổ phách: "Thầy tế của em, tình yêu của em… chúng ta lại bên nhau."' };
    return null;
  },
};

CUSTOM.mummyPlaceGirl = (c, _pid, a) => { c.G.tokens.push({ id: 'girl-token', kind: 'girlToken', room: a.room as string }); log(c.G, `Token Girl được đặt tại ${roomName(a.room as string)}.`); };
CUSTOM.mummyToken = (c, pid, a) => {
  const d = data(c); d.tokens++; if (a.step === 1) d.nameFoundTurn = c.G.turnCounter;
  log(c.G, `${pname(c.G, pid)} nhận token Knowledge Roll (${d.tokens}/2). ${a.step === 1 ? 'Tên thật của Mummy đã được tìm ra — mọi anh hùng đều biết.' : 'Đã học thần chú!'}`);
};
CUSTOM.mummyReceive = (c, pid, a) => {
  const m = mummy(c)!; const ref = loseCard(c, pid, a.card as string); if (!ref) return;
  if (ref.id === 'girl') m.companionGirl = true; else m.carries.push(ref);
  log(c.G, `${pname(c.G, pid)} giao ${cardName(ref.id)} cho Mummy.`);
};
CUSTOM.mummySteal = (c, _t, a) => {
  const m = mummy(c)!; const ref = loseCard(c, a.pid as string, a.card as string); if (!ref) return;
  if (ref.id === 'girl') m.companionGirl = true; else m.carries.push(ref);
  log(c.G, `Mummy cướp ${cardName(ref.id)} của ${pname(c.G, a.pid as string)}!`);
  if (ref.id === 'blood-dagger') enqueue(c, a.pid as string, [{ t: 'damage', kind: 'physical', dice: 2 }], true);
};
/** Mummy damage: Speed first down to its lowest number (never to the skull), then Might until dead. */
CUSTOM.mummyDamage = (c, _t, a) => {
  const G = c.G; const pid = a.pid as string; const p = G.players[pid]; let n = a.diff as number;
  if (holds(p, 'armor')) { n -= 1; log(G, 'Armor giảm 1 sát thương thể chất.'); }
  let toSpeed = Math.min(n, p.idx.speed); n -= toSpeed;
  if (toSpeed) { p.idx.speed -= toSpeed; log(G, `${pname(G, pid)} mất ${toSpeed} Speed (→ ${traitValue(p, 'speed')}).`); }
  if (n > 0) { const before = p.idx.might; p.idx.might = Math.max(-1, p.idx.might - n); log(G, `${pname(G, pid)} mất ${before - p.idx.might} Might.`); if (p.idx.might < 0) killPlayer(G, pid); }
};
