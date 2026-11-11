import { useCallback, useEffect, useRef, useState } from "react";
import { loadTurnstile, sitekeyFor, type TurnstileApi } from "./turnstile";
import type { Theme } from "../../lib/theme";

/**
 * - idle: まだ触れていない（読み込んでいない）
 * - loading: 読み込み中
 * - ready: 描いた（token はまだ無いこともある）
 * - failed: 読み込めない・使えない。代わりの窓口を出す
 */
export type TurnstileStatus = "idle" | "loading" | "ready" | "failed";

/**
 * Turnstile の部品を 1 つ持つ。activate() を呼ぶまで何も読み込まない。
 *
 * ★ token は callback のたびに差し替え、期限切れ・時間切れで消す（token の有効は 300 秒）。
 *   最初の token を持ち続けると、5 分かけて書いた人が古い token で弾かれる（レビュー 中-4）。
 * ★ 描いた部品の id を持ち、外すときに remove する。React の StrictMode（開発時）は
 *   effect を 2 回走らせるので、remove しないと部品が 2 つ描かれる。
 * ★ theme はサイトのテーマ（自動・ライト・ダーク）をそのまま渡す。既定の auto は端末に合わせるので、
 *   サイトでダークを選び端末がライトの人に、暗い画面の中の明るい部品を出してしまう。
 */
export function useTurnstile(theme: Theme) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetRef = useRef<string | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<TurnstileStatus>("idle");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        apiRef.current = api;
        widgetRef.current =
          api.render(el, {
            sitekey: sitekeyFor(window.location.hostname),
            callback: (t) => {
              setToken(t);
              // 一度 error になっても、部品が自分で立て直して token をくれたら戻す
              setStatus("ready");
            },
            "expired-callback": () => setToken(null),
            "timeout-callback": () => setToken(null),
            "error-callback": () => {
              setToken(null);
              setStatus("failed");
            },
            "unsupported-callback": () => setStatus("failed"),
            theme,
            language: "ja",
            size: "flexible",
          }) ?? null;
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("failed");
      },
    );
    return () => {
      cancelled = true;
      const id = widgetRef.current;
      widgetRef.current = null;
      if (id && apiRef.current) {
        try {
          apiRef.current.remove(id);
        } catch {
          // 既に外れていれば何もしない
        }
      }
      setToken(null);
    };
  }, [active, theme]);

  /** フォームに最初に触れたときに呼ぶ。2 回目以降は何もしない。 */
  const activate = useCallback(() => {
    setActive(true);
    setStatus((s) => (s === "idle" ? "loading" : s));
  }, []);

  /** token は 1 回きり。送るたびに呼ぶ。 */
  const reset = useCallback(() => {
    setToken(null);
    const id = widgetRef.current;
    if (id && apiRef.current) {
      try {
        apiRef.current.reset(id);
      } catch {
        // 部品が外れていれば、次に触れたときに描き直される
      }
    }
  }, []);

  return { containerRef, status, token, activate, reset };
}
