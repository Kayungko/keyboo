import { lazy, Suspense } from "react";
import { Visualization } from "./pages/Visualization";

const Settings = lazy(() => import("./pages/Settings"));
const Note = lazy(() => import("./pages/Note"));

// 多窗口路由:覆盖层窗口加载 #/,设置窗口加载 #/settings,便签窗口加载 #/note
function route() {
  const hash = window.location.hash;
  if (hash.startsWith("#/settings")) return "settings";
  if (hash.startsWith("#/note")) return "note";
  return "main";
}

function App() {
  const page = route();
  if (page === "settings" || page === "note") {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            加载中…
          </div>
        }
      >
        {page === "settings" ? <Settings /> : <Note />}
      </Suspense>
    );
  }
  return <Visualization />;
}

export default App;
