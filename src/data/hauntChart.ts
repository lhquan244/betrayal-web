// Haunt chart, 2nd edition (Traitor's Tome, Hasbro F3148 PDF p.14). Rows: room where the omen was drawn; columns: omen.
export const CHART_OMENS = ['bite', 'book', 'crystal-ball', 'dog', 'girl', 'holy-symbol', 'madman', 'mask', 'medallion', 'ring', 'skull', 'spear', 'spirit-board'];
export const HAUNT_CHART: Record<string, number[]> = {
  'abandoned-room': [18, 7, 12, 38, 1, 9, 45, 42, 49, 28, 34, 43, 48],
  balcony: [24, 7, 32, 5, 16, 6, 11, 25, 49, 20, 47, 39, 2],
  catacombs: [4, 7, 23, 46, 1, 13, 10, 25, 49, 41, 37, 43, 48],
  'charred-room': [24, 33, 23, 38, 30, 13, 31, 48, 44, 20, 47, 15, 8],
  'dining-room': [24, 3, 27, 5, 16, 6, 45, 42, 21, 20, 37, 39, 40],
  'furnace-room': [4, 33, 32, 38, 30, 13, 10, 42, 36, 28, 34, 15, 2],
  gallery: [18, 3, 19, 19, 19, 22, 10, 25, 36, 41, 37, 15, 8],
  gymnasium: [35, 29, 12, 46, 1, 22, 11, 22, 21, 41, 47, 43, 48],
  'junk-room': [4, 33, 27, 46, 1, 9, 11, 25, 44, 17, 17, 17, 40],
  kitchen: [18, 3, 23, 46, 16, 22, 31, 32, 36, 41, 37, 39, 2],
  'master-bedroom': [35, 29, 27, 5, 16, 6, 10, 35, 44, 20, 47, 43, 2],
  'pentagram-chamber': [26, 50, 32, 50, 26, 26, 45, 14, 14, 26, 14, 50, 40],
  'servants-quarters': [35, 29, 12, 5, 30, 9, 31, 42, 21, 28, 34, 15, 8],
};
export function lookupHaunt(room: string, omen: string): number | null {
  const row = HAUNT_CHART[room]; const i = CHART_OMENS.indexOf(omen);
  return row && i >= 0 ? row[i] : null;
}
