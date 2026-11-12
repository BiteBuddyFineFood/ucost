"use client";
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
import { draftStates } from "@/lib/domain";

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
          disabled={busy || recording || !state.ai.configured}
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
    [review, setReview] = useState<any>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [editText, setEditText] = useState("");
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
          disabled={busy}
          onClick={() =>
            process(
              selection.length
                ? selection
                : state.drafts
                    .filter((d: any) => d.state === "pending")
                    .slice(0, 10)
                    .map((d: any) => d.id),
            )
          }
        >
          {busy ? <Busy /> : "批量 AI 整理"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="record-list">
        {state.drafts.length ? (
          state.drafts.map((d: any) => (
            <article className="draft-card" key={d.id}>
              <div className="record-leading">
                <input
                  aria-label="选择草稿"
                  type="checkbox"
                  checked={selection.includes(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span className={`pill ${d.state === "failed" ? "red" : ""}`}>
                  {draftStates[d.state]}
                </span>
                <small>
                  {new Date(d.capturedAt).toLocaleString("zh-CN", {
                    timeZone: d.captureTimezone,
                  })}{" "}
                  · {d.captureTimezone}
                </small>
              </div>
              <p className="draft-text">{d.text || "图片记录"}</p>
              {state.attachments
                .filter((a: any) => a.draftId === d.id)
                .map((a: any) => (
                  <a
                    className="attachment-link"
                    key={a.id}
                    href={`/api/attachment/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.name}
                  </a>
                ))}
              {d.error && <p className="error">{d.error}</p>}
              {JSON.parse(d.warnings || "[]").map((w: string) => (
                <p className="hint" key={w}>
                  {w}
                </p>
              ))}
              <div className="row-actions">
                {["pending", "failed", "ready"].includes(d.state) &&
                  JSON.parse(d.appliedIndexes).length === 0 && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditing(d);
                        setEditText(d.text);
                      }}
                    >
                      修改原话
                    </button>
                  )}
                {["ready", "pending", "failed"].includes(d.state) && (
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await api("mutate", {
                          action: "draftIgnore",
                          operationId: crypto.randomUUID(),
                          id: d.id,
                          version: d.version,
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    忽略剩余内容
                  </button>
                )}
                {["pending", "failed"].includes(d.state) && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => process([d.id], true)}
                  >
                    {d.state === "failed" ? "重试整理" : "AI 整理"}
                  </button>
                )}
                {d.state === "processing" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => process([d.id], true)}
                  >
                    恢复过期任务
                  </button>
                )}
                {d.state === "ready" && (
                  <button className="button" onClick={() => setReview(d)}>
                    检查并确认
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty
            title="待整理的口袋是空的"
            text="忙的时候，先存一句话或一张截图。"
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
      {editing && (
        <Modal title="修改原始内容" close={() => setEditing(null)}>
          <p className="hint">保留原采集时间；修改后需要重新整理。</p>
          <textarea
            className="capture-text"
            rows={5}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <footer>
            <button
              className="button secondary"
              onClick={() => setEditing(null)}
            >
              取消
            </button>
            <button
              className="button"
              onClick={async () => {
                try {
                  await api("mutate", {
                    action: "draftEdit",
                    operationId: crypto.randomUUID(),
                    id: editing.id,
                    version: editing.version,
                    text: editText,
                  });
                  await refresh();
                  setEditing(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              保存原话
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
