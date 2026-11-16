// Room tiles (2nd ed. base game: 44 tiles incl. Basement/Upper Landing + Entrance Hall tile).
// Sources: names/floors/doors/symbols from Roll20 API gist shdwjk/d97377b90de4bb37195b, cross-checked against the
// door-count/turn/floor table in the 'HR = Haunt Revealer' rules summary (docest.com/doc/101019). Rule text paraphrased
// in Vietnamese from tile text quoted in those sources + 2nd-ed rulebook 'Special Rooms' (pp.7-8).
// doors: 0=N 1=E 2=S 3=W in the tile's base orientation (only the pattern matters: tiles rotate).
import type { RoomDef } from '../engine/types';
export const ROOM_TILES: RoomDef[] = [
 {
  "id": "catacombs",
  "name": "Catacombs",
  "floors": [
   "basement"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "omen",
  "text": "Rào cản (barrier): có thể đổ Sanity 6+ để băng qua. Thất bại thì dừng di chuyển.",
  "outside": false,
  "windows": false
 },
 {
  "id": "chasm",
  "name": "Chasm",
  "floors": [
   "basement"
  ],
  "doors": [
   1,
   3
  ],
  "symbol": null,
  "text": "Rào cản: có thể đổ Speed 3+ để băng qua. Thất bại thì dừng di chuyển.",
  "outside": false,
  "windows": false
 },
 {
  "id": "crypt",
  "name": "Crypt",
  "floors": [
   "basement"
  ],
  "doors": [
   0
  ],
  "symbol": "event",
  "text": "Nếu kết thúc lượt ở đây, chịu 1 điểm sát thương tinh thần (mental damage).",
  "outside": false,
  "windows": false
 },
 {
  "id": "furnace-room",
  "name": "Furnace Room",
  "floors": [
   "basement"
  ],
  "doors": [
   0,
   2,
   3
  ],
  "symbol": "omen",
  "text": "Nếu kết thúc lượt ở đây, chịu 1 điểm sát thương thể chất (physical damage).",
  "outside": false,
  "windows": false
 },
 {
  "id": "larder",
  "name": "Larder",
  "floors": [
   "basement"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "item",
  "text": "Nếu kết thúc lượt ở đây, tăng 1 Might.",
  "outside": false,
  "windows": false
 },
 {
  "id": "pentagram-chamber",
  "name": "Pentagram Chamber",
  "floors": [
   "basement"
  ],
  "doors": [
   1
  ],
  "symbol": "omen",
  "text": "Khi rời phòng, phải đổ Knowledge 4+. Thất bại thì mất 1 Sanity.",
  "outside": false,
  "windows": false
 },
 {
  "id": "stairs-from-basement",
  "name": "Stairs From Basement",
  "floors": [
   "basement"
  ],
  "doors": [
   2
  ],
  "symbol": null,
  "text": "Cầu thang bí mật nối với Foyer.",
  "outside": false,
  "windows": false
 },
 {
  "id": "underground-lake",
  "name": "Underground Lake",
  "floors": [
   "basement"
  ],
  "doors": [
   0,
   1
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "wine-cellar",
  "name": "Wine Cellar",
  "floors": [
   "basement"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "item",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "ballroom",
  "name": "Ballroom",
  "floors": [
   "ground"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "coal-chute",
  "name": "Coal Chute",
  "floors": [
   "ground"
  ],
  "doors": [
   0
  ],
  "symbol": null,
  "text": "Bước vào đây là trượt ngay xuống Basement Landing (tính là 1 ô di chuyển). Không được kết thúc lượt ở ô này.",
  "outside": false,
  "windows": false
 },
 {
  "id": "dining-room",
  "name": "Dining Room",
  "floors": [
   "ground"
  ],
  "doors": [
   0,
   1
  ],
  "symbol": "omen",
  "text": "",
  "outside": false,
  "windows": true
 },
 {
  "id": "gardens",
  "name": "Gardens",
  "floors": [
   "ground"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "event",
  "text": "",
  "outside": true,
  "windows": false
 },
 {
  "id": "graveyard",
  "name": "Graveyard",
  "floors": [
   "ground"
  ],
  "doors": [
   2
  ],
  "symbol": "event",
  "text": "Khi rời phòng, phải đổ Sanity 4+. Thất bại thì mất 1 Knowledge.",
  "outside": true,
  "windows": false
 },
 {
  "id": "patio",
  "name": "Patio",
  "floors": [
   "ground"
  ],
  "doors": [
   0,
   2,
   3
  ],
  "symbol": "event",
  "text": "",
  "outside": true,
  "windows": false
 },
 {
  "id": "abandoned-room",
  "name": "Abandoned Room",
  "floors": [
   "basement",
   "ground"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": "omen",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "kitchen",
  "name": "Kitchen",
  "floors": [
   "basement",
   "ground"
  ],
  "doors": [
   0,
   1
  ],
  "symbol": "omen",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "tower",
  "name": "Tower",
  "floors": [
   "upper"
  ],
  "doors": [
   1,
   3
  ],
  "symbol": "event",
  "text": "Rào cản: có thể đổ Might 3+ để băng qua. Thất bại thì dừng di chuyển.",
  "outside": true,
  "windows": false
 },
 {
  "id": "bedroom",
  "name": "Bedroom",
  "floors": [
   "upper"
  ],
  "doors": [
   1,
   3
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": true
 },
 {
  "id": "attic",
  "name": "Attic",
  "floors": [
   "upper"
  ],
  "doors": [
   2
  ],
  "symbol": "event",
  "text": "Khi rời phòng, phải đổ Speed 3+. Thất bại thì mất 1 Might.",
  "outside": false,
  "windows": false
 },
 {
  "id": "balcony",
  "name": "Balcony",
  "floors": [
   "upper"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "omen",
  "text": "",
  "outside": true,
  "windows": false
 },
 {
  "id": "gallery",
  "name": "Gallery",
  "floors": [
   "upper"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "event",
  "text": "Có thể chọn nhảy xuống Ballroom (nếu Ballroom đã có trên bản đồ); chịu 1 xúc xắc sát thương thể chất.",
  "outside": false,
  "windows": false
 },
 {
  "id": "master-bedroom",
  "name": "Master Bedroom",
  "floors": [
   "upper"
  ],
  "doors": [
   0,
   3
  ],
  "symbol": "omen",
  "text": "",
  "outside": false,
  "windows": true
 },
 {
  "id": "gymnasium",
  "name": "Gymnasium",
  "floors": [
   "basement",
   "upper"
  ],
  "doors": [
   2,
   1
  ],
  "symbol": "omen",
  "text": "Nếu kết thúc lượt ở đây, tăng 1 Speed.",
  "outside": false,
  "windows": false
 },
 {
  "id": "operating-laboratory",
  "name": "Operating Laboratory",
  "floors": [
   "basement",
   "upper"
  ],
  "doors": [
   2,
   1
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "research-laboratory",
  "name": "Research Laboratory",
  "floors": [
   "basement",
   "upper"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "servants-quarters",
  "name": "Servants' Quarters",
  "floors": [
   "basement",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": "omen",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "storeroom",
  "name": "Storeroom",
  "floors": [
   "basement",
   "upper"
  ],
  "doors": [
   0
  ],
  "symbol": "item",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "vault",
  "name": "Vault",
  "floors": [
   "basement",
   "upper"
  ],
  "doors": [
   0
  ],
  "symbol": "item",
  "text": "Có thể đổ Knowledge 6+ để mở và vét sạch két (rút 2 lá Item).",
  "outside": false,
  "windows": false
 },
 {
  "id": "bloody-room",
  "name": "Bloody Room",
  "floors": [
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": "item",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "chapel",
  "name": "Chapel",
  "floors": [
   "ground",
   "upper"
  ],
  "doors": [
   0
  ],
  "symbol": "event",
  "text": "Nếu kết thúc lượt ở đây, tăng 1 Sanity.",
  "outside": false,
  "windows": true
 },
 {
  "id": "charred-room",
  "name": "Charred Room",
  "floors": [
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": "omen",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "collapsed-room",
  "name": "Collapsed Room",
  "floors": [
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": null,
  "text": "Người khám phá phòng phải đổ Speed 5+ để không bị rơi. Thất bại: rút 1 ô tầng hầm đặt vào bản đồ, rơi xuống đó và chịu 1 xúc xắc sát thương thể chất.",
  "outside": false,
  "windows": false
 },
 {
  "id": "conservatory",
  "name": "Conservatory",
  "floors": [
   "ground",
   "upper"
  ],
  "doors": [
   0
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "library",
  "name": "Library",
  "floors": [
   "ground",
   "upper"
  ],
  "doors": [
   2,
   3
  ],
  "symbol": "event",
  "text": "Nếu kết thúc lượt ở đây, tăng 1 Knowledge.",
  "outside": false,
  "windows": false
 },
 {
  "id": "creaky-hallway",
  "name": "Creaky Hallway",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": null,
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "dusty-hallway",
  "name": "Dusty Hallway",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": null,
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "game-room",
  "name": "Game Room",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "junk-room",
  "name": "Junk Room",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2,
   1,
   3
  ],
  "symbol": "omen",
  "text": "Khi rời phòng, phải đổ Might 3+. Thất bại thì mất 1 Speed.",
  "outside": false,
  "windows": false
 },
 {
  "id": "mystic-elevator",
  "name": "Mystic Elevator",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   0
  ],
  "symbol": null,
  "text": "Tung 2 xúc xắc và dời phòng này cạnh một cửa trống: 4 = tầng bất kỳ; 3 = tầng trên; 2 = tầng trệt; 1 = tầng hầm; 0 = tầng hầm rồi chịu 1 xúc xắc sát thương thể chất. Chỉ dùng 1 lần mỗi lượt.",
  "outside": false,
  "windows": false
 },
 {
  "id": "organ-room",
  "name": "Organ Room",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   2,
   3
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 },
 {
  "id": "statuary-corridor",
  "name": "Statuary Corridor",
  "floors": [
   "basement",
   "ground",
   "upper"
  ],
  "doors": [
   0,
   2
  ],
  "symbol": "event",
  "text": "",
  "outside": false,
  "windows": false
 }
] as RoomDef[];
