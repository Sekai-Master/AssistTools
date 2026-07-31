import { describe, expect, it } from "vitest";
import {
  FAILSAFE_MS,
  initialState,
  reduce,
  stageAttrs,
  type StageEvent,
  type StageState,
  type Step,
} from "./machine";
import { resolvePlan } from "./plan";

const DESKTOP = { osReduce: false, touchOnly: false };

const RICH = resolvePlan("rich", DESKTOP); // sink130 / floor40 / patience320 / rise210
const SUBTLE = resolvePlan("subtle", DESKTOP); // sink0 / floor0 / rise160
const OFF = resolvePlan("off", DESKTOP);

function run(events: StageEvent[], plan = RICH, start: StageState = initialState("k0", "/")) {
  const steps: Step[] = [];
  let s = start;
  for (const e of events) {
    const step = reduce(s, e, plan);
    s = step.state;
    steps.push(step);
  }
  return { state: s, steps };
}

const kinds = (step: Step) => step.effects.map((e) => e.type);
const timerKinds = (step: Step) =>
  step.effects.flatMap((e) => (e.type === "timer" ? [e.kind] : []));

describe("チャンクが速いとき", () => {
  it("無地は minBlankMs ぴったりで抜ける（早く来ても床は払う）", () => {
    const { state, steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 140 }, // 床(40ms)未達
      { type: "TIMER", kind: "BLANK_FLOOR", at: 170 },
    ]);
    expect(steps[2].state.phase).toBe("blank");
    expect(steps[2].effects).toEqual([]);
    expect(state.phase).toBe("rise");
  });

  // 順序が逆だと、フォーカス移動に伴うブラウザのスクロールが復元位置を上書きする。
  it("浮上時の副作用は必ず スクロール→フォーカス→読み上げ の順", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 140 },
      { type: "TIMER", kind: "BLANK_FLOOR", at: 170 },
    ]);
    expect(kinds(steps[3])).toEqual([
      "cancelTimers",
      "restoreScroll",
      "focusStage",
      "announce",
      "timer",
    ]);
  });

  it("NAVIGATE の時点で先読みが走る（沈む時間をロード時間に変える）", () => {
    const { steps } = run([{ type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 }]);
    expect(steps[0].effects).toContainEqual({ type: "prefetch", path: "/evc" });
    expect(steps[0].effects).toContainEqual({ type: "saveScroll", key: "k0" });
  });

  it("表示 location の差し替え(commit)は無地に入った瞬間だけ", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
    ]);
    expect(kinds(steps[0])).not.toContain("commit");
    expect(kinds(steps[1])).toContain("commit");
  });

  it("戻る(POP)は記憶した位置へ、通常遷移は先頭へ", () => {
    const pop = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: true, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 200 },
    ]);
    expect(pop.steps[2].effects).toContainEqual({
      type: "restoreScroll",
      key: "k1",
      pop: true,
    });

    const push = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 200 },
    ]);
    expect(push.steps[2].effects).toContainEqual({
      type: "restoreScroll",
      key: "k1",
      pop: false,
    });
  });
});

describe("チャンクが遅いとき", () => {
  it("patience で待ちを見せ、到着したら床を払わず即浮上する", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "TIMER", kind: "BLANK_FLOOR", at: 170 }, // まだ来ていない
      { type: "TIMER", kind: "PATIENCE", at: 450 },
      { type: "READY", key: "k1", at: 900 },
    ]);
    expect(steps[2].state.phase).toBe("blank"); // 床は ready でないと効かない
    expect(steps[3].state.slow).toBe(true);
    expect(steps[3].effects).toEqual([
      { type: "announce", kind: "loading", path: "/analyzer" },
    ]);
    expect(steps[4].state.phase).toBe("rise");
  });

  it("待ちを見せている間も FAILSAFE は生かす（cancelTimers しない）", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "TIMER", kind: "PATIENCE", at: 450 },
    ]);
    expect(kinds(steps[2])).not.toContain("cancelTimers");
  });

  it("無地に入るとき、まだ来ていなければ patience と failsafe を張る", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
    ]);
    expect(steps[1].effects).toContainEqual({
      type: "timer",
      kind: "PATIENCE",
      after: RICH.patienceMs,
    });
    expect(steps[1].effects).toContainEqual({
      type: "timer",
      kind: "FAILSAFE",
      after: FAILSAFE_MS,
    });
  });
});

