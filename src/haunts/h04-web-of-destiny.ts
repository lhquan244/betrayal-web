// Haunt #4 "The Web of Destiny" — Betrayal at House on the Hill, 2nd edition.
// Verified from the official Traitor's Tome (Hasbro F3148 rules PDF p.16, right half) and Secrets of Survival (p.44, left half).
// Haunt chart traitor column: "Highest Might (except for the haunt revealer)". Text is paraphrased in Vietnamese.
import type { HauntModule } from './types';
import type { Ctx } from '../engine/core';
import { log, pname, rollDice, diceReason, sum, holds, livingExplorers, killPlayer, traitValue } from '../engine/core';
import { roomName, tokensIn } from '../engine/house';
import { CUSTOM, enqueue, loseCard, discardCard } from '../engine/effects';
import { canMove } from '../engine/rules';
import { byTrait, heroes, nPlayers, taskBlocked, addMonster } from './common';

const SPIDER = 'spider';
// Turn/Damage track → Spider traits (Traitor's Tome table). Row 7 is "7+".
const TABLE: Record<number, { speed: number; might: number; sanity: number }> = {
  1: { speed: 0, might: 2, sanity: 5 }, 2: { speed: 1, might: 2, sanity: 5 }, 3: { speed: 2, might: 4, sanity: 5 }, 4: { speed: 4, might: 4, sanity: 5 },
  5: { speed: 5, might: 5, sanity: 5 }, 6: { speed: 6, might: 7, sanity: 5 }, 7: { speed: 6, might: 8, sanity: 5 },
};
interface D { track: number; trapped: string; webTokens: number; webDestroyed: boolean; eggsDestroyed: boolean; doorOpenTurn?: number; exited?: string; noSkull: string[] }
const data = (c: Ctx) => c.G.haunt!.data as unknown as D;
const spider = (c: Ctx) => c.G.monsters.find((m) => m.id === SPIDER);
const trappedRoom = (c: Ctx) => c.G.players[data(c).trapped].room;
function setStats(c: Ctx) {
  const m = spider(c); if (!m) return; const row = TABLE[Math.min(7, data(c).track)];
  m.traits = { speed: row.speed, might: row.might, sanity: row.sanity };
}

