/**
 * @vitest-environment jsdom
 *
 * 効率曲ランキングの説明の置き場（UX 監査 2026-11-12、PR-4）。
 *
 * ★ 表の前の黄色の注意枠（129 字）は 1 行に縮める。要る事実「1枠補正と巻き込みを含まない」「2〜5枠の実感に近い」は残し、
 *   「効率難易度」との違いなどの詳しい話は「この数字について」へ移す（消さない）。
 * ★ 「この数字について」（約 730 字）は開いたままだったので、閉じた段にする。見出しだけで中身が分かる言い方にする。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";
import { DEFAULT_OVERHEAD_SEC } from "./lib/efficiency";

// 独りんぼエンヴィー MASTER（public/MusicDatas の値。QuickCompare.test.tsx と同じ）
const ENVY: RankingMusic = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "master",
  playLevel: 26,
  noteCount: 589,
  baseScore: 1.13309,
  skillScoreSolo: [0.073695, 0.064296, 0.070625, 0.082429, 0.069849, 0.085787],
  baseScoreAuto: 0.7735,
  skillScoreAuto: [0.051586, 0.044845, 0.048948, 0.056569, 0.047483, 0.057741],
  skillScoreMulti: [0.073695, 0.064296, 0.070625, 0.082429, 0.069849, 0.128681],
  feverScore: 0.140221,
  musicTime: 74.8,
  eventRate: 100,
  jacketLink: "jacket_s_074.webp",
};

vi.mock("./useRankingMusics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useRankingMusics")>()),
  useRankingMusics: () => ({ entries: [ENVY], loading: false, error: null }),
}));

// みんなでライブが止まっている期間の印。既定は本物と同じ true。再開したとき（false）の振る舞いも見るため差し替えられるようにする。
const suspension = vi.hoisted(() => ({ value: true }));
vi.mock("../../lib/liveSuspension", () => ({
  get MULTI_LIVE_SUSPENDED() {
    return suspension.value;
  },
}));

// ひとりでライブのロスが仮の値かの印。既定は本物と同じ true。値（OVERHEAD_SEC）は本物のまま使う。
const provisional = vi.hoisted(() => ({ value: true }));
vi.mock("../../lib/overhead", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/overhead")>();
  return {
    ...actual,
    get SOLO_OVERHEAD_PROVISIONAL() {
      return provisional.value;
    },
  };
});

afterEach(() => {
  cleanup();
  suspension.value = true;
  provisional.value = true;
});

const draw = () =>
  render(
    <MemoryRouter>
      <EfficiencyRanking />
    </MemoryRouter>,
  );

/** el がどこかの閉じた <details> の中（summary を除く）にあるか。 */
const folded = (el: Element) => {
  if (el.closest("summary")) return false;
  const d = el.closest("details");
  return d != null && !d.open;
};

describe("表の前の注意枠", () => {
  it("1 行（26 字以内）に縮め、「1枠補正と巻き込みを含まない」「2〜5枠」は畳まずに残す", () => {
    draw();
    const box = [...document.querySelectorAll("p.bg-amber-50")].find((p) => p.textContent?.includes("1枠補正"))!;
    expect(box).toBeTruthy();
    const text = box.textContent ?? "";
    // スマホ（390px）で 1 行に収まる長さ（text-xs で約 25 字）
    expect(text.length).toBeLessThanOrEqual(26);
    expect(text).toContain("巻き込み");
    expect(text).toContain("2〜5枠");
    expect(folded(box)).toBe(false);
  });
});

describe("この数字について", () => {
  const about = () => screen.getByText("この数字について").closest("details");

  it("閉じた段で、見出しに中身（式・AP 前提）が書いてある", () => {
    draw();
    const details = about();
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    const summary = details!.querySelector("summary")!.textContent ?? "";
    expect(summary).toContain("式");
    expect(summary).toContain("AP");
    // 検分 #245 低-1: 注意枠から移した「効率難易度」との違いも、見出しで分かるように
    expect(summary).toContain("効率難易度との違い");
  });

  it("中身は消さない。注意枠から移した「効率難易度」との違いも入っている", () => {
    draw();
    const text = about()!.textContent ?? "";
    expect(text).toContain("全ノーツPERFECT（AP）を前提にした理論値です");
    expect(text).toContain("みんなでライブの活躍ボーナス");
    expect(text).toContain("効率難易度");
    expect(text).toContain("1枠を取って巻き込みまで決める場合は低い難易度がもっと強くなることがあり");
  });
});

