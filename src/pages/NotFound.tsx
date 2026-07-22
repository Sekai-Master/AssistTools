import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="mt-4 text-slate-600">ページが見つかりませんでした。</p>
      <Link to="/" className="mt-6 inline-block text-teal-600 font-bold">
        ← ツール一覧へ戻る
      </Link>
    </div>
  );
}
