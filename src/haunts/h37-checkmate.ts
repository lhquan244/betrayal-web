// Haunt #37 "Checkmate" — Betrayal at House on the Hill, 2nd edition.
// Verified from the official Traitor's Tome (Hasbro F3148 rules PDF p.33, left half) and Secrets of Survival (p.61, left half).
// Haunt chart traitor column: "Lowest Might". Text is paraphrased in Vietnamese.
import type { HauntModule } from './types';
import type { Ctx } from '../engine/core';
import { log, pname, rollDice, sum, traitValue, holds, shiftTrait } from '../engine/core';
import { roomName, tokensIn } from '../engine/house';
import { CUSTOM, CUSTOM_ROLLS, enqueue } from '../engine/effects';
import type { Effect } from '../engine/types';
import { byTrait, heroes, heroesIn, nPlayers, addMonster } from './common';

const DEATH = 'death';
const SEAL_ROOMS = ['vault', 'crypt', 'research-laboratory', 'operating-laboratory', 'game-room'];
interface D { deathRoom: string; seeded: string[]; held: Record<string, number>; broken: number; deathTotal?: number; opponent?: string; forfeit?: boolean; won?: boolean; placed: boolean }
const data = (c: Ctx) => c.G.haunt!.data as unknown as D;
const death = (c: Ctx) => c.G.monsters.find((m) => m.id === DEATH);
const deathDice = (c: Ctx) => Math.max(0, 8 - data(c).broken * (nPlayers(c) <= 4 ? 2 : 1));
function seed(c: Ctx) {
  const d = data(c);
  for (const r of SEAL_ROOMS) if (c.G.rooms[r] && !d.seeded.includes(r)) { d.seeded.push(r); c.G.tokens.push({ id: `seal-${r}`, kind: 'holySeal', room: r }); }
}

