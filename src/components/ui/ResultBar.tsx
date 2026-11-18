import { useEffect } from "react";

/** バーの高さ（約 70px＋safe-area）より少し大きい、ページの下に取る余白。 */
const BAR_SPACE = "6rem";

export interface ResultBarItem {
  label: string;
  value: string;
  sub?: string;
}

/**
 * 結果の主な数字を、画面の下に固定して出すバー（UX 監査 2026-11-12、指示書の共通の型 4、PR-7）。
 *
 * ★ 既定値で結果が出る計算機（リフレッシュゲージ・必要稼働時間）で、結果の枠が 2 画面目にあり、
 *   開いた瞬間に答えが見えなかった。入力と結果の並びは変えず、主な数字だけを下に固定する。
 *   数字は呼ぶ側が結果の枠と同じ値を渡す（ここで計算しない）。
 * ★ 形は周回ラップ計測の主ボタンの固定バー（#241 の LapActionBar）とそろえる。全幅（幅で出し分けない）・
 *   下に固定・上に線・safe-area・バーの高さぶんのページの下の余白（フッターが隠れない）。
 *   ダイアログ（z-50）はこのバー（z-40）の上に出る。
 * ★ 字の形は結果の枠の Stat（pages/refresh/Stat.tsx）にそろえる（名前は xs の太字、数字は extrabold・等幅の数字・unit の色）。
 * ★ 打つたびに数字が変わるので、aria-live は付けない（読み上げが鳴り続ける）。名前付きの領域にして、
 *   読みに行けば分かるようにする。
 */
export function ResultBar({ items, empty }: { items: ResultBarItem[]; empty?: string }) {
  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    const before = body.style.paddingBottom;
    const beforeScroll = root.style.scrollPaddingBottom;
    body.style.paddingBottom = BAR_SPACE;
    root.style.scrollPaddingBottom = BAR_SPACE;
    return () => {
      body.style.paddingBottom = before;
      root.style.scrollPaddingBottom = beforeScroll;
    };
  }, []);

  return (
    // ★ !m-0: 親（ToolPage）の space-y は Tailwind v4 で最後以外の子に margin-bottom を付ける。固定の要素でも
    //   その余白ぶん下から浮く（/refresh で 24px 浮いたのを実測）ので、置き場所によらず外の余白を 0 にする
    <section aria-label="計算の結果" className="fixed inset-x-0 bottom-0 z-40 !m-0">
      <div className="border-t border-black/5 bg-neu/95 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around gap-2">
          {items.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">{empty}</p>
          ) : (
            items.map((it) => (
              <div key={it.label} className="min-w-0 flex-1 text-center">
                <p className="truncate text-xs font-bold text-slate-500">{it.label}</p>
                <p
                  className="truncate text-lg leading-tight font-extrabold tabular-nums"
                  style={{ color: "var(--unit-color)" }}
                >
                  {it.value}
                </p>
                {it.sub && <p className="truncate text-xs text-slate-500">{it.sub}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
