import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { bootstrapMotion } from "./motion/bootstrap";

// createRoot より前。初回ペイント前に html[data-motion] を確定させ、
// 「設定を読む前に一瞬だけ既定の演出が走る」フラッシュを防ぐ。
bootstrapMotion();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
