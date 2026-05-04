"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type PageTransitionProps = {
  children: ReactNode;
};

export default function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const initial = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 };
  const animate = reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
  const exit = reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 };

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={pathname}
        initial={initial}
        animate={animate}
        exit={exit}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex-1"
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
