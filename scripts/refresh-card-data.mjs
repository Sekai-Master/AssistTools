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
import sharp from "sharp";
import { auditLeaks, derive } from "./lib/deriveCardData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/CardDatas");
const BASE = "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main";

/**
 * カードのサムネイル。**ジャケット画像（refresh-music-data.js）と同じ方針**で、
 * 取得元を毎回叩かせるのではなく落として縮めて自前で配信する。
 *
 * ★★ 取りに行く対象は「派生データに残ったカード」だけ。★★
 *   未公開カードは derive() の時点で落ちているので、ここを起点にする限り
 *   未公開アセットへのリクエスト自体が発生しない（＝取得ログにも痕跡が出ない）。
 *   **カードの一覧を src.cards（生のマスタ）から作り直してはいけない。**
 *
 * ★ 特訓後の絵があるのは trained（特訓の加算）を持つカードだけ。
 *   1★・2★・birthday には無い（実際に404が返る）ことを確認済み。
 */
const THUMB_DIR = path.join(OUT_DIR, "thumb");
const THUMB_BASE = "https://storage.sekai.best/sekai-jp-assets/thumbnail/chara";
// 元画像が 128px なので、拡大はせずそのまま webp にするだけ（1枚 3〜4KB）。
const THUMB_WIDTH = 128;
const THUMB_QUALITY = 80;
const THUMB_CONCURRENCY = 8;

/** 取ってくるマスタ。ここに足すときは、その表が日付欄を持つかを必ず確かめること。 */
const SOURCES = {
  cards: "cards.json",
  cardEpisodes: "cardEpisodes.json",
  cardMysekaiCanvasBonuses: "cardMysekaiCanvasBonuses.json",
  events: "events.json",
  eventCards: "eventCards.json",
  eventDeckBonuses: "eventDeckBonuses.json",
  eventCardBonusLimits: "eventCardBonusLimits.json",
  eventRarityBonusRates: "eventRarityBonusRates.json",
  masterLessons: "masterLessons.json",
  characterRanks: "characterRanks.json",
  areaItemLevels: "areaItemLevels.json",
  gameCharacterUnits: "gameCharacterUnits.json",
  mysekaiGates: "mysekaiGates.json",
  mysekaiGateLevels: "mysekaiGateLevels.json",
};

async function fetchJson(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`);
  return res.json();
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/**
 * カードのサムネイルを揃える。既にあるファイルは触らない（毎回2000枚落とさない）。
 * 取得できないものは警告に留める（配信の遅れ・アセット名の例外は想定内で、
 * 画像が無くても計算は動く。画面側は代替表示に落とす）。
 */
async function syncThumbnails(cards) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });

  const wanted = [];
  for (const c of cards) {
    wanted.push({ asset: c.asset, variant: "normal" });
    // 特訓後の絵を持つのは特訓の加算があるカードだけ（1★・2★・birthday には無い）。
    if ((c.trained?.[0] ?? 0) > 0) wanted.push({ asset: c.asset, variant: "after_training" });
  }
  const todo = wanted.filter(
    (w) => !fs.existsSync(path.join(THUMB_DIR, `${w.asset}_${w.variant}.webp`))
  );
  if (todo.length === 0) {
    console.log(`サムネイル: ${wanted.length}枚すべて取得済み`);
    return;
  }

  let done = 0;
  const failures = [];
  const worker = async () => {
    for (;;) {
      const item = todo[done++];
      if (!item) return;
      const name = `${item.asset}_${item.variant}`;
      try {
        const res = await fetch(`${THUMB_BASE}/${name}.png`);
        if (!res.ok) {
          failures.push(`${name} (HTTP ${res.status})`);
          continue;
        }
        const webp = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: THUMB_QUALITY })
          .toBuffer();
        fs.writeFileSync(path.join(THUMB_DIR, `${name}.webp`), webp);
      } catch (err) {
        failures.push(`${name} (${err.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: THUMB_CONCURRENCY }, worker));

  const got = todo.length - failures.length;
  console.log(`サムネイル: 新規 ${got}枚 / 既存 ${wanted.length - todo.length}枚 / 失敗 ${failures.length}`);
  if (failures.length) console.warn("  取得できなかったもの:", failures.join(", "));
}

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
      episodes: out.episodes,
      canvasBonuses: out.canvasBonuses,
      characterRanks: out.characterRanks,
      areaItems: out.areaItems,
      gates: out.gates,
    },
  };
  for (const [name, data] of Object.entries(files)) {
    const json = JSON.stringify(data);
    fs.writeFileSync(path.join(OUT_DIR, name), json);
    console.log(
      `  ${name.padEnd(14)} ${kb(json.length).padStart(8)}  (brotli ${kb(zlib.brotliCompressSync(json).length)})`
    );
  }
  // ★ 画像は JSON を書き出したあと（＝未公開データの検算を通したあと）に取りに行く。
  //   out.cards が起点なので、未公開カードのアセットは要求しない。
  await syncThumbnails(out.cards);

  console.log("完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
