/**
 * カード・イベントの派生データを作る。既存の refresh-music-data.js と同じ流儀
 *（マスタDBから取得 → 加工 → public/ に置く）。
 *
 * ★ 公式が公開していない情報は出力に一切残さない。判断は deriveCardData.mjs 側で、
 *   ここは取得と書き出しだけを担う。最後に検算して、引っかかったら**書き出さずに落とす**
 *  （壊れた出力を置くより、古い出力のままにする方が安全）。
 *
 * 使い方: node scripts/refresh-card-data.mjs
 * 出力:   public/CardDatas/*.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { auditLeaks, derive } from "./lib/deriveCardData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/CardDatas");
const BASE = "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main";

/** 取ってくるマスタ。ここに足すときは、その表が日付欄を持つかを必ず確かめること。 */
const SOURCES = {
  cards: "cards.json",
  events: "events.json",
  eventCards: "eventCards.json",
  eventDeckBonuses: "eventDeckBonuses.json",
  eventCardBonusLimits: "eventCardBonusLimits.json",
  eventRarityBonusRates: "eventRarityBonusRates.json",
  masterLessons: "masterLessons.json",
  characterRanks: "characterRanks.json",
  areaItemLevels: "areaItemLevels.json",
  gameCharacterUnits: "gameCharacterUnits.json",
};

async function fetchJson(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`);
  return res.json();
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function main() {
  // ★ 取得中に日付をまたいでも判定が揺れないよう、時刻は最初に1回だけ固定する。
  const now = Date.now();
  console.log(`ビルド時刻: ${new Date(now).toISOString()}`);

  const src = {};
  for (const [key, file] of Object.entries(SOURCES)) {
    src[key] = await fetchJson(file);
    process.stdout.write(`  ${file} ${src[key].length}件\n`);
  }

  const out = derive(src, now);

  const dropped = {
    cards: src.cards.length - out.cards.length,
    events: src.events.length - out.events.length,
  };
  console.log(`未公開として落としたもの: カード ${dropped.cards}枚 / イベント ${dropped.events}件`);

  // 最終検算。ここで引っかかったら書き出さない。
  const problems = auditLeaks(out, {
    cardIds: new Set(out.cards.map((c) => c.id)),
    eventIds: new Set(out.events.map((e) => e.id)),
  });
  if (problems.length) {
    console.error("未公開データの痕跡が残っています。書き出しを中止します:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // カタログ（大きい）とボーナス表（小さく、更新が速い）を分ける。
  const files = {
    "cards.json": { cards: out.cards, generatedAt: out.generatedAt },
    "bonuses.json": {
      generatedAt: out.generatedAt,
      events: out.events,
      deckBonuses: out.deckBonuses,
      unitCharacters: out.unitCharacters,
      cardBonuses: out.cardBonuses,
      rarityBonuses: out.rarityBonuses,
      bonusLimits: out.bonusLimits,
    },
    "power.json": {
      generatedAt: out.generatedAt,
      masterBonuses: out.masterBonuses,
      characterRanks: out.characterRanks,
      areaItems: out.areaItems,
    },
  };
  for (const [name, data] of Object.entries(files)) {
    const json = JSON.stringify(data);
    fs.writeFileSync(path.join(OUT_DIR, name), json);
    console.log(
      `  ${name.padEnd(14)} ${kb(json.length).padStart(8)}  (brotli ${kb(zlib.brotliCompressSync(json).length)})`
    );
  }
  console.log("完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
