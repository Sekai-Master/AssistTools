/**
 * @vitest-environment jsdom
 *
 * ボーダー予測のページの「いま使えるツール」。時期ごとに出るリンクの先と、置き場所（予測の下・推移の上）を縛る。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TOOLS } from "../../tools";
import BorderPredictionPage from "./BorderPredictionPage";

// このリポジトリは vitest の globals を使っていないので、testing-library の自動クリーンアップが入らない
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom には ResizeObserver が無い。推移のグラフは幅が分かってから描くので、決まった幅を返す（BorderChart.test.tsx と同じ）
class FixedWidthObserver {
  private readonly cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {
    this.cb([{ contentRect: { width: 360 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  globalThis.ResizeObserver = FixedWidthObserver as unknown as typeof ResizeObserver;
});
afterAll(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

const H = 3_600_000;
const HEAD = "いま使えるツール";

const RANKS = [50, 100, 200, 500, 1000, 2000].map((rank) => ({
  rank,
  current: 1_000_000 * rank,
  predicted: 2_000_000 * rank,
  low: 1_800_000 * rank,
  high: 2_200_000 * rank,
  confidence: "mid",
  visible: true,
}));

/** いまを基準に、開始と集計を何時間ずらすかで時期を作る */
function snapshot(startIn: number, aggregateIn: number, over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    event: {
      id: 223,
      name: "いつかの君へ、旋律を",
      type: "marathon",
      unit: "school_refusal",
      startAt: now + startIn * H,
      aggregateAt: now + aggregateIn * H,
      durationHours: aggregateIn - startIn,
      ...over,
    },
    checkedAt: now,
    sampleAt: now,
    progress: 0.5,
    modelVersion: null,
    predicted: true,
    ranks: RANKS,
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** current と推移だけ返す。答え合わせは 404（無い）にする */
function serve(current: unknown, history?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/current") && current != null) return json(current);
      if (url.endsWith("/history") && history != null) return json(history);
      return new Response("", { status: 404 });
    }),
  );
}

async function show() {
  render(
    <MemoryRouter>
      <BorderPredictionPage />
    </MemoryRouter>,
  );
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await screen.findByText("しくみ");
  await vi.waitFor(() => expect(screen.queryByText("読み込み中…")).toBeNull());
}

function shelf(): HTMLElement {
  const section = screen.getByRole("heading", { name: HEAD }).closest("section");
  if (!section) throw new Error("入口の枠が無い");
  return section;
}

const hrefs = () => within(shelf()).getAllByRole("link").map((a) => a.getAttribute("href"));
const tool = (id: string) => TOOLS.find((t) => t.id === id)!;

/** 説明を添える（先頭に大きく出す）行が無い。説明は終盤のアナライザーだけ */
function expectNoLead(ids: string[]) {
  for (const id of ids) expect(within(shelf()).queryByText(tool(id).description)).toBeNull();
  expect(within(shelf()).queryByText(tool("analyzer").description)).toBeNull();
}

/**
 * ★ 通常の回でも、予測の数字の近く（確度の説明の頭）に「非公式の予測で、外れることがあります」を出す
 *   （指揮 2026-11-12。前はページ下の「しくみ」にしか無かった）。
 * ★ 外挿の回は「この回の予測は参考値です。…大きく外れることがあります」の枠がすでに言っているので、重ねて出さない。
 */
describe("予測の数字の近くの「非公式で外れる」の 1 文", () => {
  const currentPanel = () => screen.getByRole("heading", { name: "開催中のイベント" }).closest("section")!;
  const note = () => within(currentPanel()).getByText(/確度は8割の幅の広さです/);

  it("通常の回は、確度の説明の頭に出す", async () => {
    serve(snapshot(-72, 72));
    await show();
    expect(note().textContent).toMatch(/^非公式の予測で、外れることがあります。/);
  });

  it("外挿の回（参考値の枠がある）は、確度の説明に重ねて出さない", async () => {
    serve({ ...snapshot(-72, 72), extrapolatedFrom: 150 });
    await show();
    expect(within(currentPanel()).getByText("この回の予測は参考値です。")).toBeTruthy();
    expect(note().textContent).not.toContain("非公式の予測で、外れることがあります");
  });
});

