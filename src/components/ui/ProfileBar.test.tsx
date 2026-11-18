/**
 * @vitest-environment jsdom
 *
 * 編成への書き戻し（SaveToProfile）。
 *
 * ★ ここで縛るのは**壊し方**。「入力に反映」（編成→入力）と「取り込む」（入力→編成）は
 *   向きが逆で、取り違えると編成が壊れる。しかも壊れたことは押した瞬間に見えない。
 *   確認を挟むこと・空欄で既存の値を消さないことを固定する（Nori 指摘 2026-08-27）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProfileBar, SaveToProfile } from "./ProfileBar";
import {
  createProfile,
  getProfiles,
  omitEmpty,
  resetProfilesForTest,
  setActiveProfile,
} from "../../lib/profiles";

afterEach(cleanup);
beforeEach(() => {
  resetProfilesForTest();
});

describe("omitEmpty", () => {
  it("空欄（undefined）の項目は落とす＝編成の値を消さない", () => {
    expect(omitEmpty({ power: 336_000, bonus: undefined })).toEqual({ power: 336_000 });
  });

  it("0 は「入力された値」として残す（未入力と区別する）", () => {
    expect(omitEmpty({ bonus: 0 })).toEqual({ bonus: 0 });
  });
});

describe("SaveToProfile", () => {
  const setup = (collect: () => Record<string, number | undefined>) => {
    const p = createProfile("WL用", { power: 336_000, bonus: 821, hourlyRate: 2_946_000 });
    setActiveProfile(p.id);
    render(<SaveToProfile collect={collect} />);
    return p;
  };

  it("押しただけでは書き込まない（確認を挟む）", async () => {
    const p = setup(() => ({ bonus: 927 }));
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(getProfiles().find((x) => x.id === p.id)?.bonus).toBe(821);
  });

  it("確認に「何がどう変わるか」を出す", async () => {
    setup(() => ({ bonus: 927 }));
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("イベントボーナス");
    expect(dialog.textContent).toContain("821");
    expect(dialog.textContent).toContain("927");
  });

  it("やめると何も変わらない", async () => {
    const p = setup(() => ({ bonus: 927 }));
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(getProfiles().find((x) => x.id === p.id)?.bonus).toBe(821);
  });

  it("上書きすると、入っている項目だけが変わる", async () => {
    const p = setup(() => ({ bonus: 927, hourlyRate: undefined }));
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    await userEvent.click(screen.getByRole("button", { name: "上書きする" }));
    const after = getProfiles().find((x) => x.id === p.id);
    expect(after?.bonus).toBe(927);
    // 空欄だった時速は消えない
    expect(after?.hourlyRate).toBe(2_946_000);
  });
});

/**
 * ★ 編成が 1 つも無いときの ProfileBar（evc・analyzer・plan・ranking・worktime の 5 ページの先頭に出る）。
 *   前は「設定で編成を登録しておくと、ここの初期値になります。」の 26 字を毎ページの先頭に出していた
 *   （UX 監査 2026-11-12、共通の型 3）。見えるのは状態の短い 1 行にし、説明と設定へのリンクは閉じた段へ畳む（消さない）。
 */
describe("ProfileBar（編成が無いとき）", () => {
  const draw = () =>
    render(
      <MemoryRouter>
        <ProfileBar apply={() => {}} />
      </MemoryRouter>,
    );

  it("見えるのは「編成: 未登録」の 1 行だけで、説明は閉じた段の中", () => {
    draw();
    const summary = screen.getByText("編成: 未登録", { selector: "summary" });
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("ここの初期値になります");
  });

  it("畳んだ中に設定へのリンクを残す", () => {
    draw();
    const link = screen.getByRole("link", { name: "設定", hidden: true });
    expect(link.getAttribute("href")).toBe("/settings");
    expect(link.closest("details")).not.toBeNull();
  });
});
