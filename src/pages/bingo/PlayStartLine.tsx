import { playStartText } from "./playedExport";

interface Props {
  /** プレイ開始の時刻。無ければ始める前（か、時刻の無い前の版の保存）。 */
  startedAt: number | undefined;
  /** 埋めたマスの数（始める前の案内は、まだ 1 マスも埋めていないときだけ出す）。 */
  filled: number;
  /** この画面を開いてから付いた時刻か（そのときだけ太字で「プレイ開始！」）。 */
  fresh: boolean;
  /** 見るだけで開いたリンクのカードなど、自分のカードでないときは中身を出さない。 */
  hidden?: boolean;
}

/**
 * 1 枚で遊ぶのカードの枠の見出しの下の 1 行: 「プレイ開始 11/12 15:03」。プレイ開始は最初に埋めたとき（持ち主の決定 2）。
 * ★ 行はいつも置き、高さを取っておく（最初に埋めた瞬間に盤面が 1 行ぶん押し下がらないように。計画のレビュー G-09）。
 *   読み上げは role="status" で、付いた瞬間に 1 回。
 */
export function PlayStartLine({ startedAt, filled, fresh, hidden = false }: Props) {
  let body = null;
  if (!hidden && startedAt !== undefined) {
    body = fresh ? <span className="font-bold text-slate-700">{playStartText(startedAt, true)}</span> : playStartText(startedAt, false);
  } else if (!hidden && filled === 0) {
    body = <span className="text-slate-500">マスを埋めるとプレイ開始</span>;
  }
  return (
    <p role="status" aria-label="プレイ開始" className="min-h-5 basis-full text-sm text-slate-600">
      {body}
    </p>
  );
}
