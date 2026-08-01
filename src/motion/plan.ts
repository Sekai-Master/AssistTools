/**
 * 画面遷移演出の「段階」モデル。純関数のみ（DOM も localStorage も触らない）。
 *
 * duration の正本はここ。CSS 側には ms を1つも書かず、html の --stage-* へ
 * 流し込む（TS と CSS の二重管理をしない）。
 */

export const MOTION_SETTINGS = ["auto", "off", "subtle", "rich"] as const;
/** 設定画面でユーザーが選ぶ値。auto は「端末に合わせる」という意思表示。 */
export type MotionSetting = (typeof MOTION_SETTINGS)[number];
/** 実際に走る演出の段階。auto は解決されてこのどれかになる。 */
export type MotionLevel = "off" | "subtle" | "rich";

export interface MotionPlan {
  level: MotionLevel;

  /** 沈みの総尺（最後のブロックが消え終わるまで）。0 なら沈まない。 */
  sinkMs: number;
  /** 無地を最低これだけ見せる床。待ちではなく「一度素材に戻った」を知覚させるためのもの。 */
  minBlankMs: number;
  /** 無地に入ってからこれを超えて中身が来なければ待ちインジケータを出す。 */
  patienceMs: number;
  /** 浮上の総尺（最後のブロックが出終わるまで）。 */
  riseMs: number;

  /* ---- カスケード（ブロック単位の振り付け）---------------------------- */

  /** 1ブロックが溶けきるのにかける時間。 */
  sinkSpanMs: number;
  /** 先頭ブロックと最後のブロックの出だしの差＝カスケードの幅。0 なら一斉。 */
  sinkStaggerMs: number;
  /** 1ブロックが浮き上がりきるのにかける時間。 */
  riseSpanMs: number;
  riseStaggerMs: number;
  /** 溶けるときのぼかしの最大量(px)。0 ならぼかさない＝ブロック演出をしない。 */
  blurPx: number;
}

interface Cascade {
  sinkSpanMs: number;
  sinkStaggerMs: number;
  riseSpanMs: number;
  riseStaggerMs: number;
  minBlankMs: number;
  patienceMs: number;
  blurPx: number;
}

/** 総尺は「1ブロックの尺 + カスケードの幅」で決まる。ここでしか計算しない。 */
const plan = (level: MotionLevel, c: Cascade): MotionPlan => ({
  level,
  ...c,
  sinkMs: c.sinkSpanMs + c.sinkStaggerMs,
  riseMs: c.riseSpanMs + c.riseStaggerMs,
});

const OFF = plan("off", {
  sinkSpanMs: 0,
  sinkStaggerMs: 0,
  riseSpanMs: 0,
  riseStaggerMs: 0,
  minBlankMs: 0,
  patienceMs: 250,
  blurPx: 0,
});

/**
 * 控えめ＝既定。沈まないので「無地に戻る間」そのものを持たず、体感待ち時間の
 * 増加がゼロ。ブロック単位のカスケードもぼかしも無く、影が育つだけ
 *（box-shadow の再描画パスが遷移あたり2回から1回に半減する）。
 * リッチを短くした版ではなく、構造を1段外した版。
 */
const SUBTLE = plan("subtle", {
  sinkSpanMs: 0,
  sinkStaggerMs: 0,
  riseSpanMs: 180,
  riseStaggerMs: 0,
  minBlankMs: 0,
  patienceMs: 280,
  blurPx: 0,
});

/**
 * リッチ＝明示的に選んだ人だけの見世物。尺を惜しまない。
 *
 *   沈み(350ms)  色が抜ける → 輪郭がぼやける → 消える を、下のブロックから順に
 *   無地(90ms)   素材だけの面
 *   浮上(680ms)  ぼやけた塊が像を結び → 最後に色が戻る を、上のブロックから順に
 *
 * 合計は 1120ms あるが、体感待ち時間はここではない。最初のブロックが出始めるのは
 * 350 + 90 = 440ms 時点で、残り 680ms は「もう読める画面の上でカスケードが
 * 完了していく時間」。予算を2本立てにしているのはこのため（下の定数）。
 */
const RICH = plan("rich", {
  sinkSpanMs: 220,
  sinkStaggerMs: 130,
  riseSpanMs: 380,
  riseStaggerMs: 300,
  minBlankMs: 90,
  patienceMs: 480,
  blurPx: 5,
});

