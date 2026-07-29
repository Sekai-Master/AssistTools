/**
 * 楽曲スナップショットの差分を Markdown で要約する。
 * 自動更新 PR の本文に使う（レビューで見るべき点だけを出す）。
 *
 * 使い方: node scripts/summarize-music-diff.mjs <before.json> <after.json>
 */
import fs from 'fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('使い方: node scripts/summarize-music-diff.mjs <before.json> <after.json>');
  process.exit(1);
}

const load = (p) => {
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const before = load(beforePath);
const after = load(afterPath);
const byId = (arr) => new Map(arr.map((m) => [m.id, m]));
const b = byId(before);
const a = byId(after);

const added = after.filter((m) => !b.has(m.id));
const removed = before.filter((m) => !a.has(m.id));

// 公開状態が変わった曲。「未公開→公開」は反映漏れの検知に効く。
const flipped = [];
for (const m of after) {
  const prev = b.get(m.id);
  if (prev && prev.published !== m.published) flipped.push({ m, from: prev.published });
}

// 基礎点（event_rate）や曲長が変わった曲。計算結果が動くので必ず見る。
const rateChanged = [];
for (const m of after) {
  const prev = b.get(m.id);
  if (!prev) continue;
  if (prev.event_rate !== m.event_rate || prev.music_time !== m.music_time) {
    rateChanged.push({ m, prevRate: prev.event_rate, prevTime: prev.music_time });
  }
}

const line = (m) => `- \`${m.id}\` ${m.title}${m.artistName ? `（${m.artistName}）` : ''}`;
const out = [];

out.push('楽曲マスタの自動更新です。**マージ前に下の差分を確認してください。**');
out.push('');
out.push(`収録数 ${before.length} → **${after.length}** 曲`);
out.push('');

if (added.length) {
  out.push(`## 追加 ${added.length}曲`);
  out.push('');
  for (const m of added) {
    const state = m.published ? '公開済み' : `未公開（公開予定 ${new Date(m.publishedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}）`;
    out.push(`${line(m)} — ${state} / 基礎点 ${m.event_rate ?? '不明'}`);
  }
  out.push('');
}

if (removed.length) {
  out.push(`## 消失 ${removed.length}曲`);
  out.push('');
  out.push('**取得元の事故の可能性があります。意図した削除か確認してください。**');
  out.push('');
  removed.forEach((m) => out.push(line(m)));
  out.push('');
}

if (flipped.length) {
  out.push(`## 公開状態の変化 ${flipped.length}曲`);
  out.push('');
  for (const { m, from } of flipped) {
    out.push(`${line(m)} — ${from ? '公開' : '未公開'} → **${m.published ? '公開' : '未公開'}**`);
  }
  out.push('');
}

if (rateChanged.length) {
  out.push(`## 基礎点・曲長の変化 ${rateChanged.length}曲`);
  out.push('');
  out.push('**計算結果が動きます。**');
  out.push('');
  for (const { m, prevRate, prevTime } of rateChanged) {
    const parts = [];
    if (prevRate !== m.event_rate) parts.push(`基礎点 ${prevRate ?? '不明'} → **${m.event_rate ?? '不明'}**`);
    if (prevTime !== m.music_time) parts.push(`曲長 ${prevTime ?? '不明'} → ${m.music_time ?? '不明'}`);
    out.push(`${line(m)} — ${parts.join(' / ')}`);
  }
  out.push('');
}

if (!added.length && !removed.length && !flipped.length && !rateChanged.length) {
  out.push('## 実質的な変化なし');
  out.push('');
  out.push('曲の増減・公開状態・基礎点はいずれも変わっていません。');
  out.push('タイトル表記やジャケット画像などの軽微な更新と思われます。');
  out.push('');
}

out.push('---');
out.push('');
out.push('取得元: [Sekai-World/sekai-master-db-diff](https://github.com/Sekai-World/sekai-master-db-diff) ／ [sekai.best](https://storage.sekai.best)');
out.push('');
out.push('このPRは `.github/workflows/refresh-music-data.yml` が日次で作成しています。テストとビルドはPR作成前に実行済みです。');

console.log(out.join('\n'));
