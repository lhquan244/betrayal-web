// Original SVG icons (no copyrighted art).
import type { CSSProperties } from 'react';
type P = { size?: number; style?: CSSProperties; className?: string };

export const EventIcon = ({ size = 18, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><path d="M12 12m0 0a1.6 1.6 0 1 1 1.6 1.6A3.4 3.4 0 1 1 15.4 10a5.2 5.2 0 1 1-8.6 6.4A7 7 0 1 1 19.2 8.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>);
export const ItemIcon = ({ size = 18, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><path d="M6 3h12l-1.5 5.5A4.6 4.6 0 0 1 13 12v5h3v3H8v-3h3v-5a4.6 4.6 0 0 1-3.5-3.5z" fill="currentColor" /></svg>);
export const OmenIcon = ({ size = 18, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><path d="M2 12c3-5 6.5-7 10-7s7 2 10 7c-3 5-6.5 7-10 7s-7-2-10-7z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3.6" fill="currentColor" /><path d="M12 2v2M12 20v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M19.5 4.5l-1.4 1.4M5.9 18.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" /></svg>);
export const SkullIcon = ({ size = 14, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><path d="M12 2C6.9 2 3.5 5.6 3.5 10.2c0 2.9 1.4 4.9 3.3 6v3.3c0 .8.7 1.5 1.5 1.5h7.4c.8 0 1.5-.7 1.5-1.5v-3.3c1.9-1.1 3.3-3.1 3.3-6C20.5 5.6 17.1 2 12 2z" fill="currentColor" /><circle cx="8.7" cy="11" r="2.2" fill="#0d0a10" /><circle cx="15.3" cy="11" r="2.2" fill="#0d0a10" /><path d="M11 15.2l1-1.8 1 1.8z" fill="#0d0a10" /><path d="M9.5 18.5v2M12 18.5v2M14.5 18.5v2" stroke="#0d0a10" strokeWidth="1" /></svg>);
export const MummyIcon = ({ size = 26, ...r }: P) => (
  <svg viewBox="0 0 32 32" width={size} height={size} {...r}>
    <ellipse cx="16" cy="11" rx="7" ry="8" fill="#d9c9a3" /><rect x="9" y="17" width="14" height="13" rx="5" fill="#cbb98f" />
    <path d="M9 8l14 3M9 12l14-2M9 15l14 2M10 20l12 2M10 24l12-2M10 27l12 1" stroke="#8f7a52" strokeWidth="1.2" />
    <ellipse cx="13" cy="11.5" rx="1.6" ry="1.1" fill="#ff4d3a" /><ellipse cx="19" cy="11.5" rx="1.6" ry="1.1" fill="#ff4d3a" /></svg>);
export const SarcophagusIcon = ({ size = 16, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><path d="M8 2h8l3 6-2 14H7L5 8z" fill="#c79a3c" stroke="#6b4c12" strokeWidth="1.2" /><circle cx="12" cy="7" r="2" fill="#3b2a0c" /><path d="M9 12h6M9 15h6M9 18h6" stroke="#6b4c12" strokeWidth="1.2" /></svg>);
export const GirlIcon = ({ size = 16, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><circle cx="12" cy="7" r="4" fill="#f1d6c2" /><path d="M7 7a5 5 0 0 1 10 0v6l-2-2v-3a3 3 0 0 0-6 0v3l-2 2z" fill="#3a2418" /><path d="M6 22l2.5-9h7L18 22z" fill="#e8e1f5" /></svg>);
export const StairsIcon = ({ size = 14, ...r }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...r}><path d="M3 21h5v-5h5v-5h5V6h3" fill="none" stroke="currentColor" strokeWidth="2" /></svg>);
export const MoonHouse = ({ size = 220 }: { size?: number }) => (
  <svg viewBox="0 0 240 150" width={size} height={size * 150 / 240} className="moonhouse">
    <defs><radialGradient id="moon" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff7d6" /><stop offset=".7" stopColor="#e9d9a6" /><stop offset="1" stopColor="#e9d9a600" /></radialGradient></defs>
    <circle cx="178" cy="40" r="34" fill="url(#moon)" />
    <path d="M20 150V92l22-20 10 9V60l8-12 8 12v33l26-24 26 24V40l10-18 10 18v18l20-16 22 22v96z" fill="#0c0910" />
    <g fill="#ffcf6b" opacity=".85"><rect x="62" y="98" width="7" height="11" /><rect x="94" y="104" width="7" height="11" /><rect x="128" y="62" width="6" height="10" /><rect x="128" y="96" width="6" height="10" /><rect x="168" y="86" width="7" height="11" /></g>
    <path d="M0 150h240" stroke="#0c0910" strokeWidth="4" />
    <path d="M196 58c4-3 8-3 12 0M206 70c3-2 6-2 9 0" stroke="#0c0910" strokeWidth="1.5" fill="none" />
  </svg>);
export const KIND_ICON = { event: EventIcon, item: ItemIcon, omen: OmenIcon } as const;
export const KIND_VI = { event: 'Sự kiện · Event', item: 'Vật phẩm · Item', omen: 'Điềm báo · Omen' } as const;

/** A Betrayal die: faces show 0, 1 or 2 pips. */
export function Die({ value, rolling, delay = 0 }: { value: number; rolling?: boolean; delay?: number }) {
  const pips = value === 0 ? [] : value === 1 ? [[50, 50]] : [[30, 30], [70, 70]];
  return (
    <span className={`die ${rolling ? 'rolling' : 'landed'}`} style={{ animationDelay: `${delay}ms` }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">{pips.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="11" fill="currentColor" />)}</svg>
    </span>);
}