/**
 * ひとりで周回（2026-11-18〜 みんなでライブが止まったイベント向け）。
 *
 * ★ 新しい説明には公式名「ひとりでライブ」を使い、「協力」と書かない。
 * ★ 2026-11-18 Nori 決定: 「手動周回」は「みんなで周回」に改名。みんなでライブが止まっている間は「ひとりで周回」で開く。
 */
describe("ひとりで周回", () => {
  // EfficiencyRanking.tsx の STORE_KEY。保存の鍵は変えない（変えると既存の利用者の入力が消える）。
  const STORE_KEY = "sekai-master:ranking-inputs";
  afterEach(() => localStorage.clear());

  const tab = (name: string) => screen.getByRole("radio", { name });
  // タブの直後の段落が見出し、その次が説明
  const headline = () => tab("みんなで周回").closest('[role="radiogroup"]')!.nextElementSibling!;
  const body = () => headline().nextElementSibling!.textContent ?? "";

  it("タブは4つ。みんなで周回・ひとりで周回・オート周回・チャレライの順", () => {
    draw();
    const group = tab("みんなで周回").closest('[role="radiogroup"]') as HTMLElement;
    expect(within(group).getAllByRole("radio").map((b) => b.textContent)).toEqual([
      "みんなで周回",
      "ひとりで周回",
      "オート周回",
      "チャレライ",
    ]);
  });

  it("選ぶと「ひとりでライブ」の時間あたりPtの説明になり、「協力」と書かない。長さは他のタブ並み", () => {
    draw();
    const others = ["みんなで周回", "オート周回", "チャレライ"].map((name) => {
      fireEvent.click(tab(name));
      return body().length;
    });
    fireEvent.click(tab("ひとりで周回"));
    expect(tab("ひとりで周回").getAttribute("aria-checked")).toBe("true");
    expect(headline().textContent).toBe("ひとりでライブ・時間あたりのイベントポイント");
    expect(headline().textContent + body()).not.toContain("協力");
    expect(body().length).toBeLessThanOrEqual(Math.max(...others));
  });

  it("自分の条件で計算するとき、焚き数を入れられ、ロスの補足は「表示にだけ使う」と言わない", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
    draw();
    fireEvent.click(tab("ひとりで周回"));
    const labels = [...document.querySelectorAll("label")].map((l) => l.textContent);
    expect(labels).toContain("焚き数");
    expect(labels).toContain("1曲あたりのロス（秒）");
    // このタブではロスが順位を動かす。オート用の「所要時間の表示にだけ使う」は嘘になる
    expect(screen.queryByText(/所要時間の表示にだけ使う/)).toBeNull();
    expect(screen.getByText(/^ロード・リザルトの合計/)).toBeTruthy();
  });

  /**
   * ★ ひとりでライブのロス（OVERHEAD_SEC.solo）は実測前の仮の値。「仮」と出すかは
   *   SOLO_OVERHEAD_PROVISIONAL だけで決める（値が 33 かどうかでは決めない。2026-11-19 指揮）。
   */
  describe("ひとりで周回のロスの既定は、印が立っている間「仮」と出す", () => {
    // 表の下の「…／ロス ◯秒 を前提にした一般的な順位です。」
    const premise = () => screen.getByText(/を前提にした一般的な順位です/).textContent ?? "";
    const lossHint = () =>
      [...document.querySelectorAll("label")]
        .find((l) => l.textContent === "1曲あたりのロス（秒）")!
        .parentElement!.textContent ?? "";

    it("入力なしの順位の前提に「ロス 33秒（仮）」と出す。ほかのタブには出さない", () => {
      draw();
      expect(premise()).toContain(`／ロス ${DEFAULT_OVERHEAD_SEC.solo}秒（仮）`);
      fireEvent.click(tab("みんなで周回"));
      expect(premise()).toContain(`／ロス ${DEFAULT_OVERHEAD_SEC.manual}秒`);
      expect(premise()).not.toContain("仮");
    });

    it("自分の条件の「1曲あたりのロス」の補足に、既定が仮の値だと書く", () => {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
      draw();
      expect(lossHint()).toContain("仮");
      fireEvent.click(tab("みんなで周回"));
      expect(lossHint()).not.toContain("仮");
    });

    it("印が下りたら（Nori が測ったら）、どちらからも「仮」が消える", () => {
      provisional.value = false;
      draw();
      expect(premise()).toContain(`／ロス ${DEFAULT_OVERHEAD_SEC.solo}秒`);
      expect(premise()).not.toContain("仮");
      cleanup();
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
      draw();
      expect(lossHint()).not.toContain("仮");
      expect(screen.getByText("ロード・リザルトの合計")).toBeTruthy();
    });
  });

  describe("1曲あたりのロスは、ひとりで周回だけ別に持つ", () => {
    const input = () =>
      [...document.querySelectorAll("label")]
        .find((l) => l.textContent === "1曲あたりのロス（秒）")!
        .parentElement!.querySelector("input")!;
    const stored = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;

    it("何も入れていなければ、ひとりで周回で開いたときの欄は ひとりでライブの既定（みんなでライブの 54 ではない）", () => {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
      draw();
      expect(tab("ひとりで周回").getAttribute("aria-checked")).toBe("true");
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.solo));
    });

    it("みんなで周回のために入れた値（保存済みの 40）は、ひとりで周回には持ち込まない", () => {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true, overhead: "40" }));
      draw();
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.solo));
      fireEvent.click(tab("みんなで周回"));
      expect(input().value).toBe("40");
      fireEvent.click(tab("ひとりで周回"));
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.solo));
    });

    it("ひとりで周回で入れた値は、ひとりで周回にだけ効き、開き直しても残る（保存の鍵は同じ、欄だけ別）", () => {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
      draw();
      fireEvent.change(input(), { target: { value: "45" } });
      expect(input().value).toBe("45");
      expect(stored().overheadSolo).toBe("45");
      expect(stored().overhead).toBeUndefined();
      fireEvent.click(tab("みんなで周回"));
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.manual));
      fireEvent.click(tab("ひとりで周回"));
      expect(input().value).toBe("45");
      cleanup();

      draw();
      expect(input().value).toBe("45");
    });

    it("ほかの3つのタブの間の差し替えは今までどおり（触っていなければ既定へ、手で入れた値は残す）", () => {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true }));
      draw();
      fireEvent.click(tab("みんなで周回"));
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.manual));
      fireEvent.click(tab("ひとりで周回"));
      fireEvent.click(tab("オート周回"));
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.auto));
      fireEvent.click(tab("みんなで周回"));
      expect(input().value).toBe(String(DEFAULT_OVERHEAD_SEC.manual));
      cleanup();

      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, custom: true, overhead: "40" }));
      draw();
      fireEvent.click(tab("みんなで周回"));
      fireEvent.click(tab("ひとりで周回"));
      fireEvent.click(tab("オート周回"));
      expect(input().value).toBe("40");
    });
  });

  it("みんなでライブが止まっている間は、ひとりで周回で開く（保存値に知らない mode・古い版・壊れた JSON があっても落ちない）", () => {
    const blobs = [
      null,
      JSON.stringify({ v: 2, mode: "manual", overhead: "54" }),
      JSON.stringify({ v: 1, mode: "solo" }),
      "{broken",
    ];
    for (const raw of blobs) {
      if (raw != null) localStorage.setItem(STORE_KEY, raw);
      draw();
      expect(tab("ひとりで周回").getAttribute("aria-checked")).toBe("true");
      expect(headline().textContent).toBe("ひとりでライブ・時間あたりのイベントポイント");
      cleanup();
    }
  });

  it("再開したら（印が false）、みんなで周回で開く", () => {
    suspension.value = false;
    draw();
    expect(tab("みんなで周回").getAttribute("aria-checked")).toBe("true");
    expect(headline().textContent).toBe("みんなでライブ・時間あたりのイベントポイント");
  });
});

