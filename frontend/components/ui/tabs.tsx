"use client";

import type { KeyboardEvent, ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index < 0) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.id);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[tabs.indexOf(next)]?.focus();
  }

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          tabIndex={active === tab.id ? 0 : -1}
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`-mb-px border-b-2 whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors ${
            active === tab.id
              ? "border-accent font-bold text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return <div hidden={hidden}>{children}</div>;
}
