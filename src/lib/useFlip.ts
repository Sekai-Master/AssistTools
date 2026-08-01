/**
 * 並び替えを目で追えるようにする（FLIP）。
 *
 * ランキングは条件（総合力・ボーナス・難易度・レベル帯）を変えると順位が総入れ替えになる。
 * 一瞬で入れ替わると**さっき見ていた曲がどこへ行ったか分からない**ので、行が実際に
 * 移動して見えるようにする。これは装飾ではなく、変化を読ませるための道具。
 *
 * ── なぜ FLIP か ──────────────────────────────────────────────
 * 行の高さや位置を実際にアニメーションさせるとレイアウトが毎フレーム動いて重い。
 * FLIP は「新しい位置に置いてから、transform で古い位置へ戻して、0 へ向かって
 * 動かす」ので、動いているのは合成だけになる。
 *
 * ★ ここは表の中（.stage の内側）だが transform を使ってよい。
 *   遷移演出で禁じているのは **.stage 自体** に transform を載せること
 *  （position:fixed の包含ブロックを奪うため）。行はモーダルもバーも含まないので、
 *   包含ブロックを奪う相手が居ない。
 */
import { useLayoutEffect, useRef } from "react";

export interface FlipOptions {
  /** 動きの尺。 */
  durationMs?: number;
  /** これを超えて動いた行だけ動かす（誤差で微動しない）。 */
  thresholdPx?: number;
  /** 無効化（演出オフ・OS の視差軽減）。 */
  enabled?: boolean;
}

/**
 * @param keys いまの並び。これが変わったときだけ計測し直す。
 * @returns 各行に渡す ref 登録関数
 */
export function useFlip(keys: string[], opts: FlipOptions = {}) {
  const { durationMs = 320, thresholdPx = 2, enabled = true } = opts;
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const [key, el] of nodes.current) next.set(key, el.getBoundingClientRect().top);

    if (enabled) {
      for (const [key, el] of nodes.current) {
        const before = prev.current.get(key);
        const after = next.get(key);
        // 新しく出てきた行は動かしようがない（前の位置が無い）。
        if (before == null || after == null) continue;
        const delta = before - after;
        if (Math.abs(delta) < thresholdPx) continue;

        // First/Last は計測済み。ここで Invert して Play する。
        el.style.transition = "none";
        el.style.transform = `translateY(${delta}px)`;
        // 開始値を確定させてから終了値を置く（同じタスク内の2回の変更は
        // まとめて1回しか計算されない）。
        void el.offsetHeight;
        el.style.transition = `transform ${durationMs}ms var(--ease-emerge)`;
        el.style.transform = "";
      }
    }

    prev.current = next;
    // keys の中身で比較する（配列の参照ではなく並びが変わったときに走らせる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|"), enabled, durationMs, thresholdPx]);

  return (key: string) => (el: HTMLElement | null) => {
    if (el) {
      // ★ スクロールアンカリングを切る。
      //   ブラウザは中身の高さが変わったとき、画面内の要素を「錨」にして
      //   scrollTop を勝手に補正する。並び替えで行が動くと、その錨ごと動くので
      //   **入力欄をいじっているのに表の方へ画面が引っ張られる**。
      //   行を錨の候補から外すだけで止まる（並び替えの見た目には影響しない）。
      el.style.overflowAnchor = "none";
      nodes.current.set(key, el);
    } else {
      nodes.current.delete(key);
    }
  };
}