describe("いま使えるツール", () => {
  it("序盤（開始の直後）: 編成ビルダー・編成かんたん比較・周回プラン", async () => {
    serve(snapshot(-1, 100));
    await show();
    expect(hrefs()).toEqual(["/deck", "/compare", "/plan"]);
    // 名前は src/tools.ts のもの
    for (const id of ["deck", "compare", "plan"]) {
      expect(within(shelf()).getByRole("link", { name: new RegExp(tool(id).name) })).toBeTruthy();
    }
    expectNoLead(["deck", "compare", "plan"]);
  });

  it("中盤: 周回プラン・必要稼働時間計算・効率曲ランキング", async () => {
    serve(snapshot(-72, 72));
    await show();
    expect(hrefs()).toEqual(["/plan", "/worktime", "/ranking"]);
    expectNoLead(["plan", "worktime", "ranking"]);
  });

  it("終盤（集計の 1 時間前）: アナライザーを先頭に説明つきで、あとは周回プラン", async () => {
    serve(snapshot(-120, 1));
    await show();
    expect(hrefs()).toEqual(["/analyzer", "/plan"]);
    const lead = within(shelf()).getByRole("link", { name: new RegExp(tool("analyzer").name) });
    expect(within(lead).getByText(tool("analyzer").description)).toBeTruthy();
    // 説明を添えるのは先頭の 1 つだけ
    expect(within(shelf()).queryByText(tool("plan").description)).toBeNull();
  });

  it("リンクに計測用のクエリ文字列を付けない", async () => {
    serve(snapshot(-120, 1));
    await show();
    for (const href of hrefs()) expect(href).not.toMatch(/[?#]/);
  });

  it("終わった後は何も置かない（空の枠も出さない）", async () => {
    serve(snapshot(-120, -2));
    await show();
    expect(screen.getByText("直近のイベント（終了）")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: HEAD })).toBeNull();
  });

  it("開催中の回が無い（current が 404）ときも何も置かない", async () => {
    serve(null);
    await show();
    expect(screen.getByText(/まだ予測がありません/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: HEAD })).toBeNull();
  });

  // ★ X から来た人の着地のページ。入口の判定で例外を出すと、予測ごと見えなくなる
  it("壊れた snapshot（種別が無い・時刻が数でない）でも、入口を出さずにページは動く", async () => {
    serve(snapshot(-72, 72, { type: undefined, startAt: null, aggregateAt: "x" }));
    await show();
    expect(screen.getByText("いつかの君へ、旋律を")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: HEAD })).toBeNull();
  });

  // ★ 予測の数字を下へ押しやらない。開催中のイベントの枠の後、推移（#trend）の前に置く
  it("開催中のイベントの枠の後、推移の前に置く", async () => {
    const now = Date.now();
    serve(snapshot(-72, 72), { eventId: 223, rows: [[now - H, 0.49, RANKS.map((r) => [r.rank, r.current, r.predicted, r.low, r.high, 1])]] });
    await show();
    const current = screen.getByRole("heading", { name: "開催中のイベント" }).closest("section")!;
    const trend = await vi.waitFor(() => {
      const el = document.getElementById("trend");
      if (!el) throw new Error("推移がまだ無い");
      return el;
    });
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(current.contains(shelf())).toBe(false);
    expect(follows(current, shelf())).toBe(true);
    expect(follows(shelf(), trend)).toBe(true);
  });
});

/**
 * ★ 「しくみ」（約 500 字）は閉じた段へ畳む（UX 監査 2026-11-12、PR-4）。見出しだけで中身が分かる言い方にする。
 * ★★ 予測の確かさの表示（「参考値」の札と枠・「確度」の札と説明・非公式で外れること）は**消さない・畳まない**。
 *   外挿の回の参考値の表示は 2026-10-25 の大外し（221 の 1000位）の後に入れたもので、予測の数字のすぐ近くに残す。
 */
