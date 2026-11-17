"use client";
import { AiStatus } from "./enhancements";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Box,
  Check,
  Clock3,
  ChevronDown,
  ImagePlus,
  ListChecks,
  Luggage,
  Mic,
  PiggyBank,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  api,
  Busy,
  Empty,
  FieldInput,
  fieldsFor,
  initialData,
  Modal,
} from "./ui";
import { draftStates, draftTargetLabels } from "@/lib/domain";

const captureModes = [
  {
    key: "auto",
    label: "自动判断",
    hint: "一段话几件事",
    icon: Sparkles,
  },
  { key: "ledger", label: "账本", hint: "收支、退款、转账", icon: Wallet },
  {
    key: "shopping",
    label: "购物清单",
    hint: "要买的东西",
    icon: ShoppingBasket,
  },
  {
    key: "conversion",
    label: "买到 / 不买了",
    hint: "结算已有清单条目",
    icon: Check,
  },
  { key: "travel", label: "出行准备", hint: "按类别带什么", icon: Luggage },
  { key: "normal", label: "日常清单", hint: "要做、要准备", icon: ListChecks },
  { key: "items", label: "登记物品", hint: "位置、数量、保质期", icon: Box },
  {
    key: "itemUpdate",
    label: "物品变动",
    hint: "还剩、挪位置、改日期",
    icon: RefreshCw,
  },
  { key: "reminder", label: "到期提醒", hint: "提前几天提醒", icon: Bell },
  { key: "savings", label: "省钱罐", hint: "优惠、没买、降级", icon: PiggyBank },
] as const;

type CaptureMode = (typeof captureModes)[number]["key"];

function initialCaptureMode(target: string, listId: string | undefined, lists: any[]) {
  if (
    ["auto", "ledger", "items", "itemUpdate", "reminder", "savings"].includes(
      target,
    )
  )
    return target as CaptureMode;
  if (target === "shopping") {
    const list = lists.find((item: any) => item.id === listId);
    if (list?.kind === "travel") return "travel" as CaptureMode;
    if (list?.kind === "normal") return "normal" as CaptureMode;
    return "shopping" as CaptureMode;
  }
  return "auto" as CaptureMode;
}

function modeListKind(mode: CaptureMode) {
  if (mode === "travel") return "travel";
  if (mode === "normal") return "normal";
  if (mode === "shopping") return "shopping";
  return null;
}

function captureModeTitle(mode: CaptureMode) {
  if (mode === "auto") return "一句话，理清楚";
  if (mode === "ledger") return "记一笔，先核对再入账";
  if (mode === "shopping") return "说说清单里要加什么";
  if (mode === "conversion") return "清单里那件，买到了还是不买了";
  if (mode === "travel") return "说说这趟出行，AI 帮你列准备";
  if (mode === "normal") return "说说日常清单要准备什么";
  if (mode === "items") return "登记物品，不必先有账单";
  if (mode === "itemUpdate") return "物品变了什么，先列出前后值";
  if (mode === "reminder") return "设一个网页内到期提醒";
  return "省下的，也值得记";
}

function captureModePlaceholder(mode: CaptureMode) {
  if (mode === "auto")
    return "今天花 36 元买了 6 盒牛奶，放冰箱，12 月 1 日到期，提前一天提醒我。也可以一次写几件不同的事……";
  if (mode === "ledger")
    return "午饭 28；工资到账八千；买猫粮应付 100，用券 20，实付 80……";
  if (mode === "shopping")
    return "牛奶两盒，鸡蛋一打。洗衣液无香的，预算五十以内……";
  if (mode === "conversion")
    return "清单里的充电线买到了，实付 39；洗衣液不买了，原预算 49……";
  if (mode === "travel")
    return "两大一小，海边三天，想轻装。防晒、常用药和证件别忘……";
  if (mode === "normal")
    return "周末大扫除要准备什么，按清洁工具、耗材和要扔的东西分组……";
  if (mode === "items")
    return "护照放书房第二个抽屉；新买的充电线 3 根，放床头柜……";
  if (mode === "itemUpdate")
    return "冰箱牛奶还剩 2 盒；护照改到卧室床头柜；冬衣箱移到储物间……";
  if (mode === "reminder")
    return "牛奶 12 月 1 日到期，提前一天提醒我；护照到期前 30 天提醒……";
  return "洗衣液原价 69，降级买了 45 的；本来想买新杯子，后来没买，省了 39……";
}

