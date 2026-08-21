/**
 * ツール登録簿。ハブのカード一覧とヘッダーのナビが同じ定義を共有する。
 * 現行 index.html のツール一覧を踏襲。
 */
import type { UnitKey } from "./lib/units";

/**
 * ツールの仕分け。**TOP の動線はこれで決まる。**
 *
 * ★ 色はカテゴリのもの。ツール1つずつに別のユニット色を割り当てていたが、
 *   12枚が別々の色で光るだけで**色が何も意味していなかった**（Nori 指摘 2026-08-21）。
 *   いまは「色を見ればどの領域の道具か分かる」。プロセカらしさ（ユニット色）は保ったまま、
 *   **意味を持たせる**ための割り当て。
 *
 * ★★ **並びはゲームのユニット順**（Leo/need → MORE MORE JUMP! → Vivid BAD SQUAD →
 *   ワンダーランズ×ショウタイム → 25時、ナイトコードで。）。Nori 指定 2026-08-21。
 *   色の順番が先にあり、そこへ意味を当てている。**そして偶然ではなく、この順が
 *   そのままイベランの動線**（編成を決める → どれだけ走るか見積もる → 走る →
 *   着地させる → その他）になっている。**カテゴリを増減するときはこの2つを同時に壊さないこと。**
 *
 * ★ VIRTUAL SINGER（水色）はカテゴリに使わない。**サイトそのものの色**として、
 *   ツールではないページ（規約・ポリシー・更新履歴）に取ってある。
 *
 * ★ カードの色・ツールページの基調色・遷移演出の色は、すべてここから流れる。
 *   個別ページで色を指定しない（ToolPage が id から引く）。
 */
export interface ToolCategory {
  id: string;
  /** 見出し。 */
  label: string;
  /** 見出しの下に出す1行。「いつ開くものか」を書く。 */
  note: string;
  unit: UnitKey;
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "deck",
    label: "編成",
    note: "走り出す前に決めるもの。ボーナスと総合力の詰め方。",
    unit: "ln",
  },
  {
    id: "plan",
    label: "計画",
    note: "どれだけ走ればどこまで行くか。時間・ライボ・ゲージの見積り。",
    unit: "mmj",
  },
  {
    id: "run",
    label: "周回",
    note: "走っている間に開くもの。どの曲を叩くか、いま何秒で回れているか。",
    unit: "vbs",
  },
  {
    id: "event",
    label: "イベント",
    note: "イベントそのものに向き合うもの。着地のポイント調整とお祭り機能。",
    unit: "wxs",
  },
  {
    id: "other",
    label: "交流・記録",
    note: "走る以外。募集の文面や、集めたものの棚卸し。",
    unit: "n25",
  },
];

