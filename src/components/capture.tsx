"use client";
import { AiStatus } from "./enhancements";
import { useRef, useState } from "react";
import { Mic, ImagePlus, Sparkles, Check, Clock3 } from "lucide-react";
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

export function Capture({
  state,
  target = "ledger",
  listId,
  close,
  refresh,
  notify,
}: any) {
  const [text, setText] = useState(""),
    [mode, setMode] = useState(target),
    [selectedList, setSelectedList] = useState(
      listId || state.lists.find((l: any) => !l.archived)?.id || "",
    ),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false);
  const capturedAt = useRef<string | null>(null),
    recognizer = useRef<any>(null);
  const captureId = useRef<string | null>(null);
  const [review, setReview] = useState<any>(null);
  async function save(process: boolean) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      captureId.current ||= crypto.randomUUID();
      form.set("captureId", captureId.current);
      form.set("text", text);
      form.set("target", mode);
      form.set("capturedAt", capturedAt.current || new Date().toISOString());
      form.set("timezone", state.user.timezone);
      form.set(
        "inputMethod",
        capturedAt.current ? "voice" : files.length ? "image" : "text",
      );
      if (mode === "shopping") form.set("targetListId", selectedList);
      files.forEach((f) => form.append("images", f));
      const response = await fetch("/api/capture", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (process) await api("process", { ids: [data.draft.id] });
      else if (data.shouldProcess) {
        let remaining: string[] | undefined;
        do {
          const result = await api("process", { ids: remaining || [] });
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
      title={mode === "shopping" ? "说说清单里要加什么" : "先记下来，慢慢整理"}
      close={() => {
        recognizer.current?.stop();
        close();
      }}
    >
      <div className="capture-target">
        <label>
          整理到
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">自动判断模块</option>
            <option value="ledger">账本</option>
            <option value="shopping">购物清单</option>
            <option value="items">物品档案</option>
            <option value="savings">省钱罐</option>
          </select>
        </label>
        {mode === "shopping" && (
          <label>
            目标清单
            <select
              disabled={!!listId}
              value={selectedList}
              onChange={(e) => setSelectedList(e.target.value)}
            >
              {state.lists
                .filter((l: any) => !l.archived)
                .map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <textarea
        className="capture-text"
        rows={6}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          mode === "shopping"
            ? "牛奶两盒，鸡蛋一打。洗衣液无香的，预算五十以内……"
            : "今天工资到账八千，午饭二十八。买的猫粮应付一百，用券二十，实付八十……"
        }
        onPaste={(e) => {
          const images = Array.from(e.clipboardData.files).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (images.length)
            setFiles((prev) => [...prev, ...images].slice(0, 3));
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
            onChange={(e) =>
              setFiles((prev) =>
                [...prev, ...Array.from(e.target.files || [])].slice(0, 3),
              )
            }
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
      <AiStatus ai={state.ai} />
      {!state.ai.configured && (
        <p className="hint">AI 尚未配置，可以先保存内容。</p>
      )}
      {error && <p className="error">{error}</p>}
      <footer>
        <button
          className="button secondary"
          disabled={busy || recording}
          onClick={() => save(false)}
        >
          {busy ? <Busy /> : "先存着"}
        </button>
        <button
          className="button"
          disabled={
            busy ||
            recording ||
            !state.ai.configured ||
            (state.ai.providerMode === "system" && !state.ai.remaining)
          }
          onClick={() => save(true)}
        >
          <Sparkles size={16} />
          {busy ? "保存与整理中…" : "保存并整理"}
        </button>
      </footer>
    </Modal>
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
        const result = await api("process", { ids: chunk, retry });
        queue = [...result.remaining, ...rest];
        await refresh();
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
            (state.ai.providerMode === "system" && !state.ai.remaining)
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
        <select
          aria-label="草稿状态筛选"
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value)}
        >
          <option value="active">待处理</option>
          <option value="all">全部状态</option>
          <option value="pending">未整理</option>
          <option value="processing">整理中</option>
          <option value="ready">待确认</option>
          <option value="failed">失败</option>
          <option value="applied">已应用</option>
          <option value="ignored">已忽略</option>
        </select>
        <select
          aria-label="目标清单筛选"
          value={listFilter}
          onChange={(event) => setListFilter(event.target.value)}
        >
          <option value="all">全部清单</option>
          {state.lists.map((list: any) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
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
}: any) {
  const [open, setOpen] = useState(true);
  const drafts = state.drafts.filter(
    (draft: any) =>
      draft.target === target &&
      (target !== "shopping" || !listId || draft.targetListId === listId) &&
      ["pending", "processing", "ready", "failed"].includes(draft.state),
  );
  if (!drafts.length) return null;
  const ready = drafts.filter((draft: any) => draft.state === "ready").length;
  return (
    <details
      className="draft-section"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Clock3 size={15} />
        本页暂存 <b>{drafts.length}</b> 条
        {ready > 0 && <span className="pill">{ready} 条待确认</span>}
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
            !applied.includes(i) && candidates[i].duplicateOf === undefined,
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
