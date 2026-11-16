// Haunt #38 "Hellbeasts" — Betrayal at House on the Hill, 2nd edition.
// Verified from the official Traitor's Tome (Hasbro F3148 rules PDF p.33, right half) and Secrets of Survival (p.61, right half).
// Haunt chart traitor column: "Lowest Knowledge (except for the haunt revealer)". Text is paraphrased in Vietnamese.
import type { HauntModule } from './types';
import type { Ctx } from '../engine/core';
import { log, pname, rollDice, sum, holds, cardName } from '../engine/core';
import { roomName } from '../engine/house';
import { CUSTOM, enqueue, requestDamage } from '../engine/effects';
import type { Trait } from '../engine/types';
import { byTrait, heroes, heroesIn, nPlayers, monstersOf, addMonster, rollGroupMovement } from './common';

interface D { count: number; used: string[]; successes: number }
const data = (c: Ctx) => c.G.haunt!.data as unknown as D;
const bats = (c: Ctx) => monstersOf(c, 'firebat');
const ROOMS: Record<string, Trait> = { chapel: 'sanity', crypt: 'sanity', 'pentagram-chamber': 'sanity', library: 'knowledge', 'research-laboratory': 'knowledge' };
const ITEMS: Record<string, Trait> = { 'holy-symbol': 'sanity', ring: 'sanity', book: 'knowledge', 'crystal-ball': 'knowledge' };
function newBat(c: Ctx, born?: number) {
  const d = data(c); d.count++;
  addMonster(c, { id: `firebat${d.count}`, name: `Firebat ${d.count}`, room: c.G.haunt!.revealRoom, traits: { speed: 3 }, kind: 'firebat', noAttack: true, untargetable: true, noSlow: true, ...(born !== undefined ? { bornTurn: born } : {}) });
}
function sources(c: Ctx, pid: string) {
  const G = c.G; const p = G.players[pid]; const d = data(c); const out: { label: string; args: Record<string, unknown> }[] = [];
  if (ROOMS[p.room] && !d.used.includes(p.room)) out.push({ label: `${roomName(p.room)} (${ROOMS[p.room] === 'sanity' ? 'Sanity' : 'Knowledge'} 5+)`, args: { src: p.room } });
  for (const [id, t] of Object.entries(ITEMS)) if (holds(p, id) && !d.used.includes(id)) out.push({ label: `${cardName(id)} (${t === 'sanity' ? 'Sanity' : 'Knowledge'} 5+)`, args: { src: id } });
  return out;
}

