// 便签设置:启用开关(Rust 权威源,keyboo-note-enabled 条目)+ 7 色强调色。
// 开关不进 zustand,避免与 Rust 侧双源;托盘操作经 note-enabled-changed 事件回写。

import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, Switch } from "@/components/ui";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Note02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NOTE_ACCENTS, useNoteConfigStore } from "@/stores/useNoteConfigStore";

export const NoteSettings = () => {
  const accentColor = useNoteConfigStore((state) => state.accentColor);
  const setAccentColor = useNoteConfigStore((state) => state.setAccentColor);

  // 启用态以 Rust 为唯一权威源(AppState + keyboo-note-enabled 条目)
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void invoke<boolean>("get_note_enabled").then(setEnabled).catch(() => {});
    // 托盘勾选切换时回写开关 UI
    const unlisten = listen<boolean>("note-enabled-changed", (event) => {
      setEnabled(event.payload);
    });
    return () => void unlisten.then((un) => un());
  }, []);

  const toggleEnabled = (value: boolean) => {
    setEnabled(value); // 乐观更新,失败时由事件纠正
    invoke("set_note_enabled", { enabled: value }).catch((e) => console.error(e));
  };

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <h1 className="text-xl font-semibold">便签</h1>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>
            <HugeiconsIcon icon={Note02Icon} size="1em" /> 桌面便签
          </ItemTitle>
          <ItemDescription>
            在屏幕上常驻一张键帽便签，记录待办事项；静默模式时自动隐藏。按住便签头部可拖动位置
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch checked={enabled} onChange={toggleEnabled} />
        </ItemActions>
      </Item>

      <div className={cn("transition-opacity", enabled ? "" : "pointer-events-none opacity-50")}>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>强调色</ItemTitle>
            <ItemDescription>便签的勾选爪印、标题标签与添加按钮颜色</ItemDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              {NOTE_ACCENTS.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  aria-label={accent.label}
                  aria-pressed={accentColor === accent.value}
                  title={accent.label}
                  onClick={() => setAccentColor(accent.value)}
                  className={cn(
                    "h-7 w-7 rounded-md border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    accentColor === accent.value ? "border-foreground" : "border-border",
                  )}
                  style={{ background: accent.value }}
                />
              ))}
            </div>
          </ItemContent>
        </Item>
      </div>

      <p className="text-xs text-muted-foreground">
        在便签输入框中的打字同样计入伙伴成长；勾选完成的待办会盖上爪印
      </p>
    </div>
  );
};
