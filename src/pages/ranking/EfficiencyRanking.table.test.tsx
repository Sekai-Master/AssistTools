/**
 * @vitest-environment jsdom
 *
 * 効率曲ランキングの表（2026-11-19 表の直し。指示書 spec-ranking-table.md）。
 *
 * ★ 既定（自分の条件を入れていない）でも絶対値（Pt/時・Pt/回・スコア）を大きく出す。指数・ノーツ・基礎点の列は無い。
 * ★ 表のすぐ上に前提の 1 行。数字は DEFAULT_PARAMS と DEFAULT_OVERHEAD_SEC から作る。
 * ★ 既定は 1 曲 1 行。「難易度ごとに全部並べる」で今までの並びに戻せる。切り替えは保存する。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EfficiencyRanking from "./EfficiencyRanking";
import type { RankingMusic } from "./useRankingMusics";
import { DEFAULT_OVERHEAD_SEC, DEFAULT_PARAMS, rankSongs } from "./lib/efficiency";

// 独りんぼエンヴィー MASTER・EXPERT（public/MusicDatas の値。EfficiencyRanking.test.tsx・efficiency.test.ts と同じ）
const ENVY_MASTER: RankingMusic = {
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
const ENVY_EXPERT: RankingMusic = {
  musicId: "074",
  title: "独りんぼエンヴィー",
  difficulty: "expert",
  playLevel: 22,
  noteCount: 544,
  baseScore: 1.109881,
  skillScoreSolo: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.104178],
  baseScoreAuto: 0.7595,
  skillScoreAuto: [0.048394, 0.049786, 0.05292, 0.053616, 0.043171, 0.070153],
  skillScoreMulti: [0.069134, 0.071123, 0.076355, 0.077716, 0.062907, 0.148379],
  feverScore: 0.119139,
  musicTime: 74.8,
  eventRate: 100,
  jacketLink: "jacket_s_074.webp",
};
// 初音天地開闢神話 MASTER（efficiency.test.ts と同じ）。長尺で、ひとりでの Pt/時 では独りんぼより下
const TENCHI: RankingMusic = {
  musicId: "186",
  title: "初音天地開闢神話",
  difficulty: "master",
  playLevel: 33,
  noteCount: 2021,
  baseScore: 1.226808,
  skillScoreSolo: [0.018903, 0.030565, 0.045559, 0.023581, 0.047022, 0.049961],
  baseScoreAuto: 0.798,
  skillScoreAuto: [0.013047, 0.020572, 0.029834, 0.015006, 0.029923, 0.031794],
  skillScoreMulti: [0.018903, 0.030565, 0.045559, 0.023581, 0.070534, 0.049961],
  feverScore: 0.156391,
  musicTime: 182.4,
  eventRate: 130,
  jacketLink: "jacket_s_186.webp",
};
const ENTRIES = [ENVY_EXPERT, ENVY_MASTER, TENCHI];

// 読み込み中の形も見るため、読み込みの状態を差し替えられるようにする（既定は読み込み済み）
const loadState = vi.hoisted(() => ({ loading: false }));
vi.mock("./useRankingMusics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useRankingMusics")>()),
  useRankingMusics: () =>
    loadState.loading
      ? { entries: [], loading: true, error: null }
      : { entries: ENTRIES, loading: false, error: null },
}));

// 止まっている期間（ひとりで周回で開く）。印は本物と同じ true
vi.mock("../../lib/liveSuspension", () => ({ MULTI_LIVE_SUSPENDED: true }));

// ひとりでライブのロスが仮の値かの印。★ Nori が測って本物の印を下ろしても、このテストが赤くならないよう差し替える
//（値 OVERHEAD_SEC は本物のまま。EfficiencyRanking.test.tsx と同じ形）
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

const STORE_KEY = "sekai-master:ranking-inputs";

afterEach(() => {
  cleanup();
  localStorage.clear();
  provisional.value = true;
  loadState.loading = false;
});

const draw = () =>
  render(
    <MemoryRouter>
      <EfficiencyRanking />
    </MemoryRouter>,
  );

const tab = (name: string) => screen.getByRole("radio", { name });
const rows = () => [...document.querySelectorAll<HTMLElement>("[data-ranking-row]")];
const rowKeys = () => rows().map((r) => r.dataset.rankingRow);
/** 行の主役の数字（大きく出す絶対値）の文字。 */
const mainNumbers = () => rows().map((r) => r.querySelector("[data-main-number]")?.textContent ?? "");
const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");
const premise = () => screen.getByText(/の場合$/);
/** 1 曲 1 行の答え合わせ用（間引きの実装とは別に書く）: 曲ごとに最初の行だけ。 */
const firstPerSong = <T extends { musicId: string }>(list: T[]) =>
  list.filter((r, i) => list.findIndex((x) => x.musicId === r.musicId) === i);

