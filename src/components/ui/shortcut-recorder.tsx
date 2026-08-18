// 全局快捷键录制控件:点击进入录制,按下组合键生效,Esc 取消,退格清空
//
// 键名必须与 Rust 侧 vk_to_name 的输出一致,否则快捷键永远匹配不上。
// 因此用 e.code(物理键位)而非 e.key:
// - e.code 天然区分左右修饰键(ShiftLeft / ControlRight …),与后端扫描码区分一致;
// - e.key 会受输入法/大小写干扰(如大写锁定时 key="A" 但语义应为 KeyA)。

import { keymaps } from "@/lib/keymaps";
import { RawKey } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface ShortcutInputProps {
  value: string[]; // 键名数组,如 ["ShiftLeft", "F10"]
  onChange: (keys: string[]) => void;
  placeholder?: string;
}

// 浏览器 e.code → 内部键名(与后端 vk_to_name 对齐)
const codeToName = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) return code;
  if (/^Digit[0-9]$/.test(code)) return `Num${code.slice(5)}`;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  switch (code) {
    // 修饰键:左 Alt 内部键名是 "Alt"(与后端一致)
    case "ShiftLeft": return RawKey.ShiftLeft;
    case "ShiftRight": return RawKey.ShiftRight;
    case "ControlLeft": return RawKey.ControlLeft;
    case "ControlRight": return RawKey.ControlRight;
    case "AltLeft": return RawKey.Alt;
    case "AltRight": return RawKey.AltRight;
    case "MetaLeft": return RawKey.MetaLeft;
    case "MetaRight": return RawKey.MetaRight;
    // 小键盘(浏览器无 NumpadEnter,小键盘回车与主回车同为 Enter → Return)
    case "Numpad0": case "Numpad1": case "Numpad2": case "Numpad3": case "Numpad4":
    case "Numpad5": case "Numpad6": case "Numpad7": case "Numpad8": case "Numpad9":
      return `Kp${code.slice(6)}`;
    case "NumpadAdd": return "KpPlus";
    case "NumpadSubtract": return "KpMinus";
    case "NumpadMultiply": return "KpMultiply";
    case "NumpadDivide": return "KpDivide";
    case "NumpadDecimal": return "KpDecimal";
    // 常用键
    case "Enter": return "Return";
    case "Space": return "Space";
    case "ArrowLeft": return "LeftArrow";
    case "ArrowUp": return "UpArrow";
    case "ArrowRight": return "RightArrow";
    case "ArrowDown": return "DownArrow";
    // 标点(美式布局键位)
    case "Backquote": return "BackQuote";
    case "Minus": return "Minus";
    case "Equal": return "Equal";
    case "BracketLeft": return "LeftBracket";
    case "BracketRight": return "RightBracket";
    case "Backslash": return "BackSlash";
    case "Semicolon": return "SemiColon";
    case "Quote": return "Quote";
    case "Comma": return "Comma";
    case "Period": return "Dot";
    case "Slash": return "Slash";
    // 与后端同名直通
    case "Backspace": case "Tab": case "Escape": case "Delete": case "Insert":
    case "Home": case "End": case "PageUp": case "PageDown":
    case "CapsLock": case "NumLock": case "ScrollLock":
    case "PrintScreen": case "Pause": case "ContextMenu":
      return code;
    default:
      return null;
  }
};

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight",
]);

const ShortcutRecorder: React.FC<ShortcutInputProps> = ({
  value,
  onChange,
  placeholder = "点击设置快捷键",
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const stopRecording = () => {
    setIsRecording(false);
    setHint(null);
    inputRef.current?.blur();
  };

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;

      // 取消
      if (e.code === "Escape") {
        stopRecording();
        return;
      }
      // 清空
      if (e.code === "Backspace" || e.code === "Delete") {
        onChange([]);
        stopRecording();
        return;
      }

      // 只按着修饰键时继续等待主键
      if (MODIFIER_CODES.has(e.code)) {
        setHint(null);
        return;
      }

      const name = codeToName(e.code);
      if (!name) {
        setHint("不支持该按键,请换一个组合。");
        return;
      }

      // 修饰键统一记左侧键名:浏览器事件无法可靠区分实际按下的左/右修饰键,
      // 而 Rust 匹配时会做左右归一,左右按法都能命中
      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push(RawKey.ControlLeft);
      if (e.shiftKey) modifiers.push(RawKey.ShiftLeft);
      if (e.altKey) modifiers.push(RawKey.Alt);
      if (e.metaKey) modifiers.push(RawKey.MetaLeft);

      // 全局快捷键要求至少一个修饰键,避免单键误触显隐
      if (modifiers.length === 0) {
        setHint("请至少包含一个修饰键(Ctrl / Shift / Alt)。");
        return;
      }

      onChange([...new Set([...modifiers, name])]);
      stopRecording();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [isRecording, onChange]);

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        ref={inputRef}
        onClick={() => setIsRecording(true)}
        className={`
          relative flex w-full h-14 items-center rounded-lg bg-secondary p-2 outline outline-1 cursor-pointer transition-all
          ${isRecording ? "outline-primary" : "outline-transparent hover:outline-primary/50"}
        `}
        tabIndex={0}
      >
        {isRecording ? (
          <span className="ml-2 font-medium text-primary">
            {hint ?? "按下组合键进行设置，按 Esc 取消。"}
          </span>
        ) : (
          <div className="flex gap-2">
            {value.length > 0 ? (
              value.map((k) => <KeyCap key={k} label={keymaps[k]?.label ?? k} />)
            ) : (
              <span className="select-none text-gray-400">{placeholder}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const KeyCap = ({ label }: { label: string }) => (
  <div className="h-9 rounded-lg bg-primary/20">
    <div className="m-px mb-0.5 rounded-lg bg-secondary px-3 py-1.5 capitalize">
      {label}
    </div>
  </div>
);

export { ShortcutRecorder };
