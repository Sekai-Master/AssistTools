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
  const [musics, artists, metas] = await Promise.all([
    fetchJson(musicsUrl),
    fetchJson(artistsUrl),
    fetchJson(metasUrl),
  ]);

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

  // 欠落検知: マスタの曲が全てスナップショットに入ったか
  const masterIds = new Set(musics.map((m) => String(m.id).padStart(3, '0')));
  const snapshotIds = new Set(transformed.map((m) => m.id));
  const missing = [...masterIds].filter((id) => !snapshotIds.has(id));
  if (missing.length > 0) {
    console.error('マスタにあるがスナップショットに無い曲:', missing);
    process.exit(1);
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
