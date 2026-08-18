import { lazy, Suspense } from "react";
import { Visualization } from "./pages/Visualization";

const Settings = lazy(() => import("./pages/Settings"));

// 双窗口路由:覆盖层窗口加载 #/,设置窗口加载 #/settings
function route() {
  return window.location.hash.startsWith("#/settings") ? "settings" : "main";
}

function App() {
  if (route() === "settings") {
    return (
      <Suspense fallback={<div className="p-8 text-sm text-gray-400">加载中…</div>}>
        <Settings />
      </Suspense>
    );
  }
  return <Visualization />;
}

export default App;