describe("割り込み", () => {
  it("沈み途中の再ナビゲートは沈み直さず、残り時間で張り直す", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "NAVIGATE", key: "k2", path: "/bingo", pop: false, at: 60 },
    ]);
    expect(steps[1].state.phase).toBe("sink");
    expect(steps[1].state.targetKey).toBe("k2");
    expect(steps[1].effects[0]).toEqual({ type: "cancelTimers" });
    expect(steps[1].effects.at(-1)).toEqual({ type: "timer", kind: "SINK_END", after: 70 });
  });

  it("無地の最中の再ナビゲートは沈みを飛ばす（既に平らだから）", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "NAVIGATE", key: "k2", path: "/bingo", pop: false, at: 160 },
    ]);
    expect(steps[2].state.phase).toBe("blank");
    expect(timerKinds(steps[2])).not.toContain("SINK_END");
  });

  // 無地の最中は既に新しい木が commit されていて scrollY が新ページの高さで
  // クランプされうる。そこで保存すると旧ページの記憶を壊す。
  it("無地の最中の再ナビゲートではスクロールを保存し直さない", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "NAVIGATE", key: "k2", path: "/bingo", pop: false, at: 160 },
    ]);
    expect(kinds(steps[2])).not.toContain("saveScroll");
  });

  it("同じ location.key の再入は無視する", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 1 },
    ]);
    expect(steps[1].effects).toEqual([]);
  });

  it("古い READY は無視する", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "NAVIGATE", key: "k2", path: "/bingo", pop: false, at: 160 },
      { type: "READY", key: "k1", at: 200 },
    ]);
    expect(steps[3].state.ready).toBe(false);
    expect(steps[3].state.phase).toBe("blank");
  });

  it("StrictMode の二重発火で浮上が2回始まらない", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 180 },
      { type: "READY", key: "k1", at: 181 },
    ]);
    expect(steps[2].state.phase).toBe("rise");
    expect(steps[3].effects).toEqual([]);
  });

  it("浮上が終わる前の再ナビゲートは沈みからやり直す", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 180 },
      { type: "NAVIGATE", key: "k2", path: "/bingo", pop: false, at: 200 },
    ]);
    expect(steps[2].state.phase).toBe("rise");
    expect(steps[3].state.phase).toBe("sink");
  });

  it("遅れて届いた RISE_END は idle を壊さない", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "RISE_END", at: 10 }, // phase は sink
    ]);
    expect(steps[1].state.phase).toBe("sink");
  });
});

describe("失敗", () => {
  it("先読みの失敗で失敗状態になり読み上げる", () => {
    const { state, steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "FAILED", key: "k1", at: 50 },
    ]);
    expect(state.failed).toBe(true);
    expect(steps[1].effects).toContainEqual({
      type: "announce",
      kind: "failed",
      path: "/analyzer",
    });
  });

  // phase を動かさないと沈み込みの演出が保持されたまま固まり、
  // 「たまたま無地に見えているだけ」の状態になる。
  it("沈んでいる途中で失敗したら無地へ落とす（沈みかけで固まらない）", () => {
    const { state, steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "FAILED", key: "k1", at: 40 },
    ]);
    expect(steps[0].state.phase).toBe("sink");
    expect(state.phase).toBe("blank");
    // 失敗したルートを描画させない（commit しない）。
    expect(kinds(steps[1])).not.toContain("commit");
  });

  it("古い FAILED は無視する", () => {
    const { state } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "NAVIGATE", key: "k2", path: "/bingo", pop: false, at: 160 },
      { type: "FAILED", key: "k1", at: 200 },
    ]);
    expect(state.failed).toBe(false);
  });

  it("FAILSAFE で失敗表示に落ちる（永久ローディングにしない）", () => {
    const { state, steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "TIMER", kind: "FAILSAFE", at: 10_130 },
    ]);
    expect(state.failed).toBe(true);
    expect(steps[2].effects).toContainEqual({
      type: "announce",
      kind: "failed",
      path: "/analyzer",
    });
  });

  it("既に届いていれば FAILSAFE は効かない", () => {
    const { state } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 200 },
      { type: "TIMER", kind: "FAILSAFE", at: 10_130 },
    ]);
    expect(state.failed).toBe(false);
  });

  // FAILSAFE(10s) のあとに実際はチャンクが届くことがある（遅いモバイル回線）。
  // ここで捨てると、届いているページを隠したまま無地の画面が永久に固まる。
  it("失敗表示のあとに遅れて届いたら復帰する（無地のまま固まらない）", () => {
    const { state } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "TIMER", kind: "FAILSAFE", at: 10_130 },
      { type: "READY", key: "k1", at: 12_000 },
    ]);
    expect(state.failed).toBe(false);
    expect(state.phase).toBe("rise");
  });

  it("失敗中でも別ページへ逃げられる（失敗が解除される）", () => {
    const { state } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "FAILED", key: "k1", at: 200 },
      { type: "NAVIGATE", key: "k2", path: "/", pop: false, at: 300 },
    ]);
    expect(state.failed).toBe(false);
    expect(state.targetPath).toBe("/");
  });
});

