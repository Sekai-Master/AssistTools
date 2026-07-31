import { Link } from "react-router-dom";

/**
 * チャンク読み込み失敗の表示。
 *
 * 演出とは明確に別の見た目にする。無地の間は --shadow-neu* が意図的に 0 へ
 * 潰れているので、.neu-static でリテラルの影を持たせて常に浮かせておく
 * （トークンを使うと、まさに出したい場面で見えなくなる）。
 */
export function ChunkErrorCard() {
  return (
    <div className="fixed inset-x-4 top-1/3 z-40 mx-auto max-w-sm" role="alert">
      <div className="neu-static p-5 text-center">
        <p className="font-bold text-slate-700">ページの読み込みに失敗しました</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          サイトが更新された可能性があります。再読み込みしてください。
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="neu-cta neu-tactile rounded-lg px-4 py-2 text-sm font-bold"
          >
            再読み込み
          </button>
          <Link
            to="/"
            className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800"
          >
            ツール一覧へ
          </Link>
        </div>
      </div>
    </div>
  );
}
