/**
 * @vitest-environment jsdom
 *
 * カード選択モーダルの絞り込みのボタン。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CardSearchModal } from "./CardSearchModal";
import { CHARACTERS } from "./lib/characters";

afterEach(cleanup);

describe("キャラの絞り込み", () => {
  // ★ フルネームを 12px で 6 人並べると「初…」「鏡…」と切れて誰か分からなかった（2026-11-06）
  it("見える文字は名前だけ、読み上げはフルネーム", () => {
    render(<CardSearchModal cards={[]} onSelect={() => {}} onClose={() => {}} />);
    for (const c of CHARACTERS) {
      const button = screen.getByRole("button", { name: c.name });
      expect(button.textContent).toBe(c.givenName);
    }
  });
});
