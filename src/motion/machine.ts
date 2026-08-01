/**
 * 画面遷移の有限状態機械。
 *
 * DOM もタイマーも React も router も知らない純粋なリデューサで、副作用は
 * データ（StageEffect）として返すだけ。翻訳は useRouteStage.ts が担う。
 * こうしておくと「遅いチャンク」「連打」「戻る」「失敗」といった経路を
 * ブラウザ無しで全部テストできる。
 *
 *   idle ──NAVIGATE──> sink ──SINK_END──> blank ──READY/FLOOR──> rise ──> idle
 *                       （沈む）        （無地で待つ）      （浮き上がる）
 */
import { hasCascade, type MotionLevel, type MotionPlan } from "./plan";

export type StagePhase = "idle" | "sink" | "blank" | "rise";
export type TimerKind = "SINK_END" | "BLANK_FLOOR" | "PATIENCE" | "RISE_END" | "FAILSAFE";

/** これを超えて中身も失敗通知も来なければ、固まったとみなして失敗表示に切り替える。 */
export const FAILSAFE_MS = 10_000;

export interface StageState {
  phase: StagePhase;
  /** 表示中ルートの location.key。スクロール退避のキー。 */
  shownKey: string;
  targetKey: string;
  targetPath: string;
  /** 新しい木が commit 済みか（＝lazy チャンク解決済み）。 */
  ready: boolean;
  /** patience を超えて待たされているか。 */
  slow: boolean;
  failed: boolean;
  /** 戻る/進む由来か。スクロール復元の分岐に使う。 */
  pop: boolean;
  /** 設定画面のプレビュー中。commit も副作用も出さない。 */
  preview: boolean;
  /** 現 phase に入った時刻(ms)。 */
  since: number;
}

export type StageEvent =
  | { type: "NAVIGATE"; key: string; path: string; pop: boolean; at: number }
  | { type: "PREVIEW"; at: number }
  | { type: "READY"; key: string; at: number }
  | { type: "FAILED"; key: string; at: number }
  | { type: "TIMER"; kind: TimerKind; at: number };

export type StageEffect =
  | { type: "cancelTimers" }
  | { type: "timer"; kind: TimerKind; after: number }
  | { type: "prefetch"; path: string }
  | { type: "saveScroll"; key: string }
  | { type: "commit" }
  | { type: "restoreScroll"; key: string; pop: boolean }
  /** ページをブロックに割ってカスケードの順番を書き込む。flush はスタイル計算の強制。 */
  | { type: "markDivisions"; flush: boolean }
  /** 共有要素を持ち上げる（＝出発点を確定する）。まだ元ページが見えている時点で。 */
  | { type: "morphCapture" }
  /** 持ち上げたものを行き先の形へ飛ばす。新しい木が commit 済みの時点で。 */
  | { type: "morphFly" }
  /** 対応が付かなかった・割り込まれたときに複製を片付ける。 */
  | { type: "morphCancel" }
  | { type: "focusStage" }
  | { type: "announce"; kind: "arrived" | "loading" | "failed"; path: string };

export interface Step {
  state: StageState;
  effects: StageEffect[];
}

export function initialState(key: string, path: string): StageState {
  // 初回描画では絶対にアニメさせない（設定読み込み前のフラッシュ対策も兼ねる）。
  return {
    phase: "idle",
    shownKey: key,
    targetKey: key,
    targetPath: path,
    ready: true,
    slow: false,
    failed: false,
    pop: false,
    preview: false,
    since: 0,
  };
}

const stay = (state: StageState): Step => ({ state, effects: [] });

/** 無地（＝新しい木を待つ窓）へ。ここで初めて表示 location を差し替える。 */
function enterBlank(s: StageState, at: number, plan: MotionPlan): Step {
  const effects: StageEffect[] = [];
  if (!s.preview) effects.push({ type: "commit" });
  if (plan.minBlankMs > 0) {
    effects.push({ type: "timer", kind: "BLANK_FLOOR", after: plan.minBlankMs });
  }
  if (!s.ready) {
    effects.push({ type: "timer", kind: "PATIENCE", after: plan.patienceMs });
    effects.push({ type: "timer", kind: "FAILSAFE", after: FAILSAFE_MS });
  }
  const next: StageState = { ...s, phase: "blank", since: at };

  // プレビューは commit が無く最初から ready なので、床が無ければ無地を挟まずに抜ける。
  // 実ナビゲーションでは ready が必ず false なのでここには入らない
  //（＝commit 前にスクロール復元が走る事故が構造的に起きない）。
  if (next.preview && plan.minBlankMs === 0) {
    const rise = enterRise(next, at, plan);
    return { state: rise.state, effects: [...effects, ...rise.effects] };
  }
  return { state: next, effects };
}

