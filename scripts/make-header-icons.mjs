/**
 * ヘッダーに置くロゴアイコンの明所版・暗所版を作る。
 *
 * 元の icon.png は「明るいニューモーフィズムの板の上に6色の花弁が乗っている」絵で、
 * 板そのものが画像に焼き込まれている。素の PNG をそのまま置くと2つ問題が出る:
 *
 *   1. 角が塗り潰されている。板は角丸の四角なのに、その外側が **純白 (#ffffff)** で
 *      埋まっている。素材は #f0f0f0 なので、明所でも四隅だけ白く見える。
 *   2. 暗い配色にすると、板だけが白い四角として残る。
 *
 * そこで
 *   - 四隅から白い領域を塗りつぶし探索して **透過** にする（板の内側の白＝中央の音符や
 *     花弁のハイライトは四隅と繋がっていないので巻き込まれない）。
 *   - 暗所版はさらに、彩度で重み付けして **中立色（板・影・音符）だけ** を
 *     暗い素材の階調へ移し替える。花弁は彩度が残るので保護され、花弁のふちの
 *     柔らかい影は自然に暗側へ落ちる。
 *
 * 使い方: node scripts/make-header-icons.mjs
 * 出力:   public/images/icon-light.webp / public/images/icon-dark.webp
 *
 * ★ favicon と BINGO のフリーマスは元の icon.webp のまま。前者はタブの背景を
 *   選べないし、後者は canvas に描いて書き出す画像で、共有先の配色は
 *   閲覧者のテーマとは無関係だから。
 */
import sharp from "sharp";

const SRC = "public/images/icon.png";
const OUT_LIGHT = "public/images/icon-light.webp";
const OUT_DARK = "public/images/icon-dark.webp";

/** 暗い素材の3値。src/index.css の --neu-lo / --neu-hi と揃えること。 */
const LO = [0x16, 0x18, 0x1d];
const HI = [0x3a, 0x3f, 0x4a];

/** 明所側で「板」が占める明度の帯。ここを LO..HI へ張り直す。 */
const L_MIN = 200;
const L_MAX = 255;

/**
 * 四隅から塗りつぶす閾値。実測で板は 236〜239、板の外は 255。
 * 240 まで下げると板へ漏れるので、間を空けて 244 で切る。
 */
const FILL_MIN = 244;
/** 透過の傾き。253 以上を完全透過、244 で不透明に戻す（縁のアンチエイリアス用）。 */
const ALPHA_CLEAR = 253;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels: ch } = info;
const at = (x, y) => (y * width + x) * ch;
const brightness = (i) => Math.min(data[i], data[i + 1], data[i + 2]);

/**
 * 四隅からの塗りつぶし探索で「板の外側」を特定する。
 * 単純な明度の閾値だと板の内側の白（中央の音符・花弁のハイライト）まで
 * 消えてしまうので、必ず四隅から繋がっているものだけを対象にする。
 */
function findOutside() {
  const outside = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (outside[p]) return;
    if (brightness(at(x, y)) < FILL_MIN) return;
    outside[p] = 1;
    stack.push(x, y);
  };
  push(0, 0);
  push(width - 1, 0);
  push(0, height - 1);
  push(width - 1, height - 1);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return outside;
}

const outside = findOutside();
let cleared = 0;
for (let p = 0; p < outside.length; p++) {
  if (!outside[p]) continue;
  const i = p * ch;
  // 白に近いほど透ける。境界のアンチエイリアスがそのまま alpha の傾きになる。
  data[i + 3] = Math.round(255 * (1 - smoothstep(FILL_MIN, ALPHA_CLEAR, brightness(i))));
  if (data[i + 3] === 0) cleared++;
}

const light = Buffer.from(data);
await sharp(light, { raw: { width, height, channels: ch } })
  .webp({ quality: 92 })
  .toFile(OUT_LIGHT);

// 暗所版: 中立色だけを暗い素材の階調へ移す（透過済みの四隅はそのまま）。
for (let i = 0; i < data.length; i += ch) {
  if (data[i + 3] === 0) continue;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;

  // 0 = 完全な中立色（＝素材）/ 1 = 色が付いている（＝花弁）
  const colored = smoothstep(0.06, 0.22, sat);
  if (colored >= 1) continue;

  const t = clamp01((max - L_MIN) / (L_MAX - L_MIN));
  for (let k = 0; k < 3; k++) {
    const darkened = LO[k] + (HI[k] - LO[k]) * t;
    data[i + k] = Math.round(darkened * (1 - colored) + data[i + k] * colored);
  }
}

await sharp(data, { raw: { width, height, channels: ch } })
  .webp({ quality: 92 })
  .toFile(OUT_DARK);

const pct = ((100 * cleared) / (width * height)).toFixed(1);
console.log(`wrote ${OUT_LIGHT} / ${OUT_DARK} (${width}x${height}, 四隅の透過 ${pct}%)`);
