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

/**
 * 紹介カードに使う立ち絵とイベントロゴ。
 *
 * ★★ **実行時に取りに行くことはできない。** ★★
 *   配信元（Cloudflare）は Referer 付きの要求を 403 で弾く設定になっている
 *   ＝他サイトからの直リンクを意図的に塞いでいる。ブラウザは画像取得で必ず
 *   Referer を送るので、実行時取得は設計上通らない（回避はしない）。
 *   ビルド時に落として自前配信する（サムネイル・ジャケットと同じ正規の経路）。
 *
 * ★ 立ち絵は★4と birthday だけ（Nori 判断 2026-08-02・約12MB）。
 *   紹介カードで使うのはリーダーの1枚で、そこに置くのは実質★4系だけなので、
 *   全レアリティを持つ（約28MB）に見合わない。★3以下がリーダーのときは
 *   画面側がサムネイルの簡易版に落ちる。
 */
const ART_DIR = path.join(OUT_DIR, "art");
const ART_BASE = "https://storage.sekai.best/sekai-jp-assets/character/member";
const ART_WIDTH = 420;
const ART_QUALITY = 72;
/** 立ち絵を持つレアリティ。 */
const ART_RARITIES = new Set(["4", "birthday"]);

const LOGO_DIR = path.join(OUT_DIR, "logo");
const LOGO_BASE = "https://storage.sekai.best/sekai-jp-assets/event";
const LOGO_WIDTH = 280;
const LOGO_QUALITY = 78;

/** 取ってくるマスタ。ここに足すときは、その表が日付欄を持つかを必ず確かめること。 */
const SOURCES = {
  cards: "cards.json",
  skills: "skills.json",
  cardEpisodes: "cardEpisodes.json",
  cardMysekaiCanvasBonuses: "cardMysekaiCanvasBonuses.json",
  events: "events.json",
  eventCards: "eventCards.json",
  eventDeckBonuses: "eventDeckBonuses.json",
  eventCardBonusLimits: "eventCardBonusLimits.json",
  // ★ ワールドリンク第3弾（イベント202以降）の「発揮可能総合力」の上限。
  //   日付欄を持たないが、中身は eventId と数値だけで未公開の名前を含まないので出してよい。
  eventTotalPowerLimits: "eventTotalPowerLimits.json",
  eventRarityBonusRates: "eventRarityBonusRates.json",
  // ★ ワールドリンクの「属性の種類数」ボーナス。eventId を持たない全体設定で、
  //   3種類=75% / 4種類=100% / 5種類=125%。日付欄は無いが数値だけなので出してよい。
  worldBloomDifferentAttributeBonuses: "worldBloomDifferentAttributeBonuses.json",
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
 * 画像を1枚落として webp に縮める。取得できなければ null（呼び出し側が数える）。
 * ★ Referer を付けない（付けると 403。ビルド時なので既定で付かないが、明示しておく）。
 */
async function fetchImage(url, width, quality) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return sharp(Buffer.from(await res.arrayBuffer()))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/** 落とす対象を並列で処理する共通ループ。既にあるファイルは触らない。 */
async function syncImages(label, dir, items) {
  fs.mkdirSync(dir, { recursive: true });
  const todo = items.filter((i) => !fs.existsSync(path.join(dir, `${i.name}.webp`)));
  if (todo.length === 0) {
    console.log(`${label}: ${items.length}件すべて取得済み`);
    return;
  }
  let next = 0;
  const failures = [];
  const worker = async () => {
    for (;;) {
      const item = todo[next++];
      if (!item) return;
      try {
        const buf = await fetchImage(item.url, item.width, item.quality);
        if (!buf) failures.push(item.name);
        else fs.writeFileSync(path.join(dir, `${item.name}.webp`), buf);
      } catch (err) {
        failures.push(`${item.name} (${err.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: THUMB_CONCURRENCY }, worker));
  console.log(
    `${label}: 新規 ${todo.length - failures.length}件 / 既存 ${items.length - todo.length}件 / 失敗 ${failures.length}`
  );
  if (failures.length) console.warn(`  取得できなかったもの:`, failures.slice(0, 20).join(", "));
}

/** リーダーに置く立ち絵（★4・birthday のみ）。 */
function artItems(cards) {
  const items = [];
  for (const c of cards) {
    if (!ART_RARITIES.has(c.rarity)) continue;
    items.push({
      name: `${c.asset}_normal`,
      url: `${ART_BASE}/${c.asset}/card_normal.webp`,
      width: ART_WIDTH,
      quality: ART_QUALITY,
    });
    if ((c.trained?.[0] ?? 0) > 0) {
      items.push({
        name: `${c.asset}_after_training`,
        url: `${ART_BASE}/${c.asset}/card_after_training.webp`,
        width: ART_WIDTH,
        quality: ART_QUALITY,
      });
    }
  }
  return items;
}

/** イベントのロゴ。**公開済みイベントのぶんだけ**（未公開のロゴは名前だけで内容が漏れる）。 */
function logoItems(events) {
  return events
    .filter((e) => e.asset)
    .map((e) => ({
      name: e.asset,
      url: `${LOGO_BASE}/${e.asset}/logo/logo.webp`,
      width: LOGO_WIDTH,
      quality: LOGO_QUALITY,
    }));
}

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
    // スキルはカードが skillId で引くので、カタログと同じファイルに置く（21行しかない）。
    "cards.json": { cards: out.cards, skills: out.skills, generatedAt: out.generatedAt },
    "bonuses.json": {
      generatedAt: out.generatedAt,
      events: out.events,
      deckBonuses: out.deckBonuses,
      unitCharacters: out.unitCharacters,
      cardBonuses: out.cardBonuses,
      rarityBonuses: out.rarityBonuses,
      bonusLimits: out.bonusLimits,
      attributeBonuses: out.attributeBonuses,
    },
    /**
     * 総合力の上限だけを抜いた極小ファイル。**5行しかない。**
     *
     * ★ なぜ bonuses.json と別に出すか: 上限は効率曲ランキングでも要るが、
     *   ランキングに bonuses.json（270KB）を読ませるのは
     *   「各ツールが編成ビルダーのデータを直接読むとどのページも重くなる」という
     *   既存方針（src/lib/profiles.ts）に反する。上限の判定に要るのは
     *   開催期間と数値だけなので、それだけを切り出して配る。
     */
    "powerLimits.json": {
      generatedAt: out.generatedAt,
      events: out.events
        .filter((e) => e.powerLimit != null)
        .map((e) => ({
          id: e.id,
          name: e.name,
          startAt: e.startAt,
          aggregateAt: e.aggregateAt,
          powerLimit: e.powerLimit,
        })),
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
  await syncImages("立ち絵", ART_DIR, artItems(out.cards));
  await syncImages("イベントロゴ", LOGO_DIR, logoItems(out.events));

  console.log("完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
