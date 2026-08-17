/**
 * マイセカイの家具と「キャラの反応」の派生データを作る。
 * 既存の refresh-music-data.js / refresh-card-data.mjs と同じ流儀
 *（マスタDBから取得 → 加工 → public/ に置く）。判断は deriveMysekaiData.mjs 側。
 *
 * ★ この表は未公開判定ができない（日付欄が無い）。auditLeaks 相当の検算は書けないので、
 *   代わりに前回出力との差分件数をログに出す。詳細は deriveMysekaiData.mjs の冒頭。
 *
 * 使い方: node scripts/refresh-mysekai-data.mjs
 * 出力:   public/MysekaiDatas/fixtures.json と thumb/*.webp
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import sharp from "sharp";
import { derive, summarize } from "./lib/deriveMysekaiData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/MysekaiDatas");
const OUT_FILE = path.join(OUT_DIR, "fixtures.json");
const THUMB_DIR = path.join(OUT_DIR, "thumb");

/**
 * 家具のサムネイル。
 *
 * ★★ **実行時に取りに行かない。** ★★
 *   配信元は Referer 付きの要求を 403 で弾く（他サイトからの直リンクを意図的に塞いでいる）。
 *   `referrerPolicy` で回避はできるが、**先方が明示的に塞いでいるものを迂回しない**
 *  （Nori 判断 2026-08-02。立ち絵・イベントロゴと同じ扱い）。ビルド時に落として自前配信する。
 *
 * ★ パスは家具種別で2系統。正本は sekai-viewer の src/utils/mysekaiFixtureUtils.ts。
 *   実測で 34/34 が 200（全8種別＋ランダム20件）、152×152 のアルファ付き WebP。
 */
const ASSET_BASE = "https://storage.sekai.best/sekai-jp-assets/mysekai/thumbnail";
const THUMB_CONCURRENCY = 8;
const THUMB_QUALITY = 82;

/**
 * ★ 取得元が既存2スクリプト（raw.githubusercontent.com）と違う。
 *   マイセカイ系は必要な表が12本あり、raw を連続で叩くと
 *   **429 Too Many Requests** に落ちることを実測した（2026-08-17）。
 *   同じ内容が GitHub Pages 経由なら制限に当たらないのでこちらを使う。
 *   既存2本を移す判断はしていない（動いているものを触らない）。
 */
const BASE = "https://sekai-world.github.io/sekai-master-db-diff";

/**
 * 取ってくるマスタ。
 * ★ ここに足すときは、その表が日付欄を持つかを必ず確かめること
 *  （refresh-card-data.mjs と同じ約束。ただし家具系は軒並み持っていない）。
 */
const SOURCES = {
  mysekaiFixtures: "mysekaiFixtures.json",
  mysekaiFixtureMainGenres: "mysekaiFixtureMainGenres.json",
  mysekaiFixtureSubGenres: "mysekaiFixtureSubGenres.json",
  mysekaiBlueprints: "mysekaiBlueprints.json",
  mysekaiCharacterTalks: "mysekaiCharacterTalks.json",
  mysekaiCharacterTalkConditions: "mysekaiCharacterTalkConditions.json",
  mysekaiCharacterTalkConditionGroups: "mysekaiCharacterTalkConditionGroups.json",
  mysekaiGameCharacterUnitGroups: "mysekaiGameCharacterUnitGroups.json",
  mysekaiCharacterTalkFixtureCommons: "mysekaiCharacterTalkFixtureCommons.json",
  mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroups:
    "mysekaiCharacterTalkFixtureCommonMysekaiFixtureGroups.json",
  gameCharacterUnits: "gameCharacterUnits.json",
  gameCharacters: "gameCharacters.json",
};

async function fetchJson(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * ★ 文字数ではなくバイト数で測る。日本語は UTF-8 で1文字3バイトなので、
 *   `json.length / 1024` だと実際の配信量を3割ほど小さく見誤る
 *  （家具名がほぼ日本語のこのファイルでは 230KB と出て実測 314KB だった）。
 */
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const byteKb = (s) => kb(Buffer.byteLength(s, "utf8"));

/** 前回出力の要約。無ければ null（初回）。 */
function previousSummary() {
  if (!fs.existsSync(OUT_FILE)) return null;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    if (!Array.isArray(prev?.fixtures)) return null;
    return summarize(prev);
  } catch {
    return null;
  }
}

function reportDiff(before, after) {
  if (!before) {
    console.log("前回の出力が無いので差分は出さない（初回）");
    return;
  }
  const keys = Object.keys(after);
  const changed = keys.filter((k) => before[k] !== after[k]);
  if (changed.length === 0) {
    console.log("前回から変化なし");
    return;
  }
  console.log("前回からの差分:");
  for (const k of changed) {
    const d = after[k] - before[k];
    console.log(`  ${k.padEnd(12)} ${before[k]} → ${after[k]} (${d > 0 ? "+" : ""}${d})`);
  }
  // 一度に増えすぎた回は、実装前のマスタが先行して入った可能性がある（未公開判定ができないため）。
  const grew = after.fixtures - before.fixtures;
  if (grew >= 50) {
    console.warn(
      `⚠ 家具が一度に ${grew} 件増えている。実装前のデータが先行していないか確認すること。`
    );
  }
}

