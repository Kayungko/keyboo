// 折叠面板(键帽页分组用)

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useState, type ReactNode } from "react";

const CollapsibleContext = createContext<{ open: boolean; toggle: () => void }>({
  open: false,
  toggle: () => {},
});

export function Collapsible({ defaultOpen = false, children }: {
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <CollapsibleContext.Provider value={{ open, toggle: () => setOpen((o) => !o) }}>
      <div className="flex flex-col">{children}</div>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({ className, children }: {
  className?: string;
  children: ReactNode;
}) {
  const { toggle } = useContext(CollapsibleContext);
  return (
    <button type="button" onClick={toggle} className={cn("text-left", className)}>
      {children}
    </button>
  );
}

export function CollapsibleContent({ className, children }: {
  className?: string;
  children: ReactNode;
}) {
  const { open } = useContext(CollapsibleContext);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
