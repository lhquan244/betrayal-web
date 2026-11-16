// Real-browser online multiplayer test (Playwright, separate browser contexts = separate devices).
// Usage: npx tsx e2e/online.e2e.ts [baseURL]   (needs the production server: npm run build && npm start)
// Moves are sent through each player's own in-page boardgame.io client (window.__bg) over socket.io;
// the lobby, invite link, name entry, character select and start button are driven through the real UI.
import { chromium, type Browser, type BrowserContext, type Page } from '/workspace/shots-tool/node_modules/playwright/index.mjs';
import { decide, newMemory } from '../src/client/demoBot';
import { HAUNTS } from '../src/haunts';
import type { GState } from '../src/engine/types';
import fs from 'node:fs';

const BASE = (process.argv[2] ?? 'http://localhost:8000').replace(/\/$/, '');
const SHOTS = process.env.SHOTS ?? '/tmp/e2e';
const QUICK = process.env.QUICK === '1'; // tunnel smoke test: one 3-player match only
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean; info?: string }[] = [];
const check = (name: string, ok: boolean, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const errors: string[] = [];

type P = { name: string; ctx: BrowserContext; page: Page; pid?: string };
async function newPlayer(b: Browser, name: string, mobile = false): Promise<P> {
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); } catch { /* ignore */ }
  const page = await ctx.newPage(); hook(page, name);
  return { name, ctx, page };
}
function hook(page: Page, name: string) {
  page.on('pageerror', (e) => errors.push(`${name}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(`${name}: console ${m.text()}`); });
}
const G = (p: P) => p.page.evaluate(() => (window as any).__bg?.getState()?.G ?? null) as Promise<GState | null>;
const SID = (p: P) => p.page.evaluate(() => (window as any).__bg?.getState()?._stateID ?? -1) as Promise<number>;
async function waitFor(fn: () => Promise<boolean>, ms = 8000, step = 100) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(step); } return false; }

async function joinViaUI(p: P, how: 'link' | 'code' | 'list', matchID: string, link: string) {
  if (how === 'link') await p.page.goto(link); else await p.page.goto(BASE + '/');
  await p.page.getByPlaceholder('Ví dụ: Quân').fill(p.name);
  if (how === 'code') await p.page.getByPlaceholder('Dán link mời hoặc mã phòng').fill(matchID);
  if (how === 'list') { const li = p.page.locator('.matches li', { hasText: matchID }); await li.waitFor({ timeout: 8000 }); await li.getByRole('button', { name: 'Vào' }).click(); }
  else await p.page.getByRole('button', { name: 'Vào phòng' }).click();
}
async function createViaUI(p: P, n: number, haunt = 1) {
  await p.page.goto(BASE + '/'); await p.page.getByPlaceholder('Ví dụ: Quân').fill(p.name);
  await p.page.locator('.menu-grid .panel').first().locator('label.field select').first().selectOption(String(n));
  await p.page.locator('label.chk input').check(); // house rule: always use the selected haunt (default #1 — the e2e scenario plays The Mummy Walks)
  if (haunt !== 1) await p.page.locator('.forcerow select').selectOption(String(haunt));
  await p.page.getByRole('button', { name: 'Tạo phòng mới' }).click();
  await p.page.locator('.invitebox input').waitFor({ timeout: 10000 });
  const link = await p.page.locator('.invitebox input').inputValue();
  return { link, matchID: new URL(link).searchParams.get('match')! };
}

/** Plays a match to the end with the demo bot; each move is sent by the owning player's browser. */
async function playMatch(tag: string, ps: P[], opts: { reloadAt?: number; disconnectAt?: number; onHaunt?: () => Promise<void>; maxSteps?: number;
  /** moves after the haunt reveal at which one player reloads and another closes/reopens the site */ reconnectAfterHaunt?: number;
  /** stop after this many moves in the haunt (the game may not be over yet) */ postHauntMax?: number;
  /** called every 15 moves during the haunt (e.g. hidden-information checks) */ periodic?: () => Promise<void> } = {}) {
  let hauntStep = -1; let reconDone = false;
  const byPid = () => Object.fromEntries(ps.map((p) => [p.pid!, p]));
  const mem = newMemory(); let step = 0; let stalls = 0; let syncMax = 0; let syncSum = 0; let syncN = 0;
  let lastCard = ''; let lastRoll = ''; const diceShots: Record<string, boolean> = {}; let rollUiChecks = 0; let rollUiOk = 0; let rollClicks = 0; let rollClickFail = 0; const rollUiBad: string[] = []; const unpressed: string[] = []; const diceBad: string[] = []; let cardChecks = 0; let cardOk = 0; let diceChecks = 0; let diceOk = 0; let hauntDone = false;
  const maxSteps = opts.maxSteps ?? 3000; const tail: string[] = []; const errTexts = new Map<string, number>(); const rnd = () => Math.floor(Math.random() * 997);
  while (step < maxSteps) {
    const map = byPid();
    const G0 = await G(ps[0]); if (!G0) { await sleep(200); continue; }
    if (G0.phase === 'over') break;
    if (G0.phase === 'haunt' && !hauntDone) { hauntDone = true; hauntStep = step; await opts.onHaunt?.(); }
    if (hauntStep >= 0 && opts.reconnectAfterHaunt !== undefined && step >= hauntStep + opts.reconnectAfterHaunt && !reconDone && !G0.pending.length) { reconDone = true; await reloadTest(tag + ' (haunt)', ps); await disconnectTest(tag + ' (haunt)', ps); await opts.periodic?.(); }
    if (hauntStep >= 0 && opts.periodic && (step - hauntStep) % 15 === 7) await opts.periodic();
    if (hauntStep >= 0 && opts.postHauntMax !== undefined && step - hauntStep >= opts.postHauntMax) break;
    if (opts.reloadAt === step) await reloadTest(tag, ps);
    if (opts.disconnectAt === step) await disconnectTest(tag, ps);
    const mv = decide(G0, mem, rnd()); if (!mv) break; // random tie-breaks avoid bot oscillation loops
    tail.push(`${G0.phase} t${G0.turnCounter} p${mv.pid} ${mv.move} ${JSON.stringify(mv.args)}`); if (tail.length > 10) tail.shift();
    const mover = map[mv.pid];
    const before = await SID(ps[0]);
    const t0 = Date.now();
    const seqBefore = G0.lastRolls?.seq ?? 0;
    if (mv.move === 'roll') { // the roller presses the visible "Đổ xúc xắc" button; everybody else sees who we are waiting for
      const btn = mover.page.locator('.rollbtn');
      const shown = await btn.waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
      const DS = process.env.DICE_SHOTS; // optional screenshots of the roll button / waiting view (README + review)
      if (DS && shown && !diceShots.btn) { diceShots.btn = true; await sleep(700); await mover.page.screenshot({ path: `${DS}/betrayal-dice-1-button.png` }); const o = ps.find((p) => p !== mover)!; await o.page.locator('.rollwait').waitFor({ timeout: 2000 }).catch(() => {}); await o.page.screenshot({ path: `${DS}/betrayal-dice-2-waiting.png` }); }
      if (rollUiChecks < 15) { rollUiChecks++; const others = await Promise.all(ps.filter((p) => p !== mover).map((p) => p.page.locator('.rollwait').innerText({ timeout: 2000 }).catch(() => '')));
        if (shown && others.every((t) => t.includes(G0.players[mv.pid].name))) rollUiOk++; else rollUiBad.push(`${G0.players[mv.pid].name}: btn=${shown} others=${JSON.stringify(others).slice(0, 120)}`); }
      const closePopups = async () => { for (let k = 0; k < 4 && await mover.page.locator('.modal').count(); k++) { await mover.page.locator('.modal').first().click({ position: { x: 5, y: 5 }, timeout: 600 }).catch(() => {}); await sleep(80); } }; // fast-forward, then close a card popup (like a player would)
      await closePopups();
      await mover.page.locator('.diceov .do-card').click({ timeout: 400 }).catch(() => {});
      let clicked = false; for (let k = 0; k < 2 && shown && !clicked; k++) { clicked = await btn.click({ timeout: 2500 }).then(() => true).catch(() => false); if (!clicked) await closePopups(); }
      if (clicked) rollClicks++;
      else { rollClickFail++; rollUiBad.push(`click failed (${await mover.page.locator('.modal').count()} modal)`); await mover.page.evaluate(() => (window as any).__bg.moves.roll()); }
    } else await mover.page.evaluate(([m, a]) => (window as any).__bg.moves[m as string](...(a as unknown[])), [mv.move, mv.args] as const);
    // real-time sync: every client must reach the same new state
    const synced = await waitFor(async () => { const ids = await Promise.all(ps.map(SID)); return ids.every((x) => x === ids[0] && x > before); }, 4000, 25);
    const dt = Date.now() - t0;
    if (!synced) { stalls++; if (stalls > 25) { check(`${tag}: moves keep failing`, false, `last move ${mv.move} by ${mv.pid}`); break; } } else { stalls = 0; syncMax = Math.max(syncMax, dt); syncSum += dt; syncN++; }
    step++;
    const H = await G(ps[0]);
    const le = (H as unknown as { lastError?: { text: string; t: number } })?.lastError; if (le && le.t === H!.logSeq) errTexts.set(le.text, (errTexts.get(le.text) ?? 0) + 1);
    if (H?.lastCard) { const k = `${H.lastCard.id}:${H.lastCard.player}:${H.logSeq}`; if (k.split(':').slice(0, 2).join() !== lastCard.split(':').slice(0, 2).join() && cardChecks < 12) { cardChecks++; lastCard = k;
      if (await waitFor(async () => (await Promise.all(ps.map((p) => p.page.locator('.modal.carddraw.st-open .gcard').count()))).every((n) => n > 0), 3500)) cardOk++;
      await Promise.all(ps.map((p) => p.page.locator('.modal').click({ position: { x: 5, y: 5 }, timeout: 1000 }).catch(() => {}))); } }
    const seqAfter = H?.lastRolls?.seq ?? 0;
    if (seqAfter !== seqBefore) {
      if (mv.move !== 'roll') unpressed.push(`${mv.move} → ${H!.lastRolls!.items.map((i) => i.label).join(', ')}`);
      if (diceChecks < 12 || (process.env.DICE_SHOTS && !diceShots.ov)) { diceChecks++; void lastRoll; const totals = H!.lastRolls!.items.slice(0, 6).map((i) => `= ${i.total}`);
        if (await waitFor(async () => (await Promise.all(ps.map((p) => p.page.locator('.diceov').innerText().catch(() => '')))).every((t) => t.includes('Đổ xúc xắc') && totals.every((x) => t.replace(/\s+/g, ' ').includes(x))), 3000)) diceOk++;
        else diceBad.push(totals.join(' '));
        const DS = process.env.DICE_SHOTS; const items = H!.lastRolls!.items;
        if (DS && !diceShots.ov && items.length >= 2) { diceShots.ov = true; const o = ps.find((p) => p !== mover)!; await sleep(1000); await o.page.screenshot({ path: `${DS}/betrayal-dice-3-overlay-combat.png` });
          await sleep(3000); await o.page.locator('.lastroll').scrollIntoViewIfNeeded().catch(() => {}); await o.page.screenshot({ path: `${DS}/betrayal-dice-4-lastroll-panel.png` }); }
        else if (DS && !diceShots.ov1 && items.length === 1) { diceShots.ov1 = true; await sleep(1000); await ps[0].page.screenshot({ path: `${DS}/betrayal-dice-5-overlay-single.png` }); } }
    }
  }
  const GF = await G(ps[0]);
  if (errTexts.size) console.log(`  [${tag}] rejected bot moves (rule errors shown to the player):`, JSON.stringify([...errTexts]));
  if (GF?.phase !== 'over') console.log(`  [${tag}] last moves:\n   ` + tail.join('\n   '));
  if (opts.postHauntMax !== undefined) check(`${tag}: haunt played (to the end or ${opts.postHauntMax} haunt moves)`, GF?.phase === 'over' || (hauntStep >= 0 && step - hauntStep >= opts.postHauntMax), `${step} moves (${hauntStep >= 0 ? step - hauntStep : 0} in the haunt, ${GF?.turnCounter} turns), ${GF?.phase === 'over' ? `winner=${GF?.haunt?.winner}` : 'not over yet'}`);
  else check(`${tag}: game reached the end`, GF?.phase === 'over', `${step} moves, winner=${GF?.haunt?.winner}`);
  check(`${tag}: every move synced to all ${ps.length} clients`, stalls === 0 || GF?.phase === 'over', `avg ${(syncSum / Math.max(1, syncN)).toFixed(0)}ms, max ${syncMax}ms`);
  check(`${tag}: drawn cards pop up on every client`, cardChecks > 0 && cardOk === cardChecks, `${cardOk}/${cardChecks}`);
  check(`${tag}: dice overlay (faces, why, total) on every client`, diceChecks > 0 && diceOk === diceChecks, `${diceOk}/${diceChecks}${diceBad.length ? ' bad: ' + diceBad.slice(0, 3).join(' | ') : ''}`);
  check(`${tag}: roll button only for the roller, others see "Đang chờ … đổ xúc xắc"`, rollUiChecks > 0 && rollUiOk === rollUiChecks, `${rollUiOk}/${rollUiChecks}${rollUiBad.length ? ' bad: ' + rollUiBad.slice(0, 2).join(' | ') : ''}`);
  check(`${tag}: every roll was made by clicking "🎲 Đổ xúc xắc"`, rollClicks > 0 && rollClickFail === 0, `${rollClicks} clicks, ${rollClickFail} fallbacks`);
  check(`${tag}: no dice rolled without a press`, unpressed.length === 0, unpressed.slice(0, 3).join(' | '));
  // end screen everywhere, same title
  if (GF?.phase === 'over') {
  const ends = await Promise.all(ps.map(async (p) => { await p.page.locator('.end-overlay .eo-title').waitFor({ timeout: 8000 }).catch(() => {}); return p.page.locator('.end-overlay .eo-title').innerText().catch(() => ''); }));
  check(`${tag}: end screen on all clients`, ends.every((t) => t && t === ends[0]), ends[0]);
  } else { const sids = await Promise.all(ps.map(SID)); check(`${tag}: all clients on the same state when stopped`, sids.every((x) => x === sids[0]), `stateID ${sids[0]}`); }
  // hidden info: private log lines only on their owner; deck order never sent
  const priv = await Promise.all(ps.map(async (p) => { const g = (await G(p))!; return g.log.filter((l) => l.private).every((l) => l.private!.includes(p.pid!)) && JSON.stringify(g.decks.event) === JSON.stringify([...g.decks.event].sort()); }));
  check(`${tag}: private info only reaches its owner (log, deck order)`, priv.every(Boolean));
}

async function reloadTest(tag: string, ps: P[]) {
  const p = ps[ps.length - 1]; const pid = p.pid;
  await p.page.reload();
  const back = await waitFor(async () => (await p.page.evaluate(() => (window as any).__bg?.playerID)) === pid && (await G(p)) !== null, 15000);
  const ids = await Promise.all(ps.map(SID));
  check(`${tag}: reload mid-game returns ${p.name} to the same seat`, back && ids.every((x) => x === ids[0]) && p.page.url().includes('match='), `seat ${pid}, url ${p.page.url().replace(BASE, '')}`);
}
async function disconnectTest(tag: string, ps: P[]) {
  const p = ps[1]; const watcher = ps[0];
  await p.page.close();
  const offSeen = await waitFor(async () => (await watcher.page.locator('.pcard', { hasText: p.name }).locator('.netdot.off').count()) > 0, 12000, 300);
  await watcher.page.screenshot({ path: `${SHOTS}/${tag}-disconnected.png` });
  p.page = await p.ctx.newPage(); hook(p.page, p.name);
  await p.page.goto(BASE + '/'); // no link: last seat from localStorage
  const back = await waitFor(async () => (await p.page.evaluate(() => (window as any).__bg?.playerID)) === p.pid, 15000);
  const onSeen = await waitFor(async () => (await watcher.page.locator('.pcard', { hasText: p.name }).locator('.netdot.on').count()) > 0, 12000, 300);
  check(`${tag}: disconnect shows ${p.name} offline to others`, offSeen);
  check(`${tag}: ${p.name} reopens the site and is back in the seat (localStorage)`, back && onSeen);
}

async function setupMatch(b: Browser, tag: string, names: string[], mobileIdx = -1, haunt = 1) {
  const ps: P[] = [];
  for (let i = 0; i < names.length; i++) ps.push(await newPlayer(b, names[i], i === mobileIdx));
  const { link, matchID } = await createViaUI(ps[0], names.length, haunt);
  check(`${tag}: create room in lobby shows invite link`, /\?match=/.test(link), link.replace(BASE, ''));
  if (!QUICK && mobileIdx !== 0) {
    await ps[0].page.locator('.invitebox button').click();
    const clip = await ps[0].page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check(`${tag}: "Copy link mời" copies the invite link`, clip === link || (await ps[0].page.locator('.invitebox button').innerText()).includes('Đã copy'), clip ? 'clipboard ok' : 'button state');
  }
  const ways: ('link' | 'code' | 'list')[] = ['link', 'code', 'list', 'link', 'code'];
  for (let i = 1; i < ps.length; i++) await joinViaUI(ps[i], ways[i - 1], matchID, link);
  const inSelect = await Promise.all(ps.map((p) => p.page.locator('.selectscreen').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)));
  check(`${tag}: ${ps.length} players joined (invite link / match ID / lobby list)`, inSelect.every(Boolean));
  for (const p of ps) p.pid = await p.page.evaluate(() => (window as any).__bg?.playerID);
  check(`${tag}: each player got a distinct seat`, new Set(ps.map((p) => p.pid)).size === ps.length, ps.map((p) => `${p.name}=#${p.pid}`).join(' '));
  // all names visible to everyone
  const namesOk = await waitFor(async () => (await Promise.all(ps.map((p) => p.page.locator('.ss-foot').innerText()))).every((t) => names.every((n) => t.includes(n))), 10000, 300);
  check(`${tag}: every client sees every player's name`, namesOk);
  return { ps, link, matchID };
}

async function selectChars(tag: string, ps: P[], conflict: boolean) {
  const chars = ['Darrin "Flash" Williams', 'Madame Zostra', 'Zoe Ingstrom', 'Peter Akimoto', 'Father Rhinehardt', 'Heather Granville'];
  const card = (p: P, n: string) => p.page.locator('.char', { has: p.page.locator('h3', { hasText: n }) }).getByRole('button');
  if (conflict) {
    // two players click the same character at the same moment
    await Promise.all([card(ps[0], chars[0]).click(), card(ps[1], chars[0]).click()]);
    await sleep(1200);
    const g = (await G(ps[0]))!;
    const owners = Object.values(g.players).filter((x) => x.character === 'darrin-williams');
    const loser = owners[0]?.id === ps[0].pid ? ps[1] : ps[0];
    const loserTxt = await card(loser, chars[0]).innerText();
    check(`${tag}: same character picked by 2 players → only one gets it`, owners.length === 1 && /đã chọn/.test(loserTxt) && (await card(loser, chars[0]).isDisabled()), `winner ${owners[0]?.name}, other sees "${loserTxt}"`);
    // the loser takes another colour; Missy (yellow) vs Zoe (yellow) colour conflict too
    const rest = ps.filter((p) => p !== (owners[0]?.id === ps[0].pid ? ps[0] : ps[1]));
    for (let i = 0; i < rest.length; i++) await card(rest[i], chars[i + 1]).click();
    const sameColor = await card(ps[0], 'Missy Dubourde').isDisabled().catch(() => false);
    check(`${tag}: same-colour character (Missy vs Zoe, yellow) is locked`, sameColor);
  } else for (let i = 0; i < ps.length; i++) await card(ps[i], chars[i]).click();
  const allPicked = await waitFor(async () => Object.values((await G(ps[0]))!.players).every((x) => x.character), 8000);
  check(`${tag}: online character select done`, allPicked);
  await ps[0].page.locator('.selectscreen').screenshot({ path: `${SHOTS}/${tag}-select-p0.png` }).catch(() => {});
  await ps[ps.length - 1].page.screenshot({ path: `${SHOTS}/${tag}-select-last.png` });
  await ps[0].page.getByRole('button', { name: /Bắt đầu khám phá/ }).click();
  const started = await waitFor(async () => (await Promise.all(ps.map(async (p) => (await G(p))?.phase))).every((x) => x === 'explore'), 8000);
  const orders = await Promise.all(ps.map(async (p) => { const g = (await G(p))!; return JSON.stringify(g.order) + '|' + g.turn.player; }));
  const turnTxt = await Promise.all(ps.map((p) => p.page.locator('.badge.turn').innerText().catch(() => '')));
  const g = (await G(ps[0]))!;
  check(`${tag}: game starts for everyone with the same turn order`, started && orders.every((o) => o === orders[0]) && turnTxt.every((t) => t === turnTxt[0]), `order ${g.order.map((id) => g.players[id].name).join(' → ')} (first: ${g.players[g.turn.player].name})`);
}

async function hauntCheck(tag: string, ps: P[], shot: boolean) {
  const h = HAUNTS[(await G(ps[0]))?.haunt?.number ?? 1];
  const sig = (s: string) => s.split('\n').map((x) => x.trim()).filter((x) => x.length > 25)[0];
  const heroSig = sig(h.heroText); const trSig = sig(h.traitorText);
  const res = await Promise.all(ps.map(async (p) => {
    const g = (await G(p))!; const isTr = g.haunt?.traitor === p.pid;
    const side = await p.page.locator('.haunt-reveal .hr-side').innerText({ timeout: 4000 }).catch(() => '');
    if (shot) await sleep(1500);
    if (shot) await p.page.screenshot({ path: `${SHOTS}/${tag}-reveal-${p.name}.png` });
    if (p.page.isClosed()) return { name: p.name, isTr, ok: false };
    await p.page.locator('.haunt-reveal').click().catch(() => {});
    await p.page.locator('.modal').click({ position: { x: 5, y: 5 }, timeout: 800 }).catch(() => {});
    const txt = await p.page.locator('.panel.haunt .htext').innerText({ timeout: 4000 }).catch(() => '');
    const body = await p.page.locator('body').innerText();
    const ok = (isTr ? /PHẢN BỘI/.test(side) : /ANH HÙNG/.test(side)) && txt.includes(isTr ? trSig : heroSig) && !body.includes(isTr ? heroSig : trSig) && (await p.page.locator('.segmented').count()) === 0;
    return { name: p.name, isTr, ok };
  }));
  check(`${tag}: haunt #${h.number} reveal + side-specific instructions; other side's text hidden`, res.every((r) => r.ok), res.map((r) => `${r.name}:${r.isTr ? 'traitor' : 'hero'}${r.ok ? '' : '✗'}`).join(' '));
  if (shot) { await sleep(300); for (const p of ps) await p.page.screenshot({ path: `${SHOTS}/${tag}-haunt-${p.name}.png` }); }
}

/** Haunt #40: the burial room reaches only the traitor (state, status panel, log, move log) until it is found. */
async function burialCheck(tag: string, ps: P[]) {
  const views = await Promise.all(ps.map(async (p) => {
    const st = await p.page.evaluate(() => { const s = (window as any).__bg?.getState(); return s ? { d: s.G.haunt?.data, tr: s.G.haunt?.traitor, logs: [...(s.deltalog ?? []), ...(s.log ?? [])].filter((l: any) => l?.action?.payload?.type === 'resolve').map((l: any) => ({ pid: l.action.payload.playerID, args: l.action.payload.args })) } : null; });
    const body = await p.page.locator('body').innerText().catch(() => '');
    return { p, st, body };
  }));
  const trV = views.find((v) => v.st && v.st.tr === v.p.pid); const burial = trV?.st?.d?.burial as string | undefined;
  if (!burial || !trV) return; // not chosen yet
  const found = !!trV.st!.d.found; let ok = true; const bad: string[] = [];
  for (const v of views) {
    if (!v.st) continue; const isTr = v.p.pid === v.st.tr;
    if (isTr) { if (!/\(bí mật\)/.test(v.body) && !found) { ok = false; bad.push(`${v.p.name}: traitor can't see own secret`); } continue; }
    if (found) continue;
    if (v.st.d.burial) { ok = false; bad.push(`${v.p.name}: burial in state`); }
    if (/\(bí mật\)|Phòng chôn: /.test(v.body)) { ok = false; bad.push(`${v.p.name}: burial in page text`); }
    if (v.st.logs.some((l: any) => l.pid === v.st!.tr && JSON.stringify(l.args ?? null).includes(burial))) { ok = false; bad.push(`${v.p.name}: burial in move log`); }
  }
  burialChecks++; if (!ok) burialFails.push(...bad);
}
let burialChecks = 0; const burialFails: string[] = [];

async function hauntMatch(b: Browser, h: number, n: number) {
  const tag = `H${h}`; const names = Array.from({ length: n }, (_, i) => `${tag}-${['An', 'Bảo', 'Chi', 'Dũng', 'Em', 'Giang'][i]}`);
  const M = await setupMatch(b, tag, names, n - 1, h);
  const g0 = (await G(M.ps[0]))!; check(`${tag}: room created with house rule "always Haunt #${h}"`, g0.options?.forceHaunt === h, `forceHaunt=${g0.options?.forceHaunt}`);
  await selectChars(tag, M.ps, false);
  const mob = M.ps[n - 1].page;
  await playMatch(tag, M.ps, {
    onHaunt: async () => {
      await hauntCheck(tag, M.ps, true);
      const g = (await G(M.ps[0]))!; check(`${tag}: forced haunt #${h} started (online)`, g.haunt?.number === h, `#${g.haunt?.number} ${g.haunt?.name}, traitor ${g.haunt?.traitor ? g.players[g.haunt.traitor].name : '-'}`);
      await sleep(600); await mob.screenshot({ path: `${SHOTS}/${tag}-mobile-haunt.png` });
      check(`${tag}: mobile 390×844 during the haunt has no horizontal overflow`, await mob.evaluate(() => document.documentElement.scrollWidth <= 392));
    },
    reconnectAfterHaunt: 8, postHauntMax: 260, maxSteps: 2500,
    periodic: h === 40 ? () => burialCheck(tag, M.ps) : undefined,
  });
  for (const p of M.ps) await p.page.screenshot({ path: `${SHOTS}/${tag}-end-${p.name}.png` }).catch(() => {});
  for (const p of M.ps) await p.ctx.close().catch(() => {});
}

const b = await chromium.launch();
const t0 = Date.now();
try {
  if (process.env.HAUNTS) {
    // each new haunt online: house rule forces the haunt; 3–5 real browser clients incl. one phone; 2 matches at a time
    const list = process.env.HAUNTS.split(',').map(Number); const sizes: Record<number, number> = { 4: 5, 26: 3, 37: 4, 38: 3, 40: 4, 1: 3 };
    for (let i = 0; i < list.length; i += 2) await Promise.all(list.slice(i, i + 2).map((h) => hauntMatch(b, h, sizes[h] ?? 4)));
    if (list.includes(40)) check('H40: burial room hidden from heroes (state, panel, log, move log) — checked repeatedly', burialChecks > 0 && burialFails.length === 0, `${burialChecks} checks${burialFails.length ? ': ' + burialFails.slice(0, 4).join('; ') : ''}`);
  } else if (process.env.BIG === '1') {
    // 5- and 6-player rooms, concurrently
    const C = await setupMatch(b, 'C5', ['P1', 'P2', 'P3', 'P4', 'P5']);
    const D = await setupMatch(b, 'D6', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    await Promise.all([selectChars('C5', C.ps, false), selectChars('D6', D.ps, false)]);
    await Promise.all([playMatch('C5', C.ps, { onHaunt: () => hauntCheck('C5', C.ps, false) }), playMatch('D6', D.ps, { reloadAt: 40, onHaunt: () => hauntCheck('D6', D.ps, false) })]);
    await D.ps[0].page.screenshot({ path: `${SHOTS}/D6-end.png` });
  } else if (QUICK) {
    const A = await setupMatch(b, 'tunnel', ['An', 'Bình', 'Chi']);
    await selectChars('tunnel', A.ps, false);
    await playMatch('tunnel', A.ps, { onHaunt: () => hauntCheck('tunnel', A.ps, true) });
  } else {
    // --- negative lobby cases
    const x = await newPlayer(b, 'Khách');
    await x.page.goto(`${BASE}/?match=khong-ton-tai-123`);
    await x.page.getByPlaceholder('Ví dụ: Quân').fill('Khách'); await x.page.getByRole('button', { name: 'Vào phòng' }).click();
    check('invalid match ID → clear error', await waitFor(async () => /Không tìm thấy phòng/.test(await x.page.locator('.error').innerText().catch(() => '')), 5000));
    await x.page.getByPlaceholder('Dán link mời hoặc mã phòng').fill(''); await x.page.getByRole('button', { name: 'Vào phòng' }).click();
    check('empty match ID → asks for a code', /mã phòng/.test(await x.page.locator('.error').innerText().catch(() => '')));

    // --- match A: 4 players desktop, match B: 3 players incl. a phone, concurrently
    const A = await setupMatch(b, 'A', ['Quân', 'Minh', 'Lan', 'Hùng']);
    await x.page.goto(A.link); await x.page.getByPlaceholder('Ví dụ: Quân').fill('Khách'); await x.page.getByRole('button', { name: 'Vào phòng' }).click();
    check('joining a full room → "đã đủ người"', await waitFor(async () => /đủ người/.test(await x.page.locator('.error').innerText().catch(() => '')), 5000));
    const B = await setupMatch(b, 'B', ['Vy', 'Tú', 'Nam'], 0);
    const mob = B.ps[0].page;
    await mob.screenshot({ path: `${SHOTS}/B-mobile-select.png` });
    check('mobile 390×844: select screen has no horizontal overflow', await mob.evaluate(() => document.documentElement.scrollWidth <= 392));
    await Promise.all([selectChars('A', A.ps, true), selectChars('B', B.ps, false)]);
    await sleep(800);
    await mob.screenshot({ path: `${SHOTS}/B-mobile-board.png` });
    check('mobile 390×844: board has no horizontal overflow', await mob.evaluate(() => document.documentElement.scrollWidth <= 392));
    await A.ps[0].page.screenshot({ path: `${SHOTS}/A-board-Quân.png` });
    // matches are isolated
    const gA = (await G(A.ps[0]))!; const gB = (await G(B.ps[0]))!;
    check('2 concurrent matches are isolated', Object.values(gA.players).every((p) => !['Vy', 'Tú', 'Nam'].includes(p.name)) && Object.values(gB.players).every((p) => !['Quân', 'Minh', 'Lan', 'Hùng'].includes(p.name)), `A=${A.matchID} B=${B.matchID}`);
    await Promise.all([
      playMatch('A', A.ps, { reloadAt: 25, disconnectAt: 45, onHaunt: () => hauntCheck('A', A.ps, true) }),
      playMatch('B', B.ps, { onHaunt: async () => { await hauntCheck('B', B.ps, false); await mob.screenshot({ path: `${SHOTS}/B-mobile-haunt.png` }); } }),
    ]);
    for (const p of [...A.ps]) await p.page.screenshot({ path: `${SHOTS}/A-end-${p.name}.png` });
    await mob.screenshot({ path: `${SHOTS}/B-mobile-end.png` });
    // after the game: the lobby list no longer offers full rooms
    await x.page.goto(BASE + '/'); await sleep(1500);
    check('lobby list hides full rooms', (await x.page.locator('.matches li', { hasText: A.matchID }).count()) === 0);
  }
} catch (e) { check('test harness exception', false, String((e as Error).stack ?? e)); }
await b.close();
const fails = results.filter((r) => !r.ok);
check('no page errors / console errors in any client', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${results.length - fails.length - (errors.length ? 1 : 0)}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
fs.writeFileSync(`${SHOTS}/results.json`, JSON.stringify({ results, errors }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
