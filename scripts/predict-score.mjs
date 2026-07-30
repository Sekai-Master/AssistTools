#!/usr/bin/env node
/**
 * 実機測定の「予測値の事前登録」用。プレイする前にこれを走らせて期待値を出しておく。
 *
 * 測定してから式をいじると必ず後付けの説明ができてしまうので、
 * 先に予測を出して紙に固定してから叩く。ズレたらモデルが間違い、という順序を守るための道具。
 *
 * 使い方:
 *   node scripts/predict-score.mjs --song イレヴンス --diff hard --power 303417 \
 *     --deck 150,120,120,110,110 [--live solo|multi|auto] [--bonus 400] [--taki 0]
 *
 *   --deck は編成5枚のスコアアップ%。**先頭がリーダー（編成の一番左）**。
 *
 * 出力:
 *   solo … リーダーが1〜5枠のどこに入ったかで5通りの予測スコア（発動順はランダムなので）
 *   multi… 実効値から1通り
 *   どちらもイベントPtの予測つき。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/MusicDatas');
const FEVER_RATE = 0.5;
const MULTI_SUB_RATE = 0.2;
const DECK_SIZE = 5;
const LIVE_BONUS_MULTIPLIERS = { 0: 1, 1: 5, 2: 10, 3: 15, 4: 20, 5: 25, 6: 27, 7: 29, 8: 31, 9: 33, 10: 35 };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const song = arg('song');
const diff = (arg('diff', 'expert') || '').toLowerCase();
const power = Number(arg('power', '300000'));
const live = arg('live', 'solo');
const bonus = Number(arg('bonus', '0'));
const taki = Number(arg('taki', '0'));
const deck = String(arg('deck', '150,150,150,150,150'))
  .split(',')
  .map(Number);

if (!song) {
  console.error('--song が必要です。例: --song イレヴンス --diff hard');
  process.exit(1);
}
if (deck.length !== DECK_SIZE || deck.some((v) => !Number.isFinite(v))) {
  console.error(`--deck はスコアアップ%を5つ、カンマ区切りで（先頭がリーダー）。例: --deck 150,120,120,110,110`);
  process.exit(1);
}

const musics = JSON.parse(fs.readFileSync(path.join(DATA, 'transformedMusics.json'), 'utf8'));
const scores = JSON.parse(fs.readFileSync(path.join(DATA, 'musicScoreData.json'), 'utf8'));

const m = musics.find((x) => x.title === song) ?? musics.find((x) => x.title.includes(song));
if (!m) {
  console.error(`楽曲が見つかりません: ${song}`);
  process.exit(1);
}
const d = scores[m.id]?.[diff];
if (!d) {
  console.error(`難易度データがありません: ${m.title} / ${diff}`);
  process.exit(1);
}

/** ゲーム内実測で確定した丸め（src/pages/analyzer/lib/calcLivePt.ts と同じ手順）。 */
function livePtFromCoefficient(coefficient, base, bonusPct, lb) {
  const bonus100x = Math.round(bonusPct * 100);
  const step2x10 = Math.floor((coefficient * (bonus100x + 10000)) / 1000);
  return Math.floor((step2x10 * base) / 1000) * (LIVE_BONUS_MULTIPLIERS[lb] ?? 1);
}
const soloCoef = (s) => 100 + Math.floor(s / 20000);
const multiCoef = (s, other) => 110 + Math.floor(s / 17000) + Math.min(13, Math.floor((other || 4 * s) / 340000));

const leader = deck[0];
const total = deck.reduce((a, b) => a + b, 0);

console.log(`${m.title} / ${diff.toUpperCase()} (Lv${d.playLevel}, ${d.noteCount}notes, ${m.music_time}s, 基礎点${m.event_rate})`);
console.log(`総合力 ${power.toLocaleString()} ／ 編成 [${deck.join(', ')}] ／ リーダー ${leader} ／ 内部値 ${total}`);
console.log(`ライブ種別 ${live} ／ ボーナス ${bonus}% ／ ${taki}焚き`);
console.log(`前提: 全ノーツPERFECT（AP）。1ノーツでも取りこぼすと下振れます。`);
console.log('');