describe("既定（自分の条件を入れていない）でも絶対値を出す", () => {
  it("ひとりで: 主役の数字は Pt/時。DEFAULT_PARAMS とひとりでの既定のロスで計算した値そのもの", () => {
    draw();
    expect(tab("ひとりで").getAttribute("aria-checked")).toBe("true");
    const expected = rankSongs(
      ENTRIES,
      { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.solo },
      "solo",
    );
    // 1 曲 1 行なので、各曲の一番上の行
    expect(mainNumbers()).toEqual(firstPerSong(expected).map((r) => fmt(r.ptPerHour)));
    // その下の小さな行に、1 時間の回数と 1 回の Pt
    const sub = rows()[0].querySelector("[data-sub]")?.textContent ?? "";
    expect(sub).toContain(`${(3600 / expected[0].cycleSec).toFixed(1)}回/時`);
    expect(sub).toContain(`1回 ${fmt(expected[0].eventPt)}Pt`);
  });

  it("オート: 1 回の Pt、チャレライ: スコアを出す", () => {
    draw();
    fireEvent.click(tab("オート"));
    const auto = rankSongs(ENTRIES, { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.auto }, "auto");
    expect(mainNumbers()[0]).toBe(fmt(auto[0].eventPt));
    fireEvent.click(tab("チャレライ"));
    const ch = rankSongs(ENTRIES, { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.challenge }, "challenge");
    expect(mainNumbers()[0]).toBe(fmt(ch[0].score));
  });

  it("単位は見出しに出す（タブごとに Pt/時・Pt/回・スコア）", () => {
    draw();
    const head = () => document.querySelector("[data-ranking-unit]")?.textContent;
    expect(head()).toBe("Pt/時");
    fireEvent.click(tab("オート"));
    expect(head()).toBe("Pt/回");
    fireEvent.click(tab("チャレライ"));
    expect(head()).toBe("スコア");
    fireEvent.click(tab("みんなで"));
    expect(head()).toBe("Pt/時");
  });

  it("指数・ノーツ・基礎点の列と「指数は1位を100とした相対値です」の注を出さない", () => {
    draw();
    for (const name of ["みんなで", "ひとりで", "オート", "チャレライ"]) {
      fireEvent.click(tab(name));
      // ★ 見るのは表の枠の中（オートの説明の「高基礎点」など、表の外の文は対象外）
      const text = document.querySelector("[data-ranking-table]")?.textContent ?? "";
      expect(text).not.toBe("");
      expect(text).not.toContain("指数");
      expect(text).not.toContain("ノーツ");
      expect(text).not.toContain("基礎点");
      expect(text).not.toContain("スコア率");
      expect(document.body.textContent).not.toContain("1位を100とした相対値");
    }
  });
});