export const webOfDestiny: HauntModule = {
  number: 4,
  name: 'The Web of Destiny',
  edition: '2nd edition (Avalon Hill / Hasbro, F3148 — 2020 printing)',
  source: "Traitor's Tome p.16 (R) & Secrets of Survival p.44 (L) — Hasbro F3148 rules PDF",
  traitorRule: (c, revealer) => byTrait(c, revealer, 'might', 'highest', true),
  art: { art: 'spider', monsterName: 'The Spider' },

  traitorText: `MẠNG NHỆN ĐỊNH MỆNH (bạn là kẻ phản bội)
Một thứ gì đó bò vào trong đầu bạn. Bạn vẫn là bạn, nhưng bạn cũng là nó — con Nhện. Một con mồi đang giãy giụa trong mạng tơ, và bạn đã tiêm trứng vào cơ thể nó. Chẳng bao lâu nữa lũ con sẽ chui ra… trừ khi những kẻ khác ngăn cản.

NGAY BÂY GIỜ
• 5–6 người chơi: nhân vật của bạn vẫn ở trong game và đã thành kẻ phản bội.
• 3–4 người chơi: nhân vật của bạn đã bị Nhện ăn thịt. Bỏ lại mọi Item và rời khỏi game (bạn vẫn điều khiển Nhện).
• Đặt token Nhện (quái vật lớn) vào phòng của explorer đang giữ lá Bite.
• Đặt thanh Turn/Damage ở 1 để đếm thời gian.

ĐIỀU BẠN BIẾT VỀ CÁC ANH HÙNG: người lật Haunt bị mắc trong mạng tơ và bị nhiễm trứng nhện khổng lồ. Người đó không thể di chuyển.

BẠN THẮNG KHI… trứng nở (ở lượt 9) hoặc mọi anh hùng đều chết.

BẠN PHẢI LÀM: cuối mỗi lượt của bạn, đẩy thanh Turn/Damage lên số kế tiếp.

NHỆN PHẢI LÀM trong lượt của nó: di chuyển về phía một explorer KHÔNG phải người lật Haunt và tấn công nếu có thể. Cả bạn lẫn Nhện đều không được tấn công người lật Haunt cho tới khi trứng bị phá huỷ.

CHỈ SỐ NHỆN theo thanh Turn/Damage (Speed / Might / Sanity):
1: 0/2/5 · 2: 1/2/5 · 3: 2/4/5 · 4: 4/4/5 · 5: 5/5/5 · 6: 6/7/5 · 7+: 6/8/5

LUẬT TẤN CÔNG ĐẶC BIỆT: mỗi lần Nhện tấn công, bạn được đổ lại mỗi xúc xắc ra mặt trắng (chỉ một lần).`,

  heroText: `MẠNG NHỆN ĐỊNH MỆNH (bạn là anh hùng)
Mạng tơ lớn tới mức tâm trí bạn không chịu nhìn thấy nó. Người lật Haunt bị dính chặt vào mạng, một con nhện khổng lồ lướt xuống và chích ngòi vào bụng… Liệu có ai nghe tiếng thét?

NGAY BÂY GIỜ
• Người lật Haunt bị mắc vào mạng tơ: đó là "explorer bị mắc kẹt". Người đó không thể di chuyển nhưng vẫn có thể tấn công mạng tơ, dùng hoặc trao đổi Item.
• Nếu Medical Kit chưa được tìm thấy, anh hùng nào có cơ hội rút Item đều có thể lục chồng Item lấy Medical Kit thay vì rút bình thường (rồi xáo chồng).
• Để riêng số token Might Roll bằng số người chơi.
• Explorer bị mắc kẹt đã bị nhiễm trứng nhện; sớm muộn trứng sẽ nở.

ĐIỀU BẠN BIẾT VỀ PHE ÁC: một con Nhện khổng lồ đã thức giấc, nó bảo vệ explorer bị mắc kẹt cho tới khi trứng nở.

BẠN THẮNG KHI… explorer bị mắc kẹt được giải thoát, trứng đã bị phá huỷ, VÀ ít nhất một anh hùng ra khỏi nhà.

PHÁ MẠNG TƠ VÀ TRỨNG
• Khi trứng chưa bị phá huỷ, không chỉ số nào của explorer bị mắc kẹt có thể tụt xuống đầu lâu.
• Phá mạng tơ bằng đòn tấn công Might; mạng tơ phòng thủ bằng Might 4. Thắng: đặt 1 token Might Roll vào phòng đó thay vì gây sát thương. Thua: bạn không bị sát thương. Khi số token trong phòng bằng số người chơi, mạng tơ bị phá huỷ: explorer bị mắc kẹt có thể di chuyển và hành động bình thường.
• Nếu bạn ở cùng phòng với explorer bị mắc kẹt và giữ Medical Kit, có thể đổ Knowledge 4+ để phá huỷ trứng. Nếu có Healing Salve, có thể dùng nó để phá trứng mà không cần đổ.

CÁCH RA KHỎI NHÀ
Sau khi explorer bị mắc kẹt được giải thoát và trứng bị phá huỷ, anh hùng có thể thoát ra: đổ Knowledge (cạy khoá) hoặc Might (phá khoá) 6+ để mở cửa chính ở Entrance Hall. Thành công: rút 1 lá Event và kết thúc lượt. Từ các lượt sau, mọi anh hùng còn sống có thể ra khỏi nhà từ Entrance Hall bằng 1 ô di chuyển.`,

  gaps: [
    'Thời điểm đẩy thanh Turn/Damage: sách ghi "cuối mỗi lượt của bạn". Bản web đẩy thanh khi kết thúc lượt quái vật (lượt quái vật đi ngay sau lượt kẻ phản bội), kể cả khi nhân vật kẻ phản bội đã bị ăn (3–4 người) — sách không nói rõ trường hợp này.',
    'Lượt 1 Nhện có Speed 0: bản web áp dụng luật chung (rulebook tr.17) "quái vật luôn đi được ít nhất 1 ô" — sách Haunt không nói riêng.',
    '"Nhện phải di chuyển về phía một explorer không phải người lật Haunt" không được kiểm tra tự động; chỉ bắt buộc "tấn công nếu có thể".',
    'Nếu không ai giữ lá Bite (đã mất/bị bỏ), Nhện được đặt ở phòng nơi Haunt bắt đầu — sách không nói.',
    'Tấn công mạng tơ: bản web dùng đúng Might của bạn, KHÔNG cộng xúc xắc vũ khí (Axe, Blood Dagger…) và không hỗ trợ Sacrificial Dagger — sách không nói vũ khí có áp dụng hay không.',
    'Explorer bị mắc kẹt có được tự phá trứng hay không: sách viết "nếu bạn ở cùng phòng với explorer bị mắc kẹt"; bản web cho phép cả chính người bị mắc kẹt.',
    'Healing Salve dùng để phá trứng: bản web bỏ lá này sau khi dùng (theo chữ trên lá: "dùng xong thì bỏ").',
    'Đổ mở cửa chính được tính là task roll (mỗi lượt 1 lần).',
  ],

  setup(c, h) {
    const G = c.G; const tr = h.traitor!; const n = nPlayers(c);
    const biteHolder = Object.values(G.players).find((p) => !p.dead && holds(p, 'bite'));
    const room = biteHolder?.room ?? h.revealRoom;
    addMonster(c, { id: SPIDER, name: 'The Spider', room, traits: {}, kind: 'spider' });
    const d: D = { track: 1, trapped: h.revealer, webTokens: 0, webDestroyed: false, eggsDestroyed: false, noSkull: [h.revealer] };
    h.data = d as unknown as Record<string, unknown>; setStats(c);
    log(G, `🕷️ Nhện khổng lồ xuất hiện tại ${roomName(room)}${biteHolder ? ` (phòng của ${pname(G, biteHolder.id)}, người giữ Bite)` : ''}. Thanh Turn/Damage: 1.`);
    log(G, `${pname(G, h.revealer)} bị mắc vào mạng tơ và nhiễm trứng nhện.`);
    if (n <= 4) { log(G, `(${n} người chơi) Nhân vật của ${pname(G, tr)} bị Nhện ăn thịt — vẫn điều khiển Nhện.`); killPlayer(G, tr); }
  },

  actions: [
    {
      id: 'web', label: 'Tấn công mạng tơ (Might vs Might 4)', side: 'heroes',
      check(c, pid) {
        const d = data(c); if (d.webDestroyed) return 'Mạng tơ đã bị phá';
        if (c.G.players[pid].room !== trappedRoom(c)) return 'Phải ở phòng có explorer bị mắc kẹt';
        if (c.G.turn.attacked) return 'Đã tấn công lượt này';
        return null;
      },
      run(c, pid) {
        const G = c.G; G.turn.attacked = true; const d = data(c);
        const ad = rollDice(c.rng, Math.min(8, traitValue(G.players[pid], 'might')), { who: pid, label: `${pname(G, pid)} tấn công mạng tơ`, reason: diceReason('Might', traitValue(G.players[pid], 'might')) }); const dd = rollDice(c.rng, 4, { who: pid, label: 'Mạng tơ chống đỡ', reason: 'Might 4 → 4 xúc xắc' });
        const A = sum(ad), D = sum(dd);
        log(G, `⚔️ ${pname(G, pid)} tấn công mạng tơ: [${ad.join(',')}]=${A} vs Might 4 [${dd.join(',')}]=${D}`);
        if (A > D) {
          d.webTokens++; G.tokens.push({ id: `web-${d.webTokens}`, kind: 'mightRoll', room: trappedRoom(c) });
          log(G, `Đặt token Might Roll (${d.webTokens}/${nPlayers(c)}).`);
          if (d.webTokens >= nPlayers(c)) { d.webDestroyed = true; log(G, `🕸️ Mạng tơ bị phá! ${pname(G, d.trapped)} được tự do di chuyển.`); }
        } else log(G, 'Mạng tơ chịu được (không ai bị sát thương).');
      },
    },
    {
      id: 'eggsKit', label: 'Phá trứng bằng Medical Kit (Knowledge 4+)', side: 'heroes',
      check(c, pid) {
        const d = data(c); if (d.eggsDestroyed) return 'Trứng đã bị phá';
        if (!holds(c.G.players[pid], 'medical-kit')) return 'Cần giữ Medical Kit';
        if (c.G.players[pid].room !== trappedRoom(c)) return 'Phải ở cùng phòng với explorer bị mắc kẹt';
        if (c.G.turn.rollsDone.includes('h4eggs')) return 'Đã thử lượt này';
        return null;
      },
      run(c, pid) {
        c.G.turn.rollsDone.push('h4eggs');
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Phá trứng nhện (Medical Kit)', trait: 'knowledge', outcomes: [{ min: 4, effects: [{ t: 'custom', fn: 'h4Eggs' }] }, { min: 0, max: 3, effects: [] }] } }]);
      },
    },
    {
      id: 'eggsSalve', label: 'Dùng Healing Salve phá trứng', side: 'heroes',
      check(c, pid) {
        const d = data(c); if (d.eggsDestroyed) return 'Trứng đã bị phá';
        if (!holds(c.G.players[pid], 'healing-salve')) return 'Cần giữ Healing Salve';
        if (c.G.players[pid].room !== trappedRoom(c)) return 'Phải ở cùng phòng với explorer bị mắc kẹt';
        return null;
      },
      run(c, pid) { const ref = loseCard(c, pid, 'healing-salve'); if (ref) discardCard(c.G, ref); CUSTOM.h4Eggs(c, pid, {}); },
    },
    {
      id: 'door', label: 'Mở cửa chính (6+)', side: 'heroes',
      options: () => [{ label: 'Knowledge (cạy khoá)', args: { trait: 'knowledge' } }, { label: 'Might (phá khoá)', args: { trait: 'might' } }],
      check(c, pid) {
        const d = data(c); if (!d.webDestroyed || !d.eggsDestroyed) return 'Cần giải thoát explorer bị mắc kẹt và phá trứng trước';
        if (d.doorOpenTurn !== undefined) return 'Cửa đã mở';
        if (c.G.players[pid].room !== 'entrance-hall') return 'Phải ở Entrance Hall';
        return taskBlocked(c);
      },
      run(c, pid, args) {
        c.G.turn.taskDone = true; const trait = args?.trait === 'might' ? 'might' : 'knowledge';
        enqueue(c, pid, [{ t: 'roll', spec: { label: trait === 'might' ? 'Phá khoá cửa chính' : 'Cạy khoá cửa chính', trait, outcomes: [{ min: 6, effects: [{ t: 'custom', fn: 'h4Door' }] }, { min: 0, max: 5, effects: [] }] } }]);
      },
    },
    {
      id: 'exit', label: 'Ra khỏi nhà (1 ô di chuyển)', side: 'heroes',
      check(c, pid) {
        const d = data(c); if (d.doorOpenTurn === undefined) return 'Cửa chính chưa mở';
        if (d.doorOpenTurn === c.G.turnCounter) return 'Từ lượt sau mới ra được';
        if (c.G.players[pid].room !== 'entrance-hall') return 'Phải ở Entrance Hall';
        return canMove(c, pid, 1);
      },
      run(c, pid) { const G = c.G; G.turn.spent += 1; data(c).exited = pid; log(G, `🚪 ${pname(G, pid)} chạy ra khỏi ngôi nhà!`); },
    },
  ],

  replaceDraw(c, pid, kind) {
    const G = c.G; if (kind !== 'item' || G.players[pid].isTraitor) return null;
    return G.decks.item.includes('medical-kit') ? { card: 'medical-kit', optional: true } : null;
  },
  canExplorerMove(c, pid) { const d = data(c); return pid === d.trapped && !d.webDestroyed ? 'Bạn đang mắc trong mạng tơ' : null; },
  canAttackExplorer(c, _attacker, target) { const d = data(c); return target === d.trapped && !d.eggsDestroyed ? 'Không được tấn công người bị mắc trong mạng khi trứng chưa bị phá' : null; },
  onMonsterTurnStart(c) {
    const G = c.G; const m = spider(c); if (!m) return;
    if (m.stunned) { log(G, 'Nhện đang choáng, bỏ lượt.'); (G.turn as Record<string, unknown>)[`mv:${SPIDER}`] = 0; return; }
    const dice = rollDice(c.rng, m.traits.speed ?? 0, { who: c.G.haunt?.traitor ?? undefined, label: 'Nhện: di chuyển', reason: diceReason('Speed', m.traits.speed ?? 0) }); const t = sum(dice);
    (G.turn as Record<string, unknown>)[`mv:${SPIDER}`] = Math.max(1, t);
    log(G, `🎲 Nhện tung di chuyển (Speed ${m.traits.speed}): [${dice.join(',')}] = ${t}${t < 1 ? ' → vẫn đi được 1 ô' : ''}`);
  },
  onMonsterAttackRoll(c, _mid, dice) {
    const blanks = dice.filter((x) => x === 0).length; if (!blanks) return dice;
    const re = rollDice(c.rng, blanks, { who: c.G.haunt?.traitor ?? undefined, label: 'Nhện đổ lại xúc xắc trắng', reason: `${blanks} xúc xắc` }); let k = 0; const out = dice.map((x) => (x === 0 ? re[k++] : x));
    log(c.G, `Nhện đổ lại ${blanks} xúc xắc trắng: [${dice.join(',')}] → [${out.join(',')}]`); return out;
  },
  canEndMonsterTurn(c) {
    const G = c.G; const m = spider(c); if (!m || m.stunned) return null;
    const d = data(c); const targets = heroes(c).filter((o) => G.players[o].room === m.room && (o !== d.trapped || d.eggsDestroyed));
    if (targets.length && !(G.turn as Record<string, unknown>)[`att:${SPIDER}`]) return 'Nhện bắt buộc tấn công nếu có thể';
    return null;
  },
  onMonsterTurnEnd(c) {
    const d = data(c); d.track++; setStats(c);
    log(c.G, `⏳ Thanh Turn/Damage → ${d.track}${d.track >= 9 ? '' : ` (Nhện: Speed ${spider(c)?.traits.speed}, Might ${spider(c)?.traits.might})`}.`);
  },
  status(G) {
    const d = G.haunt!.data as unknown as D;
    return [['Turn/Damage', d.eggsDestroyed ? `${d.track} (trứng đã phá — không còn mốc 9)` : `${d.track}/9`], ['Mạng tơ', d.webDestroyed ? 'đã phá' : `${d.webTokens}/${G.order.length} token`], ['Trứng', d.eggsDestroyed ? 'đã phá' : 'còn'], ['Cửa chính', d.doorOpenTurn !== undefined ? 'đã mở' : 'đóng']];
  },
  botTarget(c, pid) {
    const d = data(c);
    if (!d.webDestroyed || (!d.eggsDestroyed && (holds(c.G.players[pid], 'medical-kit') || holds(c.G.players[pid], 'healing-salve')))) return trappedRoom(c);
    if (d.webDestroyed && d.eggsDestroyed) return 'entrance-hall';
    return null;
  },
  checkWin(c) {
    const G = c.G; const d = data(c); const hs = livingExplorers(G).filter((o) => !G.players[o].isTraitor);
    if (d.exited) return { winner: 'heroes', text: 'Phủi mạng nhện khỏi mắt, bạn loạng choạng ra khỏi trang viên. Ngoảnh lại, bạn thấy ánh sáng chập chờn từ một ô cửa sổ trên cao… rồi một cử động… rồi một cái nữa. Đi thôi — ngay bây giờ.' };
    if (!hs.length) return { winner: 'traitor', text: 'Mọi anh hùng đã chết. Lũ nhện con no nê bữa tiệc người.' };
    if (d.track >= 9 && !d.eggsDestroyed) return { winner: 'traitor', text: 'Trứng nở! Lũ con của bạn ăn ngấu nghiến những con người ngon lành.' };
    return null;
  },
};

CUSTOM.h4Eggs = (c, pid) => {
  const d = data(c); d.eggsDestroyed = true; d.noSkull = [];
  log(c.G, `🥚 ${pname(c.G, pid)} đã phá huỷ trứng nhện trong người ${pname(c.G, d.trapped)}!`);
};
CUSTOM.h4Door = (c, pid) => {
  const G = c.G; data(c).doorOpenTurn = G.turnCounter; G.turn.forceEnd = true;
  log(G, `🔓 ${pname(G, pid)} mở được cửa chính! Rút 1 Event và kết thúc lượt. Từ lượt sau, anh hùng có thể ra khỏi nhà từ Entrance Hall.`);
  enqueue(c, pid, [{ t: 'draw', kind: 'event' }], true);
};
void tokensIn;