if (live === 'multi') {
  const effective = leader + Math.max(0, total - leader) * MULTI_SUB_RATE;
  const base = d.baseScore + (d.feverScore ?? 0) * FEVER_RATE;
  const w = d.skillScoreMulti ?? d.skillScoreSolo;
  const rate = base + (effective * w.reduce((a, b) => a + b, 0)) / 100;
  const score = Math.floor(rate * power * 4);
  console.log(`実効値 = ${leader} + (${total} - ${leader}) × 0.2 = ${effective.toFixed(1)}`);
  console.log(`予測スコア（フィーバー成功時・自分ひとりぶん）: ${score.toLocaleString()}`);
  const baseNoFever = d.baseScore;
  const rateNoFever = baseNoFever + (effective * w.reduce((a, b) => a + b, 0)) / 100;
  console.log(`予測スコア（フィーバー無し）:                 ${Math.floor(rateNoFever * power * 4).toLocaleString()}`);
  console.log(`  → 差 ${(score - Math.floor(rateNoFever * power * 4)).toLocaleString()} がフィーバー加点ぶん（fever_score × 0.5 の検証用）`);
  console.log('');
  console.log(`予測イベントPt（1人部屋・他人のスコア0）: ${livePtFromCoefficient(110 + Math.floor(score / 17000), m.event_rate, bonus, taki).toLocaleString()}`);
  console.log(`予測イベントPt（同格5人・他4人=自分×4）: ${livePtFromCoefficient(multiCoef(score), m.event_rate, bonus, taki).toLocaleString()}`);
  process.exit(0);
}

const auto = live === 'auto';
const base = auto ? d.baseScoreAuto : d.baseScore;
const w = auto ? d.skillScoreAuto : d.skillScoreSolo;
const subs = deck.slice(1);
const encoreW = w[DECK_SIZE];

console.log(`リーダーが何枠目に入ったかで予測が変わります（1〜5枠の発動順はランダム）:`);
console.log('');
console.log('リーダーの枠  枠の重み    予測スコア   予測イベントPt');
const rows = [];
for (let i = 0; i < DECK_SIZE; i++) {
  // リーダーが枠i、残り4枚がそれ以外の枠に入る。サブ4枚の並びは平均で吸収する
  // （サブ同士の入れ替わりはサブの値が同じなら影響しない）。
  const otherW = w.slice(0, DECK_SIZE).filter((_, j) => j !== i);
  const subAvg = subs.reduce((a, b) => a + b, 0) / subs.length;
  const term = leader * w[i] + subAvg * otherW.reduce((a, b) => a + b, 0) + leader * encoreW;
  const score = Math.floor((base + term / 100) * power * 4);
  const pt = livePtFromCoefficient(soloCoef(score), m.event_rate, bonus, taki);
  rows.push({ slot: i + 1, weight: w[i], score, pt });
  console.log(
    `      ${i + 1}      ${w[i].toFixed(6)}  ${String(score.toLocaleString()).padStart(10)}   ${String(pt.toLocaleString()).padStart(8)}`,
  );
}
const lo = Math.min(...rows.map((r) => r.score));
const hi = Math.max(...rows.map((r) => r.score));
const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
console.log('');
console.log(`下振れ ${lo.toLocaleString()} 〜 上振れ ${hi.toLocaleString()}（幅 ${(hi - lo).toLocaleString()}）／ 期待値 ${Math.round(avg).toLocaleString()}`);
console.log(`ランキングが使っているのは期待値の方です。`);
if (subs.some((v) => v !== subs[0])) {
  console.log('');
  console.log('※ サブ4枚のスコアアップが揃っていないので、サブ同士の並び替えでも上下します。');
  console.log('  枠を読み取りたいときは サブ4枚を同じスキル値で揃えてください。');
}
