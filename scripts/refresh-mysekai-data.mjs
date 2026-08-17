/**
 * マイセカイの家具と「キャラの反応」の派生データを作る。
 * 既存の refresh-music-data.js / refresh-card-data.mjs と同じ流儀
 *（マスタDBから取得 → 加工 → public/ に置く）。判断は deriveMysekaiData.mjs 側。
 *
 * ★ この表は未公開判定ができない（日付欄が無い）。auditLeaks 相当の検算は書けないので、
 *   代わりに前回出力との差分件数をログに出す。詳細は deriveMysekaiData.mjs の冒頭。
 *
 * ★ 画像は扱わない。家具のサムネイルは storage.sekai.best 配下に見つからず
 *   （3パターン試して全404、assetList.json にも該当パスなし・2026-08-17 実測）、
 *   3Dモデル（assetbundleName）しか無いため。パスが判明したら syncImages 相当を足す。
 *
 * 使い方: node scripts/refresh-mysekai-data.mjs
 * 出力:   public/MysekaiDatas/fixtures.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { derive, summarize } from "./lib/deriveMysekaiData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/MysekaiDatas");
const OUT_FILE = path.join(OUT_DIR, "fixtures.json");

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

  console.log("完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
