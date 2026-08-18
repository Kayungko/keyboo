import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui";
import { Button } from "@/components/ui";
import { GithubIcon, LinkSquare02Icon, SparklesIcon, StarsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { useState } from "react";
import { VERSION } from "../Settings";

export const AboutPage = () => {
  const [hovered, setHovered] = useState(false);

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
          v{VERSION} · 桌面按键可视化与打字伙伴
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
