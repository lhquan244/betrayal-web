# Betrayal at House on the Hill — bản web chơi riêng (2nd edition)

Bản prototype chạy trên web để chơi **riêng tư với bạn bè**. Luật theo **Betrayal at House on the Hill, phiên bản 2 (2nd edition, Avalon Hill/Hasbro, mã F3148)** và chỉ dùng một phiên bản đó.
Haunt đã cài (6, đều là haunt chính thức theo sách bản 2): **#1 The Mummy Walks · #4 The Web of Destiny · #26 Pay the Piper · #37 Checkmate · #38 Hellbeasts · #40 Buried Alive**. Xem mục 7.

> Đây là bản fan làm để chơi riêng. Chữ trên lá bài và trong sách haunt đã được **diễn giải lại (paraphrase) bằng tiếng Việt**, không phải bản dịch nguyên văn. Mọi bản quyền thuộc Avalon Hill/Hasbro. Đừng phát hành công khai.

## 1. Chạy trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run server      # server game boardgame.io + lobby API ở cổng 8000
npm run dev         # giao diện Vite ở http://localhost:5173 (tự gọi server :8000)
```

Mở `http://localhost:5173`:
- **Chơi online**: nhập tên, chọn 3–6 người, bấm **Tạo phòng** rồi gửi link cho bạn bè. Bạn bè mở cùng địa chỉ, nhập tên và bấm **Vào** ở phòng đang chờ.
  - Mặc định haunt được chọn theo **bảng Haunt** như bản giấy. Ô "House rule: luôn dùng Haunt [chọn số]" là tuỳ chọn ngoài luật gốc, để ép một haunt đã cài.
- **Hotseat**: mọi người chơi chung một máy. Giao diện tự chuyển sang người đang phải quyết định, và có thể chọn tay ở góc trên.

Các lệnh khác:

```bash
npx tsx scripts/fuzz.ts <haunt> <số ván> [seed đầu] [chaos]   # fuzz engine: bot + nước đi ngẫu nhiên, kiểm tra bất biến sau mỗi nước
npm test            # vitest: khớp cửa, haunt roll, từng haunt (#1 #4 #26 #37 #38 #40), mô phỏng cả ván + ép từng haunt, wrapper boardgame.io
npm run simulate    # mô phỏng 20 ván bằng bot (mỗi dòng in ra pha, haunt, bên thắng)
npx tsx scripts/simulate.ts --haunt 38   # 20 ván bot, ép Haunt #38 (thay số khác tuỳ ý)
npm run build       # kiểm tra kiểu (tsc) + build frontend vào dist/
npm start           # MỘT server Node duy nhất: game + lobby + phục vụ dist/ (cổng $PORT, mặc định 8000)
npx tsx scripts/online-demo.ts   # 3 bot chơi online thật qua socket.io cho tới khi Haunt bắt đầu
```

Xúc xắc luôn được tung **trên server** bằng PRNG của boardgame.io (`random.D6`). Client không tự tung. Thứ tự chồng phòng và bộ bài được giấu khỏi client (`playerView` sắp xếp lại theo bảng chữ cái). Dòng log riêng tư, như kết quả xem trước lá bài, chỉ gửi cho đúng người.

### Chế độ demo (tự chơi)
Mở `http://localhost:5173/?demo=demo-64` rồi bấm **Bắt đầu hotseat**: 4 bot tự chơi một ván mẫu (seed cố định của boardgame.io), có dừng để người xem theo dõi. Thêm `&speed=2` để chạy nhanh gấp đôi.
- `src/client/demoBot.ts` chỉ chọn nước đi hợp lệ từ engine, không đổi luật.
- `npx tsx scripts/demo-seeds.ts 1 100` dùng để tìm seed có Haunt đến sớm.

## 2. Triển khai (deploy)