/**
 * 画面の文に「協力」を書かない（2026-11-18 Nori: 協力ライブはガルパの名前。公式名は「みんなでライブ」）。
 * ★ 閉じた段（<details>）の中も textContent に入るので、「この数字について」や補足も含めて見る。
 */
describe("画面の文に「協力」が無い", () => {
  afterEach(() => localStorage.clear());
  const tab = (name: string) => screen.getByRole("radio", { name });

  it("どのタブでも、自分の条件で計算する欄を開いていても「協力」と書かない", () => {
    localStorage.setItem("sekai-master:ranking-inputs", JSON.stringify({ v: 2, custom: true }));
    draw();
    for (const name of ["みんなで周回", "ひとりで周回", "オート周回", "チャレライ"]) {
      fireEvent.click(tab(name));
      expect(document.body.textContent ?? "").not.toContain("協力");
    }
  });

  it("実効値の補足は「みんなでライブ」と書く", () => {
    localStorage.setItem("sekai-master:ranking-inputs", JSON.stringify({ v: 2, custom: true }));
    draw();
    fireEvent.click(tab("ひとりで周回"));
    expect(screen.getByText(/（みんなでライブ用。このタブでは使いません）/)).toBeTruthy();
    fireEvent.click(tab("みんなで周回"));
    expect(screen.getByText(/（みんなでライブで発動する値）/)).toBeTruthy();
  });
});
