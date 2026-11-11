import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel } from "../../components/ui/Panel";
import { ToolPage } from "../../components/ui/ToolPage";
import { normalizePage } from "../../lib/contactRules";
import { SITE_NAME } from "../../lib/site";
import { ContactFallback } from "./ContactFallback";
import { ContactForm } from "./ContactForm";

type Accepting = "checking" | "open" | "closed" | "unknown";

/**
 * 開いたときに、同一オリジンの GET /api/contact で受け付けているかを見る。
 * 同一オリジンなので「開いただけで外部に接続しない」（プライバシーポリシー第5項）に触れない。
 *
 * ★ 応答の型を見てから使う。手元の `npm run dev` には関数が無く、index.html が 200 で返る。
 */
function useAccepting(): Accepting {
  const [state, setState] = useState<Accepting>("checking");
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/contact", { signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        const accepting = typeof data === "object" && data !== null ? (data as { accepting?: unknown }).accepting : undefined;
        setState(typeof accepting === "boolean" ? (accepting ? "open" : "closed") : "unknown");
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState("unknown");
      });
    // StrictMode（開発時）の 1 回目の応答で状態を書かない
    return () => ctrl.abort();
  }, []);
  return state;
}

/**
 * 問い合わせのページ。入口はフッター・規約 第2条と第7条・ポリシー 第10項（`?from=<来たページ>`）。
 * 送った先の扱いは functions/api/contact.ts、書いてある約束はプライバシーポリシー第10項。
 */
export default function ContactPage() {
  const accepting = useAccepting();
  const [params] = useSearchParams();
  const from = normalizePage(params.get("from"));

  return (
    <ToolPage unit="vs" title="お問い合わせ" icon="mail">
      <p className="text-sm leading-7 text-slate-600">
        {SITE_NAME} への不具合の報告・データの誤り・要望などを、このページから送れます。
      </p>
      {accepting === "checking" && <p className="text-sm text-slate-500">受付の状態を確かめています…</p>}
      {accepting === "closed" && <ContactFallback message="いまは受付を止めています。次の窓口からお願いします。" />}
      {accepting === "unknown" && (
        <ContactFallback message="受付の状態を確かめられませんでした。次の窓口からお願いします。" />
      )}
      {accepting === "open" && (
        <Panel>
          <ContactForm from={from} />
        </Panel>
      )}
    </ToolPage>
  );
}
