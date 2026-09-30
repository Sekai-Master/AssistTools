import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  MIN_TABLE_SHARE,
  indexMusicCategories,
  previousCategoriesFrom,
  resolveCategories,
  tableShare,
} from './lib/musicCategories.mjs';
import { auditUnreleased, splitByRelease } from './lib/musicRelease.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/MusicDatas');
const JACKET_DIR = path.join(DATA_DIR, 'jacket');

// 取得元URL（Sekai-World マスタDB／sekai.best）。
const MASTER_DB_BASE = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main';
const SEKAI_BEST_BASE = 'https://storage.sekai.best';
const musicsUrl = `${MASTER_DB_BASE}/musics.json`;
const artistsUrl = `${MASTER_DB_BASE}/musicArtists.json`;
const metasUrl = `${SEKAI_BEST_BASE}/sekai-best-assets/music_metas.json`;
// イベント限定開催でソロ常設プレイ不可のメドレー等を判定する。
const limitedTimeMusicsUrl = `${MASTER_DB_BASE}/limitedTimeMusics.json`;
// 譜面レベルとノーツ数（難易度別）。スコア計算のレベル係数に効く。
const musicDifficultiesUrl = `${MASTER_DB_BASE}/musicDifficulties.json`;
// 曲のカテゴリ（MV の種類）。2026-08 下旬に musics.json から切り出された（#130）。
const musicCategoriesUrl = `${MASTER_DB_BASE}/musicCategories.json`;
const jacketRemoteUrl = (id) =>
  `${SEKAI_BEST_BASE}/sekai-jp-assets/music/jacket/jacket_s_${id}/jacket_s_${id}.webp`;

// ジャケットは UI で小さく表示するので256pxで十分（原寸は数百KB）。
const JACKET_WIDTH = 256;
const JACKET_QUALITY = 80;
const JACKET_SMALL_BYTES = 60_000; // これ以下は縮小済みとみなす

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

async function toThumbnail(input) {
  return sharp(input)
    .resize({ width: JACKET_WIDTH, withoutEnlargement: true })
    .webp({ quality: JACKET_QUALITY })
    .toBuffer();
}

