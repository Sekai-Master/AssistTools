/**
 * @vitest-environment jsdom
 *
 * 問い合わせのページ。Turnstile の部品は差し替える（本物の challenges.cloudflare.com は読まない）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ContactPage from "./ContactPage";
import { loadTurnstile, TURNSTILE_TEST_SITEKEY, type TurnstileApi, type TurnstileOptions } from "./turnstile";
import { ISSUES_URL, X_URL } from "../../lib/site";

vi.mock("./turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./turnstile")>()),
  loadTurnstile: vi.fn(),
}));

let widget: { api: TurnstileApi; opts: () => TurnstileOptions };

function fakeTurnstile() {
  let captured: TurnstileOptions | null = null;
  const api: TurnstileApi = {
    render: vi.fn((_el: HTMLElement, o: TurnstileOptions) => {
      captured = o;
      return "w1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  return {
    api,
    opts: () => {
      if (!captured) throw new Error("Turnstile がまだ描かれていない");
      return captured;
    },
  };
}

type Posted = { body: Record<string, unknown> };
let posted: Posted[];

/** GET と POST の応答を差し替える。 */
function stubApi(o: { get?: () => Response | Promise<Response>; post?: () => Response | Promise<Response> } = {}) {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      expect(String(input)).toBe("/api/contact");
      if ((init.method ?? "GET") === "GET") return o.get ? o.get() : Response.json({ accepting: true });
      posted.push({ body: JSON.parse(String(init.body)) });
      return o.post ? o.post() : Response.json({ ok: true });
    }),
  );
}

const open = (from = "/border") =>
  render(
    <MemoryRouter initialEntries={[`/contact?from=${encodeURIComponent(from)}`]}>
      <ContactPage />
    </MemoryRouter>,
  );

const bodyBox = () => screen.getByLabelText("内容") as HTMLTextAreaElement;
const replyBox = () => screen.getByLabelText("返信先（任意）") as HTMLInputElement;
const sendButton = () => screen.getByRole("button", { name: /送る|確認中|送っています/ });

/** 受付中の画面を開き、種類と内容を入れて Turnstile を描かせる。 */
async function openAndFill(body = "計算がおかしいです") {
  open();
  await screen.findByLabelText("内容");
  fireEvent.click(screen.getByRole("button", { name: "不具合の報告" }));
  fireEvent.focus(bodyBox());
  fireEvent.change(bodyBox(), { target: { value: body } });
  await waitFor(() => expect(widget.api.render).toHaveBeenCalled());
}

beforeEach(() => {
  widget = fakeTurnstile();
  vi.mocked(loadTurnstile).mockResolvedValue(widget.api);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("受け付けているか", () => {
  it("止めているときは入力欄を出さず、代わりの窓口を出す", async () => {
    stubApi({ get: () => Response.json({ accepting: false }) });
    open();
    expect(await screen.findByText(/いまは受付を止めています/)).toBeTruthy();
    expect(screen.queryByLabelText("内容")).toBeNull();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(X_URL);
    expect(hrefs).toContain(ISSUES_URL);
  });

  it("応答が JSON でない（手元の dev が index.html を返す）ときも、黙らずに代わりの窓口を出す", async () => {
    stubApi({ get: () => new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } }) });
    open();
    expect(await screen.findByText(/受付の状態を確かめられませんでした/)).toBeTruthy();
    expect(screen.queryByLabelText("内容")).toBeNull();
  });

  it("受け付けていれば入力欄を出す。触れるまで Turnstile を読み込まない", async () => {
    stubApi();
    open();
    expect(await screen.findByLabelText("内容")).toBeTruthy();
    expect(loadTurnstile).not.toHaveBeenCalled();
  });
});

describe("Turnstile", () => {
  beforeEach(() => stubApi());

  it("最初に触れたときに読み込み、試験用の鍵（localhost）・日本語・サイトのテーマで描く", async () => {
    open();
    fireEvent.focus(await screen.findByLabelText("内容"));
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledTimes(1));
    const o = widget.opts();
    expect(o.sitekey).toBe(TURNSTILE_TEST_SITEKEY);
    expect(o.language).toBe("ja");
    expect(o.theme).toBe("auto");
  });

  it("2 回目に触れても描き直さない", async () => {
    open();
    fireEvent.focus(await screen.findByLabelText("内容"));
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledTimes(1));
    fireEvent.focus(replyBox());
    fireEvent.change(replyBox(), { target: { value: "@someone" } });
    await act(async () => {});
    expect(widget.api.render).toHaveBeenCalledTimes(1);
  });

  it("読み込みに失敗したら、代わりの窓口と「内容をコピー」を出し、送るボタンを止める", async () => {
    vi.mocked(loadTurnstile).mockRejectedValue(new Error("timeout"));
    open();
    fireEvent.focus(await screen.findByLabelText("内容"));
    expect(await screen.findByText(/確認の部品を読み込めませんでした/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "内容をコピー" })).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(ISSUES_URL);
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([["error-callback"], ["unsupported-callback"]] as const)("%s でも同じ表示を出す", async (name) => {
    await openAndFill();
    act(() => widget.opts()[name]());
    expect(await screen.findByText(/確認の部品を読み込めませんでした/)).toBeTruthy();
  });

  it("期限が切れた token は送らず、確認が終わるまで待つ", async () => {
    await openAndFill();
    act(() => widget.opts().callback("OLD"));
    act(() => widget.opts()["expired-callback"]());
    fireEvent.click(sendButton());
    expect(await screen.findByRole("button", { name: /確認中/ })).toBeTruthy();
    expect(posted).toHaveLength(0);
    act(() => widget.opts().callback("NEW"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body.token).toBe("NEW");
  });

  it("外すときに部品を remove する（StrictMode で 2 回描かない）", async () => {
    await openAndFill();
    cleanup();
    expect(widget.api.remove).toHaveBeenCalledWith("w1");
  });
});

