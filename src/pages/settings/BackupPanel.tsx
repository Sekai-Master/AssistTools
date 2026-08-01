import { useRef, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { NeuTextarea } from "../../components/ui/NeuTextarea";
import {
  applyBackup,
  backupFileName,
  buildBackup,
  parseBackup,
  type ImportEntry,
  type ParsedBackup,
} from "./lib/backup";

/**
 * 保存データの持ち出しと取り込み。
 *
 * ★ 取り込みは**押すまで書き換えない**。ファイルを選んだ時点では中身を読んで
 *   「何が入ってくるか・いま何があるか」を並べるだけにして、上書きの前に
 *   本人が見て選べるようにする（消えて困るものが混ざっているため）。
 *
 * ★ 端末を跨ぐ手段はこれだけ（サーバに何も置いていない）。スマホだと
 *   ファイルの受け渡しが面倒なので、貼り付けでも入出力できるようにしてある。
 */
export function BackupPanel({ onImported }: { onImported?: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const readStorage = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeStorage = (key: string, value: string) => localStorage.setItem(key, value);

  const say = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const text = () => JSON.stringify(buildBackup(readStorage, Date.now()), null, 1);

  const download = () => {
    const blob = new Blob([text()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName(new Date());
    a.click();
    URL.revokeObjectURL(url);
    say("書き出しました。");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      say("コピーしました。");
    } catch {
      say("コピーできませんでした（ファイルに書き出してください）。");
    }
  };

  const load = (content: string) => {
    const result = parseBackup(content, readStorage);
    setParsed(result);
    setChosen(new Set(result.entries.map((e) => e.key)));
  };

  const apply = () => {
    if (!parsed) return;
    const targets = parsed.entries.filter((e) => chosen.has(e.key));
    const n = applyBackup(targets, writeStorage);
    setParsed(null);
    setPasted("");
    setPasting(false);
    say(
      n === targets.length
        ? `${n} 項目を取り込みました。`
        : `${n}/${targets.length} 項目だけ取り込めました（保存容量が足りない可能性があります）。`
    );
    onImported?.();
  };

  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Panel title="データの書き出し・取り込み">
      <p className="text-sm text-slate-500">
        この端末に保存しているものを1つのファイルにまとめて持ち出せます。
        機種変更のときや、ブラウザの履歴を消す前にどうぞ。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <NeuButton onClick={download}>ファイルに書き出す</NeuButton>
        <NeuButton className="!px-3" onClick={copy}>
          コピー
        </NeuButton>
        <span className="mx-1 text-slate-300">|</span>
        <NeuButton onClick={() => fileRef.current?.click()}>ファイルから取り込む</NeuButton>
        <NeuButton className="!px-3" onClick={() => setPasting((v) => !v)}>
          貼り付けて取り込む
        </NeuButton>
        {notice && (
          <span role="status" className="text-xs text-slate-600">
            {notice}
          </span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          // 同じファイルをもう一度選べるように必ず空へ戻す。
          e.target.value = "";
          if (f) load(await f.text());
        }}
      />

      {pasting && !parsed && (
        <div className="mt-3 space-y-2">
          <NeuTextarea
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="書き出した内容を貼り付け"
          />
          <NeuButton className="!py-1.5" disabled={!pasted.trim()} onClick={() => load(pasted)}>
            読み込む
          </NeuButton>
        </div>
      )}

      {parsed && (
        <div className="mt-4 rounded-lg p-3 shadow-neu-inset">
          <p className="text-sm font-bold text-slate-700">
            取り込む内容の確認
            {parsed.exportedAt && (
              <span className="ml-2 font-normal text-xs text-slate-500">
                {new Date(parsed.exportedAt).toLocaleString("ja-JP")} に書き出したもの
              </span>
            )}
          </p>

          {parsed.entries.length > 0 && (
            <ul className="mt-2 space-y-1">
              {parsed.entries.map((e: ImportEntry) => (
                <li key={e.key}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.has(e.key)}
                      onChange={() => toggle(e.key)}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-slate-700">
                        {e.label}
                        <span className="ml-2 text-xs text-slate-500">{e.summary}</span>
                      </span>
                      {/* ★ 上書きになるものは、いま何があるかを必ず見せる。 */}
                      <span className="block text-xs text-slate-500">
                        {e.current
                          ? `いまある「${e.current}」を置き換えます`
                          : "この端末にはまだありません"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {/* 取り込めなかったものは黙って捨てない。 */}
          {parsed.problems.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-600">
              {parsed.problems.map((p) => (
                <li key={p}>⚠ {p}</li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <NeuButton className="!py-1.5" disabled={chosen.size === 0} onClick={apply}>
              {chosen.size} 項目を取り込む
            </NeuButton>
            <NeuButton
              className="!py-1.5"
              onClick={() => {
                setParsed(null);
                setPasted("");
              }}
            >
              やめる
            </NeuButton>
            <span className="text-xs text-slate-500">
              ファイルに入っていない項目はそのまま残ります。
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
