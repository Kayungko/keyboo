// 自定义过滤的键位选择器:键盘 / 鼠标 / 小键盘三个页签,
// 按住 Ctrl 悬停同类键高亮,点击可整组启用/禁用

import { keymaps } from "@/lib/keymaps";
import { RawKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEventStore } from "@/stores/useEventStore";
import { createContext, useContext, useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

interface KeyboardContextType {
  isCtrlHeld: boolean;
  hoveredCategory: string | undefined;
  setHoveredKey: (key: string | undefined) => void;
}

const KeyboardContext = createContext<KeyboardContextType | null>(null);

const ButtonKey: React.FC<{ rawKey: string; className?: string; flexGrow?: boolean }> = ({
  rawKey,
  className = "",
  flexGrow = false,
}) => {
  const allowedKeys = useEventStore((state) => state.allowedKeys);
  const setAllowedKeys = useEventStore((state) => state.setAllowedKeys);
  const context = useContext(KeyboardContext);

  if (!context) throw new Error("ButtonKey must be used within KeyboardContext");

  const { isCtrlHeld, hoveredCategory, setHoveredKey } = context;

  const keyData = keymaps[rawKey];
  const displayLabel = keyData?.shortLabel || keyData?.label || rawKey;
  const symbol = keyData?.symbol;
  const category = keyData?.category;
  const enabled = allowedKeys.includes(rawKey);
  const isHighlighted = isCtrlHeld && hoveredCategory && category === hoveredCategory;

  let content = <>{displayLabel}</>;
  if (symbol) {
    content = <>{symbol}<br />{displayLabel}</>;
  } else if (keyData?.category === "arrow") {
    content = <>{keyData.glyph}</>;
  }

  const handleClick = () => {
    if (isCtrlHeld && category) {
      // 整组切换
      const keysInCategory = Object.keys(keymaps).filter((k) => keymaps[k]?.category === category);
      const allEnabled = keysInCategory.every((k) => allowedKeys.includes(k));
      if (allEnabled) {
        setAllowedKeys(allowedKeys.filter((k) => !keysInCategory.includes(k)));
      } else {
        const newKeys = [...allowedKeys];
        keysInCategory.forEach((k) => {
          if (!newKeys.includes(k)) newKeys.push(k);
        });
        setAllowedKeys(newKeys);
      }
    } else {
      if (allowedKeys.includes(rawKey)) {
        setAllowedKeys(allowedKeys.filter((k) => k !== rawKey));
      } else {
        setAllowedKeys([...allowedKeys, rawKey]);
      }
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHoveredKey(rawKey)}
      onMouseLeave={() => setHoveredKey(undefined)}
      className={cn(
        !flexGrow && "w-10 h-10",
        "flex items-center justify-center text-xs text-center bg-secondary text-primary rounded-lg cursor-pointer",
        className,
        !enabled && "opacity-50",
        isHighlighted ? "outline-2 outline-blue-500" : "hover:outline-2 hover:outline-blue-500",
      )}
    >
      {content}
    </div>
  );
};

export const CustomFilter = () => {
  const [activeTab, setActiveTab] = useState<"keyboard" | "mouse" | "numpad">("keyboard");
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | undefined>(undefined);

  // 高亮分组直接由当前悬停键派生:按住 Ctrl 时悬停移动会实时更新,
  // 而不是只在按下 Ctrl 的瞬间定格一次
  const hoveredCategory = hoveredKey ? keymaps[hoveredKey]?.category : undefined;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.repeat && e.key === "Control") setIsCtrlHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") setIsCtrlHeld(false);
    };
    // 窗口失焦时 keyup 收不到(如 Alt+Tab),重置避免 Ctrl 高亮卡死
    const handleBlur = () => setIsCtrlHeld(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return (
    <KeyboardContext.Provider value={{ isCtrlHeld, hoveredCategory, setHoveredKey }}>
      <div className="flex w-full flex-col items-center justify-center gap-4">
        {activeTab === "keyboard" && (
          <div className="flex w-full max-w-196 flex-col gap-2 rounded-2xl bg-muted p-3">
            <div className="flex w-full justify-between gap-2">
              <ButtonKey rawKey={RawKey.Escape} />
              <ButtonKey rawKey={RawKey.F1} /><ButtonKey rawKey={RawKey.F2} /><ButtonKey rawKey={RawKey.F3} /><ButtonKey rawKey={RawKey.F4} />
              <ButtonKey rawKey={RawKey.F5} /><ButtonKey rawKey={RawKey.F6} /><ButtonKey rawKey={RawKey.F7} /><ButtonKey rawKey={RawKey.F8} />
              <ButtonKey rawKey={RawKey.F9} /><ButtonKey rawKey={RawKey.F10} /><ButtonKey rawKey={RawKey.F11} /><ButtonKey rawKey={RawKey.F12} />
              <ButtonKey rawKey={RawKey.Insert} /><ButtonKey rawKey={RawKey.Delete} />
            </div>
            <div className="flex w-full justify-between gap-2">
              <ButtonKey rawKey={RawKey.BackQuote} />
              <ButtonKey rawKey={RawKey.Num1} /><ButtonKey rawKey={RawKey.Num2} /><ButtonKey rawKey={RawKey.Num3} /><ButtonKey rawKey={RawKey.Num4} /><ButtonKey rawKey={RawKey.Num5} />
              <ButtonKey rawKey={RawKey.Num6} /><ButtonKey rawKey={RawKey.Num7} /><ButtonKey rawKey={RawKey.Num8} /><ButtonKey rawKey={RawKey.Num9} /><ButtonKey rawKey={RawKey.Num0} />
              <ButtonKey rawKey={RawKey.Minus} /><ButtonKey rawKey={RawKey.Equal} />
              <ButtonKey rawKey={RawKey.Backspace} className="flex-2" flexGrow />
              <ButtonKey rawKey={RawKey.Home} />
            </div>
            <div className="flex w-full justify-between gap-2">
              <ButtonKey rawKey={RawKey.Tab} className="flex-3" flexGrow />
              <ButtonKey rawKey={RawKey.KeyQ} /><ButtonKey rawKey={RawKey.KeyW} /><ButtonKey rawKey={RawKey.KeyE} /><ButtonKey rawKey={RawKey.KeyR} /><ButtonKey rawKey={RawKey.KeyT} />
              <ButtonKey rawKey={RawKey.KeyY} /><ButtonKey rawKey={RawKey.KeyU} /><ButtonKey rawKey={RawKey.KeyI} /><ButtonKey rawKey={RawKey.KeyO} /><ButtonKey rawKey={RawKey.KeyP} />
              <ButtonKey rawKey={RawKey.LeftBracket} /><ButtonKey rawKey={RawKey.RightBracket} />
              <ButtonKey rawKey={RawKey.BackSlash} className="flex-2" />
              <ButtonKey rawKey={RawKey.End} />
            </div>
            <div className="flex w-full justify-between gap-2">
              <ButtonKey rawKey={RawKey.CapsLock} className="flex-4" flexGrow />
              <ButtonKey rawKey={RawKey.KeyA} /><ButtonKey rawKey={RawKey.KeyS} /><ButtonKey rawKey={RawKey.KeyD} /><ButtonKey rawKey={RawKey.KeyF} /><ButtonKey rawKey={RawKey.KeyG} />
              <ButtonKey rawKey={RawKey.KeyH} /><ButtonKey rawKey={RawKey.KeyJ} /><ButtonKey rawKey={RawKey.KeyK} /><ButtonKey rawKey={RawKey.KeyL} />
              <ButtonKey rawKey={RawKey.SemiColon} /><ButtonKey rawKey={RawKey.Quote} />
              <ButtonKey rawKey={RawKey.Return} className="flex-4" flexGrow />
              <ButtonKey rawKey={RawKey.PageUp} />
            </div>
            <div className="flex w-full justify-between gap-2">
              <ButtonKey rawKey={RawKey.ShiftLeft} className="flex-5" flexGrow />
              <ButtonKey rawKey={RawKey.KeyZ} /><ButtonKey rawKey={RawKey.KeyX} /><ButtonKey rawKey={RawKey.KeyC} /><ButtonKey rawKey={RawKey.KeyV} /><ButtonKey rawKey={RawKey.KeyB} />
              <ButtonKey rawKey={RawKey.KeyN} /><ButtonKey rawKey={RawKey.KeyM} />
              <ButtonKey rawKey={RawKey.Comma} /><ButtonKey rawKey={RawKey.Dot} /><ButtonKey rawKey={RawKey.Slash} />
              <ButtonKey rawKey={RawKey.ShiftRight} className="flex-4" flexGrow />
              <ButtonKey rawKey={RawKey.UpArrow} />
              <ButtonKey rawKey={RawKey.PageDown} />
            </div>
            <div className="flex h-12 w-full justify-between gap-2">
              <ButtonKey rawKey={RawKey.ControlLeft} className="flex-1" />
              <ButtonKey rawKey={RawKey.Alt} className="flex-1" />
              <ButtonKey rawKey={RawKey.MetaLeft} className="flex-1" />
              <ButtonKey rawKey={RawKey.Space} className="flex-4" flexGrow />
              <ButtonKey rawKey={RawKey.ControlRight} className="flex-1" />
              <ButtonKey rawKey={RawKey.LeftArrow} /><ButtonKey rawKey={RawKey.DownArrow} /><ButtonKey rawKey={RawKey.RightArrow} />
            </div>
          </div>
        )}

        {activeTab === "mouse" && (
          <div className="grid h-fit w-fit grid-cols-3 justify-center gap-4 rounded-t-[44%] rounded-b-[40%] bg-muted p-5">
            <ButtonKey rawKey={RawKey.Left} className="mt-7" />
            <div className="flex flex-col items-center gap-4">
              <ButtonKey rawKey={RawKey.Middle} />
              <ButtonKey rawKey={RawKey.ScrollUp} />
              <ButtonKey rawKey={RawKey.ScrollDown} />
              <ButtonKey rawKey={RawKey.Drag} />
            </div>
            <ButtonKey rawKey={RawKey.Right} className="mt-7" />
          </div>
        )}

        {activeTab === "numpad" && (
          <div className="grid w-56 grid-cols-4 gap-2 rounded-2xl bg-muted p-3">
            <ButtonKey rawKey={RawKey.NumLock} />
            <ButtonKey rawKey={RawKey.KpDivide} />
            <ButtonKey rawKey={RawKey.KpMultiply} />
            <ButtonKey rawKey={RawKey.KpMinus} />
            <ButtonKey rawKey={RawKey.Kp7} />
            <ButtonKey rawKey={RawKey.Kp8} />
            <ButtonKey rawKey={RawKey.Kp9} />
            <ButtonKey rawKey={RawKey.KpPlus} className="row-span-2" flexGrow />
            <ButtonKey rawKey={RawKey.Kp4} />
            <ButtonKey rawKey={RawKey.Kp5} />
            <ButtonKey rawKey={RawKey.Kp6} />
            <ButtonKey rawKey={RawKey.Kp3} />
            <ButtonKey rawKey={RawKey.Kp2} />
            <ButtonKey rawKey={RawKey.Kp1} />
            <ButtonKey rawKey={RawKey.KpReturn} className="row-span-2" flexGrow />
            <ButtonKey className="col-span-2" rawKey={RawKey.Kp0} flexGrow />
            <ButtonKey rawKey={RawKey.KpDecimal} />
            <div />
          </div>
        )}

        <ToggleGroup
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "keyboard" | "mouse" | "numpad")}
          className="rounded-xl border p-1"
        >
          <ToggleGroupItem value="keyboard">键盘</ToggleGroupItem>
          <ToggleGroupItem value="mouse">鼠标</ToggleGroupItem>
          <ToggleGroupItem value="numpad">小键盘</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </KeyboardContext.Provider>
  );
};