export const hellbeasts: HauntModule = {
  number: 38,
  name: 'Hellbeasts',
  edition: '2nd edition (Avalon Hill / Hasbro, F3148 — 2020 printing)',
  source: "Traitor's Tome p.33 (R) & Secrets of Survival p.61 (R) — Hasbro F3148 rules PDF",
  traitorRule: (c, revealer) => byTrait(c, revealer, 'knowledge', 'lowest', true),
  art: { art: 'firebats', monsterName: 'Bầy Dơi Lửa' },

  traitorText: `QUÁI THÚ ĐỊA NGỤC (bạn là kẻ phản bội)
Dơi Lửa là lũ kén chọn: chúng chỉ ra ngoài vào ban đêm và không thể sinh sôi nếu không uống máu người. Nhưng chúng dễ thương, và là thú cưng của bạn. Bạn đã mang tới những con người chúng cần.

NGAY BÂY GIỜ
• Nhân vật của bạn vẫn trong game nhưng đã thành kẻ phản bội.
• Đặt số token Dơi Lửa bằng một nửa số người chơi (làm tròn lên) vào phòng nơi Haunt được lật.

ĐIỀU BẠN BIẾT VỀ CÁC ANH HÙNG: máu của họ là thứ Dơi Lửa cần để sinh sản. Họ sẽ tìm cách ngăn bạn.

BẠN THẮNG KHI… mọi anh hùng đều chết.

BẠN PHẢI LÀM: khi tung số ô di chuyển của Dơi Lửa ở lượt quái vật, đặt thêm số Dơi Lửa bằng kết quả tung vào phòng nơi Haunt được lật. Dơi Lửa không thể di chuyển ở lượt chúng xuất hiện.

LUẬT TẤN CÔNG ĐẶC BIỆT
• Dơi Lửa không thể tấn công và không thể bị tấn công.
• Sau khi di chuyển hết Dơi Lửa, mỗi phòng có anh hùng: đổ 1 xúc xắc cho mỗi Dơi Lửa trong phòng. Mọi anh hùng trong phòng đó chịu sát thương thể chất bằng kết quả (Armor chỉ chặn được 1 điểm).
• Dơi Lửa không làm chậm anh hùng đi qua phòng của chúng.

DƠI LỬA — Speed 3`,

  heroText: `QUÁI THÚ ĐỊA NGỤC (bạn là anh hùng)
Một vệt đỏ vụt qua khoé mắt. Rồi thêm một, rồi một nữa: những con dơi rực lửa vỗ cánh quanh bạn, sức nóng làm cháy sém tóc. Một người bạn cười khoái trá trong khi những người khác hét lên kinh hoàng.

ĐIỀU BẠN BIẾT VỀ PHE ÁC: kẻ phản bội điều khiển bầy Dơi Lửa và muốn tất cả các bạn chết. Dơi Lửa không thể tấn công, nhưng sẽ thiêu bạn nếu bạn ở cùng phòng với chúng.

BẠN THẮNG KHI… làm lễ trừ tà xua Dơi Lửa khỏi ngôi nhà.

LÀM LỄ TRỪ TÀ
Cần số lần trừ tà thành công bằng số người chơi. Mỗi lần cần một phòng hoặc một Item cụ thể và một lần đổ Sanity hoặc Knowledge. Mỗi lượt bạn chỉ được đổ trừ tà 1 lần.
• Sanity 5+: khi ở Chapel, Crypt hoặc Pentagram Chamber, hoặc khi mang Holy Symbol hoặc Ring.
• Knowledge 5+: khi ở Library hoặc Research Laboratory, hoặc khi mang Book hoặc Crystal Ball.
Mỗi lần thành công, đặt token lên phòng hoặc Item đã dùng: từ đó không anh hùng nào dùng lại phòng/Item đó để trừ tà nữa. Khi số token bằng số người chơi, Dơi Lửa bị xua đi.

LUẬT ĐẶC BIỆT: Dơi Lửa không thể tấn công hay bị tấn công, không làm chậm anh hùng. Kẻ phản bội sẽ cho bạn biết bạn chịu bao nhiêu sát thương khi ở cùng phòng với Dơi Lửa.`,

  gaps: [
    'Một phòng có hơn 8 Dơi Lửa: bản web đổ tối đa 8 xúc xắc (giới hạn chung của rulebook) — sách Haunt không nói riêng.',
    'Kẻ phản bội có bị Dơi Lửa thiêu không: sách chỉ nói "mọi anh hùng trong phòng" — bản web không thiêu kẻ phản bội.',
    'Sát thương thiêu được tính khi kẻ phản bội bấm "Kết thúc lượt quái vật" (sau khi đã di chuyển xong mọi Dơi Lửa).',
  ],

  setup(c, h) {
    h.data = { count: 0, used: [], successes: 0 } as unknown as Record<string, unknown>;
    const n = Math.ceil(nPlayers(c) / 2); for (let i = 0; i < n; i++) newBat(c);
    log(c.G, `🦇 ${n} Dơi Lửa xuất hiện tại ${roomName(h.revealRoom)}.`);
  },

  actions: [
    {
      id: 'exorcise', label: 'Trừ tà', side: 'heroes',
      options: (c, pid) => sources(c, pid),
      check(c) { return c.G.turn.rollsDone.includes('h38exo') ? 'Mỗi lượt chỉ đổ trừ tà 1 lần' : null; },
      run(c, pid, args) {
        const src = args!.src as string; const trait = ROOMS[src] ?? ITEMS[src]; c.G.turn.rollsDone.push('h38exo');
        enqueue(c, pid, [{ t: 'roll', spec: { label: `Trừ tà (${ROOMS[src] ? roomName(src) : cardName(src)})`, trait, outcomes: [{ min: 5, effects: [{ t: 'custom', fn: 'h38Exo', args: { src } }] }, { min: 0, max: 4, effects: [] }] } }]);
      },
    },
  ],

  onMonsterTurnStart(c) {
    const G = c.G; const t = rollGroupMovement(c, 'firebat', 'Dơi Lửa');
    if (!bats(c).length) { // no bats left on the board: still roll for spawning (the roll decides the new Firebats)
      const d = rollDice(c.rng, 3, { who: c.G.haunt?.traitor ?? undefined, label: 'Dơi Lửa: di chuyển / sinh thêm', reason: 'Speed 3 → 3 xúc xắc' }); const tt = sum(d); log(G, `🎲 Dơi Lửa tung (Speed 3): [${d.join(',')}] = ${tt}`);
      for (let i = 0; i < tt; i++) newBat(c, G.turnCounter);
      if (tt) log(G, `🦇 ${tt} Dơi Lửa mới xuất hiện tại ${roomName(G.haunt!.revealRoom)} (không di chuyển lượt này).`);
      return;
    }
    for (let i = 0; i < t; i++) newBat(c, G.turnCounter);
    for (const m of bats(c)) if (m.bornTurn === G.turnCounter) (G.turn as Record<string, unknown>)[`mv:${m.id}`] = 0;
    if (t) log(G, `🦇 ${t} Dơi Lửa mới xuất hiện tại ${roomName(G.haunt!.revealRoom)} (không di chuyển lượt này).`);
  },
  onMonsterTurnEnd(c) {
    const G = c.G; const rooms = [...new Set(bats(c).map((m) => m.room))];
    for (const r of rooms) {
      const hs = heroesIn(c, r); if (!hs.length) continue;
      const n = bats(c).filter((m) => m.room === r).length; const dice = rollDice(c.rng, Math.min(8, n), { who: c.G.haunt?.traitor ?? undefined, label: `Dơi Lửa thiêu ${roomName(r)}`, reason: `${n} Dơi Lửa → ${Math.min(8, n)} xúc xắc` }); const dmg = sum(dice);
      log(G, `🔥 ${n} Dơi Lửa thiêu ${roomName(r)}: [${dice.join(',')}] = ${dmg} sát thương thể chất cho mỗi anh hùng trong phòng.`);
      if (dmg > 0) for (const o of hs) requestDamage(c, o, 'physical', dmg, 'Dơi Lửa');
    }
  },
  status(G) {
    const d = G.haunt!.data as unknown as D;
    return [['Dơi Lửa', String(G.monsters.filter((m) => m.kind === 'firebat').length)], ['Trừ tà', `${d.successes}/${G.order.length}`], ['Đã dùng', d.used.map((x) => (ROOMS[x] ? roomName(x) : cardName(x))).join(', ') || '—']];
  },
  botTarget(c, pid) {
    const G = c.G; if (G.players[pid].isTraitor) return null; const d = data(c);
    const free = Object.keys(ROOMS).filter((r) => G.rooms[r] && !d.used.includes(r));
    return free[0] ?? null;
  },
  checkWin(c) {
    const d = data(c);
    if (d.successes >= nPlayers(c)) return { winner: 'heroes', text: 'Lũ dơi biến mất, trở về địa ngục đã sinh ra chúng. Ngôi nhà còn âm ỉ khói, mùi thịt cháy khiến bạn quặn ruột. Bạn loạng choạng rời trang viên, thề không bao giờ quay lại.' };
    if (!heroes(c).length) return { winner: 'traitor', text: 'Lũ dơi con hút máu những con người nằm rải rác khắp trang viên. Vòng đời… còn gì đẹp hơn?' };
    return null;
  },
};

CUSTOM.h38Exo = (c, pid, a) => {
  const d = data(c); const src = a.src as string; d.used.push(src); d.successes++;
  log(c.G, `✝️ ${pname(c.G, pid)} trừ tà thành công bằng ${ROOMS[src] ? roomName(src) : cardName(src)} (${d.successes}/${nPlayers(c)}).`);
};