describe("送る", () => {
  it("種類・内容・返信先・ページ・版・token を送り、成功したら入力を空にする", async () => {
    stubApi();
    await openAndFill("  計算がおかしいです  ");
    fireEvent.change(replyBox(), { target: { value: "@someone" } });
    act(() => widget.opts().callback("TOKEN"));
    fireEvent.click(sendButton());
    expect(await screen.findByText(/受け付けました/)).toBeTruthy();
    expect(posted[0].body).toEqual({
      kind: "不具合の報告",
      body: "  計算がおかしいです  ",
      reply: "@someone",
      page: "/border",
      ver: __APP_VERSION__,
      token: "TOKEN",
    });
    expect(bodyBox().value).toBe("");
    expect(replyBox().value).toBe("");
    // token は 1 回きり
    expect(widget.api.reset).toHaveBeenCalledWith("w1");
  });

  it("入口の from がサイト内のパスの形でなければ、ページは空で送る", async () => {
    stubApi();
    render(
      <MemoryRouter initialEntries={["/contact?from=https%3A%2F%2Fevil.example%2F"]}>
        <ContactPage />
      </MemoryRouter>,
    );
    await screen.findByLabelText("内容");
    fireEvent.click(screen.getByRole("button", { name: "要望・感想" }));
    fireEvent.focus(bodyBox());
    fireEvent.change(bodyBox(), { target: { value: "要望" } });
    await waitFor(() => expect(widget.api.render).toHaveBeenCalled());
    act(() => widget.opts().callback("T"));
    fireEvent.click(sendButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body.page).toBe("");
  });

  it("送っている間に 2 回押しても 1 回しか送らない", async () => {
    let release: (r: Response) => void = () => {};
    stubApi({ post: () => new Promise<Response>((r) => (release = r)) });
    await openAndFill();
    act(() => widget.opts().callback("TOKEN"));
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release(Response.json({ ok: true })));
    expect(posted).toHaveLength(1);
  });

  it("種類を選ばずに送ろうとしたら、選ぶよう促す（送らない）", async () => {
    stubApi();
    open();
    fireEvent.focus(await screen.findByLabelText("内容"));
    fireEvent.change(bodyBox(), { target: { value: "本文" } });
    fireEvent.click(sendButton());
    expect(await screen.findByText("種類を選んでください")).toBeTruthy();
    expect(posted).toHaveLength(0);
  });

  it("字数はコードポイントで数え、2,000 字を超えたら送れない", async () => {
    stubApi();
    await openAndFill("😀".repeat(2000));
    expect(screen.getByText("2000 / 2000")).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(bodyBox(), { target: { value: "😀".repeat(2001) } });
    expect(screen.getByText("2001 / 2000")).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("返信先が X の ID・メールアドレスの形でなくても弾かず、注意だけ出す", async () => {
    stubApi();
    await openAndFill();
    fireEvent.change(replyBox(), { target: { value: "電話でお願いします" } });
    expect(screen.getByText(/形ではないようです/)).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("下書きを localStorage に残さない", async () => {
    stubApi();
    await openAndFill("下書き");
    fireEvent.change(replyBox(), { target: { value: "@someone" } });
    expect(localStorage.length).toBe(0);
  });
});

describe("送れなかったとき", () => {
  it.each([
    [502, { ok: false, error: "unavailable" }, /いまは送れません/],
    [503, { ok: false, error: "closed" }, /いまは送れません/],
    [403, { ok: false, error: "verify" }, /確認に失敗しました/],
    [400, { ok: false, error: "invalid" }, /入力に誤りがあります/],
    [413, { ok: false, error: "too_large" }, /入力に誤りがあります/],
  ])("%s → 理由を出し、入力を消さず、代わりの窓口と「内容をコピー」を出す", async (status, data, reason) => {
    stubApi({ post: () => Response.json(data, { status }) });
    await openAndFill("消えては困る本文");
    act(() => widget.opts().callback("TOKEN"));
    fireEvent.click(sendButton());
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(bodyBox().value).toBe("消えては困る本文");
    expect(screen.getByRole("button", { name: "内容をコピー" })).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(X_URL);
    expect(widget.api.reset).toHaveBeenCalledWith("w1");
  });

  it("通信そのものが失敗しても同じ（黙らない）", async () => {
    stubApi({ post: () => Promise.reject(new TypeError("Failed to fetch")) });
    await openAndFill("本文");
    act(() => widget.opts().callback("TOKEN"));
    fireEvent.click(sendButton());
    expect(await screen.findByText(/いまは送れません/)).toBeTruthy();
    expect(bodyBox().value).toBe("本文");
  });

  it("「内容をコピー」は種類・返信先・内容をまとめてコピーする", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    stubApi({ post: () => Response.json({ ok: false, error: "unavailable" }, { status: 502 }) });
    await openAndFill("コピーする本文");
    fireEvent.change(replyBox(), { target: { value: "@someone" } });
    act(() => widget.opts().callback("TOKEN"));
    fireEvent.click(sendButton());
    fireEvent.click(await screen.findByRole("button", { name: "内容をコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = String((writeText.mock.calls[0] as unknown[])[0]);
    expect(text).toContain("不具合の報告");
    expect(text).toContain("@someone");
    expect(text).toContain("コピーする本文");
    expect(await screen.findByText("コピーしました")).toBeTruthy();
  });
});
