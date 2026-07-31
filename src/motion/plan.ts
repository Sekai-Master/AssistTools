/**
 * 画面遷移演出の「段階」モデル。純関数のみ（DOM も localStorage も触らない）。
 *
 * duration の正本はここ。CSS 側には ms を1つも書かず、html の --stage-sink /
 * --stage-rise へ流し込む（TS と CSS の二重管理をしない）。
 */

export const MOTION_SETTINGS = ["auto", "off", "subtle", "rich"] as const;
/** 設定画面でユーザーが選ぶ値。auto は「端末に合わせる」という意思表示。 */
export type MotionSetting = (typeof MOTION_SETTINGS)[number];
/** 実際に走る演出の段階。auto は解決されてこのどれかになる。 */
export type MotionLevel = "off" | "subtle" | "rich";

export interface MotionPlan {
  level: MotionLevel;
  /** 沈む時間（素材と面一になるまで）。0 なら沈まない＝無地の「間」を挟まない。 */
  sinkMs: number;
  /** 無地を最低これだけ見せる床。待ちではなく「一度戻った」を知覚させるためのもの。 */
  minBlankMs: number;
  /** 無地に入ってからこれを超えて中身が来なければ待ちインジケータを出す。 */
  patienceMs: number;
  /** 浮き上がる時間。 */
  riseMs: number;
}

const OFF: MotionPlan = { level: "off", sinkMs: 0, minBlankMs: 0, patienceMs: 250, riseMs: 0 };
const SUBTLE: MotionPlan = { level: "subtle", sinkMs: 0, minBlankMs: 0, patienceMs: 280, riseMs: 160 };
const RICH: MotionPlan = { level: "rich", sinkMs: 130, minBlankMs: 40, patienceMs: 320, riseMs: 210 };

/**
 * 体感速度の予算。チャンクが温かいときの遷移コストはこれを超えない。
 * テストで固定しているので、振り付けを伸ばすと CI が落ちる（＝意図的な契約）。
 */
export const MOTION_BUDGET_MS = 400;

export const MOTION_LABEL: Record<MotionSetting, string> = {
  auto: "自動",
  off: "オフ",
  subtle: "控えめ",
  rich: "リッチ",
};

export const MOTION_NOTE: Record<MotionSetting, string> = {
  auto: "端末に合わせます。スマホは「控えめ」、パソコンは「リッチ」。端末の「視差効果を減らす」がオンなら「オフ」。",
  off: "ページ遷移の演出をしません。切り替えは即時です。",
  subtle: "沈みません。新しいページだけが影を持って浮き上がります。",
  rich: "いったん影が沈んで無地の面に戻り、そこから影が育ちながらページが押し出されてきます。",
};

/** 「自動」の解決に使う環境。どちらもメディアクエリで観測する。 */
export interface MotionEnv {
  /** OS の「視差効果を減らす」。 */
  osReduce: boolean;
  /** 主入力がタッチで、ホバーできる装置が1つも無い＝スマホ/タブレット。 */
  touchOnly: boolean;
}

/**
 * 設定と環境から実行プランを決める唯一の場所。
 *
 * 既定は "auto" ＝「端末に合わせる」。設定画面に一度も来ない人に対しては、
 * この関数の判断が全てになる:
 *
 *   OS が視差軽減      → オフ  （WCAG 2.3.3 の「動きを無効化する手段」を既定で満たす）
 *   スマホ/タブレット   → 控えめ（box-shadow は GPU 合成できず、影の補間は
 *                                ルート配下の全ノードで再計算を起こす。モバイルGPUには重い）
 *   それ以外（パソコン）→ リッチ
 *
 * ★ フレーム時間を実測して勝手に降格させることはしない。それは明示的に選んだ設定を
 *   裏で書き換えることになり、設定 UI の意味が壊れる。一方この「端末クラスでの分岐」は
 *   auto が最初から約束している内容そのものなので矛盾しない。何に解決されたかは
 *   設定画面に表示する。
 *
 * 明示的に選んだ場合はそれが環境より優先される — OS/端末はグローバルな既定で、
 * この画面での選択はより新しく具体的な意思表示だから。黙って上書きはせず、
 * OS 側が reduce のときは設定画面に注記を出す。
 *
 * なお本演出は translate / scale / 回転 / パララックスを一切含まない（影と不透明度だけ）
 * ので、上書きされても前庭系のトリガーにはならない。
 */
export function resolvePlan(setting: MotionSetting, env: MotionEnv): MotionPlan {
  if (setting === "off") return OFF;
  if (setting === "subtle") return SUBTLE;
  if (setting === "rich") return RICH;
  // auto: 端末に合わせる
  if (env.osReduce) return OFF;
  return env.touchOnly ? SUBTLE : RICH;
}

/** チャンクが温かいときの遷移コスト。設定画面に出す値でもある。 */
export const totalMs = (p: MotionPlan): number => p.sinkMs + p.minBlankMs + p.riseMs;