export const checkmate: HauntModule = {
  number: 37,
  name: 'Checkmate',
  edition: '2nd edition (Avalon Hill / Hasbro, F3148 — 2020 printing)',
  source: "Traitor's Tome p.33 (L) & Secrets of Survival p.61 (L) — Hasbro F3148 rules PDF",
  traitorRule: (c, revealer) => byTrait(c, revealer, 'might', 'lowest', false),
  art: { art: 'death', monsterName: 'Death' },

  traitorText: `CHIẾU BÍ (bạn là kẻ phản bội)
Nhật ký của chú Ebenezer viết rằng ông đã tìm ra cách triệu hồi chính Thần Chết để thách đấu. Bộ xương ông ta vẫn ngồi cạnh bàn cờ. Lũ ngốc kia chẳng làm tốt hơn đâu — và bạn sẽ đảm bảo điều đó.

NGAY BÂY GIỜ
• Nhân vật của bạn vẫn trong game nhưng đã thành kẻ phản bội.
• Đặt token Death vào cùng phòng với một anh hùng do bạn chọn.
• 5 token Holy Seal được đặt ở Vault, Crypt, Research Laboratory, Operating Laboratory và Game Room — ngay bây giờ hoặc khi các phòng đó được khám phá. Anh hùng chỉ biết là có 5 Holy Seal.

ĐIỀU BẠN BIẾT VỀ CÁC ANH HÙNG: một người sẽ đánh cờ với Thần Chết, dùng Holy Seal để giúp sức. Chỉ cần thắng Thần Chết một lần, bạn thua.

BẠN THẮNG KHI… mọi anh hùng đều chết, HOẶC đầu lượt quái vật không có anh hùng nào ở phòng có Death (anh hùng bỏ cuộc).

DEATH PHẢI LÀM trong lượt quái vật: đánh cờ với explorer có Knowledge cao nhất trong phòng. Hai bên đổ Knowledge, nhưng Death ăn gian: sau lần đổ đầu tiên, nó đổ lại mọi xúc xắc ra mặt trắng (một lần). Hoà: không có gì. Death cao hơn:
• hơn 1–2: Tốt — mỗi anh hùng mất 1 Sanity.
• hơn 3–4: Quân lớn — mỗi anh hùng mất 1 Might.
• hơn 5+: "Chiếu." — mỗi anh hùng mất 1 Sanity và 1 Might.

LUẬT ĐẶC BIỆT
• Death không thể tấn công hay bị ảnh hưởng theo bất kỳ cách nào ngoài việc thua cờ.
• Bạn không thể vào phòng có Death hay ảnh hưởng tới anh hùng ở đó (kể cả Bell, Revolver, Dynamite). Bạn không thể nhặt Holy Seal nhưng có thể cướp chúng từ anh hùng.

DEATH — Knowledge 8`,

  heroText: `CHIẾU BÍ (bạn là anh hùng)
Nét chữ trong cuốn nhật ký cũ: "Ta, Ebenezer Slocum, đã tìm ra cách buộc chính Thần Chết hiện ra trước mặt ta…". Thi thể gục bên bàn cờ vỡ vụn thành bụi khi bạn chạm vào. Bên kia bàn, một bóng đen hiện ra và chỉ tay về phía một người trong các bạn.

ĐIỀU BẠN BIẾT VỀ PHE ÁC: Thần Chết thách các bạn đánh cờ. Nếu đầu lượt quái vật không có ai trong phòng để đánh với Death, các anh hùng bỏ cuộc và thua.

BẠN THẮNG KHI… chiếu bí Death: có kết quả Knowledge cao hơn nó. Mỗi lượt của Death, một anh hùng cùng phòng đổ lần này.

CÁCH THẮNG THẦN CHẾT
• Anh hùng có thể nhặt token Holy Seal. Đang giữ Holy Seal thì có thể đổ Sanity 4+ để phá nó (mỗi lượt chỉ phá được 1). Mỗi Holy Seal bị phá, Death đổ ít đi 1 xúc xắc ở các lần đổ Knowledge sau (3–4 người chơi: ít đi 2).
• Book có chiến thuật cờ: người đang đánh cờ với Death mà mang Book thì được +1 xúc xắc Knowledge (tối đa 8).

LUẬT ĐẶC BIỆT: Death không thể tấn công hay bị ảnh hưởng ngoài việc thua cờ. Death không làm chậm anh hùng.`,

  ttConflicts: [
    'Ai đánh cờ với Death: TT (tr.33) ghi "Death đánh cờ với explorer trong phòng có Knowledge cao nhất"; SoS (tr.61) ghi "một trong các anh hùng có thể đổ". Theo TT: luôn là người có Knowledge cao nhất trong phòng Death (anh hùng không được tự chọn người khác).',
  ],
  gaps: [
    'Hoà Knowledge cao nhất trong phòng Death: sách không nói ai đánh — bản web cho các anh hùng hoà nhau chọn (người đầu tiên theo thứ tự lượt chọn).',
    'Anh hùng giữ Holy Seal mà chết: sách không nói — bản web đánh rơi Holy Seal tại phòng đó (như Item), anh hùng khác nhặt lại được.',
    'Nếu kẻ phản bội đã đứng sẵn trong phòng được chọn đặt Death: sách chỉ cấm "vào" — bản web cho phép đứng yên nhưng vẫn cấm ảnh hưởng anh hùng ở đó.',
    'Holy Seal kẻ phản bội cướp được: bản web giữ trên kẻ phản bội (không phá được, không mất đi).',
    'Nhặt Holy Seal được coi như nhặt Item (không tốn hành động).',
  ],

  setup(c, h) {
    const G = c.G; h.data = { deathRoom: '', seeded: [], held: {}, broken: 0, placed: false } as unknown as Record<string, unknown>;
    seed(c);
    log(G, 'Có 5 Holy Seal trong nhà (đặt dần khi các phòng được khám phá).');
    const rooms = [...new Set(heroes(c).map((o) => G.players[o].room))];
    G.pending.push({ type: 'pickRoom', player: h.traitor!, prompt: 'Đặt Death vào cùng phòng với một anh hùng', rooms, then: [], varName: 'custom:h37Place' });
  },

  actions: [
    {
      id: 'pick', label: 'Nhặt Holy Seal', side: 'heroes',
      check(c, pid) { return tokensIn(c.G, c.G.players[pid].room, 'holySeal').length ? null : 'Không có Holy Seal ở đây'; },
      run(c, pid) {
        const G = c.G; const t = tokensIn(G, G.players[pid].room, 'holySeal')[0]; G.tokens = G.tokens.filter((x) => x !== t);
        const d = data(c); d.held[pid] = (d.held[pid] ?? 0) + 1; log(G, `${pname(G, pid)} nhặt 1 Holy Seal.`);
      },
    },
    {
      id: 'break', label: 'Phá Holy Seal (Sanity 4+)', side: 'heroes',
      check(c, pid) {
        if (!(data(c).held[pid] > 0)) return 'Không giữ Holy Seal';
        if (c.G.turn.rollsDone.includes('h37break')) return 'Mỗi lượt chỉ phá 1 Holy Seal';
        return null;
      },
      run(c, pid) {
        c.G.turn.rollsDone.push('h37break');
        enqueue(c, pid, [{ t: 'roll', spec: { label: 'Phá Holy Seal', trait: 'sanity', outcomes: [{ min: 4, effects: [{ t: 'custom', fn: 'h37Break' }] }, { min: 0, max: 3, effects: [] }] } }]);
      },
    },
  ],

  onEnterRoom(c) { seed(c); },
  canEnterRoom(c, who, room) {
    const G = c.G; if (who.pid && who.pid === G.haunt!.traitor && room === data(c).deathRoom) return 'Kẻ phản bội không thể vào phòng có Death';
    return null;
  },
  canAttackExplorer(c, attacker, target) {
    const G = c.G; if (attacker === G.haunt!.traitor && G.players[target].room === data(c).deathRoom) return 'Không thể ảnh hưởng anh hùng ở phòng có Death';
    return null;
  },
  stealExtras(c, _thief, victim) { return data(c).held[victim] > 0 ? [{ id: 'seal', label: 'Cướp 1 Holy Seal' }] : []; },
  onStealExtra(c, thief, victim) {
    const d = data(c); d.held[victim]--; d.held[thief] = (d.held[thief] ?? 0) + 1;
    log(c.G, `${pname(c.G, thief)} cướp 1 Holy Seal của ${pname(c.G, victim)}.`);
  },
  onMonsterTurnStart(c) {
    const G = c.G; const d = data(c); if (!d.placed) return;
    const here = heroesIn(c, d.deathRoom);
    if (!here.length) { d.forfeit = true; log(G, '♟️ Đầu lượt quái vật không có anh hùng nào ở phòng Death — các anh hùng bỏ cuộc!'); return; }
    const best = Math.max(...here.map((o) => traitValue(G.players[o], 'knowledge')));
    const tied = here.filter((o) => traitValue(G.players[o], 'knowledge') === best);
    if (tied.length === 1) CUSTOM.h37Chess(c, tied[0], { pid: tied[0] });
    else G.pending.push({ type: 'choice', player: tied[0], prompt: 'Nhiều anh hùng cùng Knowledge cao nhất: ai đánh cờ với Death?', options: tied.map((o) => ({ label: pname(G, o), effects: [{ t: 'custom', fn: 'h37Chess', args: { pid: o } }] as Effect[] })) });
  },
  canEndMonsterTurn(c) { const d = data(c); return d.opponent ? 'Ván cờ chưa xong' : null; },
  status(G) {
    const d = G.haunt!.data as unknown as D; const held = Object.entries(d.held).filter(([, n]) => n > 0).map(([p, n]) => `${G.players[p].name}: ${n}`).join(', ');
    return [['Death ở', d.deathRoom ? roomName(d.deathRoom) : '—'], ['Holy Seal đã phá', String(d.broken)], ['Death đổ', `${Math.max(0, 8 - d.broken * (G.order.length <= 4 ? 2 : 1))} xúc xắc`], ['Đang giữ Seal', held || '—']];
  },
  botTarget(c, pid) {
    const G = c.G; const d = data(c); if (G.players[pid].isTraitor) return null;
    if (!(d.held[pid] > 0)) { const t = G.tokens.find((x) => x.kind === 'holySeal'); if (t && heroesIn(c, d.deathRoom).length > 1) return t.room; }
    return d.deathRoom || null;
  },
  checkWin(c) {
    const d = data(c);
    for (const [p, n] of Object.entries(d.held)) if (n > 0 && c.G.players[p].dead) { // dead hero drops carried seals (see gaps)
      for (let i = 0; i < n; i++) c.G.tokens.push({ id: `seal-drop-${p}-${c.G.log.length}-${i}`, kind: 'holySeal', room: c.G.players[p].room });
      d.held[p] = 0; log(c.G, `${n} Holy Seal rơi tại ${roomName(c.G.players[p].room)}.`);
    }
    if (d.won) return { winner: 'heroes', text: '"Chiếu bí." Thần Chết nhìn chằm chằm vào quân Vua rồi bắt đầu vỡ vụn thành bụi. Nó mỉm cười, và bạn thấy tóc mình bạc trắng. "Hẹn lần sau."' };
    if (d.placed && !heroes(c).length) return { winner: 'traitor', text: 'Mọi anh hùng đã chết. Chiếu bí.' };
    if (d.forfeit) return { winner: 'traitor', text: 'Không ai ngồi vào bàn cờ — các anh hùng bỏ cuộc. Ha! Lũ ngốc. Chiếu bí.' };
    return null;
  },
};

