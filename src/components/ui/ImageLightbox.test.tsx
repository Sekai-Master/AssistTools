/**
 * @vitest-environment jsdom
 *
 * 画像を押すと、同じタブの中で画面いっぱいに出す部品（ZoomableImage / ImageLightbox）。
 * 更新履歴の告知画像と、知識ガイドの撮影・まとめ画像で使う。
 *
 * ★ jsdom ではレイアウトが無い（offsetParent が常に null）ので、useModalA11y の
 *   「先頭のボタンにフォーカス」はダイアログ本体に落ちる。ここでは
 *   「フォーカスがダイアログの中にある」「閉じたら押した画像に戻る」で縛る。
 *   画面に収まるかどうかは実ブラウザの撮影で確かめる（PR の本文）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ZoomableImage } from "./ImageLightbox";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
});

const ALT = "v1.32.0 の告知画像の説明（長い代替テキスト）";

function renderImage(props: Partial<Parameters<typeof ZoomableImage>[0]> = {}) {
  return render(
    <div>
      <p>前の段落</p>
      <ZoomableImage src="/images/a.webp" alt={ALT} width={1200} height={1000} title="v1.32.0 の告知画像" {...props} />
    </div>,
  );
}

/** ページに置いた方の画像のボタン（開く前は 1 つだけ）。 */
const trigger = () => screen.getByRole("button", { name: /拡大して表示/ });

/** 押下（mousedown → click）。実ブラウザと同じ順に送る。 */
function press(el: Element) {
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

describe("ZoomableImage", () => {
  it("閉じている間は、ページに画像のボタンだけを出す（新しいタブのリンクにしない）", () => {
    renderImage();
    const button = trigger();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    const img = button.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe(ALT);
    expect(img.getAttribute("width")).toBe("1200");
    expect(img.getAttribute("height")).toBe("1000");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });

  it("押すと、題をラベルにしたダイアログを開き、alt 付きの画像と題を出す", () => {
    renderImage();
    press(trigger());
    const dialog = screen.getByRole("dialog", { name: "v1.32.0 の告知画像" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const big = dialog.querySelector("img")!;
    expect(big.getAttribute("src")).toBe("/images/a.webp");
    expect(big.getAttribute("alt")).toBe(ALT);
    expect(dialog.textContent).toContain("v1.32.0 の告知画像");
    // ブロック演出を降ろすための印（ほかのモーダルと同じ）
    expect(document.querySelector("[data-overlay]")).not.toBeNull();
  });

  it("縮小版と原寸が別の画像なら、ダイアログでは原寸を出す", () => {
    renderImage({ src: "/preview/card-1.webp", fullSrc: "/cards/card-1.png" });
    expect(trigger().querySelector("img")!.getAttribute("src")).toBe("/preview/card-1.webp");
    press(trigger());
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toBe("/cards/card-1.png");
  });

  it("題が無いときは、決まった言葉をラベルにする（長い alt をラベルにしない）", () => {
    renderImage({ title: undefined });
    press(trigger());
    expect(screen.getByRole("dialog", { name: "画像の拡大表示" })).toBeTruthy();
  });

  it("キーボードで開ける: Tab で止まる素の button（Enter・Space の押下はブラウザが click にする）", () => {
    renderImage();
    const button = trigger();
    // div+onClick ではなく button なので、Tab で止まり Enter・Space で押せる。jsdom はキーから click を
    // 作らないので、ここでは「フォーカスできる素の button であること」と「click で開くこと」を縛る
    expect(button.tabIndex).toBe(0);
    expect(button.hasAttribute("disabled")).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("読み上げ: ダイアログの説明として画像の alt を結ぶ（フォーカスが閉じるに入っても中身が伝わる）", () => {
    renderImage();
    press(trigger());
    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.getAttribute("alt")).toBe(ALT);
  });

  it("ピンチ拡大を止めない（touch-action を絞らない）・画像の高さは枠に従う", () => {
    renderImage();
    press(trigger());
    const dialog = screen.getByRole("dialog");
    for (const el of [dialog, ...dialog.querySelectorAll("*")]) {
      expect(el.className.toString()).not.toMatch(/touch-(none|pan|pinch|manipulation)/);
      expect((el as HTMLElement).style.touchAction).toBe("");
    }
    const big = dialog.querySelector("img")!;
    expect(big.className.split(" ")).toContain("max-h-full");
    expect(big.className.split(" ")).toContain("max-w-full");
  });

  it("開いている間は、フォーカスがダイアログの中にある", () => {
    renderImage();
    press(trigger());
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("Esc で閉じ、押した画像にフォーカスを戻す", () => {
    renderImage();
    const button = trigger();
    press(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("閉じるボタンで閉じ、押した画像にフォーカスを戻す", () => {
    renderImage();
    const button = trigger();
    press(button);
    press(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("背景を押すと閉じる", () => {
    renderImage();
    press(trigger());
    press(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("画像の横の余白（画像を入れた枠）を押しても閉じる", () => {
    renderImage();
    press(trigger());
    const big = screen.getByRole("dialog").querySelector("img")!;
    press(big.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("画像そのものを押しても閉じない（指で拡大して読む途中で消えない）", () => {
    renderImage();
    press(trigger());
    press(screen.getByRole("dialog").querySelector("img")!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("画像の上で押し始めて背景で離したときは閉じない（なぞった拍子に消えない）", () => {
    renderImage();
    press(trigger());
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog.querySelector("img")!);
    fireEvent.mouseUp(dialog);
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("開いている間は背面のスクロールを止め、閉じたら戻す", () => {
    renderImage();
    expect(document.body.style.overflow).toBe("");
    press(trigger());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });

  it("閉じたあともう一度開ける", () => {
    renderImage();
    press(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    press(trigger());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("ダイアログはボタンの中ではなく外（兄弟）に出す（中の押下でボタンが開き直さない）", () => {
    renderImage();
    const button = trigger();
    press(button);
    expect(button.contains(screen.getByRole("dialog"))).toBe(false);
  });
});
