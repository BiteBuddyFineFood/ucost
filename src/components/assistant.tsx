"use client";

import {
  AlertTriangle,
  Bell,
  Box,
  CalendarClock,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  HelpCircle,
  History,
  Inbox,
  List,
  MessageSquarePlus,
  Plus,
  Search,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { draftTargetLabels, localDate, money } from "@/lib/domain";
import {
  answerAssistant,
  assistantContextLabel,
  assistantSuggestions,
  assistantWritePlan,
  type AssistantAction,
  type AssistantAnswer,
  type AssistantContext,
  type AssistantReference,
  type AssistantSuggestionIcon,
  type AssistantWritePlan,
} from "@/lib/assistant";
import { Busy, FieldInput, api, fieldsFor } from "./ui";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  text?: string;
  contextLabel?: string;
  answer?: AssistantAnswer;
  write?: AssistantWrite;
};

type SavedWrite = {
  index: number;
  target: string;
  id: string;
};

type AssistantWrite = {
  status: "preparing" | "stashed" | "ready" | "applied" | "conflict" | "error";
  captureId: string;
  processOperationId: string;
  operationId: string;
  text: string;
  target: AssistantWritePlan["target"];
  candidateList?: any[];
  selected?: number[];
  appliedIndexes?: number[];
  saved?: SavedWrite[];
  draftId?: string;
  draftVersion?: number;
  capturedAt?: string;
  error?: string;
  warnings?: string[];
  applying?: boolean;
};

type StoredState = {
  messages?: ChatMessage[];
  hidden?: boolean;
  contextEnabled?: boolean;
  position?: { x: number; y: number };
  launcher?: { x: number; y: number } | null;
  dock?: { side: "left" | "right"; y: number } | null;
};

type DockSide = "left" | "right";
type AssistantDock = { side: DockSide; y: number };

const DOCK_EDGE = 18;

const suggestionIcons: Record<AssistantSuggestionIcon, any> = {
  search: Search,
  wallet: Wallet,
  calendar: CalendarClock,
  list: List,
  history: History,
  bell: Bell,
  help: HelpCircle,
  box: Box,
};

function defaultPosition() {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  const width = Math.min(420, window.innerWidth - 24);
  const height = Math.min(620, window.innerHeight - 48);
  return {
    x: Math.max(10, window.innerWidth - width - 28),
    y: Math.max(10, window.innerHeight - height - 28),
  };
}

function clampPosition(position: { x: number; y: number }) {
  if (typeof window === "undefined") return position;
  const width = Math.min(420, window.innerWidth - 24);
  const height = Math.min(620, window.innerHeight - 48);
  return {
    x: Math.min(
      Math.max(8, Number(position.x) || 8),
      Math.max(8, window.innerWidth - width - 8),
    ),
    y: Math.min(
      Math.max(8, Number(position.y) || 8),
      Math.max(8, window.innerHeight - height - 8),
    ),
  };
}

function panelSize() {
  if (typeof window === "undefined") return { width: 420, height: 620 };
  return {
    width: Math.min(420, window.innerWidth - 24),
    height: Math.min(620, window.innerHeight - 48),
  };
}

function clampDockY(y: number) {
  if (typeof window === "undefined") return y;
  return Math.min(Math.max(52, Number(y) || 52), window.innerHeight - 52);
}

function dockSideAt(
  position: { x: number; y: number },
  width = panelSize().width,
): DockSide | null {
  if (typeof window === "undefined") return null;
  if (position.x <= DOCK_EDGE) return "left";
  if (window.innerWidth - (position.x + width) <= DOCK_EDGE) return "right";
  return null;
}

function clampLauncherPosition(position: { x: number; y: number }) {
  if (typeof window === "undefined") return position;
  const width = 156;
  const height = 52;
  return {
    x: Math.min(
      Math.max(8, Number(position.x) || 8),
      Math.max(8, window.innerWidth - width - 8),
    ),
    y: Math.min(
      Math.max(8, Number(position.y) || 8),
      Math.max(8, window.innerHeight - height - 8),
    ),
  };
}

function positionForDock(dock: AssistantDock) {
  const { width, height } = panelSize();
  if (typeof window === "undefined") return { x: 12, y: 84 };
  return {
    x:
      dock.side === "left"
        ? 12
        : Math.max(12, window.innerWidth - width - 12),
    y: Math.min(
      Math.max(12, dock.y - 54),
      Math.max(12, window.innerHeight - height - 12),
    ),
  };
}

