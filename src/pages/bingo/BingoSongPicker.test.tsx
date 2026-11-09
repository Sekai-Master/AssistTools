/**
 * @vitest-environment jsdom
 *
 * ビンゴの曲を選ぶ小窓: 検索（共通の searchSongs）と歌う人の絞り込み、当てはまる曲数、1 曲選ぶ／24 曲まで選ぶ。
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { parseMusics } from "./useBingoMusics";
import { searchSongs } from "../../lib/songSearch";
import { BingoSongPicker } from "./BingoSongPicker";

afterEach(cleanup);

const MUSICS = parseMusics(
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/MusicDatas/transformedMusics.json"), "utf8"))
);
const MIZUKI = 20;
const sungBy = (ch: number) => MUSICS.filter((m) => m.singers?.includes(ch));

const dialog = () => screen.getByRole("dialog");
/** 曲の行（ジャケットの絵を持つボタン）。 */
const rows = () => within(dialog()).getAllByRole("button").filter((b) => b.querySelector("img"));
const singerSelect = () => within(dialog()).getByRole("combobox", { name: "歌う人" });

function renderSingle(over: Partial<Parameters<typeof BingoSongPicker>[0]> = {}) {
  const onPick = vi.fn();
  render(
    <BingoSongPicker
      mode="single"
      caption="遊んだ曲"
      title="遊んだ曲を選ぶ"
      musics={MUSICS}
      aliases={[]}
      jacketBase="/j/"
      onPick={onPick}
      onClose={() => {}}
      {...over}
    />
  );
  return onPick;
}

describe("歌う人の絞り込み", () => {
  it("選択欄は「すべて」と 26 人（ユニットごとの見出しつき）", () => {
    renderSingle();
    const select = singerSelect() as HTMLSelectElement;
    expect(select.options).toHaveLength(27);
    expect(select.options[0].textContent).toBe("すべて");
    expect(select.querySelectorAll("optgroup")).toHaveLength(6);
  });

  it("選ぶと、その人が歌う曲だけになり、曲数が見出しの下の行に出る", () => {
    renderSingle();
    fireEvent.change(singerSelect(), { target: { value: String(MIZUKI) } });
    const expected = sungBy(MIZUKI);
    expect(within(dialog()).getByText(`瑞希が歌う ${expected.length}曲`, { exact: false })).toBeTruthy();
    const ids = new Set(expected.map((m) => m.id));
    const titles = new Set(MUSICS.filter((m) => ids.has(m.id)).map((m) => m.title));
    expect(rows().length).toBe(Math.min(expected.length, 80));
    for (const r of rows()) expect([...titles].some((t) => r.textContent?.startsWith(t))).toBe(true);
  });

  it("検索と歌う人は両方を満たす曲に絞る", () => {
    renderSingle();
    fireEvent.change(singerSelect(), { target: { value: String(MIZUKI) } });
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: "ロウ" } });
    const expected = searchSongs(sungBy(MIZUKI), [], "ロウ");
    expect(expected.length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(expected.length);
    expect(within(dialog()).getByText(`当てはまる ${expected.length}曲`, { exact: false })).toBeTruthy();
  });

  it("「すべて」に戻すと全曲になる", () => {
    renderSingle();
    fireEvent.change(singerSelect(), { target: { value: String(MIZUKI) } });
    fireEvent.change(singerSelect(), { target: { value: "" } });
    expect(within(dialog()).getByText(`全 ${MUSICS.length}曲`, { exact: false })).toBeTruthy();
  });
});

describe("バナー曲だけ（持ち主の決定 2026-11-10: そのキャラがバナーの回のイベント曲）", () => {
  // ★ PR2 では楽曲データを作り直さない（毎日の更新で入る）。届く前・届いた後のどちらでも通るよう、
  //   配信中のデータのバナーを一度消してから、瑞希の曲のうち 3 曲にだけバナーを付けた形で試す
  const PLAIN = MUSICS.map(({ bannerCharacterId: _drop, ...m }) => m);
  const MIZUKI_BANNER = PLAIN.filter((m) => m.singers?.includes(MIZUKI)).slice(0, 3);
  const BANNER_IDS = new Set(MIZUKI_BANNER.map((m) => m.id));
  const WITH_BANNER = PLAIN.map((m) => (BANNER_IDS.has(m.id) ? { ...m, bannerCharacterId: MIZUKI } : m));
  const toggle = () => within(dialog()).queryByRole("button", { name: "バナー曲だけ" });
  const pickSinger = (ch: number) => fireEvent.change(singerSelect(), { target: { value: String(ch) } });

  it("歌う人を選んでいないときは、切り替えを出さない", () => {
    renderSingle({ musics: WITH_BANNER });
    expect(toggle()).toBeNull();
  });

  it("バナー曲のある人を選ぶと切り替えが出て、押すとその人のバナー曲だけになる", () => {
    renderSingle({ musics: WITH_BANNER });
    pickSinger(MIZUKI);
    expect(toggle()!.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle()!);
    expect(toggle()!.getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog()).getByText("瑞希のバナー曲 3曲", { exact: false })).toBeTruthy();
    expect(rows().map((r) => MIZUKI_BANNER.find((m) => r.textContent?.startsWith(m.title))?.id)).toEqual(
      MIZUKI_BANNER.map((m) => m.id)
    );
  });

  it("もう一度押すと、その人が歌う曲に戻る", () => {
    renderSingle({ musics: WITH_BANNER });
    pickSinger(MIZUKI);
    fireEvent.click(toggle()!);
    fireEvent.click(toggle()!);
    expect(within(dialog()).getByText(`瑞希が歌う ${sungBy(MIZUKI).length}曲`, { exact: false })).toBeTruthy();
  });

  it("バナー曲の無い人（ミク）を選ぶと切り替えを出さず、絞り込みも掛けない", () => {
    renderSingle({ musics: WITH_BANNER });
    pickSinger(MIZUKI);
    fireEvent.click(toggle()!);
    pickSinger(21);
    expect(toggle()).toBeNull();
    expect(within(dialog()).getByText(`ミクが歌う ${sungBy(21).length}曲`, { exact: false })).toBeTruthy();
  });

  it("楽曲データにバナーの項目が無ければ、だれを選んでも切り替えを出さない（データが届くまで）", () => {
    renderSingle({ musics: PLAIN });
    pickSinger(MIZUKI);
    expect(toggle()).toBeNull();
  });

  it("検索とバナー曲は両方を満たす曲に絞る", () => {
    renderSingle({ musics: WITH_BANNER });
    pickSinger(MIZUKI);
    fireEvent.click(toggle()!);
    const target = MIZUKI_BANNER[1];
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: target.title } });
    const expected = searchSongs(MIZUKI_BANNER, [], target.title);
    expect(rows()).toHaveLength(expected.length);
    expect(within(dialog()).getByText(`当てはまる ${expected.length}曲`, { exact: false })).toBeTruthy();
  });

  // 横向きのスマホ（844×390）は一覧の高さが 114px しかない。行を増やさない（実際の高さは撮影で測る。jsdom では測れない）
  it("切り替えは歌う人の欄と同じ行に置き、高さ 44px 以上", () => {
    renderSingle({ musics: WITH_BANNER });
    pickSinger(MIZUKI);
    expect(toggle()!.parentElement).toBe(singerSelect().parentElement);
    expect(toggle()!.className).toContain("min-h-11");
  });
});