export function Capture({
  state,
  target = "ledger",
  listId,
  initialText = "",
  close,
  refresh,
  notify,
}: any) {
  const [text, setText] = useState<string>(String(initialText || "")),
    [mode, setMode] = useState<CaptureMode>(() =>
      initialCaptureMode(target, listId, state.lists),
    ),
    [selectedList, setSelectedList] = useState(
      listId || state.lists.find((l: any) => !l.archived)?.id || "",
    ),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false);
  const capturedAt = useRef<string | null>(
      initialText ? new Date().toISOString() : null,
    ),
    recognizer = useRef<any>(null);
  const selectedListRecord = state.lists.find(
    (list: any) => list.id === selectedList,
  );
  const listMode = modeListKind(mode);
  const requestTarget =
    listMode ? "shopping" : mode === "conversion" ? "auto" : mode;
  const captureId = useRef<string | null>(null);
  const voiceInput = useRef(false);
  const [review, setReview] = useState<any>(null);

  function chooseMode(next: CaptureMode) {
    setMode(next);
    const kind = modeListKind(next);
    if (!kind) return;
    const currentKind = selectedListRecord?.kind || "shopping";
    if (currentKind === kind) return;
    const match = state.lists.find(
      (list: any) => !list.archived && (list.kind || "shopping") === kind,
    );
    setSelectedList(match?.id || "");
  }

  async function save(process: boolean) {
    setBusy(true);
    setError("");
    try {
      if (listMode && !selectedList)
        throw new Error("请先选择目标清单，或切换成自动判断");
      if (!text.trim() && !files.length)
        throw new Error("先写一句要记录的内容");
      const form = new FormData();
      captureId.current ||= crypto.randomUUID();
      form.set("captureId", captureId.current);
      form.set("text", text);
      form.set("target", requestTarget);
      capturedAt.current ||= new Date().toISOString();
      form.set("capturedAt", capturedAt.current);
      form.set("timezone", state.user.timezone);
      form.set(
        "inputMethod",
        files.length ? "image" : voiceInput.current ? "voice" : "text",
      );
      if (listMode && selectedList) form.set("targetListId", selectedList);
      files.forEach((f) => form.append("images", f));
      const response = await fetch("/api/capture", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (process && !data.recognized) await api("process", { ids: [data.draft.id] });
      else if (data.shouldProcess) {
        let remaining: string[] | undefined;
        const operationId = crypto.randomUUID();
        do {
          const result = await api("process", { ids: remaining || [], operationId });
          remaining = result.remaining;
        } while (remaining?.length);
      }
      await refresh();
      if (process) {
        const latest = await api("state");
        const draft = latest.drafts.find((d: any) => d.id === data.draft.id);
        if (draft?.state === "ready") {
          setReview(draft);
          return;
        }
      }
      notify(
        process || data.shouldProcess
          ? "已保存，结果与失败提示可在待整理查看"
          : "已逐条保存时间，可稍后整理",
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startVoice() {
    const Speech =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Speech) {
      setError(
        "当前浏览器不支持网页语音识别。可以使用手机键盘的语音输入，再点保存。",
      );
      return;
    }
    const recognition = new Speech();
    recognizer.current = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const result = Array.from(e.results as any[])
        .map((x: any) => x[0].transcript)
        .join("");
      setText((t) => `${t}${t ? "\n" : ""}${result}`);
    };
    recognition.onerror = () => {
      setError("无法使用麦克风或语音服务，可使用键盘语音输入。内容未丢失。");
      setRecording(false);
    };
    recognition.onend = () => setRecording(false);
    capturedAt.current ||= new Date().toISOString();
    voiceInput.current = true;
    setRecording(true);
    setError("");
    recognition.start();
  }
  if (review)
    return (
      <DraftReview
        draft={review}
        state={state}
        close={close}
        refresh={refresh}
        notify={notify}
      />
    );
  return (
    <Modal
      title={captureModeTitle(mode)}
      close={() => {
        recognizer.current?.stop();
        close();
      }}
    >
      <div className="capture-mode-block">
        <div className="capture-mode-heading">
          <div>
            <b>这次要记什么</b>
            <small>选具体模块只保留该模块候选；不确定就用自动判断。</small>
          </div>
          <span className="pill">
            {mode === "conversion"
              ? "购买决定"
              : draftTargetLabels[requestTarget] || "自动判断"}
          </span>
        </div>
        <div className="capture-modes" role="group" aria-label="快速记录类型">
          {captureModes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={`capture-mode ${
                  mode === item.key ? "selected" : ""
                }`}
                onClick={() => chooseMode(item.key)}
                aria-pressed={mode === item.key}
              >
                <span className="capture-mode-icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={1.7} />
                </span>
                <span>
                  <b>{item.label}</b>
                  <small>{item.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
        {listMode && (
          <label className="capture-list-choice">
            <span>放进哪份清单</span>
            <select
              disabled={!!listId}
              value={selectedList}
              onChange={(e) => setSelectedList(e.target.value)}
            >
              <option value="">请选择清单</option>
              {state.lists
                .filter(
                  (list: any) =>
                    !list.archived &&
                    (list.kind || "shopping") === listMode,
                )
                .map((list: any) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {listMode && !selectedList && (
          <p className="capture-mode-warning">
            这个类型还没有可用清单。请先到清单页新建，或切换成购物清单。
          </p>
        )}
      </div>
      <textarea
        className="capture-text"
        rows={6}
        autoFocus
        value={text}
        onChange={(e) => {
          capturedAt.current ||= new Date().toISOString();
          captureId.current = null;
          setText(e.target.value);
        }}
        placeholder={captureModePlaceholder(mode)}
        onPaste={(e) => {
          const images = Array.from(e.clipboardData.files).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (images.length)
            { capturedAt.current ||= new Date().toISOString(); setFiles((prev) => [...prev, ...images].slice(0, 3)); }
        }}
      />
      <div className="capture-tools">
        <button
          className="button secondary"
          onClick={recording ? () => recognizer.current?.stop() : startVoice}
        >
          <Mic size={16} />
          {recording ? "结束口述" : "口述"}
        </button>
        <label className="button secondary">
          <ImagePlus size={16} />
          添加截图
          <input
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => {
              capturedAt.current ||= new Date().toISOString();
              setFiles((prev) =>
                [...prev, ...Array.from(e.target.files || [])].slice(0, 3),
              );
            }}
          />
        </label>
        <small>也可以直接粘贴截图</small>
      </div>
      {files.map((f, i) => (
        <div key={`${f.name}${i}`} className="split-row">
          <span>{f.name}</span>
          <button
            className="text-button"
            onClick={() => setFiles(files.filter((_, j) => j !== i))}
          >
            移除
          </button>
        </div>
      ))}
      <p className="hint">
        <Clock3 size={14} />{" "}
        保存时记录这一条的时间。晚几天整理，“今天”仍按记录当天理解。
      </p>
      {files.length > 0 && <p className="hint">截图仅在本次请求识别，不保存原图。失败可在本页重试；刷新或关闭后需重新选择。截图会发送给已配置的识别服务。</p>}
      <AiStatus ai={state.ai} />
      {!state.ai.configured && (
        <p className="hint">AI 尚未配置，可以先保存内容。</p>
      )}
      {error && <p className="error">{error}</p>}
      <footer>
        <button
          className="button secondary"
          disabled={
            busy ||
            recording ||
            files.length > 0 ||
            (!!listMode && !selectedList)
          }
          onClick={() => save(false)}
        >
          {busy ? <Busy /> : "先存着"}
        </button>
        <button
          className="button"
          disabled={
            busy ||
            recording ||
            (!!listMode && !selectedList) ||
            !state.ai.configured ||
            !state.ai.allowed
          }
          onClick={() => save(true)}
        >
          <Sparkles size={16} />
          {busy ? "保存与整理中…" : files.length ? "识别截图并保存结果" : "保存并整理"}
        </button>
      </footer>
    </Modal>
  );
}

export function FilterMenu({
  open,
  onToggle,
  label,
  value,
  options,
  counts,
  onChange,
  ariaLabel,
  align = "left",
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  value: string;
  options: [string, string][];
  counts?: Record<string, number>;
  onChange: (value: string) => void;
  ariaLabel: string;
  align?: "left" | "right";
}) {
  const current = options.find(([key]) => key === value)?.[1] || label;
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onToggle();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onToggle();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onToggle]);
  return (
    <div
      className={`filter-menu filter-menu-${align}`}
      ref={rootRef}
    >
      <button
        className={`filter-menu-trigger${open ? " open" : ""}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={onToggle}
      >
        <span className="filter-menu-label">{label}</span>
        <span className="filter-menu-value">{current}</span>
        <ChevronDown
          className="filter-menu-chevron"
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="filter-menu-pop" role="listbox" aria-label={ariaLabel}>
          {options.map(([key, optionLabel]) => {
            const count = counts?.[key] ?? 0;
            return (
              <button
                key={key}
                role="option"
                aria-selected={value === key}
                className={`filter-menu-option${
                  value === key ? " selected" : ""
                }`}
                onClick={() => {
                  onChange(key);
                  onToggle();
                }}
              >
                <span className="filter-menu-check">
                  {value === key && (
                    <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                  )}
                </span>
                <span className="filter-menu-option-label">{optionLabel}</span>
                {count > 0 && <b className="filter-menu-count">{count}</b>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DraftInbox({
  state,
  refresh,
  notify,
  openCapture,
  selection,
  toggle,
  openBatch,
}: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [targetFilter, setTargetFilter] = useState("all"),
    [listFilter, setListFilter] = useState("all"),
    [stateFilter, setStateFilter] = useState("active");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const activeDrafts = state.drafts.filter((d: any) =>
    ["pending", "processing", "ready", "failed"].includes(d.state),
  );
  const filtered = state.drafts.filter((d: any) => {
    if (
      stateFilter === "active" &&
      !["pending", "processing", "ready", "failed"].includes(d.state)
    )
      return false;
    if (
      stateFilter !== "active" &&
      stateFilter !== "all" &&
      d.state !== stateFilter
    )
      return false;
    if (targetFilter !== "all" && d.target !== targetFilter) return false;
    if (listFilter !== "all" && d.targetListId !== listFilter) return false;
    return true;
  });
  const partitions = [
    ["all", "全部"],
    ["auto", "待判断"],
    ["ledger", "账本"],
    ["shopping", "购物清单"],
    ["items", "物品"],
    ["itemUpdate", "物品更新"],
    ["reminder", "提醒"],
    ["savings", "省钱罐"],
    ["text", "普通备忘"],
  ];
  const processable = filtered.filter((d: any) => d.state === "pending");
  const chosen = filtered.filter((d: any) => selection.includes(d.id));
  async function process(ids: string[], retry = false) {
    setBusy(true);
    setError("");
    try {
      let queue = ids;
      do {
        const chunk = queue.slice(0, 10);
        const rest = queue.slice(10);
        let remaining = chunk;
        const operationId = crypto.randomUUID();
        do {
          const result = await api("process", { ids: remaining, retry, operationId });
          remaining = result.remaining;
          await refresh();
        } while (remaining.length);
        queue = rest;
      } while (queue.length);
      notify("整理已结束，请检查结果与失败提示");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-tools">
        <div>
          <b>先记录，后确认</b>
          <p className="hint">每条内容保留原始时间。只有确认后才进入账本。</p>
        </div>
        <button
          className="button"
          disabled={
            busy ||
            (!chosen.length && !processable.length) ||
            !state.ai.configured ||
            !state.ai.allowed
          }
          onClick={() =>
            process(
              chosen.length
                ? chosen.map((d: any) => d.id)
                : processable.slice(0, 10).map((d: any) => d.id),
            )
          }
        >
          {busy ? <Busy /> : "批量 AI 整理"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="draft-partitions">
        {partitions.map(([key, label]) => {
          const count =
            key === "all"
              ? activeDrafts.length
              : activeDrafts.filter((d: any) => d.target === key).length;
          return (
            <button
              key={key}
              className={targetFilter === key ? "selected" : ""}
              onClick={() => {
                setTargetFilter(key);
                setListFilter("all");
              }}
            >
              {label} <b>{count}</b>
            </button>
          );
        })}
      </div>
      <div className="filter-bar draft-filters">
        <FilterMenu
          open={openMenu === "state"}
          onToggle={() =>
            setOpenMenu(openMenu === "state" ? null : "state")
          }
          label="状态"
          value={stateFilter}
          options={[
            ["active", "待处理"],
            ["all", "全部状态"],
            ["pending", "未整理"],
            ["processing", "整理中"],
            ["ready", "待确认"],
            ["failed", "失败"],
            ["applied", "已应用"],
            ["ignored", "已忽略"],
          ]}
          counts={(() => {
            const map: Record<string, number> = {
              active: activeDrafts.length,
            };
            state.drafts.forEach((d: any) => {
              map[d.state] = (map[d.state] || 0) + 1;
            });
            return map;
          })()}
          onChange={setStateFilter}
          ariaLabel="草稿状态筛选"
        />
        <FilterMenu
          open={openMenu === "list"}
          onToggle={() => setOpenMenu(openMenu === "list" ? null : "list")}
          label="清单"
          value={listFilter}
          options={[
            ["all", "全部清单"],
            ...state.lists.map((list: any) => [list.id, list.name]),
          ]}
          counts={(() => {
            const map: Record<string, number> = {
              all: state.drafts.length,
            };
            state.drafts.forEach((d: any) => {
              if (d.targetListId) {
                map[d.targetListId] = (map[d.targetListId] || 0) + 1;
              }
            });
            return map;
          })()}
          onChange={setListFilter}
          ariaLabel="目标清单筛选"
          align="right"
        />
        <span className="hint">
          当前筛选 {filtered.length}{" "}
          条；批量整理只处理当前筛选或明确勾选的范围。
        </span>
      </div>
      <div className="record-list">
        {filtered.length ? (
          filtered.map((d: any) => (
            <DraftCard
              key={d.id}
              draft={d}
              state={state}
              refresh={refresh}
              notify={notify}
              selectable
              selected={selection.includes(d.id)}
              toggle={toggle}
              showTarget
            />
          ))
        ) : (
          <Empty
            title="当前筛选下没有草稿"
            text="可以切换分区，或先存一句话、一张截图。"
            action={
              <button className="button" onClick={openCapture}>
                记一条
              </button>
            }
          />
        )}
      </div>
      {selection.length > 0 && (
        <button className="button danger" onClick={openBatch}>
          批量管理所选草稿
        </button>
      )}
    </>
  );
}

function draftPosition(draft: any, state: any) {
  const label = draftTargetLabels[draft.target] || draft.target;
  if (draft.target === "shopping") {
    const list = state.lists.find(
      (item: any) => item.id === draft.targetListId,
    );
    return `${label} / ${list?.name || (draft.targetListId ? "清单已失效" : "未指定清单")}`;
  }
  if (draft.target === "auto") {
    const targets = [
      ...new Set(
        (JSON.parse(draft.result || "[]") as any[])
          .map((candidate) => candidate.target)
          .filter((target) => target && target !== "auto"),
      ),
    ] as string[];
    if (targets.length)
      return `${label} · ${targets
        .map((target) => draftTargetLabels[target] || target)
        .join(" / ")}`;
  }
  return label;
}

function DraftCard({
  draft,
  state,
  refresh,
  notify,
  selectable = false,
  selected = false,
  toggle,
  showTarget = false,
}: any) {
  const applied: number[] = JSON.parse(draft.appliedIndexes || "[]");
  const [review, setReview] = useState<any>(null),
    [editing, setEditing] = useState(false),
    [editText, setEditText] = useState(draft.text),
    [editTarget, setEditTarget] = useState(draft.target),
    [editListId, setEditListId] = useState(draft.targetListId || ""),
    [manual, setManual] = useState(false),
    [manualTarget, setManualTarget] = useState(
      ["ledger", "shopping", "items", "savings"].includes(draft.target)
        ? draft.target
        : "ledger",
    ),
    [manualListId, setManualListId] = useState(
      draft.targetListId ||
        state.lists.find((list: any) => !list.archived)?.id ||
        "",
    ),
    [manualData, setManualData] = useState<any>(() =>
      initialData(
        ["ledger", "shopping", "items", "savings"].includes(draft.target)
          ? draft.target
          : "ledger",
        state,
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const list = state.lists.find((item: any) => item.id === draft.targetListId);
  const missingList = draft.target === "shopping" && !draft.targetListId;
  const invalidList =
    draft.target === "shopping" &&
    !!draft.targetListId &&
    (!list || list.archived) &&
    ["pending", "failed", "ready"].includes(draft.state);
  const canEdit =
    ["pending", "failed", "ready"].includes(draft.state) && !applied.length;
  async function processDraft() {
    setBusy(true);
    setError("");
    try {
      await api("process", { ids: [draft.id], retry: true });
      await refresh();
      notify("整理已结束，请检查结果");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ignore() {
    setBusy(true);
    setError("");
    try {
      await api("mutate", {
        action: "draftIgnore",
        operationId: crypto.randomUUID(),
        id: draft.id,
        version: draft.version,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <article className="draft-card">
        <div className="record-leading">
          {selectable && (
            <input
              aria-label="选择草稿"
              type="checkbox"
              checked={selected}
              onChange={() => toggle(draft.id)}
            />
          )}
          <span className={`pill ${draft.state === "failed" ? "red" : ""}`}>
            {draftStates[draft.state]}
          </span>
          <small>
            {new Date(draft.capturedAt).toLocaleString("zh-CN", {
              timeZone: draft.captureTimezone,
            })}{" "}
            · {draft.captureTimezone}
          </small>
        </div>
        <div className="draft-target-line">
          <b>
            {showTarget
              ? draftPosition(draft, state)
              : draftTargetLabels[draft.target]}
          </b>
          {(missingList || invalidList) && (
            <span className="pill yellow">
              {missingList
                ? "未指定目标清单，请先选择"
                : "目标清单已归档或删除，请重新选择"}
            </span>
          )}
        </div>
        <p className="draft-text">{draft.text || "图片记录"}</p>
        {state.attachments
          .filter((attachment: any) => attachment.draftId === draft.id)
          .map((attachment: any) => (
            <a
              className="attachment-link"
              key={attachment.id}
              href={attachment.missing ? undefined : `/api/attachment/${attachment.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {attachment.name}{attachment.missing ? " · 附件未迁移" : ""}
            </a>
          ))}
        {draft.error && <p className="error">{draft.error}</p>}
        {JSON.parse(draft.warnings || "[]").map((warning: string) => (
          <p className="hint" key={warning}>
            {warning}
          </p>
        ))}
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          {canEdit && (
            <button
              className="text-button"
              onClick={() => {
                setEditing(true);
                setEditText(draft.text);
                setEditTarget(draft.target);
                setEditListId(draft.targetListId || "");
              }}
            >
              修改原话 / 归属
            </button>
          )}
          {["pending", "failed"].includes(draft.state) && (
            <button
              className="text-button"
              onClick={() => {
                const target = [
                  "ledger",
                  "shopping",
                  "items",
                  "savings",
                ].includes(draft.target)
                  ? draft.target
                  : "ledger";
                setManualTarget(target);
                setManualData(initialData(target, state));
                setManualListId(
                  draft.targetListId ||
                    state.lists.find((item: any) => !item.archived)?.id ||
                    "",
                );
                setManual(true);
              }}
            >
              手动整理
            </button>
          )}
          {["ready", "pending", "failed"].includes(draft.state) && (
            <button className="text-button" disabled={busy} onClick={ignore}>
              忽略剩余内容
            </button>
          )}
          {["pending", "failed"].includes(draft.state) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={processDraft}
            >
              {draft.state === "failed" ? "重试整理" : "AI 整理"}
            </button>
          )}
          {draft.state === "processing" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={processDraft}
            >
              恢复过期任务
            </button>
          )}
          {draft.state === "ready" && (
            <button className="button" onClick={() => setReview(draft)}>
              检查并确认
            </button>
          )}
        </div>
      </article>
      {editing && (
        <Modal title="修改原始内容与归属" close={() => setEditing(false)}>
          <p className="hint">
            保留原采集时间；修改后清除旧候选和旧错误，需要重新整理或手动整理。
          </p>
          <textarea
            className="capture-text"
            rows={5}
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
          />
          <div className="form-grid">
            <label className="field">
              <span>目标模块</span>
              <select
                value={editTarget}
                onChange={(event) => setEditTarget(event.target.value)}
              >
                <option value="auto">自动判断</option>
                <option value="ledger">账本</option>
                <option value="shopping">购物清单</option>
                <option value="items">物品档案</option>
                <option value="itemUpdate">物品更新</option>
                <option value="reminder">到期提醒</option>
                <option value="savings">省钱罐</option>
                <option value="text">普通备忘</option>
              </select>
            </label>
            {editTarget === "shopping" && (
              <label className="field">
                <span>目标清单</span>
                <select
                  value={editListId}
                  onChange={(event) => setEditListId(event.target.value)}
                >
                  <option value="">请选择</option>
                  {state.lists
                    .filter((item: any) => !item.archived)
                    .map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          <footer>
            <button
              className="button secondary"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button
              className="button"
              disabled={busy || !editText.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("mutate", {
                    action: "draftEdit",
                    operationId: crypto.randomUUID(),
                    id: draft.id,
                    version: draft.version,
                    text: editText,
                    target: editTarget,
                    targetListId:
                      editTarget === "shopping" ? editListId || null : null,
                  });
                  await refresh();
                  setEditing(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Busy /> : "保存原话"}
            </button>
          </footer>
        </Modal>
      )}
      {manual && (
        <Modal title="手动整理这条记录" wide close={() => setManual(false)}>
          <p className="hint">
            AI
            不可用或识别失败时，也可以人工填写候选。确认后仍走同一套版本校验和关联流程。
          </p>
          <div className="form-grid">
            <label className="field">
              <span>目标模块</span>
              <select
                value={manualTarget}
                onChange={(event) => {
                  const target = event.target.value;
                  setManualTarget(target);
                  const next = initialData(target, state);
                  if (target === "shopping")
                    next.listId =
                      manualListId ||
                      state.lists.find((item: any) => !item.archived)?.id ||
                      "";
                  setManualData(next);
                }}
              >
                <option value="ledger">账本</option>
                <option value="shopping">购物清单</option>
                <option value="items">物品档案</option>
                <option value="savings">省钱罐</option>
              </select>
            </label>
            {manualTarget === "shopping" && (
              <label className="field">
                <span>目标清单</span>
                <select
                  value={manualListId}
                  onChange={(event) => {
                    setManualListId(event.target.value);
                    setManualData({
                      ...manualData,
                      listId: event.target.value,
                    });
                  }}
                >
                  {state.lists
                    .filter((item: any) => !item.archived)
                    .map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          <div className="form-grid">
            {fieldsFor(manualTarget, manualData, state).map((field: any) => (
              <FieldInput
                key={field.key}
                field={field}
                value={manualData[field.key]}
                set={(value: any) =>
                  setManualData({ ...manualData, [field.key]: value })
                }
              />
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <footer>
            <button
              className="button secondary"
              onClick={() => setManual(false)}
            >
              取消
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("mutate", {
                    action: "draftManual",
                    operationId: crypto.randomUUID(),
                    id: draft.id,
                    version: draft.version,
                    target: manualTarget,
                    targetListId:
                      manualTarget === "shopping" ? manualListId || null : null,
                    data: manualData,
                  });
                  await refresh();
                  setManual(false);
                  notify("手动整理结果已生成，请检查并确认");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Busy /> : "生成候选"}
            </button>
          </footer>
        </Modal>
      )}
      {review && (
        <DraftReview
          draft={review}
          state={state}
          close={() => setReview(null)}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}

export function DraftSection({
  state,
  refresh,
  notify,
  target,
  listId = null,
  foldOpen,
  onFoldChange,
}: any) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = foldOpen ?? localOpen;
  const setOpen = onFoldChange ?? setLocalOpen;
  const drafts = state.drafts.filter(
    (draft: any) =>
      draft.target === target &&
      (target !== "shopping" || !listId || draft.targetListId === listId) &&
      ["pending", "processing", "ready", "failed"].includes(draft.state),
  );
  if (!drafts.length) return null;
  const ready = drafts.filter((draft: any) => draft.state === "ready").length;
  const failed = drafts.filter((draft: any) => draft.state === "failed").length;
  const pending = drafts.filter(
    (draft: any) => draft.state === "pending",
  ).length;
  return (
    <details
      className="draft-section"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Clock3 size={15} />
        本页暂存 <b>{drafts.length}</b> 条
        {failed > 0 && <span className="pill red">{failed} 条失败</span>}
        {ready > 0 && <span className="pill">{ready} 条待确认</span>}
        {pending > 0 && <span className="pill">{pending} 条待整理</span>}
      </summary>
      <div className="draft-section-list">
        {drafts.map((draft: any) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            state={state}
            refresh={refresh}
            notify={notify}
            showTarget={target === "shopping" && !listId}
          />
        ))}
      </div>
    </details>
  );
}

function DraftReview({ draft, state, close, refresh, notify }: any) {
  const applied: number[] = JSON.parse(draft.appliedIndexes);
  const [candidates, setCandidates] = useState<any[]>(
    JSON.parse(draft.result).map((c: any) => ({
      ...c,
      data: c.target === "text" ? c.data : initialData(c.target, state, c.data),
    })),
  );
  const [selected, setSelected] = useState<number[]>(
      candidates
        .map((_, i) => i)
        .filter(
          (i) =>
            !applied.includes(i) &&
            candidates[i].duplicateOf === undefined &&
            !candidates[i].existingDuplicate,
        ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [keywords, setKeywords] = useState<Record<number, string>>({});
  return (
    <Modal title="看一眼，确认这些记录" wide close={close}>
      <details>
        <summary>查看原始内容与记录时间</summary>
        <p>{draft.text}</p>
        <small>{new Date(draft.capturedAt).toLocaleString("zh-CN")}</small>
      </details>
      <div className="candidate-list">
        {candidates.map((candidate, i) => (
          <article
            key={i}
            className={`candidate ${applied.includes(i) ? "muted" : ""}`}
          >
            <label className="candidate-title">
              <input
                type="checkbox"
                disabled={applied.includes(i)}
                checked={selected.includes(i)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, i]
                      : selected.filter((j) => j !== i),
                  )
                }
              />
              <b>
                {candidate.data.title ||
                  candidate.data.name ||
                  `整理结果 ${i + 1}`}
              </b>
              {applied.includes(i) && (
                <span className="pill">
                  <Check size={12} />
                  已保存
                </span>
              )}
            </label>
            {candidate.warnings?.map((w: string) => (
              <p className="warning" key={w}>
                {w}
              </p>
            ))}
            {candidate.target === "text" ? (
              <p>{candidate.data.text}</p>
            ) : (
              <div className="form-grid">
                {fieldsFor(candidate.target, candidate.data, state).map(
                  (field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={candidate.data[field.key]}
                      set={(v) =>
                        setCandidates((prev) =>
                          prev.map((c, j) =>
                            j === i
                              ? {
                                  ...c,
                                  data: {
                                    ...c.data,
                                    [field.key]: v,
                                    ...(c.target === "conversion" &&
                                    field.key === "itemId"
                                      ? {
                                          itemVersion: state.shopping.find(
                                            (s: any) => s.id === v,
                                          )?.version,
                                        }
                                      : c.target === "itemUpdate" &&
                                          field.key === "itemId"
                                        ? {
                                            itemVersion: state.items.find(
                                              (item: any) => item.id === v,
                                            )?.version,
                                          }
                                      : {}),
                                  },
                                }
                              : c,
                          ),
                        )
                      }
                    />
                  ),
                )}
              </div>
            )}
            {candidate.target === "ledger" && (
              <label className="field">
                <span>记住分类关键词（可选，例如商家名）</span>
                <input
                  value={keywords[i] || ""}
                  onChange={(e) =>
                    setKeywords({ ...keywords, [i]: e.target.value })
                  }
                />
              </label>
            )}
            {candidate.target === "ledger" &&
              candidate.data.discount > 0 &&
              candidate.data.autoSaving && (
                <p className="hint">
                  确认后将同时新增 ¥{(candidate.data.discount / 100).toFixed(2)}{" "}
                  优惠省钱记录。
                </p>
              )}
          </article>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          稍后确认
        </button>
        <button
          className="button"
          disabled={busy || !selected.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("apply", {
                operationId: crypto.randomUUID(),
                id: draft.id,
                version: draft.version,
                selections: selected.map((index) => ({
                  index,
                  candidate: candidates[index],
                  keyword: keywords[index],
                })),
              });
              await refresh();
              notify("所选记录已保存");
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : `确认 ${selected.length} 条`}
        </button>
      </footer>
    </Modal>
  );
}
