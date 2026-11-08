/**
 * 更新履歴に添える告知画像（X に載せたもの）の台帳。版 → 画像。
 *
 * ★ CHANGELOG.md には書かない。あちらは GitHub でも読む文章の正本で、
 *   ページの部品（画像の寸法など）を混ぜると Markdown として読みにくくなる。
 *   画像を作った版だけここに足す。無い版は文章だけで出る。
 *
 * - 画像は public/images/changelog/<版>.webp。元の PNG（2400×2000）を幅 1200px・品質 80 の
 *   WebP にしたもの。public/changelog/ にしないのは、ビルドが書き出す changelog.html と
 *   同じ名前のディレクトリを作らないため（Pages の振り分けに頼らない）
 * - width・height は実物の画素数。読み込み中に枠の高さを取っておくのに使う
 *  （changelogImages.test.ts で実物と照合している）
 * - alt は X に投稿したときの代替テキストそのまま（1.25.0 だけは下の注のとおり）
 */

export interface ChangelogImage {
  /** public からの相対パス。使うときに import.meta.env.BASE_URL を前に付ける。 */
  src: string;
  alt: string;
  width: number;
  height: number;
}

const IMAGES: Readonly<Record<string, ChangelogImage>> = {
  "1.28.0": {
    src: "images/changelog/1.28.0.webp",
    alt: "Sekai-Master v1.28.0 の更新。左はお題ビンゴのカード: 5×5 のマスが曲名ではなく「ユニット VBS」「読みの頭 か行」「作者 DECO*27」などのお題で、1行目がそろって BINGO になっている。全曲から均等に流れるとすると、20曲遊ぶと2人に1人がBINGOになる。右は歴代ボーダーの推移のグラフ: 第222回 MORE MORE JUMP！ Memories の50・100・200・500・1000・2000位を開始から終了まで重ねたもの（50位は約7,300万で終了）。絞り込みは種別・箱／混合・参加キャラで、条件はURLに残る。",
    width: 1200,
    height: 1000,
  },
  "1.27.0": {
    src: "images/changelog/1.27.0.webp",
    alt: "Sekai-Master v1.27.0 の更新。トップの上に開催中のイベントのロゴ、集計までの残り時間（例: 2日 03:56:57）、経過のバー、6順位のボーダー予測（例: 11/6 17:03 時点で50位 1億1,647万、100位 9,870万、200位 4,495万、500位 2,886万、1000位 2,118万、2000位 855万）と「ボーダー予測を見る」のリンクが並ぶ。ほかに、ツールの一覧を分類ごとの枠にまとめて説明文からも検索できるようにした、各ツールの見出し・文字・アイコンの大きさを揃えた、素早く行き来すると画面が真っ白になる不具合を直した。",
    width: 1200,
    height: 1000,
  },
  "1.26.0": {
    src: "images/changelog/1.26.0.webp",
    alt: "Sekai-Master v1.26.0 の更新。ボーダー予測のずれ（予測と最終ボーダーの差の中央値。第124〜221回で、その回より前のデータだけを使って確かめた値）が、序盤（経過4〜28%）7.94%→7.69%、中盤（30〜58%）5.90%→5.56%、終盤（60〜96%）3.59%→3.45%に小さくなった。ほかに、8割の確率で収まる幅を直近40回の外れ方から経過の区間ごとに決めるように作り直し、参考値の説明を「同じ長さの回が少ない」と「過去に無い長さ」で書き分け、テストイベントが重なって始まっても開催中の回の記録を続けるようにした。",
    width: 1200,
    height: 1000,
  },
  // 1.25.0 の投稿には代替テキストを付けていなかったので、画像に書いてある内容から同じ書き方で起こした。
  "1.25.0": {
    src: "images/changelog/1.25.0.webp",
    alt: "Sekai-Master v1.25.0 の更新。ポイント調整アナライザーのプランの各行（マイセカイ採取・調整・ラストプレイ）と合計の獲得Ptの横に、手に入るイベントバッジの数が付いた（例: 合計 54,327 Pt でバッジ 5,432個（目安））。数え方は1回ごとに獲得Pt÷10（切り捨て）で、1炊き・5炊き・10炊きのリザルトで確かめた。ほかに、ボーダー予測の序盤（200・500・1000位、経過4〜8%）の外れを2割近く小さくした（過去75回で検証）。ワールドリンクはサポートユニットの分だけ表示より少なくなる。",
    width: 1200,
    height: 1000,
  },
};

/** その版の告知画像。作っていない版は undefined。 */
export function changelogImageOf(version: string): ChangelogImage | undefined {
  return Object.hasOwn(IMAGES, version) ? IMAGES[version] : undefined;
}

/** 告知画像のある版の一覧（テストで台帳と実物を照合する用）。 */
export const CHANGELOG_IMAGE_VERSIONS: readonly string[] = Object.keys(IMAGES);