function readStored(key: string): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timestamp() {
  return Date.now();
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function ScratchUnderline() {
  return (
    <svg className="assistant-scratch" viewBox="0 0 180 12" aria-hidden="true">
      <path
        d="M3 7C37 3 66 9 91 5s55 2 86-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 10c31-2 62 1 89-1 27-2 51 1 69-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  );
}

function SuggestionList({
  state,
  context,
  ask,
}: {
  state: any;
  context: AssistantContext;
  ask: (text: string) => void;
}) {
  const groups = assistantSuggestions(state, context);
  return (
    <div className="assistant-suggestions">
      {groups.map((group) => (
        <section className="assistant-suggest-group" key={group.label}>
          <h3>
            <span>{group.label}</span>
            <i aria-hidden="true" />
          </h3>
          {group.items.map((item) => {
            const Icon = suggestionIcons[item.icon] || Sparkles;
            return (
              <button
                className="assistant-suggestion"
                key={item.text}
                onClick={() => ask(item.text)}
              >
                <span className="assistant-suggestion-icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={1.7} />
                </span>
                <span className="assistant-suggestion-copy">
                  <b>{item.text}</b>
                  <small>{item.hint}</small>
                </span>
                <ChevronRight
                  className="assistant-suggestion-chevron"
                  size={15}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function AnswerView({
  answer,
  onReference,
  onAction,
  ask,
}: {
  answer: AssistantAnswer;
  onReference: (reference: AssistantReference) => void;
  onAction: (action: AssistantAction) => void;
  ask: (text: string) => void;
}) {
  return (
    <article className={`assistant-answer ${answer.empty ? "is-empty" : ""}`}>
      <div className="assistant-answer-byline">
        <span className="assistant-mini-stamp" aria-hidden="true">
          管
        </span>
        <span>小数管家</span>
      </div>
      <h3>{answer.title}</h3>
      <p>{answer.body}</p>
      {answer.facts?.length ? (
        <div className="assistant-facts">
          {answer.facts.map((fact) => (
            <div className="assistant-fact" key={`${fact.label}:${fact.value}`}>
              <small>{fact.label}</small>
              <strong>{fact.value}</strong>
              {fact.note && <em>{fact.note}</em>}
            </div>
          ))}
        </div>
      ) : null}
      {answer.rows?.length ? (
        <div className="assistant-rows">
          {answer.rows.map((row) => {
            const content = (
              <>
                <span className="assistant-row-copy">
                  <b>{row.title}</b>
                  <small>{row.meta}</small>
                  {row.detail && <em>{row.detail}</em>}
                </span>
                {row.reference && (
                  <ChevronRight
                    className="assistant-row-chevron"
                    size={15}
                    aria-hidden="true"
                  />
                )}
              </>
            );
            return row.reference ? (
              <button
                className="assistant-row is-link"
                key={row.id}
                onClick={() => onReference(row.reference!)}
                aria-label={`${row.title}，${row.reference.label}`}
              >
                {content}
              </button>
            ) : (
              <div className="assistant-row" key={row.id}>
                {content}
              </div>
            );
          })}
        </div>
      ) : null}
      {answer.caution && <p className="assistant-caution">{answer.caution}</p>}
      {answer.actions?.length ? (
        <div className="assistant-actions">
          {answer.actions.map((action) => (
            <button
              className="assistant-action"
              key={`${action.type}:${action.target}:${action.label}`}
              onClick={() => onAction(action)}
            >
              <Plus size={15} aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {answer.references?.length ? (
        <div className="assistant-references">
          {answer.references.map((reference, index) => (
            <button
              className="assistant-reference"
              key={`${reference.type}:${index}`}
              onClick={() => onReference(reference)}
            >
              {reference.label}
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      {answer.followUps?.length ? (
        <div className="assistant-followups">
          <small>也可以接着问</small>
          <div>
            {answer.followUps.slice(0, 4).map((text) => (
              <button
                className="assistant-followup"
                key={text}
                onClick={() => ask(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

const writeStatusText: Record<AssistantWrite["status"], string> = {
  preparing: "整理中",
  stashed: "已先存着",
  ready: "待确认",
  applied: "已保存",
  conflict: "需核对",
  error: "未完成",
};

const ledgerTypeLabels: Record<string, string> = {
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
};

function writeTitle(write: AssistantWrite) {
  if (write.status === "preparing") return "先把这句话整理成待确认记录";
  if (write.status === "stashed") return "原话已经先存着";
  if (write.status === "applied") return "这次写入已经有结果";
  if (write.status === "conflict") return "记录刚刚有变化，请重新核对";
  if (write.status === "error") return "这次没有整理完成";
  const count = write.candidateList?.length || 0;
  return `${count} 条候选，确认后才写入`;
}

function candidateTitle(candidate: any, index: number) {
  return (
    cleanText(candidate?.data?.title || candidate?.data?.name) ||
    `候选 ${index + 1}`
  );
}

function boxLabel(state: any, boxId: unknown) {
  if (!boxId) return "";
  const box = (state.boxes || []).find((row: any) => row.id === boxId);
  return box ? [box.name, box.location].filter(Boolean).join(" · ") : "";
}

function quantityText(value: any, unit: any) {
  if (value == null || value === "") return "";
  return `${value} ${cleanText(unit) || "件"}`;
}

function candidateFacts(candidate: any, state: any) {
  const data = candidate?.data || {};
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: unknown) => {
    const text = cleanText(value);
    if (text) facts.push({ label, value: text });
  };
  if (candidate?.target === "ledger") {
    add("类型", ledgerTypeLabels[data.type] || data.type);
    add(
      "金额",
      Number.isInteger(data.amount) ? `¥${money(Number(data.amount))}` : "",
    );
    add("日期", data.date);
    const category = (state.categories || []).find(
      (row: any) => row.id === data.categoryId,
    );
    add("分类", category?.name || "未分类");
    add("备注", data.note);
  } else if (candidate?.target === "shopping") {
    const list = (state.lists || []).find((row: any) => row.id === data.listId);
    add("清单", list?.name);
    add("数量", data.quantity);
    add(
      "预算",
      Number.isInteger(data.budget) ? `¥${money(Number(data.budget))}` : "",
    );
    add("分组", data.groupName);
    add("条件", data.requirements);
  } else if (candidate?.target === "items") {
    add("数量", quantityText(data.quantity, data.unit));
    add("位置", data.location);
    add("收纳箱", boxLabel(state, data.boxId));
    add("到期日", data.expiresOn);
    add("购入日", data.purchaseDate);
    add("备注", data.note);
  } else if (candidate?.target === "itemUpdate") {
    const item = (state.items || []).find(
      (row: any) => row.id === (data.itemId || candidate.data?.itemId),
    );
    add("物品", item?.name || data.title || data.name);
    if (data.quantity != null)
      add(
        "数量",
        `${quantityText(item?.quantity, item?.unit) || "原数量"} → ${quantityText(
          data.quantity,
          data.unit || item?.unit,
        )}`,
      );
    if (data.location != null)
      add(
        "位置",
        `${cleanText(item?.location) || "未登记"} → ${
          cleanText(data.location) || "清空位置"
        }`,
      );
    if (data.boxId != null)
      add(
        "收纳箱",
        `${boxLabel(state, item?.boxId) || "不放进箱子"} → ${
          boxLabel(state, data.boxId) || "不放进箱子"
        }`,
      );
    if (data.expiresOn != null)
      add(
        "到期日",
        `${cleanText(item?.expiresOn) || "未登记"} → ${
          cleanText(data.expiresOn) || "清空日期"
        }`,
      );
    if (data.status != null)
      add("状态", data.status === "used" ? "已用完" : data.status);
    add("备注", data.note);
  } else if (candidate?.target === "reminder") {
    add("物品", data.dependsOnName || data.title);
    add(
      "触发",
      data.triggerType === "fixed"
        ? `固定 ${cleanText(data.fixedAt)}`
        : `到期前 ${Number(data.offsetDays || 0)} 天 · ${
            cleanText(data.localTime) || "09:00"
          }`,
    );
    add("时区", data.timezone);
  } else if (candidate?.target === "savings") {
    add("省钱方式", data.type);
    add(
      "金额",
      Number.isInteger(data.amount) ? `¥${money(Number(data.amount))}` : "",
    );
    add("日期", data.date);
    add("备注", data.note);
  } else if (candidate?.target === "conversion") {
    const shopping = (state.shopping || []).find(
      (row: any) => row.id === data.itemId,
    );
    add("清单条目", shopping?.name || data.title);
    add("决定", data.mode === "skip" ? "不买了" : "买到了");
    add(
      "实付",
      Number.isInteger(data.paid) ? `¥${money(Number(data.paid))}` : "",
    );
    add("日期", data.date);
  } else if (candidate?.target === "text") {
    add("内容", data.text);
  }
  return facts.slice(0, 8);
}

function savedReference(saved: SavedWrite): AssistantReference | null {
  if (saved.target === "ledger")
    return { type: "ledger", id: saved.id, label: "打开账目" };
  if (saved.target === "shopping")
    return { type: "shopping", id: saved.id, label: "打开清单条目" };
  if (saved.target === "items" || saved.target === "itemUpdate")
    return { type: "item", id: saved.id, label: "打开物品" };
  if (saved.target === "reminder")
    return { type: "reminders", label: "打开提醒" };
  if (saved.target === "savings")
    return { type: "page", page: "savings", label: "打开省钱罐" };
  if (saved.target === "conversion")
    return { type: "page", page: "shopping", label: "打开清单" };
  return null;
}

function WriteView({
  message,
  state,
  onReference,
  onPatch,
  onApply,
  onRetry,
}: {
  message: ChatMessage;
  state: any;
  onReference: (reference: AssistantReference) => void;
  onPatch: (patch: Partial<AssistantWrite>) => void;
  onApply: () => void;
  onRetry: () => void;
}) {
  const write = message.write!;
  const candidates = write.candidateList || [];
  const selected = write.selected || [];
  const applied = write.appliedIndexes || [];
  const ready = write.status === "ready";
  function editCandidate(index: number, key: string, value: any) {
    onPatch({
      candidateList: candidates.map((candidate, current) => {
        if (current !== index) return candidate;
        const itemVersion =
          candidate.target === "itemUpdate" && key === "itemId"
            ? (state.items || []).find((item: any) => item.id === value)?.version
            : candidate.target === "conversion" && key === "itemId"
              ? (state.shopping || []).find((item: any) => item.id === value)
                  ?.version
              : candidate.data.itemVersion;
        return {
          ...candidate,
          data: {
            ...candidate.data,
            [key]: value,
            ...(itemVersion !== undefined ? { itemVersion } : {}),
          },
        };
      }),
    });
  }
  return (
    <article className={`assistant-write is-${write.status}`}>
      <div className="assistant-answer-byline">
        <span className="assistant-mini-stamp" aria-hidden="true">
          管
        </span>
        <span>小数管家 · 写入预览</span>
      </div>
      <div className="assistant-write-head">
        <h3>{writeTitle(write)}</h3>
        <span className={`assistant-write-state is-${write.status}`}>
          {writeStatusText[write.status]}
        </span>
      </div>
      {write.status === "preparing" && (
        <p className="assistant-write-note">
          <Busy text="正在整理候选…" />
          还没有写入任何记录。
        </p>
      )}
      {write.status === "stashed" && (
        <>
          <p className="assistant-write-note">
            这句话和原始时间已经存进待整理。AI
            不可用或识别不完整时，仍可去待整理手动处理。
          </p>
          {write.error && <p className="assistant-caution">{write.error}</p>}
        </>
      )}
      {write.status === "conflict" && (
        <p className="assistant-write-note">
          草稿或目标物品在别处更新过。已尝试载入最新版本，请核对后再确认，不会覆盖新数据。
        </p>
      )}
      {write.error && (
        <p className="assistant-write-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          {write.error}
        </p>
      )}
      {write.warnings?.filter((warning) => warning !== write.error).length ? (
        <div className="assistant-write-warnings">
          {write.warnings
            .filter((warning) => warning !== write.error)
            .map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
        </div>
      ) : null}
      {candidates.length > 0 && (
        <div className="assistant-write-list">
          {candidates.map((candidate, index) => {
            const isApplied = applied.includes(index);
            const facts = candidateFacts(candidate, state);
            return (
              <section
                className={`assistant-write-candidate ${
                  isApplied ? "is-applied" : ""
                }`}
                key={`${candidate.target}:${index}`}
              >
                <label className="assistant-write-candidate-head">
                  <input
                    type="checkbox"
                    disabled={!ready || isApplied}
                    checked={isApplied || selected.includes(index)}
                    onChange={(event) =>
                      onPatch({
                        selected: event.target.checked
                          ? [...selected, index]
                          : selected.filter((item) => item !== index),
                      })
                    }
                  />
                  <b>{candidateTitle(candidate, index)}</b>
                  <span className="assistant-write-target">
                    {draftTargetLabels[candidate.target] || candidate.target}
                  </span>
                  {isApplied && (
                    <span className="assistant-write-applied">
                      <Check size={12} aria-hidden="true" />
                      已保存
                    </span>
                  )}
                </label>
                {facts.length > 0 && (
                  <dl className="assistant-write-facts">
                    {facts.map((fact) => (
                      <div key={`${fact.label}:${fact.value}`}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {candidate.warnings?.length ? (
                  <div className="assistant-write-warnings">
                    {candidate.warnings.map((warning: string) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
                {ready && !isApplied && (
                  <details className="assistant-write-edit">
                    <summary>逐项修改</summary>
                    {candidate.target === "text" ? (
                      <label className="field">
                        <span>备忘内容</span>
                        <textarea
                          rows={3}
                          value={candidate.data.text || ""}
                          onChange={(event) =>
                            editCandidate(index, "text", event.target.value)
                          }
                        />
                      </label>
                    ) : (
                      <div className="form-grid">
                        {fieldsFor(candidate.target, candidate.data, state).map(
                          (field: any) => (
                            <FieldInput
                              key={field.key}
                              field={field}
                              value={candidate.data[field.key]}
                              set={(value: any) =>
                                editCandidate(index, field.key, value)
                              }
                            />
                          ),
                        )}
                      </div>
                    )}
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
      {ready && (
        <footer className="assistant-write-footer">
          <button
            className="assistant-write-link"
            onClick={() =>
              onReference({ type: "page", page: "drafts", label: "待整理" })
            }
          >
            去待整理修改
          </button>
          <button
            className="assistant-write-confirm"
            disabled={!selected.length || !!write.applying}
            onClick={onApply}
          >
            {write.applying ? (
              <Busy text="保存中…" />
            ) : (
              `确认保存 ${selected.length} 条`
            )}
          </button>
        </footer>
      )}
      {(write.status === "stashed" ||
        write.status === "error" ||
        write.status === "conflict") && (
        <footer className="assistant-write-footer">
          <button
            className="assistant-write-link"
            onClick={() =>
              onReference({ type: "page", page: "drafts", label: "待整理" })
            }
          >
            查看待整理
          </button>
          {write.status !== "stashed" && (
            <button
              className="assistant-write-confirm secondary"
              disabled={!!write.applying}
              onClick={onRetry}
            >
              重新整理
            </button>
          )}
        </footer>
      )}
      {applied.length > 0 && (
        <div className="assistant-write-saved">
          <small>这次保存的记录</small>
          <div>
            {(write.saved || []).map((saved) => {
              const reference = savedReference(saved);
              return reference ? (
                <button
                  key={`${saved.target}:${saved.index}:${saved.id}`}
                  onClick={() => onReference(reference)}
                >
                  {draftTargetLabels[saved.target] || saved.target}
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
    </article>
  );
}

export default function Assistant({
  state,
  page,
  listId,
  list,
  reminders = [],
  open,
  setOpen,
  onReference,
  onCapture,
  onRefresh,
}: any) {
  const timezone = state.user.timezone || "Asia/Shanghai";
  const today = localDate(new Date(), timezone);
  const context: AssistantContext = {
    page,
    listId,
    listName: list?.name || null,
    today,
    timezone,
    reminders,
  };
  const storageKey = `ucost.assistant.v1.${state.user.id}`;
  const [hidden, setHidden] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(true);
  const [position, setPosition] = useState(defaultPosition);
  const [launcherPosition, setLauncherPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [dock, setDock] = useState<AssistantDock | null>(null);
  const [dockHint, setDockHint] = useState<DockSide | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [hydratedKey, setHydratedKey] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [launcherDragging, setLauncherDragging] = useState(false);
  const [stashBusy, setStashBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stashCaptureId = useRef<string | null>(null);
  const positionRef = useRef(position);
  const launcherPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const launcherDragCleanupRef = useRef<(() => void) | null>(null);
  const suppressLauncherClick = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
  } | null>(null);

  useEffect(() => {
    const stored = readStored(storageKey);
    setHidden(!!stored?.hidden);
    setContextEnabled(stored?.contextEnabled !== false);
    setPosition(
      stored?.position &&
        Number.isFinite(stored.position.x) &&
        Number.isFinite(stored.position.y)
        ? clampPosition(stored.position)
        : defaultPosition(),
    );
    setDock(
      stored?.dock &&
        (stored.dock.side === "left" || stored.dock.side === "right") &&
        Number.isFinite(stored.dock.y)
        ? { side: stored.dock.side, y: clampDockY(stored.dock.y) }
        : null,
    );
    setLauncherPosition(
      stored?.launcher &&
        Number.isFinite(stored.launcher.x) &&
        Number.isFinite(stored.launcher.y)
        ? clampLauncherPosition(stored.launcher)
        : null,
    );
    setMessages(
      Array.isArray(stored?.messages)
        ? stored.messages
            .filter(
              (message: any) =>
                message &&
                (message.role === "user" || message.role === "assistant") &&
                typeof message.createdAt === "number",
            )
            .map((message: any) =>
              message.write?.status === "preparing"
                ? {
                    ...message,
                    write: {
                      ...message.write,
                      status: "error",
                      error:
                        "上次整理在关闭页面时中断。原话仍在卡片里；有草稿时可查看待整理或重新整理。",
                    },
                  }
                : message,
            )
            .slice(-40)
        : [],
    );
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (hydratedKey !== storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          messages: messages.slice(-40),
          hidden,
          contextEnabled,
          position,
          launcher: launcherPosition,
          dock,
        } satisfies StoredState),
      );
    } catch {
      /* Storage can be unavailable; the conversation still works in memory. */
    }
  }, [
    contextEnabled,
    dock,
    hidden,
    hydratedKey,
    launcherPosition,
    messages,
    position,
    storageKey,
  ]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!isMobile && dock) {
      const next = positionForDock(dock);
      positionRef.current = next;
      setPosition(next);
    } else {
      setPosition((current) => {
        const next = clampPosition(current);
        positionRef.current = next;
        return next;
      });
    }
    const onResize = () => {
      if (!isMobile && dock) {
        const next = positionForDock(dock);
        positionRef.current = next;
        setPosition(next);
        return;
      }
      setPosition((current) => {
        const next = clampPosition(current);
        positionRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dock, isMobile, open]);

  useEffect(() => {
    const onResize = () =>
      setDock((current) =>
        current ? { ...current, y: clampDockY(current.y) } : current,
      );
    const onLauncherResize = () =>
      setLauncherPosition((current) =>
        current ? clampLauncherPosition(current) : current,
      );
    window.addEventListener("resize", onResize);
    window.addEventListener("resize", onLauncherResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onLauncherResize);
    };
  }, []);

  useEffect(() => {
    launcherPositionRef.current = launcherPosition;
  }, [launcherPosition]);

  useEffect(
    () => () => {
      dragCleanupRef.current?.();
      launcherDragCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobile, open]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href]",
        ),
      ).filter((node) => node.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, open]);

  useEffect(() => {
    if (!open) return;
    if (!isMobile) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [isMobile, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const thread = threadRef.current;
      if (!thread) return;
      if (!messages.length) {
        thread.scrollTop = 0;
        return;
      }
      const answers = thread.querySelectorAll(".assistant-answer");
      const latest = answers[answers.length - 1] as HTMLElement | undefined;
      if (!latest) {
        thread.scrollTop = thread.scrollHeight;
        return;
      }
      const threadTop = thread.getBoundingClientRect().top;
      const answerTop = latest.getBoundingClientRect().top;
      thread.scrollTop += answerTop - threadTop - 8;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, open]);

  function patchWrite(id: string, patch: Partial<AssistantWrite>) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id && message.write
          ? { ...message, write: { ...message.write, ...patch } }
          : message,
      ),
    );
  }

  function resolveWriteText(raw: string, plan: AssistantWritePlan) {
    if (!["itemUpdate", "reminder"].includes(plan.target)) return raw;
    const named = (state.items || []).some(
      (item: any) =>
        item.status === "active" &&
        cleanText(item.name).length >= 2 &&
        raw.includes(cleanText(item.name)),
    );
    if (named) return raw;
    for (const message of [...messages].reverse()) {
      const reference = message.answer?.references?.find(
        (item) => item.type === "item",
      );
      if (!reference || reference.type !== "item") continue;
      const item = (state.items || []).find(
        (row: any) => row.id === reference.id,
      );
      if (item) return `${cleanText(item.name)}：${raw}`;
    }
    return raw;
  }

  async function loadDraft(
    assistantId: string,
    draftId: string,
    processOperationId: string,
    shouldProcess: boolean,
  ) {
    let latest = await api("state");
    let draft = latest.drafts.find((item: any) => item.id === draftId);
    if (!draft) throw new Error("草稿不存在或已失效");
    if (shouldProcess && ["pending", "failed"].includes(draft.state)) {
      let remaining = [draft.id];
      for (let round = 0; round < 3 && remaining.length; round++) {
        const result = await api("process", {
          ids: remaining,
          retry: true,
          operationId: processOperationId,
        });
        remaining = result.remaining || [];
      }
      latest = await api("state");
      draft = latest.drafts.find((item: any) => item.id === draftId);
    }
    if (!draft) throw new Error("草稿不存在或已失效");
    const applied = JSON.parse(draft.appliedIndexes || "[]");
    const warnings = JSON.parse(draft.warnings || "[]");
    if (draft.state === "ready") {
      const candidateList = JSON.parse(draft.result || "[]");
      patchWrite(assistantId, {
        status: "ready",
        draftId: draft.id,
        draftVersion: draft.version,
        capturedAt: draft.capturedAt,
        candidateList,
        appliedIndexes: applied,
        warnings,
        error: undefined,
        applying: false,
        selected: candidateList
          .map((_: any, index: number) => index)
          .filter(
            (index: number) =>
              !applied.includes(index) &&
              candidateList[index].duplicateOf === undefined &&
              !candidateList[index].existingDuplicate,
          ),
      });
      return;
    }
    patchWrite(assistantId, {
      status: "stashed",
      draftId: draft.id,
      draftVersion: draft.version,
      capturedAt: draft.capturedAt,
      candidateList: JSON.parse(draft.result || "[]"),
      appliedIndexes: applied,
      warnings,
      applying: false,
      error:
        draft.error ||
        (draft.state === "processing"
          ? "AI 仍在整理这条记录，可以稍后去待整理查看。"
          : "已存进待整理，稍后可以继续整理或手动处理。"),
    });
  }

  async function createWrite(
    assistantId: string,
    plan: AssistantWritePlan,
    text: string,
    captureId: string,
  ) {
    const capturedAt = new Date().toISOString();
    let draftId = "";
    try {
      const form = new FormData();
      form.set("captureId", captureId);
      form.set("text", text);
      form.set("target", plan.target);
      form.set("capturedAt", capturedAt);
      form.set("timezone", timezone);
      form.set("inputMethod", "text");
      if (plan.target === "shopping" && plan.listId)
        form.set("targetListId", plan.listId);
      const response = await fetch("/api/capture", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "未能保存原话");
      draftId = data.draft.id;
      patchWrite(assistantId, {
        draftId,
        draftVersion: data.draft.version,
        capturedAt: data.draft.capturedAt,
      });
      await loadDraft(
        assistantId,
        draftId,
        newId(),
        !!state.ai?.configured && !!state.ai?.allowed,
      );
    } catch (error) {
      patchWrite(assistantId, {
        status: draftId ? "stashed" : "error",
        applying: false,
        error: (error as Error).message,
      });
    }
  }

  async function applyWrite(assistantId: string) {
    const message = messages.find((item) => item.id === assistantId);
    const write = message?.write;
    if (!write?.draftId || !write.candidateList?.length || !write.selected?.length)
      return;
    const candidates = write.candidateList;
    const selected = write.selected;
    patchWrite(assistantId, { applying: true, error: undefined });
    try {
      const result = await api("apply", {
        operationId: write.operationId,
        id: write.draftId,
        version: write.draftVersion,
        selections: selected.map((index) => ({
          index,
          candidate: candidates[index],
        })),
      });
      const savedByIndex: SavedWrite[] = (result.savedByIndex || [])
        .filter((item: any) => item?.id)
        .map((item: any) => ({
          index: item.index,
          target: item.target,
          id: item.id,
        }));
      const appliedIndexes = [
        ...new Set([...(write.appliedIndexes || []), ...selected]),
      ];
      const saved = [...(write.saved || []), ...savedByIndex].filter(
        (item, index, rows) =>
          rows.findIndex(
            (row) =>
              row.index === item.index &&
              row.target === item.target &&
              row.id === item.id,
          ) === index,
      );
      patchWrite(assistantId, {
        status:
          appliedIndexes.length >= candidates.length ? "applied" : "ready",
        appliedIndexes,
        saved,
        applying: false,
        selected:
          appliedIndexes.length >= candidates.length
            ? []
            : selected.filter((index) => !appliedIndexes.includes(index)),
        error: undefined,
      });
      const latest = await api("state");
      const draft = latest.drafts.find((item: any) => item.id === write.draftId);
      if (draft)
        patchWrite(assistantId, {
          draftVersion: draft.version,
          status: draft.state === "applied" ? "applied" : "ready",
        });
      await onRefresh?.();
    } catch (error) {
      const text = (error as Error).message;
      let latest: any = null;
      try {
        latest = await api("state");
      } catch {
        /* Keep the original action error. */
      }
      const draft = latest?.drafts?.find(
        (item: any) => item.id === write.draftId,
      );
      const versionConflict =
        /草稿已更新|刷新后|版本|候选/.test(text) && draft?.state === "ready";
      const candidateList = versionConflict
        ? JSON.parse(draft.result || "[]")
        : (write.candidateList || []).map((candidate) => {
            if (candidate.target !== "itemUpdate") return candidate;
            const item = latest?.items?.find(
              (row: any) => row.id === candidate.data?.itemId,
            );
            return item
              ? {
                  ...candidate,
                  data: { ...candidate.data, itemVersion: item.version },
                }
              : candidate;
          });
      patchWrite(assistantId, {
        status: versionConflict ? "conflict" : "error",
        applying: false,
        candidateList,
        draftVersion: draft?.version ?? write.draftVersion,
        selected: candidateList
          .map((_: any, index: number) => index)
          .filter(
            (index: number) =>
              !(write.appliedIndexes || []).includes(index) &&
              candidateList[index].duplicateOf === undefined &&
              !candidateList[index].existingDuplicate,
          ),
        error: text,
      });
      await onRefresh?.();
    }
  }

  async function retryWrite(assistantId: string) {
    const message = messages.find((item) => item.id === assistantId);
    const write = message?.write;
    if (!write) return;
    if (!write.draftId) {
      patchWrite(assistantId, {
        status: "preparing",
        processOperationId: newId(),
        operationId: newId(),
        error: undefined,
      });
      try {
        await createWrite(
          assistantId,
          {
            target: write.target,
            label: draftTargetLabels[write.target] || "记录",
            reason: "重新整理这张写入卡片。",
          },
          write.text,
          write.captureId || newId(),
        );
      } catch (error) {
        patchWrite(assistantId, {
          status: "error",
          error: (error as Error).message,
        });
      }
      return;
    }
    const processOperationId = newId();
    patchWrite(assistantId, {
      status: "preparing",
      processOperationId,
      applying: false,
      error: undefined,
    });
    try {
      await loadDraft(
        assistantId,
        write.draftId,
        processOperationId,
        !!state.ai?.configured && !!state.ai?.allowed,
      );
    } catch (error) {
      patchWrite(assistantId, {
        status: "error",
        error: (error as Error).message,
      });
    }
  }

  async function stash(raw?: string) {
    if (stashBusy) return;
    const fallback = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.text;
    const text = cleanText(raw ?? question) || cleanText(fallback);
    if (!text) {
      const now = timestamp();
      setMessages((current) =>
        [
          ...current,
          {
            id: newId(),
            role: "assistant" as const,
            createdAt: now,
            answer: {
              intent: "howto" as const,
              title: "想先存哪一句？",
              body: "在下面的输入框写一句，再点「先存着」。原话和记录时间会一起保留。",
            },
          },
        ].slice(-40),
      );
      return;
    }
    setStashBusy(true);
    try {
      const form = new FormData();
      stashCaptureId.current ||= newId();
      form.set("captureId", stashCaptureId.current);
      form.set("text", text);
      form.set("target", "auto");
      form.set("capturedAt", new Date().toISOString());
      form.set("timezone", timezone);
      form.set("inputMethod", "text");
      const response = await fetch("/api/capture", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "未能保存原话");
      stashCaptureId.current = null;
      setQuestion("");
      const now = timestamp();
      setMessages((current) =>
        [
          ...current,
          {
            id: newId(),
            role: "assistant" as const,
            createdAt: now,
            answer: {
              intent: "howto" as const,
              title: "已经先存着",
              body: `原话和记录时间都保留了，稍后可以继续整理。\n\n“${text}”`,
              references: [
                { type: "page" as const, page: "drafts", label: "查看待整理" },
              ],
              caution: "只保存了原话，还没有生成或确认任何账目。",
            },
          },
        ].slice(-40),
      );
    } catch (error) {
      const now = timestamp();
      setMessages((current) =>
        [
          ...current,
          {
            id: newId(),
            role: "assistant" as const,
            createdAt: now,
            answer: {
              intent: "unknown" as const,
              title: "这句话还没存上",
              body: "原文还在输入框里。可以稍后重试，或换到待整理页面手动记录。",
              caution: (error as Error).message,
              empty: true,
            },
          },
        ].slice(-40),
      );
    } finally {
      setStashBusy(false);
    }
  }

  function ask(raw?: string) {
    const text = cleanText(raw ?? question);
    if (!text) return;
    const frozen: AssistantContext = contextEnabled
      ? { ...context }
      : {
          ...context,
          page: "",
          listId: null,
          listName: null,
        };
    const plan = assistantWritePlan(text, state, frozen);
    const contextLabel = contextEnabled ? assistantContextLabel(frozen) : "";
    const now = timestamp();
    if (plan) {
      const assistantId = newId();
      const writeText = resolveWriteText(text, plan);
      const captureId = newId();
      setMessages((current) =>
        [
          ...current,
          {
            id: newId(),
            role: "user" as const,
            createdAt: now,
            text,
            contextLabel,
          },
          {
            id: assistantId,
            role: "assistant" as const,
            createdAt: now + 1,
            write: {
              status: "preparing" as const,
              captureId,
              processOperationId: newId(),
              operationId: newId(),
              text: writeText,
              target: plan.target,
              selected: [],
              appliedIndexes: [],
              saved: [],
            },
          },
        ].slice(-40),
      );
      void createWrite(assistantId, plan, writeText, captureId);
    } else {
      const local = answerAssistant(text, state, frozen);
      const assistantId = newId();
      const needsAi =
        local.intent === "unknown" &&
        !!state.ai?.configured &&
        !!state.ai?.allowed;
      setMessages((current) =>
        [
          ...current,
          {
            id: newId(),
            role: "user" as const,
            createdAt: now,
            text,
            contextLabel,
          },
          {
            id: assistantId,
            role: "assistant" as const,
            createdAt: now + 1,
            answer: needsAi
              ? {
                  intent: "unknown" as const,
                  title: "让我想想…",
                  body: "这句话我先试着按你的账页查了，没对上；正在问 AI…",
                  empty: true,
                }
              : local,
          },
        ].slice(-40),
      );
      if (needsAi) {
        const history = [...messages]
          .slice(-10)
          .filter(
            (message) =>
              message.role === "user" ||
              (message.role === "assistant" &&
                (message.text || message.answer?.body) &&
                !message.write),
          )
          .map((message) => ({
            role: message.role,
            text: message.text || message.answer?.body || "",
          }))
          .filter((message) => message.text);
        setChatBusy(true);
        void api("chat", {
          question: text,
          history,
          page: frozen.page,
          listName: frozen.listName || "",
        })
          .then((data) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      answer: {
                        intent: "unknown" as const,
                        title: "小数管家",
                        body: data.reply,
                        empty: true,
                        caution: data.needsCapture
                          ? "这句话可以记下来，点上面的建议继续。"
                          : undefined,
                      },
                    }
                  : message,
              ),
            );
          })
          .catch((error) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      answer: {
                        intent: "unknown" as const,
                        title: "AI 暂时没回应",
                        body:
                          "（本地查询已经试过，没对上账页。）" +
                          (error instanceof Error ? error.message : ""),
                        empty: true,
                      },
                    }
                  : message,
              ),
            );
          })
          .finally(() => setChatBusy(false));
      }
    }
    setQuestion("");
    setOpen(true);
    if (!isMobile) window.setTimeout(() => inputRef.current?.focus(), 20);
  }

  function clearConversation() {
    if (!messages.length) {
      setQuestion("");
      return;
    }
    if (!window.confirm("清空当前对话？已保存的账单、物品和清单不受影响。"))
      return;
    setMessages([]);
    setQuestion("");
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }

  function openReference(reference: AssistantReference) {
    onReference(reference);
    if (isMobile) setOpen(false);
  }

  function runAction(action: AssistantAction) {
    onCapture(action.target, action.text || undefined);
  }

  function openAssistant() {
    setOpen(true);
    if (!isMobile) window.setTimeout(() => inputRef.current?.focus(), 20);
  }

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (isMobile || event.button !== 0 || dragRef.current) return;
    if (
      (event.target as HTMLElement).closest(
        "button, a, input, textarea, select, summary, [contenteditable='true']",
      )
    ) {
      return;
    }
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const dx = startX - positionRef.current.x;
    const dy = startY - positionRef.current.y;
    dragRef.current = {
      pointerId: event.pointerId,
      dx,
      dy,
    };
    setDragging(true);
    setDockHint(null);

    let moved = false;
    const onMove = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      pointer.preventDefault();
      if (
        Math.abs(pointer.clientX - startX) +
          Math.abs(pointer.clientY - startY) >
        4
      ) {
        moved = true;
      }
      const next = clampPosition({
        x: pointer.clientX - dx,
        y: pointer.clientY - dy,
      });
      positionRef.current = next;
      setPosition(next);
      setDockHint(dockSideAt(next));
    };
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dragCleanupRef.current = null;
      dragRef.current = null;
      setDragging(false);
      setDockHint(null);
      if (!moved) return;
      const side = dockSideAt(positionRef.current);
      if (!side) {
        setDock(null);
        if (dock) setLauncherPosition(null);
        return;
      }
      setDock({
        side,
        y: clampDockY(positionRef.current.y + 44),
      });
      setOpen(false);
    };
    const onUp = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      finish();
    };
    const onCancel = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      finish();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dragRef.current = null;
      setDragging(false);
      setDockHint(null);
    };
  }

  function startLauncherDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (isMobile || event.button !== 0 || launcherDragCleanupRef.current)
      return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const dx = startX - rect.left;
    const dy = startY - rect.top;
    let moved = false;
    setLauncherDragging(true);

    const onMove = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      pointer.preventDefault();
      if (
        Math.abs(pointer.clientX - startX) +
          Math.abs(pointer.clientY - startY) >
        4
      ) {
        moved = true;
      }
      if (!moved) return;
      const next = clampLauncherPosition({
        x: pointer.clientX - dx,
        y: pointer.clientY - dy,
      });
      launcherPositionRef.current = next;
      setLauncherPosition(next);
    };
    const finish = (openIfUnmoved: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      launcherDragCleanupRef.current = null;
      setLauncherDragging(false);
      suppressLauncherClick.current = true;
      window.setTimeout(() => {
        suppressLauncherClick.current = false;
      }, 0);
      if (!moved) {
        if (openIfUnmoved) openAssistant();
        return;
      }
      const current = launcherPositionRef.current;
      if (!current) return;
      const side = dockSideAt(current, rect.width || 156);
      if (!side) {
        setDock(null);
        return;
      }
      setDock({
        side,
        y: clampDockY(current.y + (rect.height || 52) / 2),
      });
    };
    const onUp = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      finish(true);
    };
    const onCancel = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      finish(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    launcherDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      setLauncherDragging(false);
    };
  }

  return (
    <div className="assistant-root">
      {!hidden && !open && dock && !isMobile && (
        <button
          className={`assistant-dock-tab is-${dock.side}`}
          style={{ top: dock.y }}
          onClick={openAssistant}
          aria-label="展开小数管家"
          title="展开小数管家"
        >
          <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
          <span aria-hidden="true">管</span>
        </button>
      )}
      {!hidden && !open && !dock && (
        <button
          ref={launcherRef}
          className={`assistant-launcher ${launcherDragging ? "is-dragging" : ""}`}
          style={
            isMobile || !launcherPosition
              ? undefined
              : {
                  left: launcherPosition.x,
                  top: launcherPosition.y,
                  right: "auto",
                  bottom: "auto",
                }
          }
          onPointerDown={startLauncherDrag}
          onDragStart={(event) => event.preventDefault()}
          onClick={() => {
            if (suppressLauncherClick.current) {
              suppressLauncherClick.current = false;
              return;
            }
            openAssistant();
          }}
          aria-label="打开小数管家"
          title="点击打开；按住可拖到边缘"
        >
          <span className="assistant-launcher-mark" aria-hidden="true">
            <Sparkles size={17} strokeWidth={1.8} />
            <i />
          </span>
          <span className="assistant-launcher-copy">
            <b>问小数管家</b>
            <small>查账页，也能先记一句</small>
          </span>
        </button>
      )}
      {open && (
        <>
          {dragging && dockHint && (
            <div
              className={`assistant-dock-guide is-${dockHint}`}
              style={{ top: position.y + 32 }}
              aria-hidden="true"
            />
          )}
          <div
            className="assistant-scrim"
            aria-hidden="true"
            onPointerDown={() => setOpen(false)}
          />
          <section
            ref={panelRef}
            className={`assistant-panel ${dragging ? "is-dragging" : ""}`}
            style={isMobile ? undefined : { left: position.x, top: position.y }}
            role="dialog"
            aria-label="小数管家"
            aria-modal={isMobile ? "true" : undefined}
            tabIndex={-1}
          >
            <header
              className="assistant-head"
              onPointerDown={startDrag}
            >
              <span
                className="assistant-drag-grip"
                title="按住标题栏拖动"
                aria-hidden="true"
              >
                <GripVertical size={14} strokeWidth={1.8} />
              </span>
              <div className="assistant-title">
                <span className="assistant-stamp" aria-hidden="true">
                  管
                </span>
                <div>
                  <h2>小数管家</h2>
                  <p>查账页，也能整理一句话</p>
                </div>
              </div>
              <div className="assistant-head-actions">
                <button
                  className="assistant-icon-button"
                  onClick={clearConversation}
                  aria-label="新对话"
                  title="新对话"
                >
                  <MessageSquarePlus size={17} strokeWidth={1.7} />
                </button>
                <button
                  className="assistant-icon-button"
                  onClick={() => setHidden((value) => !value)}
                  aria-label={hidden ? "恢复悬浮入口" : "隐藏悬浮入口"}
                  title={hidden ? "恢复悬浮入口" : "隐藏悬浮入口"}
                >
                  {hidden ? (
                    <Eye size={17} strokeWidth={1.7} />
                  ) : (
                    <EyeOff size={17} strokeWidth={1.7} />
                  )}
                </button>
                <button
                  className="assistant-icon-button"
                  onClick={() => setOpen(false)}
                  aria-label="收起小数管家"
                  title="收起"
                >
                  <X size={18} strokeWidth={1.7} />
                </button>
              </div>
            </header>
            <div className="assistant-context" onPointerDown={startDrag}>
              <span className="assistant-context-caption">当前</span>
              {contextEnabled ? (
                <span className="assistant-context-chip">
                  {assistantContextLabel(context)}
                  <button
                    onClick={() => setContextEnabled(false)}
                    aria-label="不使用当前页面上下文"
                    title="不使用当前页面"
                  >
                    <X size={11} />
                  </button>
                </span>
              ) : (
                <button
                  className="assistant-context-enable"
                  onClick={() => setContextEnabled(true)}
                >
                  使用当前页面上下文
                </button>
              )}
              <small>
                {contextEnabled ? "发送时冻结这次页面身份" : "只按问题本身查找"}
              </small>
              {hidden && <em>悬浮入口已隐藏</em>}
            </div>
            <div
              className="assistant-thread"
              ref={threadRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {!messages.length ? (
                <div className="assistant-welcome">
                  <p className="assistant-eyebrow">账页边上的小数管家</p>
                  <h3>
                    账页我翻过了。
                    <br />
                    想先看哪一件？
                  </h3>
                  <ScratchUnderline />
                  <p className="assistant-welcome-note">
                    已经保存的记录可以查；要写入时会先出候选卡，点确认才保存。
                  </p>
                  <SuggestionList state={state} context={context} ask={ask} />
                </div>
              ) : (
                messages.map((message) =>
                  message.role === "user" ? (
                    <div className="assistant-user-message" key={message.id}>
                      <div className="assistant-user-bubble">
                        <p>{message.text}</p>
                      </div>
                      {message.contextLabel && (
                        <small>当时页面：{message.contextLabel}</small>
                      )}
                    </div>
                  ) : message.write ? (
                    <WriteView
                      key={message.id}
                      message={message}
                      state={state}
                      onReference={openReference}
                      onPatch={(patch) => patchWrite(message.id, patch)}
                      onApply={() => void applyWrite(message.id)}
                      onRetry={() => void retryWrite(message.id)}
                    />
                  ) : (
                    message.answer && (
                      <AnswerView
                        key={message.id}
                        answer={message.answer}
                        onReference={openReference}
                        onAction={runAction}
                        ask={ask}
                      />
                    )
                  ),
                )
              )}
            </div>
            <div className="assistant-composer">
              <form
                className="assistant-input"
                onSubmit={(event) => {
                  event.preventDefault();
                  ask();
                }}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  maxLength={500}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !(event.nativeEvent as any).isComposing
                    ) {
                      event.preventDefault();
                      ask();
                    }
                  }}
                  placeholder="问花销、物品位置，或说「把护照改到床头柜」…"
                  aria-label="问小数管家"
                />
                <button
                  type="submit"
                  className="assistant-send"
                  aria-label="发送问题"
                  disabled={!question.trim() || chatBusy}
                >
                  {chatBusy ? <Busy /> : <ChevronRight size={18} strokeWidth={2} />}
                </button>
              </form>
              <div className="assistant-composer-tools">
                <button
                  disabled={stashBusy}
                  onClick={() => void stash()}
                >
                  <Inbox size={14} aria-hidden="true" />
                  {stashBusy ? "保存中…" : "先存着"}
                </button>
                <button onClick={() => onCapture("ledger")}>
                  <Plus size={14} aria-hidden="true" />
                  记一笔
                </button>
                <button onClick={() => onCapture("itemUpdate")}>
                  <Box size={14} aria-hidden="true" />
                  改物品
                </button>
                <button onClick={() => onCapture("reminder")}>
                  <Bell size={14} aria-hidden="true" />
                  加提醒
                </button>
                <span>写入先预览 · 对话留在这台设备</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
