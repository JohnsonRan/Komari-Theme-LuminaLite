import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
const root = rootEl;

/**
 * MiSans 分区字体 CSS 体积大（~90 个 @font-face）。
 * 不阻塞首屏：load 后再等待 3 秒和空闲时机，unicode-range 仍按需下载 woff2。
 */
function loadThemeFonts() {
  const run = () => {
    void import("subsetted-fonts/MiSans-VF/MiSans-VF.css");
  };
  const schedule = () => {
    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 4000 });
      } else {
        run();
      }
    }, 3000);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
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
