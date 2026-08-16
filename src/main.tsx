import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
const root = rootEl;

/**
 * MiSans CSS 在首屏渲染后尽快加载；unicode-range 仍只下载页面实际使用的字形。
 */
function loadThemeFonts() {
  const run = () => {
    void import("subsetted-fonts/MiSans-VF/MiSans-VF.css");
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 300);
  }
}

async function bootstrap() {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("mock") === "1"
  ) {
    const { installDevMockApi } = await import("./dev/mockApi");
    installDevMockApi();
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  loadThemeFonts();
}

void bootstrap();
