import { useMemo, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { NeuButton } from "../../components/ui/NeuButton";
import { STORED_ITEMS, type StoredItem } from "./lib/storedItems";

/**
 * この端末に保存しているもの。
 *
 * 全部ブラウザの localStorage に置いていて、サーバへは何も送っていない。
 * ツールごとにバラバラの場所へ溜まるので、**何が残っているか**と
 * **どこから消せるか**を1箇所で見せる。
 *
 * ★ 見せるのは中身の要約であってバイト数ではない。「2 文字」と言われても
 *   利用者には何の意味も無いし、空配列 `[]` が保存済みに見えてしまう
 *   （実際そうなっていた）。中身が実質空なら行ごと出さない。
 *
 * ★ 台帳（どのキーがあるか）は `lib/storedItems.ts` に置いてある。書き出し・取り込み
 *   （BackupPanel）と共有していて、**新しい保存キーを作ったらそちらに足す**。
 */

interface Row extends StoredItem {
  summary: string;
}

function readRows(): Row[] {
  return STORED_ITEMS.flatMap((item) => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(item.key);
    } catch {
      // プライベートモード等。読めないなら「無い」と同じ扱いでよい。
    }
    if (raw === null) return [];
    const summary = item.summarize(raw);
    return summary === null ? [] : [{ ...item, summary }];
  });
}

export function StoredDataPanel() {
  // 消したあとに一覧を引き直すためだけのカウンタ。
  const [revision, setRevision] = useState(0);
  // 一度押しただけでは消さない。消えて困るものが混ざっているため。
  const [confirming, setConfirming] = useState<string | null>(null);

  const rows = useMemo(() => readRows(), [revision]);

  const remove = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 消せなくても一覧は引き直す（残っていれば次の描画で分かる）。
    }
    setConfirming(null);
    setRevision((v) => v + 1);
    // 設定系のキーを消しても、画面に出ている値はここで戻さない。
    // 戻すと「消したのに残っている」ように見える。次に開いたときから既定になる。
  };

  return (
    <Panel title="この端末に保存しているもの">
      <p className="text-sm text-slate-500">
        すべてこのブラウザの中だけに保存しています（サーバへは送っていません）。
        ブラウザの履歴消去や別の端末では引き継がれません。
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">いまは何も保存されていません。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-3 shadow-neu-inset"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-700">
                  {r.label}
                  <span className="ml-2 font-normal text-slate-500">{r.summary}</span>
                </span>
                <span className="block text-xs text-slate-500">{r.note}</span>
              </span>
              {confirming === r.key ? (
                <span className="flex items-center gap-2">
                  <NeuButton className="!px-3 !py-1 !text-rose-600" onClick={() => remove(r.key)}>
                    本当に消す
                  </NeuButton>
                  <NeuButton className="!px-3 !py-1" onClick={() => setConfirming(null)}>
                    やめる
                  </NeuButton>
                </span>
              ) : (
                <NeuButton className="!px-3 !py-1" onClick={() => setConfirming(r.key)}>
                  消す
                </NeuButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
