// 全局快捷键录制控件:点击进入录制,按下组合键生效,Esc 取消,退格清空

import { keymaps } from "@/lib/keymaps";
import { RawKey } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface ShortcutInputProps {
  value: string[]; // 键名数组,如 ["ShiftLeft", "F10"]
  onChange: (keys: string[]) => void;
  placeholder?: string;
}

const punctuationMap: { [key: string]: string } = {
  "`": "BackQuote",
  "-": "Minus",
  "=": "Equal",
  "[": "LeftBracket",
  "]": "RightBracket",
  "\\": "BackSlash",
  ";": "SemiColon",
  "'": "Quote",
  ",": "Comma",
  ".": "Dot",
  "/": "Slash",
};

// 把浏览器事件键名转为内部键名
const formatKey = (key: string) => {
  if (key.length === 1 && key.match(/[a-zA-Z]/)) return `Key${key.toUpperCase()}`;
  if (key.length === 1 && key.match(/[0-9]/)) return `Num${key}`;
  if (key.startsWith("Arrow")) return `${key.replace("Arrow", "")}Arrow`;
  if (punctuationMap[key]) return punctuationMap[key];
  return key;
};

const ShortcutRecorder: React.FC<ShortcutInputProps> = ({
  value,
  onChange,
  placeholder = "点击设置快捷键",
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { key, ctrlKey, altKey, shiftKey, metaKey, repeat } = e;
      if (repeat) return;

      // 取消
      if (key === "Escape") {
        setIsRecording(false);
        inputRef.current?.blur();
        return;
      }
      // 清空
      if (key === "Backspace" || key === "Delete") {
        onChange([]);
        setIsRecording(false);
        return;
      }

      // 修饰键
      const modifiers: string[] = [];
      if (ctrlKey) modifiers.push(RawKey.ControlLeft);
      if (shiftKey) modifiers.push(RawKey.ShiftLeft);
      if (altKey) modifiers.push(RawKey.Alt);
      if (metaKey) modifiers.push(RawKey.MetaLeft);

      // 只按着修饰键时继续等待主键
      if (["Control", "Shift", "Alt", "Meta"].includes(key)) return;

      const finalKey = formatKey(key);
      const newShortcut = [...new Set([...modifiers, finalKey])];
      onChange(newShortcut);
      setIsRecording(false);
      inputRef.current?.blur();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [isRecording, onChange]);

  const handleClickOutside = (e: MouseEvent) => {
    if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
      setIsRecording(false);
    }
  };

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
            按下组合键进行设置，按 Esc 取消。
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
