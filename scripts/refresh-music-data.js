import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

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
  const [musics, artists, metas, limitedTimeMusics, musicDifficulties] = await Promise.all([
    fetchJson(musicsUrl),
    fetchJson(artistsUrl),
    fetchJson(metasUrl),
    fetchJson(limitedTimeMusicsUrl),
    fetchJson(musicDifficultiesUrl),
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

  // 難易度別データを music_id で引けるようにまとめる。
  //
  // event_rate と music_time は難易度によらず同じ値なので曲の直下に置く（従来どおり）。
  // base_score と skill_score_solo は難易度ごとに違うので、ここで難易度別に持つ。
  //
  //   base_score       : スキル無しでAPしたときのスコア率（曲×難易度で固定）
  //   skill_score_solo : スキル発動6枠それぞれが曲全体スコアに占める重み（長さ6）
  //                      ソロ／チャレンジライブ用。6枠目はリーダーのアンコール。
  //
  // スコアは次式で出せる（sekai-calculator の高速版と同じ）:
  //   rate  = base_score + Σ(各枠のスコアアップ% × skill_score_solo[i] / 100)
  //   score = floor(rate × 総合力 × 4)
  const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert', 'master', 'append'];
  const diffByMusic = new Map();
  for (const d of musicDifficulties) {
    if (!d || d.musicId == null) continue;
    if (!diffByMusic.has(d.musicId)) diffByMusic.set(d.musicId, {});
    diffByMusic.get(d.musicId)[d.musicDifficulty] = d;
  }
  const metaByMusic = new Map();
  for (const x of metas) {
    if (!x || x.music_id == null) continue;
    if (!metaByMusic.has(x.music_id)) metaByMusic.set(x.music_id, {});
    metaByMusic.get(x.music_id)[x.difficulty] = x;
  }

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
        baseScore: meta ? meta.base_score : null,
        skillScoreSolo: meta ? meta.skill_score_solo : null,
      };
    }
    return out;
  }

  const transformed = musics.map((m) => {
    const id = String(m.id).padStart(3, '0');
    const artist = artists.find((a) => a.id === m.creatorArtistId);
    const seqStr = String(m.seq);
    const unit = unitMapping[seqStr.length >= 2 ? seqStr[1] : ''] || '';
    let categories = m.categories.map((c) => (c === 'mv' ? 'mv_3d' : c));
    if (categories.includes('image') && categories.length > 1) {
      categories = categories.filter((c) => c !== 'image');
    }
    const meta = metas.find((x) => x.music_id === m.id);
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
      difficulties: buildDifficulties(m.id),
    };
  });

  // 欠落検知: マスタの曲が全てスナップショットに入ったか
  const masterIds = new Set(musics.map((m) => String(m.id).padStart(3, '0')));
  const snapshotIds = new Set(transformed.map((m) => m.id));
  const missing = [...masterIds].filter((id) => !snapshotIds.has(id));
  if (missing.length > 0) {
    console.error('マスタにあるがスナップショットに無い曲:', missing);
    process.exit(1);
  }

  // 難易度データの欠落は警告にとどめる（配信直後は音源解析が追いつかず
  // music_metas 側に載っていないことがあり、そこで更新全体を落としたくない）。
  const noDifficulty = transformed.filter(
    (m) => m.published && Object.keys(m.difficulties).length === 0
  );
  if (noDifficulty.length > 0) {
    console.warn(
      `⚠ 難易度データが無い公開曲 ${noDifficulty.length}件:`,
      noDifficulty.map((m) => `${m.id} ${m.title}`).join(', ')
    );
  }
  const noBaseScore = transformed.filter(
    (m) => m.published && m.difficulties.master && m.difficulties.master.baseScore == null
  );
  if (noBaseScore.length > 0) {
    console.warn(
      `⚠ MASTERの base_score が無い公開曲 ${noBaseScore.length}件:`,
      noBaseScore.map((m) => `${m.id} ${m.title}`).join(', ')
    );
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'transformedMusics.json'),
    JSON.stringify(transformed, null, 2),
    'utf-8'
  );
  console.log(`変換完了: ${transformed.length}曲`);

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