### Cách A: một server Node (đơn giản nhất)
```bash
npm ci && npm run build && PORT=8000 npm start
```
Server phục vụ cả web (`dist/`) lẫn API/socket. Có thể chạy trên VPS bất kỳ, Fly.io, Railway hoặc Render. Bạn bè chỉ cần mở `https://ten-mien-cua-ban`.
- **Fly.io**: `fly launch` (Node), đặt lệnh build `npm run build`, lệnh chạy `npm start`, `internal_port = 8000`.
- **Railway**: tạo service từ repo, Build Command `npm run build`, Start Command `npm start`. Railway tự cấp `PORT`.

### Cách B: tách frontend (Vercel) và server (Fly.io/Railway)
1. Deploy server như cách A (không cần `dist/`).
2. Trên Vercel: framework Vite, build `npm run build`, output `dist`, biến môi trường `VITE_SERVER=https://server-cua-ban.fly.dev`.
3. Trên server, đặt thêm `ALLOWED_ORIGINS=https://app-cua-ban.vercel.app` nếu muốn siết CORS.
   - Lưu ý: bản prototype hiện cho phép mọi origin để dễ chơi riêng.

Trạng thái ván được giữ trong bộ nhớ server, nên khởi động lại server là mất ván. Muốn lưu lâu dài thì dùng storage của boardgame.io (ví dụ FlatFile hoặc Postgres adapter).

## 3. Cấu trúc mã

```
src/
  engine/            # luật thuần TypeScript, không phụ thuộc UI
    types.ts         # kiểu dữ liệu: GState, Effect, Pending…
    core.ts          # xúc xắc (mặt 0,0,1,1,2,2), thanh chỉ số, chết
    house.ts         # 3 tầng, đặt phòng/xoay khớp cửa, cầu thang, lối đi, khoảng cách, tầm nhìn
    effects.ts       # trình thông dịch hiệu ứng lá bài (data-driven) + quyết định chờ người chơi
    rules.ts         # lượt, di chuyển, khám phá, phòng đặc biệt, item/omen, combat, haunt roll, chọn haunt, quái vật
    game.ts          # bọc boardgame.io: moves, playerView, endIf
  data/              # dữ liệu chép từ game thật
    characters.ts    # 12 nhân vật + thanh chỉ số thật
    rooms.ts         # 42 lá phòng rút được (tầng, cửa, biểu tượng, chữ)
    cards.ts         # 13 Omen, 22 Item, 45 Event của bản 2
    hauntChart.ts    # bảng Haunt (Omen × phòng → số haunt) của bản 2
  haunts/            # plugin haunt
    types.ts         # interface HauntModule
    index.ts         # danh sách haunt đã cài
    h01-mummy-walks.ts
  client/            # React UI tiếng Việt, theme gothic: Board, MapView, Overlays (lá bài, xúc xắc, Haunt reveal, kết thúc), Icons (SVG tự vẽ), demoBot
  server/index.ts    # boardgame.io Server + koa-static
scripts/             # simulate.ts, simbot.ts (bot), online-demo.ts
tests/               # vitest
```

## 4. Thêm một haunt mới (từng bước)

1. **Xác minh luật trước.** Mở Traitor's Tome và Secrets of Survival của bản 2 (sách Hasbro F3148) và đọc **cả hai phe**. Không bịa luật: chỗ nào chưa rõ thì đánh dấu `TODO` và cho người chơi xử lý bằng "Điều chỉnh thủ công".
2. Tạo `src/haunts/hNN-ten-haunt.ts` export một `HauntModule`:

