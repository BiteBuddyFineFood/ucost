"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { defaultWidgets } from "@/lib/domain";
import {
  defaultNavigation,
  navigationFor,
  navigationLabels,
  type LayoutMode,
  type NavigationGroup,
  type NavigationKey,
  type NavigationPreferences,
} from "@/lib/navigation";
import { useLayoutMode } from "./collapsible";

export function NavigationSettings({
  state,
  mutate,
  notify,
}: {
  state: any;
  mutate: (body: any) => Promise<any>;
  notify: (message: string) => void;
}) {
  const layoutMode = useLayoutMode();
  const saved = navigationFor(state.user.preferences);
  const [editing, setEditing] = useState<LayoutMode>(layoutMode);
  const [edited, setEdited] = useState(false);
  const [draft, setDraft] = useState<NavigationPreferences>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = draft[editing];

  useEffect(() => {
    if (!edited) setEditing(layoutMode);
  }, [layoutMode, edited]);

  function updateGroup(next: NavigationGroup) {
    setDraft({ ...draft, [editing]: next });
  }

  function move(key: NavigationKey, direction: -1 | 1, name: keyof NavigationGroup) {
    const list = [...group[name]];
    const index = list.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    updateGroup({ ...group, [name]: list });
  }

  function transfer(key: NavigationKey, from: keyof NavigationGroup) {
    if (editing === "mobile" && from === "more" && group.main.length >= 3)
      return;
    const to = from === "main" ? "more" : "main";
    updateGroup({
      ...group,
      [from]: group[from].filter((item) => item !== key),
      [to]: [...group[to], key],
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const preferences = state.user.preferences || {};
      await mutate({
        action: "preferences",
        preferences: {
          schemaVersion: 1,
          widgets: preferences.widgets || defaultWidgets,
          sizes: preferences.sizes || {},
          navigation: draft,
        },
      });
      notify("导航布局已保存");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel navigation-settings">
      <div className="panel-heading">
        <h2>导航与布局</h2>
        <span className="hint">按窗口宽度自动切换</span>
      </div>
      <div className="nav-mode-switch" role="group" aria-label="编辑布局">
        {(["mobile", "desktop"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={editing === mode ? "active" : ""}
            aria-pressed={editing === mode}
            onClick={() => {
              setEdited(true);
              setEditing(mode);
            }}
          >
            {mode === "mobile" ? "手机／窄屏" : "电脑／宽屏"}
          </button>
        ))}
      </div>
      <p className="hint">
        按窗口宽度自动切换，分别保存布局。设置和小数管家始终可从“更多”打开。
      </p>
      {(["main", "more"] as const).map((name) => (
        <div className="nav-setting-group" key={name}>
          <div className="nav-setting-caption">
            <b>{name === "main" ? "常用入口" : "更多入口"}</b>
            <span>
              {group[name].length}
              {name === "main" && editing === "mobile" ? " / 3" : ""}
            </span>
          </div>
          {group[name].map((key, index) => (
            <div className="nav-setting-row" key={key}>
              <span>{navigationLabels[key]}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`上移${navigationLabels[key]}`}
                disabled={index === 0}
                onClick={() => move(key, -1, name)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`下移${navigationLabels[key]}`}
                disabled={index === group[name].length - 1}
                onClick={() => move(key, 1, name)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                className="text-button"
                disabled={
                  editing === "mobile" && name === "more" && group.main.length >= 3
                }
                title={
                  editing === "mobile" && name === "more" && group.main.length >= 3
                    ? "常用入口已满，请先移出一个入口"
                    : undefined
                }
                onClick={() => transfer(key, name)}
              >
                {name === "main" ? "移到更多" : "移到常用"}
              </button>
            </div>
          ))}
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="nav-setting-footer">
        <button
          type="button"
          className="button secondary"
          onClick={() => setDraft(defaultNavigation)}
        >
          <RotateCcw size={15} />
          恢复默认
        </button>
        <div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft(saved);
              setError("");
            }}
          >
            取消修改
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={save}
          >
            <Save size={15} />
            {busy ? "保存中…" : "保存布局"}
          </button>
        </div>
      </div>
    </section>
  );
}
