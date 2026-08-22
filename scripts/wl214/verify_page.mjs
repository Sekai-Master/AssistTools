// wl214 ページの検証。拡張リレーが噛むので独立 Chrome を自前で立てる。
// コンソールエラー0 / 横あふれ0 / 主要数値 / フォールバック経路のクラッシュ有無 を見る。
import { chromium } from 'playwright-core';

// ポートは brain の life/dev-ports.md の割り当て（AssistTools = 3010-3019、+1 が preview）。
// `npm run preview` で立ててから実行する。
const URL = 'http://localhost:3011/wl214/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const grabFn = () => {
  const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
  const pick = (re) => { const m = t.match(re); return m ? m[1] : null; };
  return {
    landing: pick(/着地見込み\n([\d.]+億)/),
    needLb: pick(/ここから必要なLB\n([\d,]+) LB/),
    totalLb: pick(/全期間 ([\d,]+)/),
    autoHours: pick(/所要\n([\d.]+) 時間 \/ 日/),
    autoPt: pick(/([\d,]+)Pt \/ 回/),
    coefLine: pick(/(係数 = [^\n]*)/),
    m50: pick(/総合50位 ボーダー\n[^\n]+\nマージン ([^\n]+)/),
    m100: pick(/総合100位 ボーダー\n[^\n]+\nマージン ([^\n]+)/),
  };
};

const settleFn = async () => {
  const g = () => {
    const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
    return (t.match(/着地見込み\n([\d.]+億)/) || [])[1] + '|' + (t.match(/ここから必要なLB\n([\d,]+) LB/) || [])[1];
  };
  let prev = null, same = 0, t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    await new Promise(r => setTimeout(r, 250));
    const c = g();
    if (c === prev) { if (++same >= 4) return true; } else { same = 0; prev = c; }
  }
  return false;
};

const overflowFn = () => {
  const de = document.documentElement;
  const off = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > de.clientWidth + 1) {
      let scrollable = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') { scrollable = true; break; }
      }
      if (!scrollable) off.push(el.tagName + '.' + String(el.className).slice(0, 30));
    }
  });
  return { clientW: de.clientWidth, scrollW: de.scrollWidth, overflow: de.scrollWidth > de.clientWidth, offenders: off.slice(0, 8) };
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function run(label, width, blockMusicData) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  if (blockMusicData) await page.route('**/MusicDatas/**', r => r.abort());
  await page.goto(URL, { waitUntil: 'load' });
  const title = await page.title();
  // ★ 対象の取り違えを防ぐ。2026-08-22 に、落ちたプレビューのポートを別プロジェクトが
  //   取っていたのに気づかず「wl214 を検証したつもりで旅程ページを測っていた」事故があった。
  if (!/SekaiMaster|WL3/.test(title)) throw new Error('別サイトを掴んでいる: ' + title);
  await page.evaluate(settleFn);
  const vals = await page.evaluate(grabFn);
  const of = await page.evaluate(overflowFn);
  console.log('=== ' + label + ' ===');
  console.log('  コンソールエラー:', errors.filter(e => !e.includes('favicon')).length,
              errors.filter(e => !e.includes('favicon')).slice(0, 3));
  console.log('  横あふれ:', of.overflow, of.offenders.length ? of.offenders : '');
  console.log('  値:', JSON.stringify(vals, null, 0));
  await ctx.close();
}

await run('デスクトップ 1440', 1440, false);
await run('モバイル 390', 390, false);
await run('MusicDatas 取得失敗（フォールバック経路）', 1440, true);
await browser.close();
