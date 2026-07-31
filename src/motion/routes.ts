/**
 * ルートの遅延ロード定義。React.lazy と先読みが「同じ import 関数・同じ Promise」を
 * 共有することがこのファイルの存在理由。別々に呼ぶと同じチャンクを二重に取りに行く。
 *
 * 遷移演出は沈み込みの時間を待ちに使うので、その間にチャンクを先読みしておくと
 * 「演出のための間」がそのままロード時間になり、実質タダになる。
 */
import { lazy, type ComponentType } from "react";
import { TOOLS } from "../tools";

type Mod = { default: ComponentType };
type Loader = () => Promise<Mod>;

export const ROUTE_LOADERS: Record<string, Loader> = {
  "/tweet": () => import("../pages/tweet/TweetGenerator"),
  "/evc": () => import("../pages/evc/EffectiveValueCalculator"),
  "/analyzer": () => import("../pages/analyzer/PointAnalyzer"),
  "/bingo": () => import("../pages/bingo/BingoGenerator"),
  "/refresh": () => import("../pages/refresh/RefreshGaugeCalculator"),
  "/plan": () => import("../pages/refresh/PlanPage"),
  "/worktime": () => import("../pages/worktime/WorkTimeCalculator"),
  "/ranking": () => import("../pages/ranking/EfficiencyRanking"),
};

const cache = new Map<string, Promise<Mod>>();

/**
 * 同一パスは1回しか import しない。
 * 失敗したらキャッシュを捨て、次に来たときに再試行できるようにする
 * （デプロイ直後の一時的な失敗をキャッシュに焼き付けないため）。
 */
export function loadRoute(path: string, loaders: Record<string, Loader> = ROUTE_LOADERS) {
  const loader = loaders[path];
  if (!loader) return undefined;
  let p = cache.get(path);
  if (!p) {
    p = loader();
    // catch を繋いだ Promise を捨て、元の p を返す（呼び出し側で reject を扱えるように）。
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/** テスト用。モジュールキャッシュを跨いだ状態の持ち越しを避ける。 */
export function clearRouteCache(): void {
  cache.clear();
}

/**
 * 先読み。成功/失敗を boolean で返す（失敗は遷移ステージの FAILED になる）。
 * 未登録パス（/ や /settings）には loader が無いので undefined を返す。
 */
export function prefetchRoute(path: string): Promise<boolean> | undefined {
  return loadRoute(path)?.then(
    () => true,
    () => false
  );
}

// lazy に渡す関数は loadRoute と同一。ROUTE_LOADERS にキーがあることは
// routes.test.ts が READY_TOOLS 突き合わせで保証している。
const lazyOf = (path: string) => lazy(() => loadRoute(path)!);

export const RoutePages = {
  tweet: lazyOf("/tweet"),
  evc: lazyOf("/evc"),
  analyzer: lazyOf("/analyzer"),
  bingo: lazyOf("/bingo"),
  refresh: lazyOf("/refresh"),
  plan: lazyOf("/plan"),
  worktime: lazyOf("/worktime"),
  ranking: lazyOf("/ranking"),
};

/** aria-live に流す遷移先の名前。 */
export function routeTitle(pathname: string): string {
  if (pathname === "/") return "ツール一覧";
  if (pathname === "/settings") return "設定";
  return TOOLS.find((t) => t.path === pathname)?.name ?? "ページ";
}

export function announceText(kind: "arrived" | "loading" | "failed", path: string): string {
  if (kind === "loading") return "読み込み中";
  if (kind === "failed") return "ページの読み込みに失敗しました";
  return `${routeTitle(path)} に移動しました`;
}
