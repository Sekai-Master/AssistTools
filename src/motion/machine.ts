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
import type { MotionLevel, MotionPlan } from "./plan";

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
      if (plan.sinkMs > 0 && state.phase !== "blank") {
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
      if (plan.sinkMs > 0) {
        return {
          state: { ...base, phase: "sink", since: event.at },
          effects: [...pre, { type: "timer", kind: "SINK_END", after: plan.sinkMs }],
        };
      }
      const step = enterBlank({ ...base, since: event.at }, event.at, plan);
      return { state: step.state, effects: [...pre, ...step.effects] };
    }

    case "READY": {
      if (event.key !== state.targetKey || state.failed) return stay(state);
      // StrictMode の二重発火や、沈む前に解決したケースを吸収する。
      if (state.phase !== "blank") return stay({ ...state, ready: true });
      const ready = { ...state, ready: true };
      // 既に十分待たせた(slow)なら床は払わない。それ以外は minBlank の床を守る。
      const floorPaid = state.slow || event.at - state.since >= plan.minBlankMs;
      if (!floorPaid) return stay(ready);
      const step = enterRise(ready, event.at, plan);
      return { state: step.state, effects: [{ type: "cancelTimers" }, ...step.effects] };
    }

    case "FAILED": {
      if (event.key !== state.targetKey || state.failed) return stay(state);
      // 沈んでいる途中で失敗が来たら blank へ落とす。phase を動かさないと
      // 沈み込みアニメーションが fill:both で保持されたまま固まり、
      // 「たまたま無地に見えているだけ」の状態になる。
      // commit はしない（失敗したルートを描画させない）ので、表示中の木は
      // 前のページのまま無地の裏に留まる。
      return {
        state: { ...state, failed: true, slow: false, phase: "blank", since: event.at },
        effects: [
          { type: "cancelTimers" },
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
  /** CSS へ渡す duration。ms の正本は TS 側だけ（CSS に数字を書かない）。 */
  sink: string;
  rise: string;
  busy: boolean;
}

export function stageAttrs(state: StageState, plan: MotionPlan): StageAttrs {
  return {
    motion: plan.level,
    stage: state.phase,
    sink: `${plan.sinkMs}ms`,
    rise: `${plan.riseMs}ms`,
    busy: state.phase === "blank" && !state.ready && !state.failed,
  };
}