(async () => {
  const [musics, artists, metas, limitedTimeMusics, musicDifficulties, musicCategories] = await Promise.all([
    fetchJson(musicsUrl),
    fetchJson(artistsUrl),
    fetchJson(metasUrl),
    fetchJson(limitedTimeMusicsUrl),
    fetchJson(musicDifficultiesUrl),
    // ★ カテゴリはビンゴでしか使わないので、取れなくても更新全体は止めない
    //   （直前の配信データのカテゴリを引き継ぐ。scripts/lib/musicCategories.mjs）。
    fetchJson(musicCategoriesUrl).catch((err) => {
      console.warn(`::warning::musicCategories.json が取れない（${err.message}）。カテゴリは直前の配信データから引き継ぐ`);
      return [];
    }),
  ]);

  // メドレー等の除外（調整候補の母集合から落とす）。
  // 判定は limitedTimeMusics.json の「collaborationModeId を持たないエントリ」に一本化する。
  //   - collaborationModeId 無し = イベント限定開催でソロ常設に無い（メドレー 674/675/676・
  //     初音ミクの激唱 388）。これらは調整曲として選べないので published=false を焼き込む。
  //   - collaborationModeId 有り = コラボ楽曲（707/708/709）で常設プレイ可なので残す。
  // categories / Unit / isFullLength / タイトル文字列は判定不可・誤爆（380 スターダストメドレー
  // は limitedTimeMusics に無く published のまま）のため使わない。musicDifficulties での
  // 独立クロスチェックは検証済みだが、フェッチを増やさないため判定はここに一本化する。
  const limitedExcludedIds = new Set(
    limitedTimeMusics
      .filter((e) => e && e.collaborationModeId === undefined)
      .map((e) => String(e.musicId).padStart(3, '0'))
  );

  let deletedSongs = [];
  const deletedPath = path.join(DATA_DIR, 'deletedSongs.json');
  if (fs.existsSync(deletedPath)) {
    try {
      deletedSongs = JSON.parse(fs.readFileSync(deletedPath, 'utf-8'));
    } catch (err) {
      console.error('deletedSongs.json 読み込み失敗:', err);
    }
  }
  const deletedIds = new Set(deletedSongs.map((s) => String(s.id).padStart(3, '0')));

  const unitMapping = {
    1: '0_VS',
    2: '1_L/n',
    3: '2_MMJ',
    4: '3_VBS',
    5: '4_WxS',
    6: '5_25',
    7: '9_oth',
  };
  const now = Date.now();

  // ★ 公開日を過ぎた曲だけを扱う（scripts/lib/musicRelease.mjs）。公開前の曲は曲名もジャケットも出さない。
  //   ログにも件数だけ出す（この repo の Actions のログは誰でも読めるので、曲名を書くと漏れる）。
  const { released: releasedMusics, upcoming } = splitByRelease(musics, now);
  if (upcoming.length > 0) {
    console.log(`公開前の曲 ${upcoming.length}曲は入れない（公開日を過ぎた最初の更新で入る）`);
  }

  // 難易度別データを music_id で引けるようにまとめる。
  //
  // event_rate と music_time は難易度によらず同じ値なので曲の直下に置く（従来どおり）。
  // base_score と skill_score_* は難易度ごとに違うので、ここで難易度別に持つ。
  //
  //   base_score        : スキル無しでAPしたときのスコア率（曲×難易度で固定）
  //   skill_score_solo  : スキル発動6枠それぞれが曲全体スコアに占める重み（長さ6）
  //                       ソロ／チャレンジライブ用。6枠目はリーダーのアンコール。
  //   skill_score_multi : 同じく協力ライブ（みんなでライブ）用。6枠目が重い。
  //   fever_score       : 協力ライブのフィーバー加点ぶん。base_score に 0.5 倍で足す。
  //
  // スコアは次式で出せる（sekai-calculator の高速版と同じ）:
  //   rate  = base + Σ(各枠のスコアアップ% × skill_score[i] / 100)
  //   score = floor(rate × 総合力 × 4)
  // ライブ種別ごとに base と skill_score の組が変わる（sekai-calculator と同じ対応）:
  //   ソロ/チャレライ : base_score                     × skill_score_solo
  //   協力ライブ      : base_score + fever_score × 0.5 × skill_score_multi
  //   オート          : base_score_auto                × skill_score_auto
  const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert', 'master', 'append'];
  const diffByMusic = new Map();
  // append が後から増えた前例があるので、知らない難易度が来たら気づけるようにする。
  // 黙って落とすと「生成物には無いが画面にも出ない」で誰も気づかないまま数か月経つ。
  const unknownDifficulties = new Set();
  for (const d of musicDifficulties) {
    if (!d || d.musicId == null) continue;
    if (!DIFFICULTIES.includes(d.musicDifficulty)) unknownDifficulties.add(d.musicDifficulty);
    if (!diffByMusic.has(d.musicId)) diffByMusic.set(d.musicId, {});
    diffByMusic.get(d.musicId)[d.musicDifficulty] = d;
  }
  if (unknownDifficulties.size > 0) {
    console.warn(
      `⚠ 未知の難易度 ${[...unknownDifficulties].join(', ')} を検出。` +
        'scripts/refresh-music-data.js の DIFFICULTIES と src/pages/ranking/useRankingMusics.ts の DIFFICULTY_ORDER に追加が必要です。'
    );
  }
  const metaByMusic = new Map();
  for (const x of metas) {
    if (!x || x.music_id == null) continue;
    if (!metaByMusic.has(x.music_id)) metaByMusic.set(x.music_id, {});
    metaByMusic.get(x.music_id)[x.difficulty] = x;
  }

  // スコア率は倍精度のまま書くと1値18文字になり、ブラウザに配る JSON が倍近く膨らむ。
  // score = floor(rate × 総合力 × 4) なので、1e-6 の丸め誤差は総合力30万でも 1.2 点。
  // 数百万点のスコアに対して無視できるので6桁で切る。
  const RATE_DIGITS = 6;
  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(RATE_DIGITS)) : null);
  const roundAll = (a) => (Array.isArray(a) ? a.map(round) : null);

  /** 1曲ぶんの難易度別データ。存在する難易度だけを持つ。 */
  function buildDifficulties(musicId) {
    const dm = diffByMusic.get(musicId) ?? {};
    const mm = metaByMusic.get(musicId) ?? {};
    const out = {};
    for (const key of DIFFICULTIES) {
      const d = dm[key];
      const meta = mm[key];
      if (!d && !meta) continue;
      out[key] = {
        playLevel: d ? d.playLevel : null,
        noteCount: d ? d.totalNoteCount : null,
        baseScore: meta ? round(meta.base_score) : null,
        skillScoreSolo: meta ? roundAll(meta.skill_score_solo) : null,
        // オートは判定が全て auto(0.7) になるため専用の値が要る。
        // ソロ値から比で近似すると順位が狂うので実データを持つ。
        baseScoreAuto: meta ? round(meta.base_score_auto) : null,
        skillScoreAuto: meta ? roundAll(meta.skill_score_auto) : null,
        // 協力ライブ用。ソロと 1〜5枠から違う曲が7割あるので別に持つ。
        skillScoreMulti: meta ? roundAll(meta.skill_score_multi) : null,
        feverScore: meta ? round(meta.fever_score) : null,
      };
    }
    return out;
  }

  // カテゴリ（取り先の順と理由は scripts/lib/musicCategories.mjs）。
  // 直前の配信データは、別表が取れないときの引き継ぎ用。上書きする前にここで読む。
  let previousSnapshot = null;
  try {
    previousSnapshot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'transformedMusics.json'), 'utf-8'));
  } catch (err) {
    console.warn('直前の transformedMusics.json を読めない（カテゴリの引き継ぎ無しで続ける）:', err.message);
  }
  const categoryIndex = indexMusicCategories(musicCategories);
  const previousCategories = previousCategoriesFrom(previousSnapshot);
  const categoryOf = new Map(
    releasedMusics.map((m) => [m.id, resolveCategories(m, categoryIndex, previousCategories)])
  );

  const transformed = releasedMusics.map((m) => {
    const id = String(m.id).padStart(3, '0');
    const artist = artists.find((a) => a.id === m.creatorArtistId);
    const seqStr = String(m.seq);
    const unit = unitMapping[seqStr.length >= 2 ? seqStr[1] : ''] || '';
    const { categories } = categoryOf.get(m.id);
    const meta = metas.find((x) => x.music_id === m.id);
    // 公開前の曲はもう入ってこないので、ここで false になるのは配信停止とイベント限定だけ
    let published = m.publishedAt <= now;
    if (deletedIds.has(id)) published = false;
    // メドレー等（イベント限定・ソロ常設なし）は調整候補から除外する。
    if (limitedExcludedIds.has(id)) published = false;
    return {
      id,
      title: m.title,
      pronunciation: m.pronunciation,
      creatorArtistId: m.creatorArtistId,
      artistName: artist ? artist.name : '',
      default: m.seq,
      Unit: unit,
      categories,
      publishedAt: m.publishedAt,
      published,
      isNewlyWrittenMusic: m.isNewlyWrittenMusic,
      isFullLength: m.isFullLength,
      jacketLink: `jacket_s_${id}.webp`,
      music_time: meta ? meta.music_time : null,
      event_rate: meta ? meta.event_rate : null,
    };
  });

  // 難易度別データは別ファイルにする。
  // 曲単位のデータ（transformedMusics.json）はほぼ全ツールが読むのに対し、
  // 難易度別データを使うのはランキングだけ。同梱すると 340KB → 2.5MB になり、
  // 難易度データを使わないツールにまで転送量を押し付けることになる。
  const scoreData = {};
  for (const m of releasedMusics) {
    const id = String(m.id).padStart(3, '0');
    const d = buildDifficulties(m.id);
    if (Object.keys(d).length > 0) scoreData[id] = d;
  }

  // 欠落検知: マスタの公開済みの曲が全てスナップショットに入ったか
  const masterIds = new Set(releasedMusics.map((m) => String(m.id).padStart(3, '0')));
  const snapshotIds = new Set(transformed.map((m) => m.id));
  const missing = [...masterIds].filter((id) => !snapshotIds.has(id));
  if (missing.length > 0) {
    console.error('マスタにあるがスナップショットに無い曲:', missing);
    process.exit(1);
  }

  // ★ 公開前の曲の痕跡が残っていないかの検算（カードの auditLeaks と同じ考え方）。
  //   混ざっていたら書き出さずに止める。曲名はログに出さず件数だけ（ログは誰でも読める）。
  const leaked = auditUnreleased(transformed, now);
  if (leaked.length > 0) {
    console.error(`公開前の曲が ${leaked.length}件 混ざっている。書き出さずに止める`);
    process.exit(1);
  }

  // 難易度データの欠落は警告にとどめる（配信直後は音源解析が追いつかず
  // music_metas 側に載っていないことがあり、そこで更新全体を落としたくない）。
  const noDifficulty = transformed.filter((m) => m.published && !scoreData[m.id]);
  if (noDifficulty.length > 0) {
    console.warn(
      `⚠ 難易度データが無い公開曲 ${noDifficulty.length}件:`,
      noDifficulty.map((m) => `${m.id} ${m.title}`).join(', ')
    );
  }
  const noBaseScore = transformed.filter(
    (m) => m.published && scoreData[m.id]?.master && scoreData[m.id].master.baseScore == null
  );
  if (noBaseScore.length > 0) {
    console.warn(
      `⚠ MASTERの base_score が無い公開曲 ${noBaseScore.length}件:`,
      noBaseScore.map((m) => `${m.id} ${m.title}`).join(', ')
    );
  }

  // ★ #130 の再発に気付くための警告。上流で別表の形が変わると、曲は揃っているのに
  //   カテゴリだけ引き継ぎ（または空）になり、上の曲の欠落検知を素通りする。
  const categoryResults = [...categoryOf.values()];
  const bySource = (s) => categoryResults.filter((r) => r.source === s).length;
  console.log(
    `カテゴリ: 別表 ${bySource('table')} / musics.json の欄 ${bySource('field')} / ` +
      `引き継ぎ ${bySource('previous')} / なし ${bySource('none')}`
  );
  if (tableShare(categoryResults) < MIN_TABLE_SHARE) {
    console.warn(
      `::warning::カテゴリを別表（musicCategories.json）から取れた曲が ${bySource('table')}/${categoryResults.length} 曲しかない。` +
        '上流の形が変わった可能性がある（#130）'
    );
  }
  // 別表が取れているのに1曲だけ行が消えた、も引き継ぎで黙って埋まるので、どの曲かを出しておく。
  const keptIds = [...categoryOf].filter(([, r]) => r.source === 'previous').map(([id]) => id);
  if (keptIds.length > 0) {
    const shown = keptIds.slice(0, 20).join(', ');
    console.warn(
      `⚠ 別表に行が無く、直前の配信データのカテゴリを引き継いだ曲 ${keptIds.length}件: ` +
        (keptIds.length > 20 ? `${shown} ほか` : shown)
    );
  }
  const noCategory = transformed.filter((m) => m.published && m.categories.length === 0);
  if (noCategory.length > 0) {
    console.warn(
      `⚠ カテゴリが無い公開曲 ${noCategory.length}件:`,
      noCategory.map((m) => `${m.id} ${m.title}`).join(', ')
    );
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'transformedMusics.json'),
    JSON.stringify(transformed, null, 2),
    'utf-8'
  );
  // ランキングでしか使わないので整形せずに書く（転送量を優先）。
  fs.writeFileSync(
    path.join(DATA_DIR, 'musicScoreData.json'),
    JSON.stringify(scoreData),
    'utf-8'
  );
  console.log(
    `変換完了: ${transformed.length}曲 / 難易度データ ${Object.keys(scoreData).length}曲`
  );

  // ジャケット: 既存はローカルで256px縮小、無い曲だけリモート取得
  fs.mkdirSync(JACKET_DIR, { recursive: true });
  let resized = 0;
  let downloaded = 0;
  let skipped = 0;
  const failures = [];
  for (const m of transformed) {
    const file = path.join(JACKET_DIR, `jacket_s_${m.id}.webp`);
    try {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).size <= JACKET_SMALL_BYTES) {
          skipped += 1;
          continue;
        }
        fs.writeFileSync(file, await toThumbnail(fs.readFileSync(file)));
        resized += 1;
      } else {
        const res = await fetch(jacketRemoteUrl(m.id));
        if (!res.ok) {
          failures.push(`${m.id} (HTTP ${res.status})`);
          continue;
        }
        fs.writeFileSync(file, await toThumbnail(Buffer.from(await res.arrayBuffer())));
        downloaded += 1;
      }
    } catch (err) {
      failures.push(`${m.id} (${err.message})`);
    }
  }
  console.log(
    `ジャケット: 縮小 ${resized} / DL ${downloaded} / 既縮小 ${skipped} / 失敗 ${failures.length}`
  );
  if (failures.length) console.warn('取得失敗（未配信曲などは想定内）:', failures.join(', '));
})();