```ts
export interface HauntModule {
  number: number;          // số haunt trong bảng
  name: string; edition: string; source: string;   // ghi rõ nguồn đã đối chiếu
  traitorRule(c, revealer): string | null;         // cột "Traitor" của bảng: revealer, người trái revealer, Knowledge cao nhất…; null = không có kẻ phản bội
  traitorText: string;     // hướng dẫn phe phản bội (UI chỉ hiện cho kẻ phản bội)
  heroText: string;        // hướng dẫn phe anh hùng
  setup(c, h): void;       // phần "Right Now": đặt token/quái vật, h.data = trạng thái riêng của haunt
  actions: HauntAction[];  // nút hành động thêm: { id, label, side: 'heroes'|'traitor', check(c,pid) → lý do|null, run(c,pid,args) }
  onEnterRoom?(c, pid, room)                  // ví dụ: nhặt token
  replaceDraw?(c, pid, kind) → cardId|null    // "lục chồng lấy lá X thay vì rút"
  onMonsterTurnStart?(c)                       // tung di chuyển quái: đặt G.turn['mv:<id>'] = số bước, 'tp:<id>' = được dịch chuyển
  onMonsterInflicts?(c, mid, pid, diff, trait) → boolean   // quái thắng: tự xử lý sát thương/cướp đồ
  canAttackMonster?(c, pid, mid, trait, weapon) → lỗi|null // miễn nhiễm…
  onMonsterDefeated?(c, pid, mid, trait) → boolean         // thay vì "stun" mặc định
  canEndMonsterTurn?(c) → lỗi|null                         // "bắt buộc tấn công"…
  checkWin(c) → { winner: 'traitor'|'heroes', text } | null // gọi sau mỗi thay đổi
  // thêm (từ đợt 6 haunt): gaps (chỗ sách không nói), art, status(G), botTarget, playerView (giấu thông tin bí mật),
  // onMonsterTurnEnd, onExplorerTurnEnd, onMonsterLoses, onMonsterAttackRoll, canAttackExplorer, canEnterRoom,
  // canExplorerMove, blockCard, onCardStolen, stealExtras/onStealExtra; action side 'monsters' + options(c,pid)
}
```

3. Trong hàm, `c.G` là trạng thái game. Dùng các helper sẵn có:
   - `enqueue(c, pid, effects)`: hiệu ứng dạng dữ liệu như `{t:'roll', spec:{trait:'knowledge', outcomes:[…]}}`, `{t:'damage', kind:'physical', amount:2}`, `{t:'gain', trait:'might', n:1}`.
   - `requestDamage`, `gainCard`, `loseCard`, `log`.
   - Hàm `CUSTOM.xxx = (c, pid, args) => …` cho hiệu ứng đặc biệt.
   - Quyết định của người chơi: đẩy `G.pending.push({type:'choice' | 'pickRoom', …})`. Với `pickRoom`, `varName: 'custom:tenHam'` sẽ gọi `CUSTOM.tenHam(c, pid, {room})`.
4. Thêm một dòng vào `src/haunts/index.ts`: `import { x } from './hNN-…'` và `HAUNTS[NN] = x`.
5. Viết test trong `tests/` cho điều kiện thắng, rồi chạy `npm test` và `npm run simulate`.
6. Bảng Haunt (`data/hauntChart.ts`) đã có đủ 50 số của bản 2. Khi haunt nào chưa cài, game dùng luật tuỳ chọn chính thức **"Selecting the Haunt"** (rulebook tr.16): thử phòng Omen gần nhất / các Omen khác của người lật haunt. Nếu vẫn không ra haunt đã cài, game hỏi chơi Haunt #1 (house rule, ghi rõ trong log) hoặc dừng ván.

## 5. Nguồn đã đối chiếu

- **Rulebook + Traitor's Tome + Secrets of Survival bản 2 chính thức (Hasbro F3148 PDF)**: https://www.hasbro.com/common/documents/60D52426B94D40B98A9E78EE4DD8BF94/38E7C8028AA2455CBE6D25E68FF9C18E.pdf
  - Luật: tr. 2–12 của PDF. Bảng Haunt: tr.14. Haunt 1 phe phản bội: tr.15. Phe anh hùng: tr.42.
  - Haunt 4/26/37/38/40: xem bảng trang ở mục 7.
- **Chữ đầy đủ các lá bài bản 2** (bản dịch tiếng Hungary "BaHotH 2. kiadás szerinti átdolgozás", 2018): https://tarsasjatekok.com/files/common/d/de/ded/ded4265ad49b1f5a2295a38fc2e84c13/betrayalathouseonthehill-hun-kartyak.pdf
  - Lá của bản mở rộng Widow's Walk đã được loại ra bằng cách so với danh sách 45 Event / 13 Omen / 22 Item gốc.
