import { useState } from 'react';

/** Invite link format: <origin>/?match=<matchID>. Opening it goes straight to the join form (or back to your seat). */
export const inviteLink = (matchID: string) => `${location.origin}/?match=${encodeURIComponent(matchID)}`;

/** Copy-to-clipboard with a fallback for non-secure contexts (plain http on a LAN IP). */
export async function copyText(text: string) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); return ok;
}
export function InviteBox({ matchID, compact }: { matchID: string; compact?: boolean }) {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const link = inviteLink(matchID);
  const copy = async () => { const ok = await copyText(link); setCopied(ok ? 'ok' : 'fail'); setTimeout(() => setCopied(''), 2500); };
  if (compact) return <button className="small invitebtn" onClick={copy} title={link}>{copied === 'ok' ? '✓ Đã copy link' : '🔗 Copy link mời'}</button>;
  return (
    <div className="invitebox">
      <div className="ib-label">Mời bạn bè vào phòng <code>{matchID}</code></div>
      <div className="ib-row"><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link mời" /><button className="primary invitebtn" onClick={copy}>{copied === 'ok' ? '✓ Đã copy' : copied === 'fail' ? 'Hãy tự copy ô bên trái' : '🔗 Copy link mời'}</button></div>
    </div>);
}

