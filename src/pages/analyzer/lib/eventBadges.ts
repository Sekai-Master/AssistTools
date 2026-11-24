import { MEMORY_A_10X, MEMORY_B_10X, MEMORY_C_10X } from "./constants";

/**
 * イベントバッジ（イベント交換所で使う通貨。マスタ eventItems.json の名称は
 * 「イベントバッジ」、ワールドリンクは「チャプターNバッジ」「ワールドバッジ」）の獲得数。
 *
 * ## 式
 *
 *   1回のライブ（またはマイセカイの採取1回）ごとに
 *   バッジ = floor(そのプレイの獲得イベントPt ÷ 除数)
 *
 * 除数はマスタDB configs.json の `event_item_reduction`。**決め打ちしない。**
 * https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/configs.json
 *
 * - 長く "10" だった（2026-10-25 に確認）。
 * - 2026-11-19（master 7.1.0.71）に "7" になった。公式は「みんなでライブ」を止めている間の調整として
 *   「ひとりでライブにおけるイベントバッジ獲得量の増加」を告知している。みんなでライブは 11/30 の
 *   v7.1.1 の後に再開する予定で、そのとき 10 に戻る可能性がある。
 *
 * ## 値の流れ
 *
 *   configs.json → scripts/refresh-card-data.mjs（6時間おき）→ public/CardDatas/badgeConfig.json
 *   → vite.config.ts の define（ビルド時）→ parseEventItemReduction → EVENT_ITEM_REDUCTION
 *
 * データ更新のコミットは CI（ci.yml の workflow_run）がビルドしてデプロイするので、値が変われば
 * 次の更新で画面と画像に届く。実行時に取りに行かないのは、読み込みまでの間に別の除数で数えた
 * 表示を出さないため（同期の定数で済む）。
 *
 * - 自動更新がマスタから取れなかった回は、ファイルを書き換えない（最後に取れた値が残る）。
 * - ファイルが無い・壊れている（数でない・0以下）ときは DEFAULT_EVENT_ITEM_REDUCTION（10）で数える。
 *
 * ## 実機での照合
 *
 * 1〜3 は除数が 10 だった 2026-10-26 の照合（MORE MORE JUMP！ Memories・ソロ・ボーナス +395%）。
 * 丸め方・炊き倍率・1回ごとかは除数によらない。
 *
 * 1. **端数の丸め（確定）**: Pt を出してから除数で割って切り捨てる。
 *    5炊き（倍率25）で 4,655 Pt → 465 バッジ。
 *    炊き倍率を掛ける前に ÷10 していたなら 4,655÷25=186.2 → 18×25=450 になる。
 * 2. **炊き倍率（確定）**: マスタ boosts.json はイベントPt用の eventPointRate と報酬用の
 *    rewardRate を別に持ち、6炊き以上で食い違う（10炊きで 35 と 30）。
 *    バッジは eventPointRate 側に乗る。10炊きで 32,970 Pt → 3,297 バッジ
 *    （rewardRate 側なら約 2,826）。リザルトの「ライブ報酬35倍」の表示も 35 の側。
 * 3. **1回ごとか累計からか（確定）**: 1回ごとに切り捨て、端数は次の回に持ち越さない。
 *    1炊きで 4,835 Pt（前回までの累計 59,345）→ 483 バッジ。累計から出すなら 484。
 *    所持も 6,417 で、累計 64,180 の 1/10（6,418）より端数の分だけ少ない。
 * 4. **除数 7（確定）**: 11/19 以降の実機の画面で 517 Pt → 73 バッジ（= floor(517÷7)。÷10 なら 51）。
 *
 * ## ★ 実機で裏を取れていない点
 *
 * 5. **7 がオートとマイセカイの採取にも効くか**: configs の値は1つなので全部に効くと見て、
 *    BADGE_REDUCTION の live と mySekai に同じ値を入れている。マイセカイだけ違えば mySekai を分ける。
 *    オートだけ違う場合は、プランが叩き方（ソロ・オート）を持っていないので、それだけでは直せない。
 * 6. **ワールドリンク**: サポートユニットのボーナスはバッジには半分しか乗らない
 *    （configs.json `world_bloom_support_deck_event_item_correction_value` = 0.5、
 *    英語版 wiki の "the Support Unit's event points bonus is double the chapter badge bonus"）。
 *    このツールはボーナスを合計1本で受け取るので区別できず、ワールドリンクでは表示より少なくなる。
 *    画像は注記なしで出回るので、合計の欄に「（目安）」を残している。
 *
 * 判定が付いたら、このコメントと badgeNote の文面を同時に直すこと。
 */

