import { Button, Item, ItemActions, ItemContent, ItemDescription, ItemTitle, Switch } from "@/components/ui";
import {
  CheckmarkCircle01Icon,
  CloudDownloadIcon,
  GithubIcon,
  LinkSquare02Icon,
  Loading04Icon,
  RefreshIcon,
  Rocket01Icon,
  SparklesIcon,
  StarsIcon,
  SystemUpdate01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Update } from "@tauri-apps/plugin-updater";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  getAutoCheck,
  relaunchApp,
  setAutoCheck,
  updaterAvailable,
  useAppVersion,
  type DownloadProgress,
} from "@/lib/updater";

type UpdateStatus = "idle" | "checking" | "latest" | "available" | "downloading" | "ready";

/** 更新状态机:检查 → 发现新版 → 下载(带进度)→ 重启安装 */
function UpdateItem() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const handleCheck = async () => {
    if (!updaterAvailable()) {
      toast.error("当前环境不支持在线更新", { description: "请安装正式版后使用检查更新" });
      return;
    }
    setStatus("checking");
    try {
      const result = await checkForUpdate();
      if (result) {
        setUpdate(result);
        setStatus("available");
      } else {
        setStatus("latest");
      }
    } catch (e) {
      setStatus("idle");
      toast.error("检查更新失败", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleInstall = async () => {
    if (!update) return;
    setStatus("downloading");
    setProgress({ downloaded: 0 });
    try {
      await downloadAndInstallUpdate(update, setProgress);
      setStatus("ready");
    } catch (e) {
      setStatus("available");
      toast.error("下载更新失败", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const description = (() => {
    switch (status) {
      case "idle":
        return "更新来源为 GitHub Releases,检查是否已发布新版本";
      case "checking":
        return "正在检查更新…";
      case "latest":
        return "已是最新版本";
      case "available":
        return `发现新版本 v${update?.version}`;
      case "downloading":
        return percent !== null ? `正在下载 ${percent}%` : "正在下载…";
      case "ready":
        return "下载完成,重启应用以完成更新";
    }
  })();

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>
          <HugeiconsIcon icon={SystemUpdate01Icon} size="1em" /> 软件更新
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
        {status === "downloading" && (
          <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-150"
              style={{ width: `${percent ?? 100}%` }}
            />
          </div>
        )}
      </ItemContent>
      <ItemActions>
        {status === "idle" && (
          <Button variant="outline" size="sm" onClick={handleCheck}>
            <HugeiconsIcon icon={RefreshIcon} size="1em" /> 检查更新
          </Button>
        )}
        {status === "checking" && (
          <Button variant="outline" size="sm" disabled>
            <HugeiconsIcon icon={Loading04Icon} size="1em" className="animate-spin" /> 检查中
          </Button>
        )}
        {status === "latest" && (
          <Button variant="outline" size="sm" onClick={handleCheck}>
            <HugeiconsIcon icon={CheckmarkCircle01Icon} size="1em" /> 重新检查
          </Button>
        )}
        {status === "available" && (
          <Button size="sm" onClick={handleInstall}>
            <HugeiconsIcon icon={CloudDownloadIcon} size="1em" /> 下载 v{update?.version}
          </Button>
        )}
        {status === "downloading" && (
          <Button variant="outline" size="sm" disabled>
            <HugeiconsIcon icon={Loading04Icon} size="1em" className="animate-spin" /> 下载中
          </Button>
        )}
        {status === "ready" && (
          <Button size="sm" onClick={() => void relaunchApp()}>
            <HugeiconsIcon icon={Rocket01Icon} size="1em" /> 重启完成更新
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}

/** 启动时自动检查更新开关(plugin-store 持久化) */
function AutoCheckItem() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    void getAutoCheck().then(setEnabled);
  }, []);

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>启动时检查更新</ItemTitle>
        <ItemDescription>应用启动后静默检查,发现新版本时提示</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            void setAutoCheck(v);
          }}
        />
      </ItemActions>
    </Item>
  );
}

export const AboutPage = () => {
  const [hovered, setHovered] = useState(false);
  const version = useAppVersion();

  return (
    <div>
      <div className="flex flex-col items-center bg-linear-to-b from-secondary to-background py-6">
        <div className="relative h-24 w-24">
          <motion.div
            animate={{ scale: hovered ? 0.85 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="absolute inset-0 flex items-center justify-center rounded-3xl bg-keyboo text-4xl font-bold text-white"
          >
            K
          </motion.div>
        </div>
        <h1 className="mb-2 mt-4 text-xl font-semibold">{hovered ? "Keyboo 键啵" : "Keyboo"}</h1>
        <p className="text-center text-sm text-muted-foreground">
          {version ? `v${version} · ` : ""}桌面按键可视化与打字伙伴
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 px-6 pb-6">
        <motion.div
          animate={{
            scale: hovered ? 1.02 : 1,
            borderColor: hovered ? ["#FFCA94", "#B3FF88", "#00FFF5", "#B367FF", "#FFCA94"] : "transparent",
          }}
          transition={{
            borderColor: { repeat: Infinity, duration: 4, ease: "linear" },
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="peer rounded-lg border"
        >
          <Item variant="muted" className="hover:bg-muted">
            <ItemContent>
              <ItemTitle>
                <HugeiconsIcon icon={SparklesIcon} size="1em" /> 打字伙伴(开发中)
              </ItemTitle>
              <ItemDescription>
                记录你的敲字总数，角色随打字攒经验、慢慢长大
              </ItemDescription>
            </ItemContent>
          </Item>
        </motion.div>

        <UpdateItem />
        <AutoCheckItem />

        <Item variant="muted" className="transition-all peer-hover:blur-xs">
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={StarsIcon} size="1em" /> 许可证
            </ItemTitle>
            <ItemDescription className="max-w-100">
              Keyboo 是 MIT 许可的自由软件，可自由使用、修改与分发
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <span className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium">MIT</span>
          </ItemActions>
        </Item>

        <Item variant="muted" className="transition-all peer-hover:blur-xs">
          <ItemContent>
            <ItemTitle>
              <HugeiconsIcon icon={GithubIcon} size="1em" /> 源代码
            </ItemTitle>
            <ItemDescription className="max-w-100">
              在 GitHub 上查看项目源代码
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="icon" onClick={() => openUrl("https://github.com/Kayungko/keyboo")}>
              <HugeiconsIcon icon={LinkSquare02Icon} />
            </Button>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
};
