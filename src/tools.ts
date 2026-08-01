/**
 * ツール登録簿。ハブのカード一覧とヘッダーのナビが同じ定義を共有する。
 * 現行 index.html のツール一覧を踏襲。
 */
export interface ToolDef {
  id: string;
  path: string;
  name: string;
  /** ヘッダーナビ用の短縮名。フルネームだと横並びが詰まるため。 */
  shortName: string;
  description: string;
  /** Material Icons 名（現行デザイン踏襲。実装時に lucide 等へ置換検討）。 */
  icon: string;
  /** ユニット色キー。Hubカードのアクセントと各ツールページの基調色を一致させる。 */
  unit: string;
  status: "ready" | "coming_soon";
  /**
   * ヘッダーの横並びに出すか。
   *
   * ★ 全ツールを等しく並べるのは「全部同じ重要度」と宣言することになるし、
   *   実際 9 個は 1400px でも詰まる。ここに入れるのは 4 つまで。
   *   それ以外はヘッダーの「すべて」→ ハブか、モバイルメニューから辿る。
   *   増やしたくなったら、増やす前にどれを降ろすかを決めること。
   */
  primary?: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    id: "tweet",
    path: "/tweet",
    name: "ついぼジェネレーター",
    shortName: "ついぼ",
    description: "協力ライブ募集ツイートを簡単に作成できます。",
    icon: "campaign",
    unit: "vs",
    status: "ready",
    primary: true,
  },
  {
    id: "evc",
    path: "/evc",
    name: "スキル実効値計算機",
    shortName: "実効値",
    description: "スキル効果の実効値を計算できます。",
    icon: "calculate",
    unit: "ln",
    status: "ready",
  },
  {
    id: "analyzer",
    path: "/analyzer",
    name: "ポイント調整アナライザー",
    shortName: "アナライザー",
    description: "ポイント調整の方法を検索できます。",
    icon: "analytics",
    unit: "mmj",
    status: "ready",
    primary: true,
  },
  {
    id: "bingo",
    path: "/bingo",
    name: "BINGOカードジェネレーター",
    shortName: "BINGO",
    description: "チアフルカーニバル用のBINGOカードを生成できます。",
    icon: "grid_on",
    unit: "vbs",
    status: "ready",
  },
  {
    id: "refresh",
    path: "/refresh",
    name: "リフレッシュゲージ計算機",
    shortName: "ゲージ",
    description: "現在のゲージから100%まで何分か・持続ペースを確認。プレイ/休憩/マイセカイを積んで推移も計画できます。",
    icon: "battery_charging_full",
    unit: "wxs",
    status: "ready",
  },
  {
    id: "worktime",
    path: "/worktime",
    name: "必要稼働時間計算",
    shortName: "稼働時間",
    description: "焚き数・稼働時間・編成ボーナスから到達ポイントを計算。目標からの逆算・必要ライボも出します。",
    icon: "schedule",
    unit: "n25",
    status: "ready",
  },
  {
    id: "plan",
    path: "/plan",
    name: "周回プラン",
    shortName: "プラン",
    description: "現在ポイントを起点に、焚き数×時間の稼働枠を積んで累積の到達ポイント・到達時刻を可視化します。",
    icon: "event_note",
    unit: "vs",
    status: "ready",
    primary: true,
  },
  {
    id: "ranking",
    path: "/ranking",
    name: "効率曲ランキング",
    shortName: "ランキング",
    description:
      "手動周回・オート周回・チャレンジライブの3つで効率曲を順位表示。用途で最適解が変わるので分けています。総合力とボーナスを入れると自分用の順位になります。",
    icon: "leaderboard",
    unit: "ln",
    status: "ready",
    primary: true,
  },
  {
    id: "deck",
    path: "/deck",
    name: "編成ビルダー",
    shortName: "編成",
    description:
      "カード5枚のイベントボーナスと総合力を出します。ボーナスを落として総合力を盛った方が勝つ場合があるので、編成を並べて最終ポイントで比べられます。",
    icon: "style",
    unit: "wxs",
    status: "ready",
  },
  {
    id: "efficiency",
    path: "/efficiency",
    name: "効率難易度検索",
    shortName: "効率",
    description: "楽曲ごとの最高効率難易度を検索できます。",
    icon: "speed",
    unit: "ln",
    status: "coming_soon",
  },
];

export const READY_TOOLS = TOOLS.filter((t) => t.status === "ready");
/**
 * ヘッダーの横並びに出すツール。4つまで（ToolDef.primary のコメント参照）。
 * ヘッダーは実際にはこれ＋現在地を出すので、組み立ては Layout 側で行う。
 */
export const PRIMARY_TOOLS = READY_TOOLS.filter((t) => t.primary);
