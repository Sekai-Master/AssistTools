import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