describe("一覧と検索", () => {
  it("検索の入力は 16px（iPhone で入力時に画面が拡大しない）", () => {
    renderSingle();
    expect(within(dialog()).getByRole("textbox").className).toContain("text-base");
    expect(singerSelect().className).toContain("text-base");
  });

  it("絞らないと先頭の 80 曲と「もっと見る」。押すと全部出る", () => {
    renderSingle();
    expect(rows()).toHaveLength(80);
    fireEvent.click(within(dialog()).getByRole("button", { name: `もっと見る（残り ${MUSICS.length - 80}）` }));
    expect(rows()).toHaveLength(MUSICS.length);
  });

  it("見つからなければそう出す", () => {
    renderSingle();
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: "存在しない曲名zzz" } });
    expect(within(dialog()).getByText("見つかりませんでした")).toBeTruthy();
  });
});

describe("1 曲選ぶ（single）", () => {
  it("行を押すとその曲を返す", () => {
    const onPick = renderSingle();
    const target = MUSICS[3];
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: target.title } });
    fireEvent.click(rows().find((b) => b.textContent?.startsWith(target.title))!);
    expect(onPick).toHaveBeenCalledWith(target);
  });

  it("選べない曲は押せず、理由を出す", () => {
    const blocked = MUSICS[0];
    const onPick = renderSingle({ unavailable: new Set([blocked.id]), unavailableNote: "カードにあります" });
    const row = rows().find((b) => b.textContent?.startsWith(blocked.title))!;
    expect((row as HTMLButtonElement).disabled).toBe(true);
    expect(row.textContent).toContain("カードにあります");
    fireEvent.click(row);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("入力欄にフォーカスがある（すぐ打てる）", () => {
    renderSingle();
    expect(document.activeElement).toBe(within(dialog()).getByRole("textbox"));
  });
});

describe("いくつも選ぶ（multi）", () => {
  const renderMulti = (selected: string[], max = 24) => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <BingoSongPicker
        mode="multi"
        caption="入れたい曲"
        title="曲を選ぶ"
        musics={MUSICS}
        aliases={[]}
        jacketBase="/j/"
        selected={selected}
        max={max}
        onPick={onPick}
        onClose={onClose}
      />
    );
    return { onPick, onClose };
  };

  it("選んだ曲は印が付き、選んだ数を出す", () => {
    renderMulti([MUSICS[0].id]);
    const row = rows().find((b) => b.textContent?.startsWith(MUSICS[0].title))!;
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog()).getByText("選んだ曲", { exact: false }).textContent).toContain("1/24");
  });

  it("上限まで選ぶと、選んでいない曲は押せなくなり、そう知らせる。選んだ曲は押して外せる", () => {
    const ids = MUSICS.slice(0, 2).map((m) => m.id);
    const { onPick } = renderMulti(ids, 2);
    expect(within(dialog()).getByRole("status").textContent).toContain("2曲まで選べます");
    const other = rows().find((b) => b.textContent?.startsWith(MUSICS[5].title))! as HTMLButtonElement;
    expect(other.disabled).toBe(true);
    const chosen = rows().find((b) => b.textContent?.startsWith(MUSICS[0].title))! as HTMLButtonElement;
    expect(chosen.disabled).toBe(false);
    fireEvent.click(chosen);
    expect(onPick).toHaveBeenCalledWith(MUSICS[0]);
  });

  it("「選び終える」で閉じる。入力欄にはフォーカスを入れない（歌う人で絞って選ぶことが多い）", () => {
    const { onClose } = renderMulti([]);
    expect(document.activeElement).not.toBe(within(dialog()).getByRole("textbox"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "選び終える" }));
    expect(onClose).toHaveBeenCalled();
  });
});