describe("しくみを畳む・予測の確かさの表示は畳まない", () => {
  /** el がどこかの閉じた <details> の中（summary を除く）にあるか。 */
  const folded = (el: Element) => {
    if (el.closest("summary")) return false;
    const d = el.closest("details");
    return d != null && !d.open;
  };

  it("「しくみ」は閉じた段で、見出しに中身（予測の作り方・候補の選び直し）が書いてある。中身は残っている", async () => {
    serve(snapshot(-72, 72));
    await show();
    const summary = screen.getByText("しくみ").closest("summary");
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain("予測の作り方");
    expect(summary!.textContent).toContain("候補の選び直し");
    const details = summary!.closest("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("過去から借りるのは伸び方の形だけです");
    expect(details.textContent).toContain("人の勘で数字を足すことはしていません");
  });

  it("「序盤は目安」は畳まずに見せ、データの取得元の名前とリンクは出さない（2026-11-22 Nori「ページ内の仕組み的なとこにある記載とリンクも」消す）", async () => {
    serve(snapshot(-72, 72));
    await show();
    const note = screen.getByText(/序盤は幅が広い「目安」/);
    expect(folded(note)).toBe(false);
    expect(note.textContent).toContain("50位・100位は");
    expect(screen.queryByRole("link", { name: "Sekai Viewer" })).toBeNull();
    expect(note.textContent).not.toContain("Sekai Viewer");
  });

  it("予測が出ている回は「非公式の予測で、外れることがあります」を数字の近くで 1 回だけ言う（しくみの段で重ねない）", async () => {
    serve(snapshot(-72, 72));
    await show();
    const all = screen.getAllByText(/非公式の予測で、外れることがあります/);
    expect(all).toHaveLength(1);
    expect(all[0].textContent).toContain("確度は8割の幅の広さです");
  });

  it("予測がまだ出ていない回は、しくみの段で「非公式の予測で、外れることがあります」を言う", async () => {
    serve({ ...snapshot(-72, 72), predicted: false });
    await show();
    const all = screen.getAllByText(/非公式の予測で、外れることがあります/);
    expect(all).toHaveLength(1);
    expect(all[0].textContent).toContain("序盤は幅が広い「目安」");
    expect(folded(all[0])).toBe(false);
  });

  it("確度の札と説明は畳まない", async () => {
    serve(snapshot(-72, 72));
    await show();
    for (const el of screen.getAllByText(/確度 /)) expect(folded(el)).toBe(false);
    expect(folded(screen.getByText(/確度は8割の幅の広さです/))).toBe(false);
  });

  it("外挿の回の「参考値」の札と枠は畳まない", async () => {
    // extrapolatedFrom は event の外（snapshot の直下）
    const body = { ...snapshot(-72, 72), extrapolatedFrom: 150 };
    serve(body);
    await show();
    for (const el of screen.getAllByText("参考値")) expect(folded(el)).toBe(false);
    expect(folded(screen.getByText("この回の予測は参考値です。"))).toBe(false);
  });
});

/**
 * ★ みんなでライブ停止中の回（226 など）は特別モデルで出す（workers/border/src/special.ts、2026-11-19）。
 *   「みんなでライブ停止中の特別対応・目安」と書き、当たり方を確かめようがないので「確度は8割の幅の広さです」は出さない。
 *   11/18 の決まり（「非公式の予測で、外れることがあります」はページに 1 回だけ）は、この回でも守る。
 *   スナップショットには古い Bot 向けに extrapolatedFrom（参考値の札）も付いているが、参考値の枠は出さない
 */
describe("みんなでライブ停止中の特別対応の回", () => {
  const special = (over: Record<string, unknown> = {}) => ({
    ...snapshot(-72, 30),
    special: "solo",
    extrapolatedFrom: 150,
    referenceSource: "thin",
    thin: { duration: 102, samples: 2, latestEventId: 222, weight: 0.3 },
    modelVersion: "solo-special-v1@abcd1234",
    ranks: RANKS.map((r) => ({ ...r, confidence: "rough" })),
    ...over,
  });
  const currentPanel = () => screen.getByRole("heading", { name: "開催中のイベント" }).closest("section")!;

  it("特別対応の札を出し、「確度は8割の幅の広さです」と参考値の枠は出さない。「8割の幅」とも書かない", async () => {
    serve(special());
    await show();
    const panel = currentPanel();
    expect(within(panel).getByText("みんなでライブ停止中の特別対応・目安")).toBeTruthy();
    expect(screen.queryByText(/確度は8割の幅の広さです/)).toBeNull();
    expect(within(panel).queryByText("この回の予測は参考値です。")).toBeNull();
    expect(within(panel).queryByText("参考値")).toBeNull();
    expect(within(panel).getAllByText("目安")).toHaveLength(6);
    expect(panel.textContent).not.toContain("8割");
    expect(panel.textContent).toContain("目安の幅");
  });

  it("予測が出ている回は「非公式の予測で、外れることがあります」を特別対応の枠の中で 1 回だけ言う（しくみの段で重ねない）", async () => {
    serve(special());
    await show();
    const all = screen.getAllByText(/非公式の予測で、外れることがあります/);
    expect(all).toHaveLength(1);
    expect(all[0].textContent).toContain("みんなでライブ停止中の特別対応・目安");
  });

  it("予測がまだ出ていない間は、しくみの段で 1 回だけ言う", async () => {
    serve(special({ predicted: false }));
    await show();
    const all = screen.getAllByText(/非公式の予測で、外れることがあります/);
    expect(all).toHaveLength(1);
    expect(all[0].textContent).toContain("序盤は幅が広い「目安」");
  });

  // ★ 曲線がまだ使えず、ふだんのモデルの数字を広めの目安で出している間（specialFallback。検分 G1）も、「8割」「確度は8割の幅の広さです」を出さない
  it("曲線が使えずふだんの数字で出している間（specialFallback）も特別対応の札で、「8割」を出さず、非公式の 1 文は 1 回", async () => {
    serve(special({ specialFallback: true, modelVersion: "share-median-v1@e225-x+solo-fallback" }));
    await show();
    const panel = currentPanel();
    expect(within(panel).getByText("みんなでライブ停止中の特別対応・目安")).toBeTruthy();
    expect(panel.textContent).toContain("ふだんのモデルの数字を、幅を広げた目安として出しています");
    expect(panel.textContent).not.toContain("8割");
    expect(screen.queryByText(/確度は8割の幅の広さです/)).toBeNull();
    expect(within(panel).queryByText("この回の予測は参考値です。")).toBeNull();
    expect(screen.getAllByText(/非公式の予測で、外れることがあります/)).toHaveLength(1);
  });

  it("推移の説明と凡例も「目安の幅」と書く", async () => {
    const now = Date.now();
    serve(special(), { eventId: 226, rows: [[now - H, 0.49, RANKS.map((r) => [r.rank, r.current, r.predicted, r.low, r.high, 1])]] });
    await show();
    const trend = await vi.waitFor(() => {
      const el = document.getElementById("trend");
      if (!el) throw new Error("推移がまだ無い");
      return el;
    });
    expect(trend.textContent).toContain("目安の幅（帯）");
    expect(trend.textContent).not.toContain("8割");
  });
});

/**
 * ★ 「いまのモデル」の表の当たり率の欄（2026-11-22 Nori「それは"8割くらい"タイトルラベルが悪いわ」）。
 *   前は欄の名前が「8割の幅に入った率」で、数字も 82% だったので、「8割 × 8割 = 6割強の信用度」と読めてしまった。
 *   実際は 1 つの約束（10 回中 8 回は幅に収まる）の答え合わせなので、欄の名前に「8割」を重ねず、表の下で 1 回だけ説明する。
 *   「624回中」はイベントの数ではなく、1 回のイベントを数時点で答え合わせした合計なので、そう書く。
 */
describe("いまのモデルの表の当たり率の欄", () => {
  const model = {
    version: "v-test",
    createdAt: new Date(2026, 10, 21, 12).toISOString(),
    poolSize: 104,
    ranks: [
      {
        rank: 100,
        champion: "all",
        medianAbsError: [
          { p: 0.5, value: 0.03 },
          { p: 0.9, value: 0.01 },
        ],
        medianAbsErrorEarly: [{ p: 0.04, value: 0.12 }],
        coverage: [{ p: 0.5, covered: 70, total: 85 }],
        coverageEarly: [{ p: 0.08, covered: 12, total: 15 }],
      },
    ],
  };

  async function showWithModel() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/track-record")) return json({ model, reports: [] });
        return new Response("", { status: 404 });
      }),
    );
    await show();
    const panel = screen.getByRole("heading", { name: "いまのモデル" }).closest("section");
    if (!panel) throw new Error("いまのモデルの枠が無い");
    return panel as HTMLElement;
  }

  it("欄の名前に「8割」を重ねず、数字は答え合わせの回数と並べる", async () => {
    const panel = await showWithModel();
    expect(within(panel).queryByText("8割の幅に入った率")).toBeNull();
    expect(within(panel).getByRole("columnheader", { name: "幅に収まった実績" })).toBeTruthy();
    // 70+12 / 85+15 = 82%。「回中」ではなく「答え合わせ」の回数と書く
    expect(within(panel).getByText("82%（答え合わせ100回）")).toBeTruthy();
    expect(panel.textContent).not.toMatch(/（\d+回中）/);
  });

  it("表の下で「8割の幅」の意味と、右の欄が何の答え合わせかを 1 回だけ説明する", async () => {
    const panel = await showWithModel();
    const note = within(panel).getByText(/10 回中 8 回/);
    expect(note.textContent).toContain("「8割の幅」");
    expect(note.textContent).toContain("数時点で答え合わせした合計");
  });
});
