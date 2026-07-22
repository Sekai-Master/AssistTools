import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Hub } from "./pages/Hub";
import { NotFound } from "./pages/NotFound";

// 各ツールは重い（データや計算を抱える）ので遅延ロードし、ハブの初期表示を軽くする。
const TweetGenerator = lazy(() => import("./pages/tweet/TweetGenerator"));
const EffectiveValueCalculator = lazy(
  () => import("./pages/evc/EffectiveValueCalculator")
);
const PointAnalyzer = lazy(() => import("./pages/analyzer/PointAnalyzer"));
const BingoGenerator = lazy(() => import("./pages/bingo/BingoGenerator"));

function PageFallback() {
  return <div className="p-8 text-center text-slate-500">読み込み中…</div>;
}

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Hub />} />
            <Route path="/tweet" element={<TweetGenerator />} />
            <Route path="/evc" element={<EffectiveValueCalculator />} />
            <Route path="/analyzer" element={<PointAnalyzer />} />
            <Route path="/bingo" element={<BingoGenerator />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
