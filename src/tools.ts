/**
 * ツール登録簿。ハブのカード一覧とヘッダーのナビが同じ定義を共有する。
 * 現行 index.html のツール一覧を踏襲。
 */
export interface ToolDef {
  id: string;
  path: string;
  name: string;
  description: string;
  /** Material Icons 名（現行デザイン踏襲。実装時に lucide 等へ置換検討）。 */
  icon: string;
  status: "ready" | "coming_soon";
}

export const TOOLS: ToolDef[] = [
  {
    id: "tweet",
    path: "/tweet",
    name: "ついぼジェネレーター",
    description: "協力ライブ募集ツイートを簡単に作成できます。",
    icon: "campaign",
    status: "ready",
  },
  {
    id: "evc",
    path: "/evc",
    name: "スキル実効値計算機",
    description: "スキル効果の実効値を計算できます。",
    icon: "calculate",
    status: "ready",
  },
  {
    id: "analyzer",
    path: "/analyzer",
    name: "ポイント調整アナライザー",
    description: "ポイント調整の方法を検索できます。",
    icon: "analytics",
    status: "ready",
  },
  {
    id: "bingo",
    path: "/bingo",
    name: "BINGOカードジェネレーター",
    description: "チアフルカーニバル用のBINGOカードを生成できます。",
    icon: "grid_on",
    status: "ready",
  },
  {
    id: "efficiency",
    path: "/efficiency",
    name: "効率難易度検索",
    description: "楽曲ごとの最高効率難易度を検索できます。",
    icon: "speed",
    status: "coming_soon",
  },
  {
    id: "worktime",
    path: "/worktime",
    name: "必要稼働時間計算",
    description: "編成ボーナス・ライボ数などから稼働時間の計算をします。",
    icon: "schedule",
    status: "coming_soon",
  },
];

export const READY_TOOLS = TOOLS.filter((t) => t.status === "ready");
