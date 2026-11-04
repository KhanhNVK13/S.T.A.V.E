"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT } from "../../context/i18n-context";
import { Dialog } from "../ui/dialog";
import { INPUT_CLASS } from "../ui/form";
import type { RecentProject } from "./use-recent-projects";
import type { ShellNavItem } from "./nav-items";

interface QuickFindProps {
  open: boolean;
  onClose: () => void;
  pages: ShellNavItem[];
  projects: RecentProject[];
}

interface Entry {
  key: string;
  href: string;
  label: string;
  group: "pages" | "projects";
}

export function QuickFind({ open, onClose, pages, projects }: QuickFindProps) {
  const t = useT();
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const all: Entry[] = [
    ...pages.map((p) => ({ key: p.id, href: p.href, label: t(p.label), group: "pages" as const })),
    ...projects.map((p) => ({ key: `project-${p.id}`, href: `/projects/${p.id}`, label: p.name, group: "projects" as const })),
  ];
  const needle = query.trim().toLowerCase();
  const entries = needle ? all.filter((e) => e.label.toLowerCase().includes(needle)) : all;
  const active = Math.min(cursor, Math.max(entries.length - 1, 0));

  function close() {
    setQuery("");
    setCursor(0);
    onClose();
  }

  function go(entry: Entry | undefined) {
    if (!entry) return;
    close();
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (entries.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setCursor((active + step + entries.length) % entries.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(entries[active]);
    }
  }

  return (
    <Dialog open={open} title={t("shell.quickFind")} onClose={close} className="max-w-lg p-5">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          data-autofocus
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={entries[active] ? `${listId}-${entries[active].key}` : undefined}
          aria-label={t("shell.quickFind")}
          placeholder={t("shell.quickFindHint")}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          className={`${INPUT_CLASS} w-full pl-9`}
        />
      </div>
      <ul id={listId} role="listbox" aria-label={t("shell.quickFindResults")} className="mt-3 max-h-72 overflow-y-auto">
        {entries.map((entry, i) => {
          const showGroup = i === 0 || entries[i - 1].group !== entry.group;
          return (
            <li key={entry.key} role="presentation">
              {showGroup && (
                <p className="px-2.5 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                  {t(entry.group === "pages" ? "shell.quickFindPages" : "shell.quickFindProjects")}
                </p>
              )}
              <div
                id={`${listId}-${entry.key}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setCursor(i)}
                onClick={() => go(entry)}
                className={`cursor-pointer truncate rounded-md px-2.5 py-2 text-[13px] ${
                  i === active ? "bg-surface-muted text-foreground" : "text-muted"
                }`}
              >
                {entry.label}
              </div>
            </li>
          );
        })}
        {entries.length === 0 && <li role="presentation" className="px-2.5 py-3 text-[13px] text-muted">{t("shell.quickFindEmpty")}</li>}
      </ul>
    </Dialog>
  );
}
