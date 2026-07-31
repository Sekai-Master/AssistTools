import { Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RoutePages } from "./motion/routes";
import { Hub } from "./pages/Hub";
import { NotFound } from "./pages/NotFound";
// 設定は数百バイトで、かつ「演出が重いから切りたい」人が最短で辿り着くべき画面。
// 遅延ロードで待たせるのは本末転倒なので lazy にしない。
import { SettingsPage } from "./pages/settings/SettingsPage";

// 各ツールは重い（データや計算を抱える）ので遅延ロードし、ハブの初期表示を軽くする。
// 定義は motion/routes.ts に集約している（先読みと同じ import 関数を共有するため）。

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
            <Route path="/tweet" element={<RoutePages.tweet />} />
            <Route path="/evc" element={<RoutePages.evc />} />
            <Route path="/analyzer" element={<RoutePages.analyzer />} />
            <Route path="/bingo" element={<RoutePages.bingo />} />
            <Route path="/refresh" element={<RoutePages.refresh />} />
            <Route path="/plan" element={<RoutePages.plan />} />
            <Route path="/worktime" element={<RoutePages.worktime />} />
            <Route path="/ranking" element={<RoutePages.ranking />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
