import { Suspense, useMemo, useState, type ReactNode } from "react";
import type { Location } from "react-router-dom";
import { aimMorph } from "../motion/morph";
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

  // 境界が拾ったかどうか。拾っていれば失敗カードはステージの中に出ているので、
  // ステージ外にもう1枚出さない（2枚重なって role="alert" が2回発火する）。
  const [boundaryCaught, setBoundaryCaught] = useState(false);

  return (
    <StageContext.Provider value={api}>
      <div
        ref={s.stageRef}
        tabIndex={-1}
        className="stage"
        // 同じ印のカードが並ぶ一覧では、採寸だけでは「どれ」が押されたか決まらない。
        // 遷移が始まる前（capture 段階）に出発点を指名しておく。
        onClickCapture={(e) => aimMorph(e.target)}
        aria-busy={s.attrs.busy || undefined}
        // 見えていない間はタブ順・支援技術から外す。付けないと「画面には何も
        // 見えないのに Tab で前ページのボタンを押せる」状態になる。
        inert={s.attrs.hidden}
      >
        {/* 初回ディープリンクなど、先読みを経由しない経路の例外はここで拾う。 */}
        <RouteErrorBoundary
          resetKey={s.shown.pathname}
          onCaughtChange={setBoundaryCaught}
          fallback={<ChunkErrorCard />}
        >
          {/* 直リンク/リロードでだけ出る本物の fallback。
              通常のページ遷移では startTransition のおかげでここに落ちない。 */}
          <Suspense fallback={<div className="stage-fallback">読み込み中…</div>}>
            {children(s.shown)}
          </Suspense>
        </RouteErrorBoundary>
      </div>

      {/* 我慢の限界を超えて待たされたときだけ出る。装飾ではなく機能フィードバック。 */}
      {s.state.slow && !s.state.failed && <div className="stage-wait" aria-hidden />}

      {/* 先読みの reject / FAILSAFE で拾った失敗。無地のまま永久に待たせない。
          境界が既に出しているときは重複させない。 */}
      {s.state.failed && !boundaryCaught && <ChunkErrorCard />}

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {s.live}
      </div>
    </StageContext.Provider>
  );
}