/**
 * 浮上へ。
 *
 * restoreScroll → focusStage → announce の順序は入れ替えないこと（テストで固定）。
 * 逆にするとフォーカス移動に伴うブラウザのスクロールが復元位置を上書きする。
 *
 * 新しい木はレイアウト済み・かつ画面上はまだ無地（rich）なので、ここで
 * スクロールを確定するとジャンプが原理的に見えない。
 */
function enterRise(s: StageState, at: number, plan: MotionPlan): Step {
  const effects: StageEffect[] = [];
  if (!s.preview) {
    effects.push({ type: "restoreScroll", key: s.targetKey, pop: s.pop });
  }
  // ★ 印付けはスクロール復元の後。どのブロックが画面内かを見て順番を決めるので、
  //   復元前の位置で測るとカスケードの尺を画面外のブロックに食わせてしまう。
  //   プレビュー（設定画面での試し再生）は commit も復元もしないが、カスケード
  //   そのものを見せるための機能なので印は必要。だから preview の外に置く。
  if (hasCascade(plan) && plan.riseMs > 0) {
    effects.push({ type: "markDivisions", flush: true });
  }
  // ★ 印付けの後・フォーカス移動の前。行き先の採寸はスクロール復元が済んで
  //   いないと狂うし、飛ばし始めてからフォーカスで画面が動くと軌道がずれる。
  if (plan.morphMs > 0) effects.push({ type: "morphFly" });
  if (!s.preview) {
    effects.push({ type: "focusStage" });
    effects.push({ type: "announce", kind: "arrived", path: s.targetPath });
  }
  const base = { ...s, shownKey: s.targetKey, slow: false, since: at };
  if (plan.riseMs <= 0) {
    return { state: { ...base, phase: "idle", preview: false }, effects };
  }
  effects.push({ type: "timer", kind: "RISE_END", after: plan.riseMs });
  return { state: { ...base, phase: "rise" }, effects };
}