- **Esoteric Order of Gamers**, tóm tắt luật và chữ haunt (để đối chiếu Haunt 1): https://www.orderofgamers.com/downloads/BetrayalHouseHill_v4.2.pdf
- **Danh sách phòng**: số cửa, kiểu cửa, tầng, biểu tượng.
  - Roll20 API script: https://gist.github.com/shdwjk/d97377b90de4bb37195b
  - Đối chiếu với bảng phòng "Haunt Revealer": https://docest.com/doc/101019
- **Thanh chỉ số nhân vật**: Betrayal wiki (betrayalathoth.fandom.com, trang Explorers, "1st & 2nd edition").
  - Đối chiếu với các ví dụ trong rulebook bản 2 (Zoe, Jenny) và gist quinnjn.

## 6. Phần chưa tự động / cần xác minh (TODO)

Dùng nút **"Điều chỉnh thủ công"** (ghi công khai vào nhật ký) cho các trường hợp sau:

- **Dog** (Omen): việc chó chạy đi nhặt hoặc mang đồ chưa tự động.
- **Music Box**: hiệu ứng mê hoặc người/quái có Sanity chưa tự động, mới chỉ bật/tắt.
- **Bloody Vision**, kết quả 0–1 (buộc tấn công người/quái gần nhất): mới ghi log.
- **It Is Meant to Be**: mới cho xem riêng 3 lá, chưa cho sắp xếp lại.
- **Tầng bị bịt kín**: luật chung nói nếu mọi ô còn lại của một tầng đều sẽ bịt kín tầng thì người đang tới lượt *sắp xếp lại* tầng đó. Bản web chưa làm việc này: ô không đặt được bị bỏ sang chồng loại. Hiếm gặp (fuzz: 1/1800 ván, #38 seed 5091 chaos 0.6 — anh hùng kẹt dưới hầm, Dơi Lửa không tới được); dùng "Điều chỉnh thủ công" để đặt lại.

Xem thêm mục "Diễn giải / chưa kiểm chứng" trong báo cáo kèm theo, và mục 7 (chỗ sách không nói rõ của từng haunt mới).

## 7. Danh sách Haunt đã cài

Tất cả theo **sách chính thức bản 2 (Hasbro F3148 PDF)** — số trang là trang của file PDF (mỗi trang PDF = 2 trang sách). Bảng Haunt (tr.14) tự chọn haunt theo Omen + phòng như bản giấy.

| # | Tên | Kẻ phản bội (bảng Haunt) | Tóm tắt | Trang PDF |
|---|---|---|---|---|
| 1 | The Mummy Walks | Haunt revealer | Mummy đi tìm cô dâu (Girl); anh hùng tìm tên thật của Mummy rồi đày nó bằng Book. | Traitor's Tome tr.15 · Secrets of Survival tr.42 |
| 4 | The Web of Destiny | Might cao nhất (trừ người lật Haunt) | Nhện khổng lồ canh người bị mắc trong mạng tơ cho tới khi trứng nở ở lượt 9; anh hùng phá mạng, phá trứng rồi thoát ra cửa chính. | TT tr.16 (nửa phải) · SoS tr.44 (nửa trái) |
| 26 | Pay the Piper | Người bên trái người lật Haunt | Kẻ phản bội là người-chuột làm nghi lễ trong Pentagram Chamber; anh hùng phải giết hết bầy Chuột. | TT tr.27 (phải) · SoS tr.55 (trái) |
| 37 | Checkmate | Might thấp nhất | Thần Chết thách đánh cờ (Knowledge); anh hùng phá Holy Seal để Death đổ ít xúc xắc hơn và phải luôn có người ngồi bàn cờ. | TT tr.33 (trái) · SoS tr.61 (trái) |
| 38 | Hellbeasts | Knowledge thấp nhất (trừ người lật Haunt) | Bầy Dơi Lửa sinh sôi và thiêu anh hùng; anh hùng làm lễ trừ tà ở phòng/Item thánh. | TT tr.33 (phải) · SoS tr.61 (phải) |
| 40 | Buried Alive | Người bên trái người lật Haunt | Một người bạn bị chôn sống ở phòng tầng hầm bí mật; anh hùng lục soát, dùng Spirit Board và đào lên trước khi người đó chết. | TT tr.34 (phải) · SoS tr.62 (phải) |

### Khi Traitor's Tome và Secrets of Survival mâu thuẫn

**Quy tắc chung: khi TT và SoS mâu thuẫn, bản web theo Traitor's Tome.** Quy tắc này hiện ở đầu mục "⚠ Chỗ sách chưa nói rõ" trong game. Đã rà lại cả 6 haunt (PDF tr.15/42, 16/44, 27/55, 33/61, 33/61, 34/62):

| Haunt | TT nói | SoS nói | Bản web |
|---|---|---|---|
| #37 Checkmate | Death đánh cờ với explorer trong phòng có **Knowledge cao nhất** | "một trong các anh hùng" có thể đổ | Theo TT: luôn là người Knowledge cao nhất (đã đúng từ trước, không cần sửa code) |

Các haunt #1, #4, #26, #38, #40: hai cuốn chỉ bổ sung cho nhau (mỗi cuốn nói phần của phe mình), không có chỗ mâu thuẫn.

Cũng trong lần rà này, sửa một chỗ bản web chưa đúng TT (không phải mâu thuẫn TT–SoS): **#1** khi cả Ring lẫn Holy Symbol chưa ra, TT cho kẻ phản bội "lấy *một trong hai* lá" — trước đây bản web tự lấy Ring, giờ kẻ phản bội được chọn.

### Chỗ sách không nói rõ — bản web xử lý thế nào

Những điểm dưới đây **không** có câu trả lời trong sách; bản web chọn một cách và hiện công khai trong bảng Haunt (mục "⚠ Chỗ sách chưa nói rõ"). Nhóm chơi có thể dùng **"Điều chỉnh thủ công"** nếu muốn xử lý khác.

**#4 The Web of Destiny**

- Thời điểm đẩy thanh Turn/Damage: sách ghi "cuối mỗi lượt của bạn". Bản web đẩy thanh khi kết thúc lượt quái vật (lượt quái vật đi ngay sau lượt kẻ phản bội), kể cả khi nhân vật kẻ phản bội đã bị ăn (3–4 người) — sách không nói rõ trường hợp này.
- Lượt 1 Nhện có Speed 0: bản web áp dụng luật chung (rulebook tr.17) "quái vật luôn đi được ít nhất 1 ô" — sách Haunt không nói riêng.
- "Nhện phải di chuyển về phía một explorer không phải người lật Haunt" không được kiểm tra tự động; chỉ bắt buộc "tấn công nếu có thể".
- Nếu không ai giữ lá Bite (đã mất/bị bỏ), Nhện được đặt ở phòng nơi Haunt bắt đầu — sách không nói.
- Tấn công mạng tơ: bản web dùng đúng Might của bạn, KHÔNG cộng xúc xắc vũ khí (Axe, Blood Dagger…) và không hỗ trợ Sacrificial Dagger — sách không nói vũ khí có áp dụng hay không.
- Explorer bị mắc kẹt có được tự phá trứng hay không: sách viết "nếu bạn ở cùng phòng với explorer bị mắc kẹt"; bản web cho phép cả chính người bị mắc kẹt.
- Healing Salve dùng để phá trứng: bản web bỏ lá này sau khi dùng (theo chữ trên lá: "dùng xong thì bỏ").
- Đổ mở cửa chính được tính là task roll (mỗi lượt 1 lần).

**#26 Pay the Piper**

- Ai chọn phòng kề cho explorer đang ở Pentagram Chamber lúc Haunt bắt đầu: sách không nói — bản web cho chính explorer đó chọn.
- Chuột bị giết có được dùng lại cho nghi lễ hay không ("nếu còn"): bản web chỉ dùng các token Chuột chưa từng đặt lên bàn; Chuột đã chết không quay lại kho.
- Anh hùng mở cửa và rút trúng Pentagram Chamber (phòng chưa có trong nhà): sách chỉ nói "anh hùng không thể vào Pentagram Chamber", không nói xử lý ô phòng — bản web vẫn đặt ô phòng vào nhà nhưng anh hùng KHÔNG vào (đứng lại phòng cũ, không rút Omen, vẫn tính 1 bước). Dùng "Điều chỉnh thủ công" nếu nhóm quyết định khác.
- Lá bài/phòng tự đặt explorer vào một phòng (Mystic Elevator, Collapsed Room, Secret Stairs, Revolving Wall, Bottle, Dark Dice) không bị chặn khỏi Pentagram Chamber: sách không nói "không thể vào" có ghi đè hiệu ứng lá bài hay không.
- Chuột không có lượt "mới xuất hiện không được đi"; bản web cho Chuột mới đặt di chuyển bình thường ở lượt quái vật kế tiếp.
- Nếu thừa Chuột: bản web tự đặt 1 con vào mỗi phòng hợp lệ trước, rồi kẻ phản bội chọn phòng (hợp lệ) cho từng con còn lại.

**#37 Checkmate**

- Hoà Knowledge cao nhất trong phòng Death: sách không nói ai đánh — bản web cho các anh hùng hoà nhau chọn (người đầu tiên theo thứ tự lượt chọn).
- Anh hùng giữ Holy Seal mà chết: sách không nói — bản web đánh rơi Holy Seal tại phòng đó (như Item), anh hùng khác nhặt lại được.
- Nếu kẻ phản bội đã đứng sẵn trong phòng được chọn đặt Death: sách chỉ cấm "vào" — bản web cho phép đứng yên nhưng vẫn cấm ảnh hưởng anh hùng ở đó.
- Holy Seal kẻ phản bội cướp được: bản web giữ trên kẻ phản bội (không phá được, không mất đi).
- Nhặt Holy Seal được coi như nhặt Item (không tốn hành động).

**#38 Hellbeasts**

- Một phòng có hơn 8 Dơi Lửa: bản web đổ tối đa 8 xúc xắc (giới hạn chung của rulebook) — sách Haunt không nói riêng.
- Kẻ phản bội có bị Dơi Lửa thiêu không: sách chỉ nói "mọi anh hùng trong phòng" — bản web không thiêu kẻ phản bội.
- Sát thương thiêu được tính khi kẻ phản bội bấm "Kết thúc lượt quái vật" (sau khi đã di chuyển xong mọi Dơi Lửa).

**#40 Buried Alive**

- Mốc chết của người bị chôn: sách ghi "chịu được 12 điểm sát thương trước khi chết" — bản web coi tổng sát thương đạt 12 là chết.
- Phòng chôn có được là Basement Landing hay không: sách đếm Basement Landing là một phòng tầng hầm — bản web cho phép chọn.
- Việc rút và đặt thêm phòng tầng hầm cho đủ 5 được làm tự động (đặt vào chỗ hợp lệ đầu tiên) thay vì cho kẻ phản bội tự đặt.
- Nếu kẻ phản bội chết: không còn "cuối lượt của bạn" — bản web ngừng đẩy thanh Turn/Damage (sách không nói).
- "Mỗi phòng chỉ lục soát được 1 lần trong lượt": bản web hiểu là mỗi phòng 1 lần/lượt (có thể lục soát nhiều phòng khác nhau trong cùng lượt nếu đi vào chúng).
- Kết quả 3–4 của Spirit Board ("di chuyển một explorer bất kỳ 3 ô"): bản web cho chọn một phòng cách đúng tối đa 3 ô theo lối đi, không áp hiệu ứng phòng đi qua. Sách không nói có được dừng sớm hay không.
- Nếu chính kẻ phản bội đang giữ Spirit Board: sách không nói — bản web không cho kẻ phản bội dùng chức năng Haunt của Spirit Board.
- **Chỉ khi ép Haunt #40 từ sảnh (house rule, ngoài bảng Haunt):** theo bảng gốc #40 chỉ xảy ra khi người lật Haunt là người vừa nhận Spirit Board, nên khi ép haunt mà không anh hùng nào giữ Spirit Board, bản web chuyển Spirit Board cho người lật Haunt (có ghi log). Ván thường không bị ảnh hưởng.

### Haunt chưa cài và lý do

- Không có kẻ phản bội / phản bội giữa chừng (cần luồng chơi khác hẳn): #9 Dance of Death, #12 Fleshwalkers, #31 Airborne, #50 Treasure Hunt.
- Kẻ phản bội ẩn (cần cơ chế bí mật riêng): #34, #43.
- Anh hùng bị biến thành phe ác (zombie, ma cà rồng, điều khiển tâm trí): #6 Floating Eye, #21 House of the Living Dead, #30 Tomb of Dracula.
- Quá phức tạp cho bản hiện tại: #2 Séance (nhà sập + cuộc đua triệu hồi hai chiều), #10 Family Gathering (AI zombie bắt buộc).
- Luật di chuyển/hướng nhìn của quái chưa rõ: #46 The Feast.
- Các số còn lại: **chưa đánh giá chi tiết**. Sách có đủ chữ cho cả 50 haunt.

Khi bảng Haunt ra một số chưa cài, game dùng luật tuỳ chọn "Selecting the Haunt" (rulebook tr.16) để tìm haunt đã cài.


## Xúc xắc hiển thị & hiệu ứng

**Đổ xúc xắc rõ ràng (luật không đổi).** Mỗi lần luật cần đổ xúc xắc, ván chơi dừng ở bước "🎲 Đổ xúc xắc":
- Chỉ người đổ thấy nút: người đi lượt (sự kiện, phòng, Haunt roll…), kẻ phản bội (quái vật). Khi tấn công: người tấn công bấm trước, rồi người chống đỡ bấm (xúc xắc của quái vật chống đỡ do kẻ phản bội bấm).
- Người khác thấy "Đang chờ X đổ xúc xắc…".
- Xúc xắc vẫn đổ trên server (PRNG boardgame.io), chỉ đổ khi được bấm.
- Mọi máy cùng thấy bảng xúc xắc động: từng mặt (0/1/2), số xúc xắc và lý do (vd. "Might 4 → 4 xúc xắc"), mục đích, tổng và kết quả. Bảng tự tắt sau ~3 giây hoặc khi bấm vào; panel "Lần đổ gần nhất" ở cột phải giữ lại kết quả.
- Kỹ thuật: hàng đợi hiệu ứng tạm dừng trước hiệu ứng có xúc xắc (`rollGateFor`, `CUSTOM_ROLLS` trong `src/engine/effects.ts`). Các move đổ xúc xắc trực tiếp được thử trên bản sao (`dryRun` trong `src/engine/game.ts`) rồi chạy thật khi người đổ bấm. Tham số của move đang chờ bị ẩn với người khác (playerView).

**Hiệu ứng.**
- Khám phá phòng: ô phòng lật vào bản đồ. Lá bài bay ra từ đúng chồng bài (chồng bài hiển thị số lá còn lại), lật mặt, phóng to ra giữa màn hình. Người rút bấm "Tiếp tục"; máy khác tự đóng. Bấm khi lá đang bay để xem ngay.
- Haunt bắt đầu: rung màn hình, chớp đỏ, sương mù và tia chớp.
- Chỉ số tăng/giảm có số nổi (+1/−2) và nhấp nháy trên thẻ nhân vật. Quân cờ di chuyển mượt.
- Màn hình thắng/thua có tia sáng và tàn lửa. Màn hình này chờ bảng xúc xắc quyết định ván chơi hiện xong mới hiện.
- Âm thanh (xúc xắc, rút bài, tấn công, Haunt) do `scripts/gen-sfx.py` tạo ra. Đây là âm thanh tổng hợp, CC0, nằm ở `public/sfx/`. Nút 🔊/🔇 trên thanh trên cùng lưu lựa chọn vào localStorage.
- Tôn trọng `prefers-reduced-motion` (tắt chuyển động). Có bố cục gọn cho màn hình nhỏ.
- Chế độ demo/bot tự bấm nút đổ xúc xắc sau một khoảng ngắn (theo tham số `speed`).

## Artwork (hình minh hoạ)

Toàn bộ chân dung nhân vật, Mummy, sarcophagus và Girl trong `public/art/` là **tranh gốc tạo riêng cho prototype này** (AI image generation, phong cách gothic sơn dầu, ánh nến) — **không** dùng/sao chép art chính thức của Avalon Hill.

- `public/art/<characterId>.webp` (512×512) và `<characterId>-sm.webp` (128×128, dùng cho quân trên bản đồ)
- `mummy.webp` (768×1024, haunt reveal + màn kết thúc), `mummy-token(-sm).webp`, `sarcophagus(-sm).webp`, `girl(-sm).webp`
- Haunt mới (864×1152 + token 256/128): `spider` (#4), `rats` (#26), `death` (#37), `firebats` (#38), `buried` (#40) — `<tên>.webp`, `<tên>-token.webp`, `<tên>-token-sm.webp`
- Code: `src/client/Art.tsx` (`ART`, `Avatar`, `ArtImg`, `ArtToken`). Nếu ảnh lỗi/thiếu, giao diện tự quay về chữ viết tắt / icon SVG cũ.
- File gốc 1024px nằm ngoài repo; muốn thay art chỉ cần ghi đè file `.webp` cùng tên.

## Chơi online với bạn bè (link mời)

1. Chạy bản production: `npm run build && npm start` → một server Node duy nhất ở cổng 8000 phục vụ cả web và game (socket.io cùng origin).
2. Mở trang, nhập tên → **Tạo phòng mới** (chọn số người 3–6).
3. Ở màn chọn nhân vật bấm **🔗 Copy link mời** (`https://<host>/?match=<mã phòng>`) và gửi cho bạn bè. Họ mở link → nhập tên → **Vào phòng**. Có thể dán mã phòng/link vào ô “Mã phòng / link mời”, hoặc bấm “Vào” trong danh sách phòng đang chờ.
4. Ai cũng chọn nhân vật (mỗi màu một người), rồi một người bấm **Bắt đầu khám phá ngôi nhà**.
- Ghế (matchID + playerID + credentials) được lưu trong `localStorage` của trình duyệt: tải lại trang hoặc mở lại link là về đúng ghế. Chấm xanh/xám cạnh tên = đang online / mất kết nối.
- Phòng chỉ nằm trong bộ nhớ server: khởi động lại server là mất phòng (giao diện sẽ báo và cho tạo phòng mới).
- Chia sẻ ra Internet tạm thời: `cloudflared tunnel --url http://localhost:8000` (quick tunnel, link `*.trycloudflare.com` đổi mỗi lần chạy).

### Test trình duyệt thật (online)
`npx tsx e2e/online.e2e.ts [baseURL]` — Playwright, mỗi người chơi một browser context riêng. Biến môi trường: `BIG=1` (phòng 5 và 6 người), `QUICK=1` (một ván 3 người, dùng để kiểm tra qua link public), `HAUNTS=4,26,37,38,40` (mỗi haunt một phòng online ép haunt đó, 3–5 browser kể cả 1 điện thoại: đồng bộ, reload/mất kết nối giữa haunt, layout mobile, #40 kiểm tra phòng chôn chỉ kẻ phản bội thấy). Script import Playwright từ `/workspace/shots-tool/node_modules` (sửa đường dẫn import nếu chạy ở máy khác).
