"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChartNoAxesCombined,
  ShoppingBasket,
  Package,
  PiggyBank,
  Inbox,
  Settings,
  Plus,
  Sparkles,
  LogOut,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  Share2,
} from "lucide-react";
import {
  api,
  Busy,
  Editor,
  Empty,
  Modal,
  Jar,
  FieldInput,
  fieldsFor,
} from "./ui";
import Dashboard from "./dashboard";
import { Capture, DraftInbox } from "./capture";
import {
  entryTypes,
  heldDays,
  localDate,
  money,
  savingTypes,
  shoppingStatuses,
  sourceLabels,
  reviewStates,
} from "@/lib/domain";

const navigation = [
  { key: "dashboard", name: "统计", icon: ChartNoAxesCombined },
  { key: "ledger", name: "账本", icon: BookOpen },
  { key: "shopping", name: "购物清单", icon: ShoppingBasket },
  { key: "items", name: "物品成本", icon: Package },
  { key: "savings", name: "省钱罐", icon: PiggyBank },
  { key: "drafts", name: "待整理", icon: Inbox },
  { key: "settings", name: "设置", icon: Settings },
];
const pageCopy: Record<string, [string, string]> = {
  dashboard: ["日常，慢慢有数。", "记下每一笔，也照顾每一个小愿望。"],
  ledger: ["一笔一笔，都是生活。", "收入、支出与退款，清清楚楚。"],
  shopping: ["想买的，先放这里。", "留一点时间，把需要和喜欢想明白。"],
  items: ["好东西，陪你久一点。", "看看每一天、每一次使用的成本。"],
  savings: ["省下来的，也值得记。", "优惠、不买与降级，分开记录每一种决定。"],
  drafts: ["先记下来，不着急。", "原话和时间都在，等你有空再整理。"],
  settings: ["按你的习惯来。", "账户、分类和 AI 整理，都在这里。"],
};