/**
 * 体感速度の予算。「合計」ではなく「最初の中身が出始めるまで」で縛る。
 * ここを超えると操作に対する返事が遅いと感じられる。
 */
export const MOTION_FIRST_PAINT_BUDGET_MS = 500;
/**
 * カスケードが完了するまでの上限。超えると「まだ終わらないのか」に変わる。
 * 振り付けを伸ばすと plan.test.ts が落ちる（＝意図的な契約）。
 */
export const MOTION_TOTAL_BUDGET_MS = 1200;

/** 操作してから最初の中身が出始めるまで。 */
export const firstPaintMs = (p: MotionPlan): number => p.sinkMs + p.minBlankMs;
/** チャンクが温かいときの遷移コスト。設定画面に出す値でもある。 */
export const totalMs = (p: MotionPlan): number => p.sinkMs + p.minBlankMs + p.riseMs;

export const MOTION_LABEL: Record<MotionSetting, string> = {
  auto: "自動",
  off: "オフ",
  subtle: "控えめ",
  rich: "リッチ",
};

export const MOTION_NOTE: Record<MotionSetting, string> = {
  auto: "端末に合わせます。ふだんは「控えめ」、端末の「視差効果を減らす」がオンなら「オフ」。",
  off: "ページ遷移の演出をしません。切り替えは即時です。",
  subtle: "沈みません。新しいページだけが影を持って浮き上がります。",
  rich: "ブロックごとに色が抜けて溶け、無地の素材に戻ります。そこから順に像を結び、最後に色が戻ります。",
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
 * 既定は "auto"。設定画面に一度も来ない人に対してはこの関数の判断が全てになる:
 *
 *   OS が視差軽減 → オフ  （WCAG 2.3.3 の「動きを無効化する手段」を既定で満たす）
 *   それ以外       → 控えめ
 *
 * ★ 端末クラス（スマホかPCか）では分岐しない。リッチは尺が1秒を超える見世物で、
 *   PC なら黙って出してよいという性格のものではなくなった。既定は全端末で控えめにし、
 *   リッチは設定画面で明示的に選んだ人だけに出す（Nori 判断 2026-08-01）。
 *   touchOnly は解決には使わないが、設定画面で「この端末では重いかも」と
 *   知らせるために引き続き観測している。
 *
 * ★ フレーム時間を実測して勝手に降格させることはしない。それは明示的に選んだ設定を
 *   裏で書き換えることになり、設定 UI の意味が壊れる。
 *
 * 明示的に選んだ場合はそれが環境より優先される — OS/端末はグローバルな既定で、
 * この画面での選択はより新しく具体的な意思表示だから。黙って上書きはせず、
 * OS 側が reduce のときは設定画面に注記を出す。
 *
 * なお本演出は translate / scale / 回転 / パララックスを一切含まない
 *（影・不透明度・ぼかし・彩度だけ）ので、上書きされても前庭系のトリガーにはならない。
 */
export function resolvePlan(setting: MotionSetting, env: MotionEnv): MotionPlan {
  if (setting === "off") return OFF;
  if (setting === "subtle") return SUBTLE;
  if (setting === "rich") return RICH;
  // auto: 端末に合わせる
  return env.osReduce ? OFF : SUBTLE;
}

/** ブロック単位のカスケードを持つ段階か（＝ディビジョンに印を付ける必要があるか）。 */
export const hasCascade = (p: MotionPlan): boolean => p.blurPx > 0;

/**
 * CSS へ渡す duration/量。ms も px も TS 側だけが持つ（CSS に数字を書かない）。
 * ここに無い値は CSS 側で「尺の何割」として書く。
 */
export function stageVars(p: MotionPlan): Record<string, string> {
  return {
    "--stage-sink": `${p.sinkSpanMs}ms`,
    "--stage-sink-cascade": `${p.sinkStaggerMs}ms`,
    "--stage-sink-total": `${p.sinkMs}ms`,
    "--stage-rise": `${p.riseSpanMs}ms`,
    "--stage-rise-cascade": `${p.riseStaggerMs}ms`,
    "--stage-rise-total": `${p.riseMs}ms`,
    "--stage-blur": `${p.blurPx}px`,
  };
}
