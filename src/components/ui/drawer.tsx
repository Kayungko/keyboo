// 底部抽屉(自定义过滤键盘选择器用)

import { AnimatePresence, motion } from "motion/react";
import { cloneElement, createContext, isValidElement, useContext, useState, type ReactElement, type ReactNode } from "react";

const DrawerContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function Drawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>;
}

export function DrawerTrigger({ asChild, children }: { asChild?: boolean; children: ReactNode }) {
  const { setOpen } = useContext(DrawerContext);
  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(true),
    });
  }
  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

export function DrawerContent({ children, className }: { children: ReactNode; className?: string }) {
  const { open, setOpen } = useContext(DrawerContext);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl ${className ?? ""}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function DrawerHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-1">{children}</div>;
}

export function DrawerTitle({ children }: { children: ReactNode }) {
  return <div className="text-base font-semibold">{children}</div>;
}

export function DrawerDescription({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}
