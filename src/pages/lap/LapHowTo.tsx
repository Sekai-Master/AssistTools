/**
 * 使い方。**初回も閉じておき、計測のパネルの下に置く**（UX 監査 2026-11-12）。
 *
 * ★ 前は計測していない間は開いていて（open={!running}）、計測のパネルの上にあった。
 *   約 240 字が「計測開始」を 2 画面目の下（390×844 で y≈1463）へ押し下げていた。
 *   周回中に開く道具なので、最初の 1 押しを近くに置くほうを取る。中身は畳んだだけで消していない。
 *   開いたままでも計測のパネルの下なので、押すところは動かない。開閉の状態は持たず、
 *   計測の開始・終了で閉じ直すのは呼ぶ側（LapTimer の key）。
 */
export function LapHowTo() {
  return (
    <details className="neu-panel px-5 py-4 sm:px-6">
      <summary className="cursor-pointer text-sm font-bold text-slate-600">使い方</summary>
      <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
        <li>
          <b>1.</b> 一番上で周回する曲を選ぶ（曲の長さを引いて
          <b>オーバーヘッド</b>を出すため）。
        </li>
        <li>
          <b>2.</b> 1周目が始まった瞬間に <b>計測開始</b> を押す。
        </li>
        <li>
          <b>3.</b> あとは1周終わるたびに <b>周回した</b> を押すだけ。
        </li>
        <li>
          <b>4.</b> 休憩・部屋落ち・離席は <b>中断</b>。戻ったら <b>再開</b>。
          <span className="text-slate-500">中断していた時間は自動で平均から外れます。</span>
        </li>
        <li>
          <b>5.</b> 押し忘れた区間は一覧の <b>＋</b> で周回数を増やす。
          <span className="text-slate-500">
            区間の時間をその数で割った値がラップになるので、時刻の整合は壊れません。
          </span>
        </li>
      </ol>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
        計測中は画面の自動ロックを止めます（対応端末のみ）。記録はこの端末にだけ保存され、
        リロードしても続きから測れます。
      </p>
    </details>
  );
}
