import { chromium } from "playwright-core";
import path from "node:path";

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const file = "file:///" + path.resolve("header.html").replace(/\\/g, "/");

const b = await chromium.launch({ executablePath: CHROME, headless: true });

// 2倍で描いて縮小されても潰れないようにする（X は 1500x500 推奨だが上限まで余裕がある）。
const p = await b.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: 2 });
await p.goto(file);
await p.waitForLoadState("networkidle");
await p.screenshot({ path: "shots/x-header.png" });

// タグライン違いの比較用。文言はサイト側の名乗りに合わせる案。
for (const [name, text] of [
  ["site", "プロセカをより楽しむためのツール集"],
  ["none", ""],
]) {
  await p.evaluate((t) => {
    const el = document.querySelector(".tag");
    if (el) el.textContent = t;
    if (el && !t) el.remove();
  }, text);
  await p.screenshot({ path: `shots/x-header-${name}.png` });
}
// 元の文言に戻してから安全域の確認へ進む。
await p.evaluate(() => {
  const plate = document.querySelector(".plate > div");
  if (plate && !document.querySelector(".tag")) {
    const d = document.createElement("div");
    d.className = "tag";
    d.textContent = "プロセカのイベランを、計算で助ける";
    plate.appendChild(d);
  } else {
    document.querySelector(".tag").textContent = "プロセカのイベランを、計算で助ける";
  }
});

// スマホでの見え方の確認用。アイコンが重なる位置と、上下が切れる範囲を重ねて描く。
await p.addStyleTag({
  content: `
    body::before {
      content: ""; position: absolute; left: 60px; bottom: -60px;
      width: 200px; height: 200px; border-radius: 50%;
      background: rgba(238,17,102,0.35); border: 4px solid #ee1166; z-index: 99;
    }
    body::after {
      content: ""; position: absolute; left: 0; right: 0; top: 0; height: 100%;
      z-index: 98; pointer-events: none;
      background: linear-gradient(180deg,
        rgba(0,0,0,0.35) 0, rgba(0,0,0,0.35) 60px,
        rgba(0,0,0,0) 60px, rgba(0,0,0,0) 440px,
        rgba(0,0,0,0.35) 440px, rgba(0,0,0,0.35) 100%);
    }
  `,
});
await p.screenshot({ path: "shots/x-header-safearea.png" });

await b.close();
console.log("書き出した: shots/x-header.png（3000x1000）/ shots/x-header-safearea.png");
