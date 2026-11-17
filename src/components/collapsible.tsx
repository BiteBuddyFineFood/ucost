"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import type { LayoutMode } from "@/lib/navigation";

const QUERY = "(max-width: 800px)";

export function useLayoutMode() {
  const [mode, setMode] = useState<LayoutMode>("desktop");
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setMode(query.matches ? "mobile" : "desktop");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mode;
}

export function useFoldPreference(
  key: string,
  defaultOpen: boolean,
  mode: LayoutMode,
  scope = "guest",
) {
  const storageKey = `ucost:fold:${scope}:${key}:${mode}`;
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setOpen(stored === null ? defaultOpen : stored === "open");
    } catch {
      setOpen(defaultOpen);
    }
    setReady(true);
  }, [storageKey, defaultOpen]);
  function update(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      // A private browser may reject storage; the current session still works.
    }
  }
  return { open, setOpen: update, ready };
}

export function CollapsibleSection({
  title,
  summary,
  badge,
  icon,
  open,
  onToggle,
  children,
  className = "",
}: {
  title: string;
  summary?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  function toggle() {
    const next = !open;
    if (
      !next &&
      bodyRef.current &&
      bodyRef.current.contains(document.activeElement)
    )
      toggleRef.current?.focus();
    onToggle(next);
  }
  return (
    <section className={`fold-section ${open ? "open" : ""} ${className}`}>
      <button
        ref={toggleRef}
        type="button"
        className="fold-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        {icon && <span className="fold-icon">{icon}</span>}
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-summary">{summary}</span>}
        {badge}
        <span className="fold-action">
          {open ? "收起" : "展开"}
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="fold-body" id={id} ref={bodyRef}>
          {children}
        </div>
      )}
    </section>
  );
}