CUSTOM.h37Place = (c, _tr, a) => {
  const G = c.G; const d = data(c); const room = a.room as string; d.deathRoom = room; d.placed = true;
  addMonster(c, { id: DEATH, name: 'Death', room, traits: { knowledge: 8 }, kind: 'death', noMove: true, noAttack: true, noSlow: true, untargetable: true });
  log(G, `💀 Thần Chết ngồi vào bàn cờ tại ${roomName(room)}.`);
};
CUSTOM.h37Break = (c, pid) => {
  const d = data(c); d.held[pid]--; d.broken++;
  log(c.G, `✨ ${pname(c.G, pid)} phá 1 Holy Seal! Death giờ đổ ${deathDice(c)} xúc xắc.`);
};
CUSTOM_ROLLS.h37Chess = { label: 'Death đánh cờ (Knowledge)', who: (c) => c.G.haunt?.traitor ?? '0' };
CUSTOM.h37Chess = (c, _x, a) => {
  const G = c.G; const d = data(c); const pid = a.pid as string; d.opponent = pid;
  let dice = rollDice(c.rng, deathDice(c), { who: c.G.haunt?.traitor ?? undefined, label: 'Death đánh cờ (Knowledge)', reason: `Knowledge 8 → ${deathDice(c)} xúc xắc (trừ Holy Seal đã phá)` }); const blanks = dice.filter((x) => x === 0).length;
  const first = [...dice];
  if (blanks) { const re = rollDice(c.rng, blanks, { who: c.G.haunt?.traitor ?? undefined, label: 'Death ăn gian: đổ lại xúc xắc trắng', reason: `${blanks} xúc xắc` }); let k = 0; dice = dice.map((x) => (x === 0 ? re[k++] : x)); }
  d.deathTotal = sum(dice);
  log(G, `♟️ Death đổ Knowledge (${first.length} xúc xắc): [${first.join(',')}]${blanks ? ` → ăn gian đổ lại mặt trắng: [${dice.join(',')}]` : ''} = ${d.deathTotal}. ${pname(G, pid)} đánh cờ.`);
  const book = holds(G.players[pid], 'book') ? 1 : 0; // max 8 dice is enforced by the dice engine
  enqueue(c, pid, [{ t: 'roll', spec: { label: `Đánh cờ với Death${book ? ' (+1 xúc xắc nhờ Book)' : ''}`, trait: 'knowledge', ...(book ? { bonusDice: 1 } : {}),
    outcomes: Array.from({ length: 41 }, (_, k) => ({ min: k, max: k === 40 ? undefined : k, effects: [{ t: 'custom', fn: 'h37Result', args: { total: k } }] as Effect[] })) } }]);
};
CUSTOM.h37Result = (c, pid, a) => {
  const G = c.G; const d = data(c); const total = a.total as number; const dt = d.deathTotal ?? 0; d.opponent = undefined;
  if (total > dt) { d.won = true; log(G, `♛ ${pname(G, pid)} (${total}) thắng Death (${dt})!`); return; }
  if (total === dt) { log(G, `Hoà (${total}) — không có gì xảy ra.`); return; }
  const diff = dt - total; log(G, `Death (${dt}) hơn ${pname(G, pid)} (${total}) ${diff} điểm.`);
  for (const o of heroes(c)) {
    if (diff <= 2) shiftTrait(G, o, 'sanity', -1);
    else if (diff <= 4) shiftTrait(G, o, 'might', -1);
    else { shiftTrait(G, o, 'sanity', -1); if (!G.players[o].dead) shiftTrait(G, o, 'might', -1); }
  }
};