describe("オフ", () => {
  it("沈みフェーズを経由せず、副作用の順序は同じ", () => {
    const { steps } = run(
      [
        { type: "NAVIGATE", key: "k1", path: "/evc", pop: true, at: 0 },
        { type: "READY", key: "k1", at: 30 },
      ],
      OFF
    );
    expect(steps[0].state.phase).toBe("blank");
    // 演出の 0ms タイマーは張らない（＝「オフなのに即時でない」を作らない）。
    // 遅延・失敗の検知タイマーはオフでも張る（演出ではなく機能なので）。
    expect(timerKinds(steps[0])).not.toContain("SINK_END");
    expect(timerKinds(steps[0])).not.toContain("BLANK_FLOOR");
    expect(timerKinds(steps[0])).toContain("PATIENCE");
    expect(steps[1].state.phase).toBe("idle"); // riseMs 0 なので即 idle
    expect(kinds(steps[1])).toEqual([
      "cancelTimers",
      "restoreScroll",
      "focusStage",
      "announce",
    ]);
  });

  it("オフでも先読み・スクロール復元・読み上げは残る（演出ではなく機能）", () => {
    const { steps } = run(
      [{ type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 }],
      OFF
    );
    expect(steps[0].effects).toContainEqual({ type: "prefetch", path: "/evc" });
  });
});

describe("控えめ", () => {
  it("沈まず無地も挟まないが、浮上はする", () => {
    const { steps } = run(
      [
        { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
        { type: "READY", key: "k1", at: 30 },
      ],
      SUBTLE
    );
    expect(steps[0].state.phase).toBe("blank");
    expect(steps[1].state.phase).toBe("rise");
  });
});

describe("プレビュー", () => {
  it("commit もスクロールもフォーカスも読み上げも動かさない", () => {
    const { steps } = run([
      { type: "PREVIEW", at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "TIMER", kind: "BLANK_FLOOR", at: 170 },
    ]);
    const all = steps.flatMap(kinds);
    expect(all).not.toContain("commit");
    expect(all).not.toContain("restoreScroll");
    expect(all).not.toContain("focusStage");
    expect(all).not.toContain("announce");
    expect(steps[2].state.phase).toBe("rise");
  });

  it("遷移中のプレビュー要求は無視する", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "PREVIEW", at: 10 },
    ]);
    expect(steps[1].effects).toEqual([]);
    expect(steps[1].state.preview).toBe(false);
  });

  it("プレビューが終わると preview フラグが下りる", () => {
    const { state } = run([
      { type: "PREVIEW", at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "TIMER", kind: "BLANK_FLOOR", at: 170 },
      { type: "TIMER", kind: "RISE_END", at: 380 },
    ]);
    expect(state.phase).toBe("idle");
    expect(state.preview).toBe(false);
  });
});

describe("stageAttrs", () => {
  it("プランの ms を CSS 変数の文字列にする（CSS に数字を書かないため）", () => {
    const a = stageAttrs(initialState("k0", "/"), RICH);
    expect(a).toMatchObject({ motion: "rich", stage: "idle", sink: "130ms", rise: "210ms" });
  });

  it("aria-busy は無地で待っている間だけ立つ", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 140 },
    ]);
    expect(stageAttrs(steps[0].state, RICH).busy).toBe(false); // 沈み中はまだ
    expect(stageAttrs(steps[1].state, RICH).busy).toBe(true);
    expect(stageAttrs(steps[2].state, RICH).busy).toBe(false); // 届いたら下ろす
  });

  // opacity:0 の間 DOM は残るので、これが無いと「画面には何も見えないのに
  // Tab で前ページのボタンを押せる」状態になる。
  it("リッチで見えていない間だけ hidden（inert）が立つ", () => {
    const { steps } = run([
      { type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "READY", key: "k1", at: 200 },
    ]);
    expect(stageAttrs(steps[0].state, RICH).hidden).toBe(true); // sink
    expect(stageAttrs(steps[1].state, RICH).hidden).toBe(true); // blank
    expect(stageAttrs(steps[2].state, RICH).hidden).toBe(false); // rise
  });

  // オフ/控えめは中身が見えているので絶対に inert しない
  //（＝「見えているのに操作できない」を作らない）。
  it("オフ・控えめでは hidden が立たない", () => {
    for (const plan of [OFF, SUBTLE]) {
      const { steps } = run(
        [{ type: "NAVIGATE", key: "k1", path: "/evc", pop: false, at: 0 }],
        plan
      );
      expect(stageAttrs(steps[0].state, plan).hidden).toBe(false);
    }
  });

  it("失敗中は busy にしない（永久に読み込み中と読ませない）", () => {
    const { state } = run([
      { type: "NAVIGATE", key: "k1", path: "/analyzer", pop: false, at: 0 },
      { type: "TIMER", kind: "SINK_END", at: 130 },
      { type: "FAILED", key: "k1", at: 200 },
    ]);
    expect(stageAttrs(state, RICH).busy).toBe(false);
  });
});
