/**
 * Cloudflare Turnstile（迷惑な送信を防ぐ確認の部品）の読み込み。
 *
 * ★ ページを開いただけでは読み込まない。問い合わせのフォームに**最初に触れたとき**だけ
 *   challenges.cloudflare.com へ接続する（プライバシーポリシー第5項「開いただけで外部に接続しない」）。
 *   index.html に preconnect も足さない（足すと開いた時点で接続する）。
 * ★ 読み込みの失敗・時間切れ（10 秒）は reject する。黙ってボタンが押せないままにしない。
 */

/** 本番のサイトキー（公開の値。ホスト名 sekaimaster.pages.dev＝プレビューのサブドメインを含む、マネージド）。 */
export const TURNSTILE_SITEKEY = "0x4AAAAAAF8-rH-apEnhQ2ck";
/** 手元用の試験の鍵（常に通る）。Cloudflare の公式の値。 */
export const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";

/** 手元（localhost）では試験の鍵を使う。本番の鍵は localhost を許していない。 */
export function sitekeyFor(hostname: string): string {
  return hostname === "localhost" || hostname === "127.0.0.1" ? TURNSTILE_TEST_SITEKEY : TURNSTILE_SITEKEY;
}

/** 使うオプションだけを型にする（公式 widget-configurations）。 */
export interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => void;
  "unsupported-callback": () => void;
  theme: "auto" | "light" | "dark";
  language: string;
  size: "normal" | "flexible" | "compact";
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

const ONLOAD = "__sekaiMasterTurnstileOnload";
const SCRIPT_URL = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${ONLOAD}`;
const LOAD_TIMEOUT_MS = 10_000;

type TurnstileWindow = Window & { turnstile?: TurnstileApi; [ONLOAD]?: () => void };

let pending: Promise<TurnstileApi> | null = null;

/**
 * スクリプトを 1 回だけ読み込む。同時に呼ばれても同じ Promise を返す（StrictMode の 2 回目も含む）。
 * 準備ができた合図は onload の引数で受ける（動的に足したスクリプトでは公式がこの形を勧めている）。
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as TurnstileWindow;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (pending) return pending;
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const finish = (err?: Error) => {
      clearTimeout(timer);
      delete w[ONLOAD];
      if (!err && w.turnstile) return resolve(w.turnstile);
      // 失敗したら次に呼ばれたときに読み直せるようにしておく
      pending = null;
      script.remove();
      reject(err ?? new Error("turnstile missing"));
    };
    const timer = setTimeout(() => finish(new Error("turnstile timeout")), LOAD_TIMEOUT_MS);
    w[ONLOAD] = () => finish();
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => finish(new Error("turnstile load error"));
    document.head.appendChild(script);
  });
  return pending;
}