/**
 * 家具1件ぶんのサムネイル取得元URL。out（派生データ）を起点にするので、
 * 出力に残っていない家具のアセットは要求しない。
 */
function thumbUrl(f, vocab) {
  if (!f.im) return null;
  const type = vocab.type[f.ty];
  if (type === "surface_appearance") {
    // ★ 内装は階層も拡張子も違ううえ、**assetbundleName が壁紙と床で共通**。
    //   保存名(im)には向きが付いているので、取得元を組み立てるときは剥がす。
    const layout = vocab.layout[f.ly];
    if (!layout) return null;
    const ab = f.im.endsWith(`_${layout}`) ? f.im.slice(0, -(layout.length + 1)) : f.im;
    return `${ASSET_BASE}/surface_appearance/${ab}/tex_${ab}_${layout}_1.png`;
  }
  return `${ASSET_BASE}/fixture/${f.im}_1.webp`;
}

/**
 * サムネイルを揃える。**既にあるファイルは触らない**（毎回1,500枚落とさない）。
 * 取得できないものは警告に留める（画像が無くても一覧は成立する。画面側は名前だけ出す）。
 */
async function syncThumbnails(fixtures, vocab) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const wanted = fixtures
    .map((f) => ({ name: f.im, url: thumbUrl(f, vocab) }))
    .filter((x) => x.name && x.url);
  const todo = wanted.filter((x) => !fs.existsSync(path.join(THUMB_DIR, `${x.name}.webp`)));
  if (todo.length === 0) {
    console.log(`サムネイル: ${wanted.length}枚すべて取得済み`);
    return;
  }

  let next = 0;
  const failures = [];
  const worker = async () => {
    for (;;) {
      const item = todo[next++];
      if (!item) return;
      try {
        // ★ Referer を付けない（付けると403。Node の fetch は既定で付かないが、明示しておく）。
        const res = await fetch(item.url);
        if (!res.ok) {
          failures.push(`${item.name} (HTTP ${res.status})`);
          continue;
        }
        // 元が152pxと小さいので拡大はしない。内装のPNGだけ webp にして揃える。
        const buf = await sharp(Buffer.from(await res.arrayBuffer()))
          .webp({ quality: THUMB_QUALITY })
          .toBuffer();
        fs.writeFileSync(path.join(THUMB_DIR, `${item.name}.webp`), buf);
      } catch (err) {
        failures.push(`${item.name} (${err.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: THUMB_CONCURRENCY }, worker));

  const got = todo.length - failures.length;
  console.log(
    `サムネイル: 新規 ${got}枚 / 既存 ${wanted.length - todo.length}枚 / 失敗 ${failures.length}`
  );
  if (failures.length) console.warn("  取得できなかったもの:", failures.slice(0, 20).join(", "));
}

async function main() {
  // ★ 取得中に日付をまたいでも生成時刻が揺れないよう、最初に1回だけ固定する。
  const now = Date.now();
  console.log(`ビルド時刻: ${new Date(now).toISOString()}`);

  const src = {};
  for (const [key, file] of Object.entries(SOURCES)) {
    src[key] = await fetchJson(file);
    process.stdout.write(`  ${file} ${src[key].length}件\n`);
  }

  const before = previousSummary();
  const out = derive(src, now);
  const after = summarize(out);

  console.log(
    `家具 ${after.fixtures}件 / 反応あり ${after.reactive}件` +
      `（固有会話 ${after.withTalk} / キャラ動作 ${after.withAction} / 好み ${after.withCommon}）`
  );
  console.log(`会話 ${after.talks}本 / 模写可 ${after.sketchable}件 / キャラ ${after.characters}人`);
  reportDiff(before, after);

  if (out.fixtures.length === 0) {
    console.error("家具が0件。結合に失敗している可能性が高いので書き出しを中止します。");
    process.exit(1);
  }

  // 条件グループは AND だが、collectTalks は家具ごとにばらして数えている（OR 展開）。
  // 今のマスタには該当が無いので実害が無いだけなので、出てきたら知らせる。
  if (out.multiFixtureConditionGroups > 0) {
    console.warn(
      `⚠ 家具条件を2つ以上持つ会話条件グループが ${out.multiFixtureConditionGroups} 件ある。` +
        `\n  現在の結合は AND を OR として展開するので、会話数が水増しされ、` +
        `\n  それぞれの家具を単独で置いても会話が出るように見える。deriveMysekaiData.mjs を見直すこと。`
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // ★ 整形せずに書く。この画面でしか使わないデータなので転送量を優先する
  //   （refresh-music-data.js の musicScoreData.json と同じ判断）。
  const json = JSON.stringify(out);
  fs.writeFileSync(OUT_FILE, json);
  console.log(
    `  fixtures.json ${byteKb(json).padStart(8)}  (brotli ${kb(zlib.brotliCompressSync(json).length)})`
  );

  // ★ 画像は JSON を書き出したあとに取りに行く（out を起点にするため）。
  await syncThumbnails(out.fixtures, out.vocab);

  console.log("完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
