import { describe, expect, it } from "vitest";
import {
  drawPlanCanvas,
  planCanvasHeight,
  type PlanCanvasData,
  type PlanCanvasRow,
} from "./planCanvas";

/**
 * R6: PlanCanvasRow に scoreBand/lb/bonusLabel（強調表示用）を追加したことによる
 * refresh/worktime への非破壊回帰。これらのフィールドを持たない行（refresh 本来の
 * 周回行）は従来通り54px/行のまま1pxも変わらないことを固定する。
 */
describe("planCanvasHeight — 新フィールド未指定行は高さ不変（refresh/worktime 非破壊）", () => {
  const NORMAL_ROW: PlanCanvasRow = {
    time: "21:00 → 22:00",
    label: "独りんぼエンヴィー",
    percent: "23.5%",
    warn: false,
  };
  const EMPHASIS_ROW: PlanCanvasRow = {
    time: "1回 × 3炊き",
    label: "独りんぼエンヴィー",
    percent: "+1,000 Pt",
    warn: false,
    scoreBand: { min: 0, max: 19_999 },
  };

  it("新フィールド無し3行は 128 + 54*3 + 96", () => {
    const rows = [NORMAL_ROW, NORMAL_ROW, NORMAL_ROW];
    expect(planCanvasHeight(rows)).toBe(128 + 54 * 3 + 96);
  });

  it("scoreBand を持つ行は84pxに広がり、無い行は54pxのまま混在できる", () => {
    const rows = [NORMAL_ROW, EMPHASIS_ROW];
    expect(planCanvasHeight(rows)).toBe(128 + 54 + 84 + 96);
  });

  it("0行なら HEADER_H + FOOTER_H のみ", () => {
    expect(planCanvasHeight([])).toBe(128 + 96);
  });
});

/**
 * 日をまたぐ時刻（2026-11-24）。リフレッシュゲージ・周回プランの「画像を保存」で、時刻に (+1d) が付くと
 * 時刻の文字がジャケットと曲名の下に潜っていた。
 *
 * ★ 原因: 通常行の時刻は左端から幅の確認なしに 1 行で描き、ジャケット・曲名は左から 150px の固定の位置に描く。
 *   「00:00 (+1d) → 01:00 (+1d)」は 12px で 150px を超える（日本語の字形の環境で約 170px）。
 * ★ ここでは canvas の代わりに、描いた文字と位置を記録する偽物を渡す。文字幅は半角 0.6 字・全角 1 字ぶんで数える
 *   （ブラウザの字形とは違うが、「幅を測らずに固定の位置へ描く」ことは字形によらず赤になる）。
 */
describe("drawPlanCanvas — 時刻は曲名・ジャケットに重ならない", () => {
  interface Fill {
    text: string;
    x: number;
    y: number;
    font: string;
    align: string;
  }

  const sizeOf = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 10);
  const widthOf = (text: string, font: string) =>
    [...text].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 0.6 : 1) * sizeOf(font), 0);

  /** fillText を記録するだけの canvas。 */
  function fakeCanvas() {
    const fills: Fill[] = [];
    const ctx = {
      font: "10px sans-serif",
      fillStyle: "#000",
      textAlign: "left",
      textBaseline: "alphabetic",
      scale() {},
      fillRect() {},
      drawImage() {},
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      arcTo() {},
      closePath() {},
      clip() {},
      measureText(text: string) {
        return { width: widthOf(text, ctx.font) };
      },
      fillText(text: string, x: number, y: number) {
        fills.push({ text, x, y, font: ctx.font, align: ctx.textAlign });
      },
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    return { canvas, fills };
  }

  const row = (time: string): PlanCanvasRow => ({
    time,
    label: "独りんぼエンヴィー　1時間0分",
    sub: "≈34回",
    percent: "6.7%",
    warn: false,
  });
  const data = (rows: PlanCanvasRow[]): PlanCanvasData => ({
    songTitle: "独りんぼエンヴィー",
    meta: ["ペース: 34回/時（エビ基準・ひとりでライブ想定）"],
    rows,
    summary: [{ label: "総時間", value: "3時間0分" }],
    accent: "#88dd44",
  });
  const TIME_FONT = "12px sans-serif";
  const LABEL_FONT = "bold 14px sans-serif";

  it("(+1d) の付いた時刻も、ラベルの左端より手前で終わり、文字は欠けない", async () => {
    const times = [
      "23:00 → 00:00 (+1d)",
      "00:00 (+1d) → 01:00 (+1d)",
      "01:00 (+1d) → 02:00 (+1d)",
    ];
    const { canvas, fills } = fakeCanvas();
    await drawPlanCanvas(canvas, data(times.map(row)));

    const labelX = Math.min(...fills.filter((f) => f.font === LABEL_FONT).map((f) => f.x));
    const timeFills = fills.filter((f) => f.font === TIME_FONT && f.align === "left");
    expect(timeFills.length).toBeGreaterThan(0);
    for (const f of timeFills) {
      expect(f.x + widthOf(f.text, f.font)).toBeLessThan(labelX);
    }
    // 各行の時刻が、開始と終了の両方とも省略されずに描かれている
    const drawn = timeFills.map((f) => f.text).join(" ");
    for (const clock of ["23:00", "00:00 (+1d)", "01:00 (+1d)", "02:00 (+1d)"]) {
      expect(drawn).toContain(clock);
    }
    expect(drawn).not.toContain("…");
  });

  it("収まる時刻だけの画像は、足す前と同じく 1 行で同じ位置に描く", async () => {
    const { canvas, fills } = fakeCanvas();
    await drawPlanCanvas(canvas, data([row("21:00 → 22:00"), row("22:00 → 23:00")]));
    const timeFills = fills.filter((f) => f.font === TIME_FONT && f.align === "left");
    expect(timeFills).toEqual([
      { text: "21:00 → 22:00", x: 28, y: 128 + 27, font: TIME_FONT, align: "left" },
      { text: "22:00 → 23:00", x: 28, y: 128 + 54 + 27, font: TIME_FONT, align: "left" },
    ]);
  });
});
