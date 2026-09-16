"use client";

import type { ReactNode } from "react";

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
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`-mb-px border-b-2 px-3 py-2.5 text-xs transition-colors ${
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
