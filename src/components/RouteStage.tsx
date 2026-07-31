import { Suspense, useMemo, type ReactNode } from "react";
import type { Location } from "react-router-dom";
import { StageContext } from "../motion/stageContext";
import { useRouteStage } from "../motion/useRouteStage";
import { ChunkErrorCard } from "./ChunkErrorCard";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

/**
 * 画面遷移の舞台。
 *
 * 表示中の location を自前で握り、沈み込みが終わってから差し替える。
 * children は関数で受け、その location を <Routes location={...}> に渡す。
 *
 * ★ 表示は最大 sinkMs + チャンク時間ぶん保留されるので、この内側で
 *   useLocation を読むと「URL は新しいのに中身は前のページ」の窓に当たる。
 *   現状ステージ内で router hook を使っているページは無い（Layout のみで、
 *   Layout はステージの外にあるのでヘッダーのアクティブ表示は即座に動く）。
 *   将来 URL 駆動のツールを足すときはここを読むこと。
 */
export function RouteStage({ children }: { children: (loc: Location) => ReactNode }) {
  const s = useRouteStage();
  const api = useMemo(() => ({ preview: s.preview }), [s.preview]);

  return (
    <StageContext.Provider value={api}>
      <div ref={s.stageRef} tabIndex={-1} className="stage" aria-busy={s.attrs.busy || undefined}>
        {/* 初回ディープリンクなど、先読みを経由しない経路の例外はここで拾う。 */}
        <RouteErrorBoundary resetKey={s.shown.pathname} fallback={<ChunkErrorCard />}>
          {/* 直リンク/リロードでだけ出る本物の fallback。
              通常のページ遷移では startTransition のおかげでここに落ちない。 */}
          <Suspense fallback={<div className="stage-fallback">読み込み中…</div>}>
            {children(s.shown)}
          </Suspense>
        </RouteErrorBoundary>
      </div>

      {/* 我慢の限界を超えて待たされたときだけ出る。装飾ではなく機能フィードバック。 */}
      {s.state.slow && !s.state.failed && <div className="stage-wait" aria-hidden />}

      {/* 先読みの reject / FAILSAFE で拾った失敗。無地のまま永久に待たせない。 */}
      {s.state.failed && <ChunkErrorCard />}

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {s.live}
      </div>
    </StageContext.Provider>
  );
}
