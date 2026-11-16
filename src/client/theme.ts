import type { PlayerState } from '../engine/types';
import { CHARACTERS } from '../data/characters';
export const COLOR: Record<string, string> = { red: '#e2504c', blue: '#4f8fe6', green: '#45c46c', yellow: '#efc444', white: '#e6e1ea', purple: '#a56ff0' };
export const charOfP = (p: PlayerState) => CHARACTERS.find((c) => c.id === p.character);
export const pcolor = (p: PlayerState) => COLOR[charOfP(p)?.color ?? 'white'];
export const initials = (name: string) => { const w = name.replace(/["()]/g, '').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : name.slice(0, 2)).toUpperCase(); };