describe("表のすぐ上の前提の 1 行", () => {
  const soloPremise = (mark: string) =>
    `総合力${(DEFAULT_PARAMS.power / 10000).toFixed(1)}万・ボーナス${DEFAULT_PARAMS.bonus}%・${DEFAULT_PARAMS.taki}焚き・` +
    `スキル${DEFAULT_PARAMS.skillLeader}/${DEFAULT_PARAMS.skillTotal}・ロス${DEFAULT_OVERHEAD_SEC.solo}秒${mark}の場合`;

  it("数字は DEFAULT_PARAMS と DEFAULT_OVERHEAD_SEC から（ひとりでは仮のロスに「（仮）」）", () => {
    draw();
    expect(premise().textContent).toBe(soloPremise("（仮）"));
  });

  it("仮の値の印が下りたら（Nori が測ったら）「（仮）」を付けない", () => {
    provisional.value = false;
    draw();
    expect(premise().textContent).toBe(soloPremise(""));
  });

  it("表より前にある（前提を読んでから数字を見る）", () => {
    draw();
    const list = document.querySelector("[data-ranking-row]")!;
    expect(premise().compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("みんなでは みんなでライブのロス、チャレライはボーナス・焚き数・ロスを書かない", () => {
    draw();
    fireEvent.click(tab("みんなで"));
    expect(premise().textContent).toContain(`ロス${DEFAULT_OVERHEAD_SEC.manual}秒の場合`);
    fireEvent.click(tab("チャレライ"));
    expect(premise().textContent).toBe(
      `総合力${(DEFAULT_PARAMS.power / 10000).toFixed(1)}万・スキル${DEFAULT_PARAMS.skillLeader}/${DEFAULT_PARAMS.skillTotal}の場合`,
    );
  });

  it("「自分の編成で計算する」を押すと、自分の条件の入力欄が開く（保存もする）", () => {
    draw();
    expect(document.querySelector("#ranking-custom label")?.textContent).toContain("自分の条件で計算する");
    expect([...document.querySelectorAll("label")].some((l) => l.textContent === "総合力")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "自分の編成で計算する" }));
    expect([...document.querySelectorAll("label")].some((l) => l.textContent === "総合力")).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}").custom).toBe(true);
  });

  it("自分の条件を入れているときは「自分の条件で計算」の行に変わり、入れた数字を出す", () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ v: 2, custom: true, power: "330000", bonus: "450", skillLeader: "160", skillTotal: "720", overheadSolo: "30" }),
    );
    draw();
    expect(screen.queryByText(/の場合$/)).toBeNull();
    const line = screen.getByText(/^自分の条件で計算：/).textContent ?? "";
    expect(line).toContain("総合力33.0万");
    expect(line).toContain("ボーナス450%");
    expect(line).toContain("スキル160/720");
    // 自分で入れたロスは仮の値ではない
    expect(line).toContain("ロス30秒");
    expect(line).not.toContain("仮");
  });
});

describe("1 曲 1 行（既定）と「難易度ごとに全部並べる」", () => {
  const allSwitch = () => screen.getByRole("checkbox", { name: "難易度ごとに全部並べる" }) as HTMLInputElement;

  it("既定は 1 曲 1 行。同じ曲は一番上の難易度だけ", () => {
    draw();
    expect(allSwitch().checked).toBe(false);
    const expected = rankSongs(ENTRIES, { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.solo }, "solo");
    const firstEnvy = expected.find((r) => r.musicId === "074")!;
    expect(rowKeys()).toEqual([`074-${firstEnvy.difficulty}`, "186-master"]);
  });

  it("切り替えを入れると、今までどおり難易度ごとに全部並ぶ（rankSongs の並びそのまま）", () => {
    draw();
    fireEvent.click(allSwitch());
    const expected = rankSongs(ENTRIES, { ...DEFAULT_PARAMS, overheadSec: DEFAULT_OVERHEAD_SEC.solo }, "solo");
    expect(rowKeys()).toEqual(expected.map((r) => `${r.musicId}-${r.difficulty}`));
  });

  it("難易度の絞り込みの中で 1 曲 1 行にする（EXPERT を外すと独りんぼは MASTER が残る）", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "EXPERT" }));
    expect(rowKeys()).toContain("074-master");
    expect(rowKeys()).not.toContain("074-expert");
  });

  it("4 つのタブで同じように効く", () => {
    draw();
    for (const name of ["みんなで", "ひとりで", "オート", "チャレライ"]) {
      fireEvent.click(tab(name));
      const ids = rows().map((r) => r.dataset.rankingRow!.split("-")[0]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    fireEvent.click(allSwitch());
    for (const name of ["みんなで", "ひとりで", "オート", "チャレライ"]) {
      fireEvent.click(tab(name));
      expect(rows()).toHaveLength(ENTRIES.length);
    }
  });

  it("切り替えは保存し、ほかの入力を保存しても消えず、開き直しても残る", () => {
    draw();
    fireEvent.click(allSwitch());
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}").allDiffs).toBe(true);
    // 別の欄を保存しても（persist は保存済みの値を読み直して書く）消えない
    fireEvent.click(screen.getByRole("button", { name: "下限を上げる" }));
    cleanup();
    draw();
    expect(allSwitch().checked).toBe(true);
    expect(rows()).toHaveLength(ENTRIES.length);
  });
});