export interface ToolDef {
  id: string;
  path: string;
  name: string;
  /** ヘッダーナビ用の短縮名。フルネームだと横並びが詰まるため。 */
  shortName: string;
  description: string;
  /** Material Icons 名（現行デザイン踏襲。実装時に lucide 等へ置換検討）。 */
  icon: string;
  /**
   * 仕分け（TOOL_CATEGORIES の id）。**色はここから決まる**ので、
   * ツール側で色を持たない。
   */
  category: string;
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
    id: "deck",
    path: "/deck",
    name: "編成ビルダー",
    shortName: "編成",
    description:
      "カード5枚のイベントボーナスと総合力を出します。ボーナスを落として総合力を盛った方が勝つ場合があるので、編成を並べて最終ポイントで比べられます。",
    icon: "style",
    category: "deck",
    status: "ready",
  },
  {
    id: "evc",
    path: "/evc",
    name: "スキル実効値計算機",
    shortName: "実効値",
    description: "スキル効果の実効値を計算できます。",
    icon: "calculate",
    category: "deck",
    status: "ready",
  },
  {
    id: "plan",
    path: "/plan",
    name: "周回プラン",
    shortName: "プラン",
    description:
      "現在ポイントを起点に、焚き数×時間の稼働枠を積んで累積の到達ポイント・到達時刻を可視化します。",
    icon: "event_note",
    category: "plan",
    status: "ready",
    primary: true,
  },
  {
    id: "worktime",
    path: "/worktime",
    name: "必要稼働時間計算",
    shortName: "稼働時間",
    description:
      "焚き数・稼働時間・編成ボーナスから到達ポイントを計算。目標からの逆算・必要ライボも出します。",
    icon: "schedule",
    category: "plan",
    status: "ready",
  },
  {
    id: "refresh",
    path: "/refresh",
    name: "リフレッシュゲージ計算機",
    shortName: "ゲージ",
    description:
      "現在のゲージから100%まで何分か・持続ペースを確認。プレイ/休憩/マイセカイを積んで推移も計画できます。",
    icon: "battery_charging_full",
    category: "plan",
    status: "ready",
  },
  {
    id: "ranking",
    path: "/ranking",
    name: "効率曲ランキング",
    shortName: "ランキング",
    description:
      "手動周回・オート周回・チャレンジライブの3つで効率曲を順位表示。用途で最適解が変わるので分けています。総合力とボーナスを入れると自分用の順位になります。",
    icon: "leaderboard",
    category: "run",
    status: "ready",
    primary: true,
  },
  {
    id: "lap",
    path: "/lap",
    name: "周回ラップ計測",
    shortName: "ラップ",
    description:
      "1周終わるたびに押すだけで、実際のラップ・オーバーヘッド・周/時を測ります。休憩や部屋落ちは中断ボタンで自動的に平均から外れます。実測の時速は編成に取り込めます。",
    icon: "timer",
    category: "run",
    status: "ready",
  },
  {
    id: "efficiency",
    path: "/efficiency",
    name: "効率難易度検索",
    shortName: "効率",
    description: "楽曲ごとの最高効率難易度を検索できます。",
    icon: "speed",
    category: "run",
    status: "coming_soon",
  },
  {
    id: "analyzer",
    path: "/analyzer",
    name: "ポイント調整アナライザー",
    shortName: "アナライザー",
    description: "ポイント調整の方法を検索できます。",
    icon: "analytics",
    category: "event",
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
    category: "event",
    status: "ready",
  },
  {
    id: "tweet",
    path: "/tweet",
    name: "ついぼジェネレーター",
    shortName: "ついぼ",
    description: "協力ライブ募集ツイートを簡単に作成できます。",
    icon: "campaign",
    category: "other",
    status: "ready",
    primary: true,
  },
  {
    id: "mysekai",
    path: "/mysekai",
    name: "マイセカイ リアクション図鑑",
    shortName: "マイセカイ",
    description:
      "キャラが反応する家具をキャラ別に一覧できます。ゲーム内の絞り込みは自分が設計図を持っている家具しか出ないので、まだ持っていない家具や、他人のセカイへ模写しに行く候補もここで探せます。",
    icon: "weekend",
    category: "other",
    status: "ready",
  },
];

export const READY_TOOLS = TOOLS.filter((t) => t.status === "ready");
/**
 * ヘッダーの横並びに出すツール。4つまで（ToolDef.primary のコメント参照）。
 * ヘッダーは実際にはこれ＋現在地を出すので、組み立ては Layout 側で行う。
 */
export const PRIMARY_TOOLS = READY_TOOLS.filter((t) => t.primary);

const CATEGORY_BY_ID = new Map(TOOL_CATEGORIES.map((c) => [c.id, c]));

/**
 * ツールの色（ユニットキー）。**カテゴリから引く。**
 * ★ ここが唯一の出どころ。ページ側で色を書かないこと（書くと必ず片方だけ古くなる）。
 */
export function unitOf(toolId: string): UnitKey {
  const tool = TOOLS.find((t) => t.id === toolId);
  const unit = tool && CATEGORY_BY_ID.get(tool.category)?.unit;
  return (unit ?? "vs") as UnitKey;
}

/** カテゴリごとのツール（TOOL_CATEGORIES の順）。TOP の並びはこれで決まる。 */
export function toolsByCategory(): {
  category: ToolCategory;
  tools: ToolDef[];
}[] {
  return TOOL_CATEGORIES.map((category) => ({
    category,
    tools: TOOLS.filter((t) => t.category === category.id),
  })).filter((g) => g.tools.length > 0);
}
