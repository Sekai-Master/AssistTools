/**
 * まとめ画像（/guide/cards）。共有しやすい 6 枚の PNG（2400×2000、6:5）と、まとめて保存する zip。
 *
 * - 画像は public/guide/cards/card-1.png〜card-6.png、zip は sekaimaster-guide-cards.zip（6 枚入り）
 * - 題と alt は画像の文言から（指揮 2026-11-12）。文言の元の cards.md はリポジトリに入れず、ここに写してある
 *   - 1 枚目は入口のページ（docs/guide/start.md）の手順の題を並べた絵なので、alt は手順の題から作る
 *     （start.md の手順を直せば alt も付いて来る）
 *   - 2〜6 枚目は、各枚の箇条をつないだ文（確かさの印は外した）
 * ★ 画像を作り直して文言が変わったら、ここの points も直す（2026-11-12 20:57 の画像・20:44 の cards.md に合わせた）
 */
export interface GuideCard {
  n: number;
  file: string;
  title: string;
  alt: string;
  width: number;
  height: number;
}

export const CARD_COUNT = 6;
export const CARD_WIDTH = 2400;
export const CARD_HEIGHT = 2000;
export const CARDS_ZIP = "sekaimaster-guide-cards.zip";

/** 各枚の題と、画像に書いてある箇条をつないだ文（1 枚目の points は使わず、手順の題から作る）。 */
export const CARD_TEXTS: readonly { title: string; points: string }[] = [
  { title: "はじめての周回の流れ", points: "" },
  { title: "募集の文の読み方", points: "主は募集者の編成、募は入室条件を表します。@1〜@4は残りの募集人数を表します。主・募の%はリーダーのスキル値です。入室は先頭スキルや内部値（5枚合計）で基本的に決まります。募集の文の用語について公式の説明は見当たりません。" },
  { title: "スタンプの使い分け", points: "抜ける時は「またね」「ありがとう」系を使います。咲希の「おつかれさま！」は部屋主の解散の合図です。「謝罪不要」の部屋では謝るスタンプは要りません。抜けるスタンプを押す時機は揃っていません。スタンプの使い分けに公式の説明は見当たりません。" },
  { title: "炊き数とイベントポイント", points: "炊き数（使うライボ数）は最大10まで選べます。イベントPの倍率は1〜5炊きで1個あたり5倍です。2024年9月から4〜6炊きが上がり5炊き25倍です。イベントPは6炊き27倍、10炊き35倍です。資源が多いときは5炊きで走ることが多いです。時間がない時や上位狙いでは7や10で走ります。" },
  { title: "アンコール", points: "協力のスキルは5人各1回と最後のアンコールです。直前にスコアが一番高かった人が担当します。担当が取るには高い総合力と安定プレイが要ります。譲る側は難易度を下げる考えもあります。アンコールの決まり方に公式の説明は見当たりません。" },
  { title: "リフレッシュゲージ", points: "2026年2月からリフレッシュゲージが追加されました。100%になるとイベントPやバッジを得られません。手動のライブやマイセカイの採取でゲージが増えます。オートとチャレンジは増えず100%でもPを得られます。前のプレイから5分で休憩です（5分は3月10日〜）。休憩が累計30分になるごとに一定量減ります。休憩30分ごとに約8.33%減り、6時間で0%です。" },
];

/**
 * 6 枚の台帳。steps は入口のページの手順の題（「1. 部屋を探す・作る」の形。GUIDE.start.sections の label）。
 */
export function buildCards(steps: readonly string[]): GuideCard[] {
  return CARD_TEXTS.map((t, i) => {
    const n = i + 1;
    const points =
      n === 1
        ? steps.length
          ? `${steps.map((s) => s.replace(/^(\d+)\.\s*/, "$1 ")).join("、")}の${steps.length}つの手順。`
          : ""
        : t.points;
    return {
      n,
      file: `card-${n}.png`,
      title: t.title,
      alt: points ? `${t.title}。${points}` : t.title,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
  });
}

export const cardSrc = (base: string, file: string) => `${base}guide/cards/${file}`;