/**
 * 表の上を詰める（2026-11-19 指揮の追加依頼）。
 * ★ 難易度・譜面レベル・「難易度ごとに全部並べる」は 4 タブ共通で閉じた段「絞り込み」に畳む。
 *   見出しに今の条件の要約と、既定から変えた数（MoreSettings の作法）。
 * ★ タブの下の説明は 1 行に縮め、元の文は「この数字について」へ移す（消さない）。
 */
describe("絞り込みは閉じた段に畳む", () => {
  const filter = () =>
    [...document.querySelectorAll("details")].find((d) =>
      d.querySelector("summary")?.textContent?.includes("絞り込み"),
    )!;
  const summary = () => filter().querySelector("summary")!.textContent ?? "";

  it("4 タブとも、難易度の札・すべて・選択を外す・切り替え・譜面レベルが閉じた段の中にある", () => {
    draw();
    for (const name of ["みんなで", "ひとりで", "オート", "チャレライ"]) {
      fireEvent.click(tab(name));
      const d = filter();
      expect(d).toBeTruthy();
      expect(d.open).toBe(false);
      for (const label of ["EXPERT", "すべて", "選択を外す", "下限を上げる"]) {
        expect(d.contains(screen.getByRole("button", { name: label }))).toBe(true);
      }
      expect(d.contains(screen.getByRole("checkbox", { name: "難易度ごとに全部並べる" }))).toBe(true);
    }
  });

  it("見出しに今の条件の要約を出し、既定のままなら変えた数は出さない", () => {
    draw();
    expect(summary()).toContain("すべての難易度・全レベル・1曲1行");
    expect(summary()).not.toContain("項目を変更中");
  });

  it("既定から変えると、見出しの要約と変えた数が変わる（畳んでいても表に効く）", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "EXPERT" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "難易度ごとに全部並べる" }));
    expect(summary()).toContain("EXPERT以外・全レベル・難易度ごと");
    expect(summary()).toContain("2 項目を変更中");
    // 畳んだ中の値で表が絞られている
    expect(rowKeys()).not.toContain("074-expert");
  });

  // ★ 読み込み中は譜面レベルの範囲がまだ分からない（仮の 1〜40）。保存したレベル（例 5〜38）を
  //   「絞っている」と数えると、見出しが一瞬「レベル5〜38（1 項目を変更中）」に跳ねてから戻る
  it("読み込み中は、保存した譜面レベルを「変えた」と数えない", () => {
    loadState.loading = true;
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, lvMin: 5, lvMax: 38 }));
    draw();
    expect(summary()).toContain("すべての難易度・全レベル・1曲1行");
    expect(summary()).not.toContain("項目を変更中");
  });
});

describe("タブの下の説明は 1 行", () => {
  // タブの直後が見出し（何で並べているか）、その次が説明（EfficiencyRanking.test.tsx と同じたどり方）
  const headline = () => tab("みんなで").closest('[role="radiogroup"]')!.nextElementSibling!;
  const body = () => headline().nextElementSibling!.textContent ?? "";
  const about = () => screen.getByText("この数字について").closest("details")!.textContent ?? "";

  it("4 タブとも説明は 26 字以内（390px の text-xs で 1 行）。見出しは何で並べているかのまま", () => {
    draw();
    const heads: Record<string, string> = {
      みんなで: "みんなでライブ・時間あたりのイベントポイント",
      ひとりで: "ひとりでライブ・時間あたりのイベントポイント",
      オート: "オート・1プレイあたりのイベントポイント",
      チャレライ: "チャレンジライブ・1プレイあたりのスコア",
    };
    for (const [name, head] of Object.entries(heads)) {
      fireEvent.click(tab(name));
      expect(headline().textContent).toBe(head);
      expect(body().length).toBeGreaterThan(0);
      expect(body().length).toBeLessThanOrEqual(26);
    }
  });

  it("縮める前の説明は「この数字について」へ移す（消さない）", () => {
    draw();
    const text = about();
    expect(text).toContain("フィーバー込みのみんなでライブの式で計算しています");
    expect(text).toContain("ひとりでライブのスコアとイベントポイントの式で計算しています");
    expect(text).toContain("手動とは最適解が逆になります");
    expect(text).toContain("イベント基礎点も無関係で、純粋にスコアだけを見ます");
  });
});
