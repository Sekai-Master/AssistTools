import { useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { DocLink } from "../legal/LegalDoc";
import { ISSUES_URL, X_HANDLE, X_URL } from "../../lib/site";

/**
 * 代わりの窓口（公式 X の DM・GitHub の Issues）。受付を止めているとき・送れなかったとき・
 * 確認の部品を読み込めなかったときに出す。
 *
 * ★ 送れなかったときは「内容をコピー」も出す。書いた内容を別の窓口へ持っていけないと、
 *   2,000 字を書いた人に書き直させることになる。
 */
export function ContactFallback({ message, copyText }: { message: string; copyText?: string }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-slate-300 p-4 text-sm leading-7 text-slate-600">
      <p className="font-bold text-slate-700">{message}</p>
      <ul className="ml-5 list-disc space-y-1 marker:text-slate-400">
        <li>
          公式 X <DocLink href={X_URL}>{X_HANDLE}</DocLink> への DM・リプライ
        </li>
        <li>
          GitHub の <DocLink href={ISSUES_URL}>Issues</DocLink>（再現の手順が要る不具合は、こちらが確実です）
        </li>
      </ul>
      {copyText !== undefined && <CopyButton text={copyText} />}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <NeuButton
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("done");
          } catch {
            setState("error");
          }
        }}
      >
        内容をコピー
      </NeuButton>
      <span aria-live="polite" className="text-xs text-slate-500">
        {state === "done" && "コピーしました"}
        {state === "error" && "コピーできませんでした。内容の欄から選んでコピーしてください"}
      </span>
    </div>
  );
}
