import { NeuButton } from "../../components/ui/NeuButton";
import type { Progress } from "./bingoProgress";
import { MAX_MULTI_CARDS } from "./multiStorage";

interface Props {
  /** リンクのカードの進み具合（見るだけの間に埋めたマスも数える）。 */
  progress: Progress;
  /** 見るだけで開いている（埋めた途中の同じ種類のカードを持っている人）。 */
  viewOnly: boolean;
  /** まとめて遊ぶが 5 枚あって足せない。 */
  multiFull: boolean;
  /** このカードで遊ぶ（いまのカードと入れ替える）。見るだけのときだけ。 */
  onPlay: () => void;
  onAdd: () => void;
  /** 見るのをやめる（見るだけ）／閉じる。 */
  onClose: () => void;
}

const BUTTON = "min-h-11 !px-3 text-sm";

/**
 * リンク（?card=）のカードを開いたときの知らせ。カードの枠の頭に置く。
 * ★ 1 行の文は「開きました（埋めたマス 9/24）」まで。同じリンクを本人の別の端末も友だちも開き、見分けられないので、
 *   「続きを遊べます」とは書かない（計画のレビュー G-28）。続きを遊ぶかは下の選択肢に任せる。
 * ★ 見るだけのときは、埋めても残らないことをここに出す（保存しないのに埋められるので、黙っていると消えたと思われる）。
 */
export function LinkBand({ progress, viewOnly, multiFull, onPlay, onAdd, onClose }: Props) {
  return (
    <section aria-label="リンクのカード" className="mb-4 rounded-lg border border-slate-300 p-4">
      <div role="status">
        <p className="text-sm text-slate-700">
          リンクのカードを開きました（埋めたマス{" "}
          <span className="font-num font-bold">
            {progress.filled}/{progress.total}
          </span>
          ）
        </p>
        {viewOnly && (
          <p className="mt-1 text-sm text-slate-600">見るだけで開いています。マスを埋めても、この端末には残りません</p>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {viewOnly && (
          <NeuButton className={BUTTON} onClick={onPlay}>
            このカードで遊ぶ（いまのカードと入れ替える）
          </NeuButton>
        )}
        <NeuButton className={BUTTON} onClick={onAdd} disabled={multiFull}>
          まとめて遊ぶに足す
        </NeuButton>
        <NeuButton className={BUTTON} onClick={onClose}>
          {viewOnly ? "見るのをやめる" : "閉じる"}
        </NeuButton>
      </div>
      {multiFull && (
        <p className="mt-2 text-xs text-slate-500">
          まとめて遊ぶは {MAX_MULTI_CARDS} 枚までです。どれかを外すと足せます
        </p>
      )}
    </section>
  );
}