export function reduce(state: StageState, event: StageEvent, plan: MotionPlan): Step {
  switch (event.type) {
    case "NAVIGATE": {
      if (event.key === state.targetKey) return stay(state); // 同一遷移の再入は無視
      const base: StageState = {
        ...state,
        targetKey: event.key,
        targetPath: event.path,
        pop: event.pop,
        ready: false,
        slow: false,
        failed: false,
        preview: false,
      };
      const pre: StageEffect[] = [{ type: "cancelTimers" }];

      // 無地の最中は、既に新しい木が commit されていて scrollY が新ページの
      // 高さでクランプされている可能性がある。そこで保存すると旧ページの
      // 記憶を壊すので、旧ページが実際に見えている phase でだけ退避する。
      if (state.phase !== "blank") {
        pre.push({ type: "saveScroll", key: state.shownKey });
      }
      // 沈む時間をそのままロード時間に変える。
      pre.push({ type: "prefetch", path: event.path });

      if (state.phase === "sink") {
        // 沈み途中の再ナビゲート: 沈み直さず残り時間で張り直す（連打で無地が伸びない）。
        const rest = Math.max(0, plan.sinkMs - (event.at - state.since));
        return {
          state: { ...base, phase: "sink" },
          effects: [...pre, { type: "timer", kind: "SINK_END", after: rest }],
        };
      }
      // ★ ここから先が「新しく遷移が始まる」経路。上の沈み途中の再ナビゲートでは
      //   既に持ち上げ済みなので通らない（連打で複製が増えない）。
      //   採寸は旧ページが見えているうちにしかできないので、沈む前に済ませる。
      if (plan.morphMs > 0) pre.push({ type: "morphCapture" });

      if (plan.sinkMs > 0 && state.phase !== "blank") {
        // 印は今まさに見えている木（＝旧ページ）に対して付ける。
        // 沈み途中の再ナビゲート（上の分岐）では木が変わっていないので付け直さない。
        if (hasCascade(plan)) pre.push({ type: "markDivisions", flush: false });
        return {
          state: { ...base, phase: "sink", since: event.at },
          effects: [...pre, { type: "timer", kind: "SINK_END", after: plan.sinkMs }],
        };
      }
      // 既に平ら（blank 中）、または沈まないレベル → そのまま無地へ。
      const step = enterBlank({ ...base, since: event.at }, event.at, plan);
      return { state: step.state, effects: [...pre, ...step.effects] };
    }

    case "PREVIEW": {
      if (state.phase !== "idle") return stay(state);
      const base: StageState = {
        ...state,
        preview: true,
        ready: true,
        slow: false,
        failed: false,
      };
      const pre: StageEffect[] = [{ type: "cancelTimers" }];
      // プレビューはページが変わらない＝着地点が無いので、持ち上げはしない。
      if (plan.sinkMs > 0) {
        if (hasCascade(plan)) pre.push({ type: "markDivisions", flush: false });
        return {
          state: { ...base, phase: "sink", since: event.at },
          effects: [...pre, { type: "timer", kind: "SINK_END", after: plan.sinkMs }],
        };
      }
      const step = enterBlank({ ...base, since: event.at }, event.at, plan);
      return { state: step.state, effects: [...pre, ...step.effects] };
    }

    case "READY": {
      if (event.key !== state.targetKey) return stay(state);
      // ★ failed で弾かない。FAILSAFE(10s) が発火したあとに実際はチャンクが届く
      //   ことがある（遅いモバイル回線）。ここで捨てると画面が無地のまま
      //   永久に固まり、届いているページを隠したまま偽の失敗カードを出し続ける。
      //   届いたなら失敗表示を取り下げて復帰させる。
      const ready = { ...state, ready: true, failed: false };
      // StrictMode の二重発火や、沈む前に解決したケースを吸収する。
      if (state.phase !== "blank") return stay(ready);
      // 既に十分待たせた(slow)なら床は払わない。それ以外は minBlank の床を守る。
      const floorPaid = state.slow || event.at - state.since >= plan.minBlankMs;
      if (!floorPaid) return stay(ready);
      const step = enterRise(ready, event.at, plan);
      return { state: step.state, effects: [{ type: "cancelTimers" }, ...step.effects] };
    }

    case "FAILED": {
      if (event.key !== state.targetKey || state.failed) return stay(state);
      // 沈んでいる途中で失敗が来たら blank へ落とす。phase を動かさないと
      // 沈み込みの演出が保持されたまま固まり、
      // 「たまたま無地に見えているだけ」の状態になる。
      // commit はしない（失敗したルートを描画させない）ので、表示中の木は
      // 前のページのまま無地の裏に留まる。
      return {
        state: { ...state, failed: true, slow: false, phase: "blank", since: event.at },
        effects: [
          { type: "cancelTimers" },
          // 行き先が来ない以上、持ち上げたものの着地点も無い。
          { type: "morphCancel" },
          { type: "announce", kind: "failed", path: state.targetPath },
        ],
      };
    }

    case "TIMER":
      switch (event.kind) {
        case "SINK_END": {
          if (state.phase !== "sink") return stay(state);
          const step = enterBlank(state, event.at, plan);
          return { state: step.state, effects: [{ type: "cancelTimers" }, ...step.effects] };
        }
        case "BLANK_FLOOR": {
          if (state.phase !== "blank" || !state.ready || state.failed) return stay(state);
          const step = enterRise(state, event.at, plan);
          return { state: step.state, effects: [{ type: "cancelTimers" }, ...step.effects] };
        }
        case "PATIENCE":
          // 我慢の限界。待ちを見える形にする。
          // FAILSAFE はまだ生かしておきたいので cancelTimers はしない。
          if (state.phase !== "blank" || state.ready || state.failed) return stay(state);
          return {
            state: { ...state, slow: true },
            effects: [{ type: "announce", kind: "loading", path: state.targetPath }],
          };
        case "FAILSAFE":
          if (state.phase !== "blank" || state.ready || state.failed) return stay(state);
          return {
            state: { ...state, failed: true, slow: false },
            effects: [{ type: "announce", kind: "failed", path: state.targetPath }],
          };
        case "RISE_END":
          if (state.phase !== "rise") return stay(state);
          return {
            state: { ...state, phase: "idle", preview: false, since: event.at },
            effects: [],
          };
      }
  }
}

export interface StageAttrs {
  motion: MotionLevel;
  stage: StagePhase;
  busy: boolean;
  /**
   * ステージが視覚的に消えているか。inert を付ける判断に使う。
   *
   * opacity:0 の間も DOM は残るので、これを付けないと「画面には何も見えないのに
   * Tab で前ページの入力欄やボタンを巡れて Enter で発火できる」状態になる。
   * 逆にオフ/控えめでは中身が見えているので絶対に付けない
   *（＝「見えているのに操作できない」を作らない）。
   */
  hidden: boolean;
}

export function stageAttrs(state: StageState, plan: MotionPlan): StageAttrs {
  const invisible = plan.level === "rich" && (state.phase === "sink" || state.phase === "blank");
  return {
    motion: plan.level,
    stage: state.phase,
    busy: state.phase === "blank" && !state.ready && !state.failed,
    hidden: invisible,
  };
}