export default function Workspace() {
  const [state, setState] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("dashboard"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [more, setMore] = useState(false);
  const [editor, setEditor] = useState<any>(null),
    [capture, setCapture] = useState<any>(null),
    [batch, setBatch] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [category, setCategory] = useState("all"),
    [listId, setListId] = useState<string | null>(null),
    [showArchived, setShowArchived] = useState(false),
    [pageIndex, setPageIndex] = useState(0),
    [conversion, setConversion] = useState<any>(null),
    [reviewItem, setReviewItem] = useState<any>(null),
    [usageItem, setUsageItem] = useState<any>(null),
    [resolveSaving, setResolveSaving] = useState<any>(null);
  const [dates, setDates] = useState({
    start: `${localDate().slice(0, 7)}-01`,
    end: localDate(),
  });
  const refresh = useCallback(async () => {
    try {
      const result = await api("state");
      setState(result);
      setError("");
    } catch (e) {
      if ((e as Error).message === "请先登录") setState(null);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(key: string) {
    setPage(key);
    setSelection([]);
    setQuery("");
    setType("all");
    setCategory("all");
    setPageIndex(0);
    setMore(false);
  }
  function toggle(id: string) {
    setSelection((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  async function mutate(body: any) {
    const result = await api("mutate", {
      operationId: crypto.randomUUID(),
      ...body,
    });
    await refresh();
    return result;
  }
  async function run(action: () => Promise<unknown>, success = "已保存") {
    try {
      await action();
      setToast(success);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="boot">
        <BookOpen size={40} strokeWidth={1.2} />
        <Busy text="翻开账本…" />
      </div>
    );
  if (!state) return <Auth done={refresh} error={error} />;
  const entity = page === "shopping" ? (listId ? "shopping" : "lists") : page;
  let records: any[] = (state[entity] || []).filter(
    (r: any) =>
      !query ||
      [r.title, r.name, r.note, r.reason].some((t) => t?.includes(query)),
  );
  if (page === "ledger")
    records = records.filter(
      (r) =>
        r.date >= dates.start &&
        r.date <= dates.end &&
        (type === "all" || r.type === type) &&
        (category === "all" ||
          r.categoryId === (category === "none" ? null : category)),
    );
  if (page === "savings")
    records = records.filter(
      (r) =>
        (showArchived || r.status !== "revoked") &&
        r.date >= dates.start &&
        r.date <= dates.end &&
        (type === "all" || r.type === type) &&
        (category === "all" || r.source === category),
    );
  if (page === "shopping")
    records = listId
      ? records.filter((r) => r.listId === listId)
      : records.filter((r) => showArchived || !r.archived);
  const visible = records.slice(pageIndex * 20, pageIndex * 20 + 20);
  const pending = state.drafts.filter((d: any) =>
    ["pending", "ready", "failed"].includes(d.state),
  ).length;
  const selectedRecords = (state[entity] || []).filter((r: any) =>
    selection.includes(r.id),
  );
  const heading = pageCopy[page];
  const list = state.lists.find((l: any) => l.id === listId);
  const bulkButton = selection.length > 0 && (
    <div className="batch-bar">
      <span>已选 {selection.length} 条</span>
      <button className="button secondary" onClick={() => setBatch(true)}>
        <Pencil size={14} />
        批量编辑 / 删除
      </button>
      <button className="text-button" onClick={() => setSelection([])}>
        取消选择
      </button>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="UCost 首页">
          <span className="brand-mark">
            <BookOpen size={25} strokeWidth={1.5} />
          </span>
          <span>
            UCost<small>日常有数</small>
          </span>
        </Link>
        <div className="sidebar-caption">我的生活账页</div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.key}
              className={page === n.key ? "active" : ""}
              onClick={() => navigate(n.key)}
            >
              <n.icon size={19} strokeWidth={1.6} />
              <span>{n.name}</span>
              {n.key === "drafts" && pending > 0 && <em>{pending}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <svg viewBox="0 0 100 55" aria-hidden="true">
            <path
              d="M5 40Q20 10 38 30T72 25M70 17L75 25L66 30M19 44Q50 53 82 43"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <p>
            认真生活，
            <br />
            也可以轻轻松松。
          </p>
        </div>
        <div className="user-box">
          <span className="avatar">{state.user.username.slice(0, 1)}</span>
          <span>
            {state.user.username}
            <small>本地账本</small>
          </span>
          <button
            className="icon-button"
            aria-label="退出登录"
            onClick={() =>
              run(async () => {
                await api("auth/logout", {});
                setState(null);
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="page-header">
          <div>
            <p className="page-context">
              {new Intl.DateTimeFormat("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
                timeZone: state.user.timezone,
              }).format(new Date())}
            </p>
            <h1>{heading[0]}</h1>
            <p>{heading[1]}</p>
          </div>
          <button
            className="button quick-record"
            onClick={() =>
              setCapture({
                target:
                  page === "shopping"
                    ? "shopping"
                    : page === "items"
                      ? "items"
                      : page === "savings"
                        ? "savings"
                        : "ledger",
                listId,
              })
            }
          >
            <Plus size={18} />
            快速记录
          </button>
        </header>
        {pending > 0 && page === "dashboard" && (
          <button className="inbox-strip" onClick={() => navigate("drafts")}>
            <Inbox size={17} />
            <span>
              口袋里有 <b>{pending}</b> 条记录等你整理
            </span>
            <ChevronRight size={16} />
          </button>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              收起
            </button>
          </div>
        )}
        {page === "dashboard" ? (
          <Dashboard
            state={state}
            openPage={navigate}
            refresh={refresh}
            dates={dates}
            setDates={setDates}
            openLedger={(id?: string | null) => {
              navigate("ledger");
              if (id !== undefined) setCategory(id || "none");
            }}
          />
        ) : page === "settings" ? (
          <SettingsPage
            state={state}
            mutate={mutate}
            edit={(entity: string, record?: any) =>
              setEditor({ entity, record })
            }
            notify={setToast}
          />
        ) : page === "drafts" ? (
          <>
            <DraftInbox
              state={state}
              refresh={refresh}
              notify={setToast}
              selection={selection}
              toggle={toggle}
              openCapture={() => setCapture({ target: "ledger" })}
              openBatch={() => setBatch(true)}
            />
          </>
        ) : (
          <>
            {page === "savings" && (
              <div className="saving-overview">
                <Jar small />
                <div>
                  <small>当前日期范围 · 有效记录</small>
                  <strong>
                    ¥
                    {money(
                      state.savings
                        .filter(
                          (s: any) =>
                            s.status === "valid" &&
                            s.date >= dates.start &&
                            s.date <= dates.end,
                        )
                        .reduce((a: number, s: any) => a + s.amount, 0),
                    )}
                  </strong>
                  <span>是省下的决定，不是新增的收入。</span>
                </div>
                <div className="saving-mini-splits">
                  {Object.entries(savingTypes).map(([key, label]) => (
                    <div key={key}>
                      <span>{label}</span>
                      <b>
                        ¥
                        {money(
                          state.savings
                            .filter(
                              (s: any) =>
                                s.status === "valid" &&
                                s.type === key &&
                                s.date >= dates.start &&
                                s.date <= dates.end,
                            )
                            .reduce((a: number, s: any) => a + s.amount, 0),
                        )}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {page === "shopping" && listId && (
              <div className="list-context">
                <button
                  className="text-button"
                  onClick={() => {
                    setListId(null);
                    setSelection([]);
                    setPageIndex(0);
                  }}
                >
                  所有清单
                </button>
                <ChevronRight size={16} />
                <h2>{list?.name || "清单"}</h2>
                {list?.archived && <span className="pill">已归档</span>}
                <p>{list?.description}</p>
              </div>
            )}
            <div className="filter-bar">
              <input
                aria-label="搜索记录"
                placeholder="搜索名称或备注"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelection([]);
                  setPageIndex(0);
                }}
              />
              {["ledger", "savings"].includes(page) && (
                <>
                  <input
                    aria-label="开始日期"
                    type="date"
                    value={dates.start}
                    onChange={(e) => {
                      setDates({ ...dates, start: e.target.value });
                      setSelection([]);
                    }}
                  />
                  <input
                    aria-label="结束日期"
                    type="date"
                    value={dates.end}
                    onChange={(e) => {
                      setDates({ ...dates, end: e.target.value });
                      setSelection([]);
                    }}
                  />
                  <select
                    aria-label="类型筛选"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setSelection([]);
                      setPageIndex(0);
                    }}
                  >
                    <option value="all">全部类型</option>
                    {Object.entries(
                      page === "ledger" ? entryTypes : savingTypes,
                    ).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="分类或来源筛选"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSelection([]);
                    }}
                  >
                    <option value="all">
                      {page === "ledger" ? "全部分类" : "全部来源"}
                    </option>
                    {page === "ledger" ? (
                      <>
                        <option value="none">未分类</option>
                        {state.categories.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </>
                    ) : (
                      Object.entries(sourceLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))
                    )}
                  </select>
                </>
              )}
              {page === "savings" && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  显示已撤销
                </label>
              )}
              {page === "shopping" && !listId && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  含已归档
                </label>
              )}
              <button
                className="button secondary"
                onClick={() =>
                  setEditor({
                    entity,
                    record: entity === "shopping" ? { listId } : undefined,
                  })
                }
              >
                <Plus size={16} />
                {entity === "lists" ? "新建清单" : "手动添加"}
              </button>
              {entity === "shopping" && !list?.archived && (
                <button
                  className="button"
                  onClick={() => setCapture({ target: "shopping", listId })}
                >
                  <MicIcon />
                  口述 / AI 添加
                </button>
              )}
            </div>
            {bulkButton}
            <div className="panel records-panel">
              <div className="record-header">
                <label className="check-field">
                  <input
                    aria-label="全选当前页"
                    type="checkbox"
                    checked={
                      visible.length > 0 &&
                      visible.every((r: any) => selection.includes(r.id))
                    }
                    onChange={(e) =>
                      setSelection(
                        e.target.checked
                          ? [
                              ...new Set([
                                ...selection,
                                ...visible.map((r: any) => r.id),
                              ]),
                            ]
                          : selection.filter(
                              (id) => !visible.some((r: any) => r.id === id),
                            ),
                      )
                    }
                  />
                  全选当前页
                </label>
                <span>{records.length} 条记录</span>
              </div>
              {visible.length ? (
                visible.map((record: any) => (
                  <div className="record-row" key={record.id}>
                    <input
                      aria-label={`选择${record.title || record.name}`}
                      type="checkbox"
                      checked={selection.includes(record.id)}
                      onChange={() => toggle(record.id)}
                    />
                    <RecordBody
                      entity={entity}
                      record={record}
                      state={state}
                      openList={() => {
                        setListId(record.id);
                        setSelection([]);
                        setPageIndex(0);
                      }}
                    />
                    <div className="row-actions">
                      {entity === "shopping" &&
                        ["considering", "planned"].includes(record.status) && (
                          <>
                            <button
                              className="text-button"
                              onClick={() =>
                                setConversion({ ...record, mode: "buy" })
                              }
                            >
                              买到了
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                setConversion({ ...record, mode: "skip" })
                              }
                            >
                              不买了
                            </button>
                            <button
                              className="icon-button"
                              title="发起评议"
                              aria-label="发起评议"
                              onClick={() => setReviewItem(record)}
                            >
                              <Share2 size={17} />
                            </button>
                          </>
                        )}
                      {entity === "items" && (
                        <>
                          <button
                            className="button secondary compact"
                            onClick={() =>
                              run(
                                () =>
                                  mutate({
                                    action: "usage",
                                    id: record.id,
                                    count: 1,
                                    date: localDate(),
                                  }),
                                "已记一次使用",
                              )
                            }
                            disabled={!!record.retiredDate}
                          >
                            用了一次
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setUsageItem(record)}
                          >
                            使用记录
                          </button>
                        </>
                      )}
                      {entity === "savings" &&
                        record.source === "automatic" &&
                        record.status === "pending" && (
                          <button
                            className="text-button"
                            onClick={() => setResolveSaving(record)}
                          >
                            核对保留优惠
                          </button>
                        )}
                      {entity === "savings" &&
                        record.source === "automatic" &&
                        record.suppressed && (
                          <button
                            className="text-button"
                            onClick={() =>
                              run(
                                () =>
                                  mutate({
                                    action: "restoreDiscount",
                                    id: record.id,
                                    version: record.version,
                                  }),
                                "已重新开启自动优惠",
                              )
                            }
                          >
                            重新开启
                          </button>
                        )}
                      {entity === "savings" && record.ledgerId && (
                        <button
                          className="text-button"
                          onClick={() => {
                            const entry = state.ledger.find(
                              (e: any) => e.id === record.ledgerId,
                            );
                            if (entry)
                              setEditor({ entity: "ledger", record: entry });
                          }}
                        >
                          原账单
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label="编辑"
                        onClick={() => setEditor({ entity, record })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="删除"
                        onClick={() => {
                          setSelection([record.id]);
                          setBatch(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title={
                    query
                      ? "没有找到匹配记录"
                      : entity === "lists"
                        ? "建一张自己的购物清单"
                        : "这一页还没有记录"
                  }
                  text="可以手动添加，也可以把一段话交给 AI 整理。"
                />
              )}
              <div className="pagination">
                <button
                  className="button secondary compact"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex(pageIndex - 1)}
                >
                  上一页
                </button>
                <span>
                  第 {pageIndex + 1} /{" "}
                  {Math.max(1, Math.ceil(records.length / 20))} 页
                </span>
                <button
                  className="button secondary compact"
                  disabled={(pageIndex + 1) * 20 >= records.length}
                  onClick={() => setPageIndex(pageIndex + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
            {page === "shopping" && state.reviews.length > 0 && (
              <section className="panel reviews-section">
                <h2>购物评议</h2>
                {state.reviews
                  .filter(
                    (r: any) =>
                      !listId ||
                      state.shopping.some(
                        (s: any) => s.listId === listId && s.id === r.itemId,
                      ),
                  )
                  .map((r: any) => (
                    <div className="review-row" key={r.id}>
                      <span>
                        <b>{r.title}</b>
                        <small>
                          {
                            state.votes.filter((v: any) => v.reviewId === r.id)
                              .length
                          }
                          /{r.targetCount} 人 ·{" "}
                          {r.rule === "all" ? "全员赞成" : "过半赞成"}
                        </small>
                      </span>
                      <span className="pill">{reviewStates[r.status]}</span>
                      <a
                        className="text-button"
                        href={`/review/${r.token}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开
                      </a>
                      <button
                        className="text-button"
                        onClick={() =>
                          run(async () => {
                            await navigator.clipboard.writeText(
                              `${location.origin}/review/${r.token}`,
                            );
                          }, "链接已复制（仅可访问本地服务的人可用）")
                        }
                      >
                        复制链接
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          run(
                            () =>
                              mutate({
                                action: "reviewUpdate",
                                id: r.id,
                                version: r.version,
                                mode: "reset",
                              }),
                            "旧链接已失效",
                          )
                        }
                      >
                        重置链接
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() =>
                          run(
                            () =>
                              mutate({
                                action: "reviewUpdate",
                                id: r.id,
                                version: r.version,
                                mode: "revoke",
                              }),
                            "评议已撤销",
                          )
                        }
                      >
                        撤销
                      </button>
                    </div>
                  ))}
              </section>
            )}
          </>
        )}
      </main>
      <nav className="mobile-nav">
        {navigation.slice(0, 3).map((n) => (
          <button
            key={n.key}
            className={page === n.key ? "active" : ""}
            onClick={() => navigate(n.key)}
          >
            <n.icon size={20} />
            {n.name}
          </button>
        ))}
        <button className={more ? "active" : ""} onClick={() => setMore(!more)}>
          <MoreHorizontal size={22} />
          更多
        </button>
      </nav>
      {more && (
        <div className="mobile-more">
          {navigation.slice(3).map((n) => (
            <button key={n.key} onClick={() => navigate(n.key)}>
              <n.icon size={18} />
              {n.name}
            </button>
          ))}
          <button
            onClick={() =>
              run(async () => {
                await api("auth/logout", {});
                setState(null);
              })
            }
          >
            <LogOut size={18} />
            退出登录
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {editor && (
        <Editor
          entity={editor.entity}
          record={editor.record}
          state={state}
          close={() => setEditor(null)}
          save={async (data) => {
            await mutate({
              action: "save",
              entity: editor.entity,
              id: editor.record?.id,
              version: editor.record?.version,
              data,
            });
            setToast("已保存");
          }}
        />
      )}
      {capture && (
        <Capture
          {...capture}
          state={state}
          close={() => setCapture(null)}
          refresh={refresh}
          notify={setToast}
        />
      )}
      {batch && (
        <BatchEditor
          entity={entity}
          records={selectedRecords}
          state={state}
          close={() => setBatch(false)}
          save={async (mode: string, records: any[]) => {
            await mutate({ action: "batch", entity, mode, records });
            setSelection([]);
            setToast(mode === "delete" ? "所选记录已处理" : "批量修改已保存");
          }}
        />
      )}
      {conversion && (
        <Convert
          item={conversion}
          state={state}
          close={() => setConversion(null)}
          save={async (data: any) => {
            await mutate({
              action: "convert",
              id: conversion.id,
              version: conversion.version,
              ...data,
            });
            setToast("购物决定已记录");
          }}
        />
      )}
      {reviewItem && (
        <CreateReview
          item={reviewItem}
          close={() => setReviewItem(null)}
          save={async (data: any) => {
            await mutate({
              action: "reviewCreate",
              itemId: reviewItem.id,
              data,
            });
            setToast("评议已创建，可复制分享链接");
          }}
        />
      )}
      {resolveSaving && (
        <ResolveSaving
          record={resolveSaving}
          close={() => setResolveSaving(null)}
          save={async (amount: number) => {
            await mutate({
              action: "resolveDiscount",
              id: resolveSaving.id,
              version: resolveSaving.version,
              amount,
            });
            setToast("保留优惠已核对");
          }}
        />
      )}
      {usageItem && (
        <Usage
          item={usageItem}
          state={state}
          close={() => setUsageItem(null)}
          mutate={mutate}
        />
      )}
    </div>
  );
}

function MicIcon() {
  return <Sparkles size={16} />;
}
function ResolveSaving({ record, close, save }: any) {
  const [amount, setAmount] = useState(record.amount),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="部分退款后，还保留多少优惠？" close={close}>
      <p className="hint">
        请根据退款明细核对，无法确定时可以先保留待核对。填 0
        表示优惠已全部退回。
      </p>
      <FieldInput
        field={{ key: "amount", label: "实际保留优惠（元）", type: "money" }}
        value={amount}
        set={setAmount}
      />
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          稍后核对
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await save(amount);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          确认金额
        </button>
      </footer>
    </Modal>
  );
}
function RecordBody({ entity, record: r, state, openList }: any) {
  if (entity === "ledger")
    return (
      <>
        <span
          className={`entry-symbol ${["income", "refund"].includes(r.type) ? "income" : ""}`}
        >
          {r.type === "income" ? "↙" : r.type === "refund" ? "↶" : "↗"}
        </span>
        <div className="record-content">
          <b>{r.title}</b>
          <small>
            {r.date} · {entryTypes[r.type as keyof typeof entryTypes]} ·{" "}
            {state.categories.find((c: any) => c.id === r.categoryId)?.name ||
              "未分类"}
            {r.note && ` · ${r.note}`}
          </small>
        </div>
        <div className="record-amount">
          <strong className={r.type === "income" ? "green" : ""}>
            {["income", "refund"].includes(r.type)
              ? "+"
              : r.type === "transfer"
                ? ""
                : "−"}
            ¥{money(r.amount)}
          </strong>
          {r.discount > 0 && <small>优惠 ¥{money(r.discount)}</small>}
        </div>
      </>
    );
  if (entity === "lists")
    return (
      <>
        <span className="entry-symbol">
          <ShoppingBasket size={20} />
        </span>
        <button className="record-content list-title" onClick={openList}>
          <b>
            {r.name}
            {r.archived && <span className="pill">已归档</span>}
          </b>
          <small>
            {state.shopping.filter((s: any) => s.listId === r.id).length} 件物品
            {r.description && ` · ${r.description}`}
          </small>
        </button>
        <button
          className="icon-button"
          aria-label="打开清单"
          onClick={openList}
        >
          <ChevronRight size={18} />
        </button>
      </>
    );
  if (entity === "shopping")
    return (
      <>
        <span className="entry-symbol">
          <ShoppingBasket size={19} />
        </span>
        <div className="record-content">
          <b>
            {r.name} <span className="pill">{shoppingStatuses[r.status]}</span>
          </b>
          <small>
            {r.quantity && `${r.quantity} · `}
            {r.reason || r.requirements || r.note || "还没有备注"}
          </small>
        </div>
        <div className="record-amount">
          <strong>
            {r.budget == null ? "预算未定" : `¥${money(r.budget)}`}
          </strong>
          <small>预计总预算</small>
        </div>
      </>
    );
  if (entity === "items") {
    const ledger = state.ledger.find((e: any) => e.id === r.ledgerId);
    const refunds = ledger
      ? state.ledger
          .filter((e: any) => e.refundOfId === ledger.id)
          .reduce((s: number, e: any) => s + e.amount, 0)
      : 0;
    const net = (ledger?.amount ?? r.price) - refunds - r.recovery;
    const days = heldDays(r.purchaseDate, r.retiredDate);
    const count = state.usage
      .filter((u: any) => u.itemId === r.id)
      .reduce((s: number, u: any) => s + u.count, 0);
    return (
      <>
        <span className="entry-symbol">
          <Package size={20} />
        </span>
        <div className="record-content">
          <b>
            {r.name}
            <span className="pill">{r.retiredDate ? "已退役" : "使用中"}</span>
          </b>
          <small>
            {r.purchaseDate} 购入 · 陪伴 {days} 天 · 使用 {count} 次
          </small>
          {r.note && <small>{r.note}</small>}
        </div>
        <div className="record-amount">
          <strong>
            {r.mode === "use"
              ? count
                ? `¥${money(net / count)}`
                : "还没开始使用"
              : `¥${money(net / days)}`}
            <small>{r.mode === "use" ? (count ? "/次" : "") : "/天"}</small>
          </strong>
          <small>
            {r.mode === "use"
              ? `¥${money(net / days)}/天`
              : count
                ? `¥${money(net / count)}/次`
                : "还没开始使用"}
          </small>
        </div>
      </>
    );
  }
  return (
    <>
      <span className="entry-symbol saving">
        <PiggyBank size={20} />
      </span>
      <div className="record-content">
        <b>
          {r.title}
          <span className={`pill ${r.status === "pending" ? "yellow" : ""}`}>
            {r.status === "revoked"
              ? "已撤销"
              : r.status === "pending"
                ? "待核对，不计入累计"
                : savingTypes[r.type as keyof typeof savingTypes]}
          </span>
        </b>
        <small>
          {r.date} · {sourceLabels[r.source]}
          {r.note && ` · ${r.note}`}
        </small>
      </div>
      <div className="record-amount">
        <strong className="green">¥{money(r.amount)}</strong>
        <small>省下了</small>
      </div>
    </>
  );
}

function Auth({ done, error: initialError }: any) {
  const [registerMode, setRegisterMode] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError || "");
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <span className="brand">
          <BookOpen size={28} /> UCost
        </span>
        <h1>
          把生活的账，
          <br />
          轻轻记下来。
        </h1>
        <p>
          花了多少，想买什么，
          <br />
          还有那些悄悄省下来的钱。
        </p>
        <Jar />
        <span className="hand-note">日常有数，心里有底。</span>
      </section>
      <section className="auth-form panel">
        <h2>{registerMode ? "翻开你的第一本账" : "欢迎回来"}</h2>
        <p>
          {registerMode
            ? "创建本地账号，数据保存在这台电脑的 SQLite 中。"
            : "登录，接着记下今天的生活。"}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`auth/${registerMode ? "register" : "login"}`, {
                username,
                password,
              });
              await done();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>用户名</span>
            <input
              autoComplete="username"
              value={username}
              required
              minLength={2}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete={registerMode ? "new-password" : "current-password"}
              minLength={8}
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="button" disabled={busy}>
            {busy ? <Busy /> : registerMode ? "创建账号" : "登录账本"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegisterMode(!registerMode);
            setError("");
          }}
        >
          {registerMode ? "已有账号，去登录" : "第一次来？创建账号"}
        </button>
        <small>不连接银行，不需要付费数据库。</small>
      </section>
    </main>
  );
}

function BatchEditor({ entity, records, state, save, close }: any) {
  const [mode, setMode] = useState("edit"),
    [data, setData] = useState<any[]>(records.map((r: any) => ({ ...r }))),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed: Record<string, string[]> = {
    ledger: ["date", "categoryId", "accountId", "amount", "note"],
    lists: ["name", "description", "archived"],
    shopping: ["listId", "name", "quantity", "budget", "note", "status"],
    savings: ["title", "date", "planned", "actual", "amount", "type", "note"],
    items: ["name", "note", "retiredDate"],
    drafts: [],
  };
  const [sharedField, setSharedField] = useState("note"),
    [sharedValue, setSharedValue] = useState<any>(""),
    [sharedIntent, setSharedIntent] = useState("keep");
  const firstField = records.length
    ? fieldsFor(entity === "drafts" ? "ledger" : entity, data[0], state).find(
        (f) => f.key === sharedField,
      )
    : null;
  const affectedItems =
    entity === "lists"
      ? state.shopping.filter((s: any) =>
          records.some((r: any) => r.id === s.listId),
        ).length
      : 0;
  return (
    <Modal title={`批量管理 ${records.length} 条记录`} close={close} wide>
      <div className="tabs">
        <button
          className={mode === "edit" ? "selected" : ""}
          onClick={() => setMode("edit")}
          disabled={entity === "drafts"}
        >
          编辑
        </button>
        <button
          className={mode === "delete" ? "selected" : ""}
          onClick={() => setMode("delete")}
        >
          删除
        </button>
      </div>
      {mode === "delete" ? (
        <div className="delete-summary">
          <h3>确认删除所选 {records.length} 条？</h3>
          {entity === "lists" && (
            <p>
              包含 {affectedItems}{" "}
              件清单物品；关联账单和物品档案保留，分享评议将撤销。
            </p>
          )}
          {entity === "ledger" && (
            <p>
              自动优惠省钱会撤销，物品购入金额保留快照；有退款的原支出必须先处理退款。
            </p>
          )}
          {entity === "savings" && (
            <p>
              不删除账单、不改变余额。删除自动优惠会记住你的选择，之后不会自动重新生成。
            </p>
          )}
          {entity === "drafts" && (
            <p>只删除草稿，不删除已经确认的正式记录。整理中的草稿不能删除。</p>
          )}
          <ul>
            {records.map((r: any) => (
              <li key={r.id}>
                {r.name || r.title || r.text?.slice(0, 50) || "图片草稿"}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="batch-common">
            <h3>统一修改指定字段</h3>
            <select
              value={sharedField}
              onChange={(e) => {
                setSharedField(e.target.value);
                setSharedValue(null);
              }}
            >
              {(allowed[entity] || []).map((k: string) => (
                <option key={k} value={k}>
                  {fieldsFor(entity, data[0], state).find((f) => f.key === k)
                    ?.label || k}
                </option>
              ))}
            </select>
            <select
              value={sharedIntent}
              onChange={(e) => setSharedIntent(e.target.value)}
            >
              <option value="keep">保持不变</option>
              <option value="set">设置为</option>
              <option value="clear">清空</option>
            </select>
            {sharedIntent === "set" && firstField && (
              <FieldInput
                field={firstField}
                value={sharedValue}
                set={setSharedValue}
              />
            )}
            <button
              className="button secondary"
              onClick={() => {
                if (sharedIntent === "keep") return;
                setData(
                  data.map((r: any) => ({
                    ...r,
                    [sharedField]:
                      sharedIntent === "clear" ? null : sharedValue,
                  })),
                );
              }}
            >
              应用到下方预览
            </button>
          </div>
          <p className="hint">
            下方逐行编辑。未改动的字段会保持原值；不适用的操作会阻止整批提交。
          </p>
          {data.map((record: any, i: number) => (
            <details className="batch-record" key={record.id}>
              <summary>{record.title || record.name}</summary>
              <div className="form-grid">
                {fieldsFor(entity, record, state)
                  .filter((f) => allowed[entity]?.includes(f.key))
                  .map((field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={record[field.key]}
                      set={(v) =>
                        setData(
                          data.map((r: any, j: number) =>
                            j === i ? { ...r, [field.key]: v } : r,
                          ),
                        )
                      }
                    />
                  ))}
              </div>
            </details>
          ))}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className={`button ${mode === "delete" ? "danger" : ""}`}
          disabled={
            busy ||
            !records.length ||
            (entity === "drafts" && mode !== "delete")
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const payload = records.map((r: any, i: number) => ({
                id: r.id,
                version: r.version,
                data: Object.fromEntries(
                  Object.entries(data[i]).filter(
                    ([k, v]) => allowed[entity]?.includes(k) && v !== r[k],
                  ),
                ),
              }));
              await save(mode, payload);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : mode === "delete" ? "确认删除" : "保存整批修改"}
        </button>
      </footer>
    </Modal>
  );
}

function Convert({ item, state, save, close }: any) {
  const skip = item.mode === "skip";
  const [data, setData] = useState<any>({
      mode: skip ? "skip" : "buy",
      date: localDate(),
      paid: item.budget,
      discount: 0,
      planned: item.budget,
      createLedger: !skip,
      createItem: false,
      createSaving: skip,
      accountId: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, v: any) => setData({ ...data, [key]: v });
  return (
    <Modal title={`${skip ? "不买了" : "买到了"} · ${item.name}`} close={close}>
      <div className="form-grid">
        <FieldInput
          field={{ key: "date", label: "日期", type: "date" }}
          value={data.date}
          set={(v) => set("date", v)}
        />
        {!skip && (
          <>
            <FieldInput
              field={{ key: "paid", label: "实际付款（元）", type: "money" }}
              value={data.paid}
              set={(v) => set("paid", v)}
            />
            <FieldInput
              field={{
                key: "discount",
                label: "真实优惠（元）",
                type: "money",
              }}
              value={data.discount}
              set={(v) => set("discount", v)}
            />
            <FieldInput
              field={{
                key: "accountId",
                label: "付款账户",
                type: "select",
                options: [
                  { value: "", label: "暂不指定" },
                  ...state.accounts.map((a: any) => ({
                    value: a.id,
                    label: a.name,
                  })),
                ],
              }}
              value={data.accountId}
              set={(v) => set("accountId", v)}
            />
          </>
        )}
        <FieldInput
          field={{ key: "planned", label: "原计划金额（元）", type: "money" }}
          value={data.planned}
          set={(v) => set("planned", v)}
        />
      </div>
      {!skip && (
        <>
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.createLedger}
              onChange={(e) => set("createLedger", e.target.checked)}
            />
            生成实际支出（优惠随账单自动入罐）
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.createItem}
              onChange={(e) => set("createItem", e.target.checked)}
            />
            建立物品档案
          </label>
        </>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={data.createSaving}
          onChange={(e) => set("createSaving", e.target.checked)}
        />
        {skip ? "记录不买省下的钱" : "这次是降级购买，记录扣除优惠后的降级差额"}
      </label>
      <div className="preview-note">
        {skip
          ? `不新增支出${data.createSaving ? `，省下 ¥${money(data.planned || 0)}` : ""}`
          : `实际支出 ¥${money(data.paid || 0)}；优惠 ¥${money(data.discount || 0)}${data.createSaving ? `；降级差额 ¥${money((data.planned || 0) - (data.paid || 0) - (data.discount || 0))}` : ""}`}
      </div>
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await save(data);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "确认这个决定"}
        </button>
      </footer>
    </Modal>
  );
}

function CreateReview({ item, save, close }: any) {
  const [data, setData] = useState({
      title: `帮我看看：${item.name}`,
      description: "",
      targetCount: 1,
      rule: "majority",
      visibility: "link",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="邀请大家帮忙看看" close={close}>
      <div className="form-grid">
        <FieldInput
          field={{ key: "title", label: "标题" }}
          value={data.title}
          set={(v) => setData({ ...data, title: v })}
        />
        <label className="field">
          <span>需要几人（1–20）</span>
          <input
            type="number"
            min={1}
            max={20}
            value={data.targetCount}
            onChange={(e) =>
              setData({ ...data, targetCount: Number(e.target.value) })
            }
          />
        </label>
        <FieldInput
          field={{
            key: "rule",
            label: "通过规则",
            type: "select",
            options: [
              { value: "majority", label: "严格过半赞成" },
              { value: "all", label: "全员赞成" },
            ],
          }}
          value={data.rule}
          set={(v) => setData({ ...data, rule: v })}
        />
        <FieldInput
          field={{
            key: "visibility",
            label: "可见范围",
            type: "select",
            options: [
              { value: "private", label: "仅自己" },
              { value: "link", label: "持链接可访问" },
              { value: "public", label: "公开访问" },
            ],
          }}
          value={data.visibility}
          set={(v) => setData({ ...data, visibility: v })}
        />
        <FieldInput
          field={{
            key: "description",
            label: "想请大家评价什么",
            type: "textarea",
          }}
          value={data.description}
          set={(v) => setData({ ...data, description: v })}
        />
      </div>
      <button
        className="text-button"
        disabled={busy || !data.description}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await api("polish", { text: data.description });
            setData({ ...data, description: result.text });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        AI 帮我整理说明
      </button>
      <p className="hint">
        分享内容：物品名、预算、购买理由和上方说明。私有备注、原话、订单截图均不会公开。链接仅对能访问这台电脑服务的人有效。
      </p>
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await save(data);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          创建评议
        </button>
      </footer>
    </Modal>
  );
}

function Usage({ item, state, close, mutate }: any) {
  const [count, setCount] = useState(1),
    [date, setDate] = useState(localDate()),
    [error, setError] = useState("");
  async function execute(body: any) {
    try {
      await mutate({ action: "usage", id: item.id, ...body });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={`${item.name} · 使用记录`} close={close}>
      <div className="filter-bar">
        <input
          aria-label="使用日期"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          aria-label="使用次数"
          type="number"
          min={1}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <button className="button" onClick={() => execute({ date, count })}>
          补录
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {state.usage
        .filter((u: any) => u.itemId === item.id)
        .map((u: any) => (
          <div className="split-row" key={u.id}>
            <span>
              {u.date} · {u.count} 次
            </span>
            <button
              className="text-button"
              onClick={() => execute({ undoId: u.id })}
            >
              撤销
            </button>
          </div>
        ))}
    </Modal>
  );
}

function SettingsPage({ state, mutate, edit, notify }: any) {
  const [autoBatch, setAutoBatch] = useState(state.user.autoBatch),
    [batchSize, setBatchSize] = useState(state.user.batchSize),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <h2>账户</h2>
          <button className="text-button" onClick={() => edit("accounts")}>
            添加账户
          </button>
        </div>
        {state.accounts.map((a: any) => (
          <div className="split-row" key={a.id}>
            <span>
              {a.name}
              {a.archived && "（已归档）"}
              <small>期初 ¥{money(a.opening)}</small>
            </span>
            <button
              className="icon-button"
              aria-label="编辑账户"
              onClick={() => edit("accounts", a)}
            >
              <Pencil size={16} />
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>分类</h2>
          <button className="text-button" onClick={() => edit("categories")}>
            添加分类
          </button>
        </div>
        <div className="category-chips">
          {state.categories.map((c: any) => (
            <button
              className="pill"
              key={c.id}
              onClick={() => edit("categories", c)}
            >
              {c.type === "income" ? "+ " : "− "}
              {c.name}
              {c.archived && "（归档）"}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>AI 整理</h2>
        <p className="hint">
          文本：{state.ai.textModel}
          <br />
          截图识别：{state.ai.visionModel}
          <br />
          {state.ai.configured
            ? "已读取本地服务端配置"
            : "未配置密钥，请编辑 .env 后重启"}
        </p>
        <label className="check-field">
          <input
            type="checkbox"
            checked={autoBatch}
            onChange={(e) => setAutoBatch(e.target.checked)}
          />
          累计未整理记录后自动整理
        </label>
        <label className="field">
          <span>触发条数（5–10）</span>
          <input
            type="number"
            min={5}
            max={10}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
          />
        </label>
        <div className="row-actions">
          <button
            className="button"
            onClick={async () => {
              try {
                await mutate({ action: "settings", autoBatch, batchSize });
                notify("整理偏好已保存");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            保存偏好
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("ai-test", {});
                notify("AI 文本连接成功");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Busy /> : "测试 AI 连接"}
          </button>
        </div>
        <p className="hint">
          仅在保存草稿且本地服务运行时触发；密钥不会发送到浏览器。
        </p>
        {error && <p className="error">{error}</p>}
      </section>
      <section className="panel">
        <h2>带走你的记录</h2>
        <p>导出当前用户的数据，便于核对和以后迁移。</p>
        <div className="row-actions">
          <a download className="button secondary" href="/api/export">
            导出 JSON
          </a>
          <a
            download
            className="button secondary"
            href="/api/export?format=csv"
          >
            账本 CSV
          </a>
        </div>
        <p className="hint">
          导出不含密码和密钥。完整备份请先停服务，再复制 data 与 uploads
          目录；恢复方法见 README。
        </p>
      </section>
    </div>
  );
}
