import { useEffect, useRef, useState } from "react";
import { NeuButton } from "../../components/ui/NeuButton";
import { progressOf } from "./bingoProgress";
import { MAX_EXPORT_BYTES, buildMultiExport, exportFileName, parseMultiExport, shortTime } from "./multiExport";
import type { MultiEntry, MultiSet } from "./useMultiSet";

/** 置き換える前に確かめるか: 埋めたマス・名前・読めないカード（中身が分からない）のどれかがあるとき。 */
const worthKeeping = (entries: readonly MultiEntry[]) =>
  entries.some((e) => !e.card || e.name !== "" || progressOf(e.card.card).filled > 0);

type Message = { kind: "ok" | "error"; text: string };

/** 書き出した・読み込んだの知らせを消すまで（ms）。盤面を押し下げたままにしない。読めない理由は次に押すまで残す。 */
const OK_MESSAGE_MS = 6000;

const BUTTON = "min-h-11 !px-3 text-sm";

/**
 * 中断・再開用の完全な書き出し（ファイル）の入口。まとめて遊ぶの操作の列に置く。
 * ★ 読み込みは、読めない・やめたときは今のセットに触らない。読めないカードは落とさずに持ってきて、その数を知らせる。
 */
export function MultiSaveFile({ set }: { set: MultiSet }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  useEffect(() => {
    if (message?.kind !== "ok") return;
    const t = setTimeout(() => setMessage(null), OK_MESSAGE_MS);
    return () => clearTimeout(t);
  }, [message]);

  const download = () => {
    const now = new Date();
    const blob = new Blob([JSON.stringify(buildMultiExport(set.saved, now.getTime()), null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(now);
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: "ok", text: "書き出しました。「書き出しを読み込む」で、この続きから遊べます" });
  };

  const load = async (file: File) => {
    // 大きすぎるファイルは中身を読まない（壊れた・別のファイルでタブを固めない）
    if (file.size > MAX_EXPORT_BYTES) {
      setMessage({ kind: "error", text: "ファイルが大きすぎます（2MB まで）" });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage({ kind: "error", text: "ファイルを読めませんでした（ビンゴの書き出しではありません）" });
      return;
    }
    const r = parseMultiExport(text);
    if (!r.ok) {
      setMessage({ kind: "error", text: r.error });
      return;
    }
    const n = r.multi.cards.length;
    if (
      worthKeeping(set.entries) &&
      !window.confirm(`いまのカード（${set.entries.length}枚）を、書き出しのカード（${n}枚）に置き換えますか？埋めたマスも置き換わります`)
    ) {
      setMessage(null);
      return;
    }
    const unreadable = set.replaceAll(r.multi);
    const when = r.exportedAt === null ? "書き出しの" : `${shortTime(r.exportedAt)} に書き出した`;
    const notes = [
      unreadable > 0 && `読めないカードが ${unreadable} 枚あります（配信が止まった曲などが入っています）`,
      r.dropped > 0 && `形の合わないカード ${r.dropped} 枚は読みませんでした`,
    ].filter(Boolean);
    setMessage({ kind: "ok", text: [`${when}カード ${n} 枚を読み込みました`, ...notes].join("。") });
  };

  return (
    <>
      <div className="ml-auto flex flex-wrap gap-2">
        <NeuButton className={BUTTON} onClick={download} disabled={set.entries.length === 0}>
          中断用に書き出す
        </NeuButton>
        <NeuButton className={BUTTON} onClick={() => fileRef.current?.click()}>
          書き出しを読み込む
        </NeuButton>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="書き出しのファイル"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // 同じファイルをもう一度選べるように空へ戻す
          e.target.value = "";
          if (f) void load(f);
        }}
      />
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`basis-full text-sm ${message.kind === "error" ? "text-rose-600" : "text-slate-600"}`}
        >
          {message.text}
        </p>
      )}
    </>
  );
}
