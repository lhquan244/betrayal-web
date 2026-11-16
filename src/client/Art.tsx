/// <reference types="vite/client" />
// Original artwork (generated for this project, not Avalon Hill art) served from /public/art.
// Every <img> falls back to the old initials / SVG icon if the file fails to load.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { initials } from './theme';

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
export const ART = {
  portrait: (charId: string) => `${BASE}art/${charId}.webp`,
  portraitSm: (charId: string) => `${BASE}art/${charId}-sm.webp`,
  mummy: `${BASE}art/mummy.webp`,
  mummyToken: `${BASE}art/mummy-token-sm.webp`,
  mummyTokenLg: `${BASE}art/mummy-token.webp`,
  /** Haunt artwork by base name (HauntModule.art.art): reveal picture + round tokens. */
  haunt: (art: string) => `${BASE}art/${art}.webp`,
  hauntToken: (art: string) => `${BASE}art/${art}-token-sm.webp`,
  hauntTokenLg: (art: string) => `${BASE}art/${art}-token.webp`,
  sarcophagus: `${BASE}art/sarcophagus-sm.webp`,
  girl: `${BASE}art/girl-sm.webp`,
};

/** <img> that removes itself on error so whatever is underneath (initials/icon) shows. */
export function ArtImg({ src, alt = '', className, style }: { src: string; alt?: string; className?: string; style?: CSSProperties }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return <img className={className} style={style} src={src} alt={alt} draggable={false} loading="lazy" decoding="async" onError={() => setBad(true)} />;
}

/** Round portrait with a colour ring; initials underneath as fallback. */
export function Avatar({ charId, name, color, size, small, className = '' }: { charId?: string; name: string; color: string; size?: number; small?: boolean; className?: string }) {
  const style: CSSProperties = { ['--pc' as string]: color, background: color, ...(size ? { width: size, height: size } : {}) };
  return (
    <span className={`avatar art ${className}`} style={style} title={name}>
      <b>{initials(name)}</b>
      {charId && <ArtImg src={small ? ART.portraitSm(charId) : ART.portrait(charId)} />}
    </span>);
}

/** Round art token (monster / item) with fallback child (SVG icon). */
export function ArtToken({ src, fallback, className = '', title }: { src: string; fallback: ReactNode; className?: string; title?: string }) {
  return <span className={`arttok ${className}`} title={title}><i className="fb">{fallback}</i><ArtImg src={src} alt={title} /></span>;
}