/** マスタの値が読めないときの除数。11/19 より前の長いあいだの値。 */
export const DEFAULT_EVENT_ITEM_REDUCTION = 10;

/** 生成ファイルの値を除数にする。数でない・0以下・無いときは DEFAULT_EVENT_ITEM_REDUCTION。 */
export function parseEventItemReduction(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EVENT_ITEM_REDUCTION;
}

/** 獲得Ptをバッジに換算する除数（configs.json の event_item_reduction。ビルド時に読む）。 */
export const EVENT_ITEM_REDUCTION = parseEventItemReduction(__EVENT_ITEM_REDUCTION__);

/**
 * 種類ごとの除数。今はマスタの値1つを全部に使う（上の ★5）。
 * 実機の計測で種類ごとに違うと分かったら、ここだけを分ける。
 */
export const BADGE_REDUCTION = {
  /** ライブ（ソロ・オート）。 */
  live: EVENT_ITEM_REDUCTION,
  /** マイセカイの採取。 */
  mySekai: EVENT_ITEM_REDUCTION,
} as const;

/** 画面・画像で使う呼び名。ゲーム内の正式名称は「イベントバッジ」。 */
export const BADGE_LABEL = "バッジ";

/** 数え方と未確認点を利用者に伝える注記（画面用。上の ★ と内容を揃える）。 */
export function badgeNote(reduction: number): string {
  const usual =
    reduction === DEFAULT_EVENT_ITEM_REDUCTION ? "" : `（普段は${DEFAULT_EVENT_ITEM_REDUCTION}）`;
  return (
    `イベントバッジは1回ごとに「獲得Pt÷${reduction}（切り捨て）」で数えています。` +
    `割る数はゲームのマスタデータに合わせて自動で変わります${usual}。` +
    "ワールドリンクのチャプターバッジはサポートユニットの分の計算が違い、表示より少なくなります。"
  );
}

export const BADGE_NOTE = badgeNote(BADGE_REDUCTION.live);

/** 1回のプレイで得るバッジ数。非数・負値は 0（表示を壊さない）。 */
export function badgesForPlay(pt: number, reduction: number = BADGE_REDUCTION.live): number {
  if (!Number.isFinite(pt) || pt <= 0) return 0;
  return Math.floor(pt / reduction);
}

/**
 * 同じ条件のプレイを count 回ずつ叩くまとまりの合計バッジ数。
 * 合計Ptを割るのではなく、1回ごとに切り捨ててから足す（1回ずつ配られるため）。
 */
export function badgesForUnits(
  units: ReadonlyArray<{ pt: number; count: number }>,
  reduction: number = BADGE_REDUCTION.live,
): number {
  return units.reduce(
    (sum, u) => sum + badgesForPlay(u.pt, reduction) * Math.max(0, Math.floor(u.count)),
    0,
  );
}

/** 採取1回のPt（単価 × メモリ値）。mySekai.ts の allocateMySekai と同じ 0.1 単位の整数で掛ける。 */
function harvestPt(unitBasePt: number, memory10x: number): number {
  return Math.floor((unitBasePt * memory10x) / 10);
}

/**
 * マイセカイ採取の合計バッジ数。採取1回ごとに切り捨ててから足す。
 *
 * ★ 合計Ptを割って済ませない。採取1回のPt（単価×1.0 / 0.5 / 0.2）は単価が100の倍数なので
 *   必ず10の倍数で、除数が 10 のあいだは合計Ptの1/10と一致していた。7 では一致しない
 *   （単価 1,100 の草花 1回 = 220 Pt → 31。合計で割る式では種類をまたいで端数が繰り上がる）。
 */
export function badgesForMySekai(
  allocation: { countA: number; countB: number; countC: number },
  unitBasePt: number,
  reduction: number = BADGE_REDUCTION.mySekai,
): number {
  return badgesForUnits(
    [
      { pt: harvestPt(unitBasePt, MEMORY_A_10X), count: allocation.countA },
      { pt: harvestPt(unitBasePt, MEMORY_B_10X), count: allocation.countB },
      { pt: harvestPt(unitBasePt, MEMORY_C_10X), count: allocation.countC },
    ],
    reduction,
  );
}

/** 「バッジ 473個」。 */
export function formatBadges(n: number): string {
  return `${BADGE_LABEL} ${n.toLocaleString()}個`;
}

/** 1回のプレイの獲得Ptから「バッジ 473個」を作る（画面の行で使う短縮形）。 */
export function formatPlayBadges(pt: number): string {
  return formatBadges(badgesForPlay(pt));
}
