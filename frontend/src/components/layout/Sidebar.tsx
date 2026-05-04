import Link from "next/link";
import type { ReactNode } from "react";

type SidebarItem = {
  href: string;
  label: string;
  icon?: ReactNode;
};

type SidebarProps = {
  items: SidebarItem[];
  activeHref?: string;
};

export default function Sidebar({ items, activeHref }: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar px-4 py-6 md:block">
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
                  : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-subtle transition-colors hover:bg-muted hover:text-ink"
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
