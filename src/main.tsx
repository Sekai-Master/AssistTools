import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// ★ フォントとアイコンはサイト自身から配信する。以前は Google Fonts の CDN を
//   読んでいたが、それだと**ページを開いただけで閲覧者の IP が Google に渡る**。
//   プライバシーポリシーで「外部へ何も送らない」と言い切るために自前に移した。
//
//   fontsource の 400/500/700 は unicode-range で 126 個に分割されている。
//   まとめた japanese-*.css（1ファイル 900KB）ではなくこちらを読むのは、
//   ブラウザが**実際に使う文字を含むチャンクだけ**取りに行くため。Google Fonts が
//   やっていたことと同じで、体感の速さを落とさずに送信先だけ消せる。
//   ★ 重みを増減するときは index.css の --font-sans と揃っているか確認すること。
import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/500.css";
import "@fontsource/m-plus-rounded-1c/700.css";
// filled のみ。material-icons.css は outlined/round/sharp/two-tone まで抱き込む。
import "material-icons/iconfont/filled.css";
import "./index.css";
import { App } from "./App";
import { bootstrapMotion } from "./motion/bootstrap";
import { applyTheme, getTheme } from "./lib/theme";

// createRoot より前。初回ペイント前に html[data-motion] を確定させ、
// 「設定を読む前に一瞬だけ既定の演出が走る」フラッシュを防ぐ。
bootstrapMotion();
// テーマは index.html のインラインスクリプトが既に立てているが、そちらが
// 効かない経路（テスト・埋め込み）でも配色が合うようにここでも確定させる。
applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
