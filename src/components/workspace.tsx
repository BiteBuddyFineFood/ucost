"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChartNoAxesCombined,
  ShoppingBasket,
  Package,
  Archive,
  CalendarClock,
  Bell,
  Plane,
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
  Copy,
  Share2,
  Ticket,
  TicketCheck,
  Eye,
  EyeOff,
  KeyRound,
  UserRound,
  ArrowRight,
  SlidersHorizontal,
  Search,
  Ellipsis,
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
  CategoryMark,
} from "./ui";
import Dashboard from "./dashboard";
import {
  AllItemsModal,
  ExpiryPage,
  ItemEditor,
  ReminderCenter,
  ReminderEditor,
  StoragePage,
} from "./household";
import { ExchangePanel } from "./exchange";
import {
  GroupControls,
  GroupHeading,
  ListActions,
  PersonalAi,
  Classification,
  AiStatus,
} from "./enhancements";
import { Capture, DraftInbox, DraftSection } from "./capture";
import Assistant from "./assistant";
import { answerAssistant } from "@/lib/assistant";
import {
  navigationFor,
  navigationLabels,
  type NavigationKey,
} from "@/lib/navigation";
import {
  CollapsibleSection,
  useFoldPreference,
  useLayoutMode,
} from "./collapsible";
import { NavigationSettings } from "./navigation-settings";
import {
  entryTypes,
  heldDays,
  localDate,
  money,
  savingTypes,
  shoppingStatuses,
  sourceLabels,
  reviewStates,
  effectiveSaving,
  itemCostView,
} from "@/lib/domain";

const navigationIcons = {
  dashboard: ChartNoAxesCombined,
  ledger: BookOpen,
  shopping: ShoppingBasket,
  items: Package,
  storage: Archive,
  expiry: CalendarClock,
  savings: PiggyBank,
  reminders: Bell,
  drafts: Inbox,
  settings: Settings,
};
type PageKey = NavigationKey | "settings";
const navigation = [
  ...Object.entries(navigationIcons).map(([key, icon]) => ({
    key: key as PageKey,
    name: navigationLabels[key as NavigationKey] || "设置",
    icon,
  })),
];
const pageCopy: Record<string, [string, string]> = {
  dashboard: ["日常，慢慢有数。", "记下每一笔，也照顾每一个小愿望。"],
  ledger: ["一笔一笔，都是生活。", "收入、支出与退款，清清楚楚。"],
  shopping: ["想买的、要带的，都先放这里。", "购物记账，出行和日常准备各自清楚。"],
  items: ["好东西，陪你久一点。", "看看每一天、每一次使用的成本。"],
  storage: ["东西有归处，找起来不慌。", "按位置和箱子整理，不要求先有账单。"],
  expiry: ["先吃掉快到期的。", "到期当天仍算今天到期，不提前报过期。"],
  savings: ["省下来的，也值得记。", "优惠、不买与降级，分开记录每一种决定。"],
  reminders: ["该处理的事，放在眼前。", "只在网页内提醒，打开或回到页面时补查。"],
  drafts: ["先记下来，不着急。", "原话和时间都在，等你有空再整理。"],
  settings: ["按你的习惯来。", "账户、分类、邀请码和 AI 整理，都在这里。"],
};

export default function Workspace() {
  const [state, setState] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("dashboard"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [more, setMore] = useState(false),
    [assistantOpen, setAssistantOpen] = useState(false);
  const [editor, setEditor] = useState<any>(null),
    [capture, setCapture] = useState<any>(null),
    [batch, setBatch] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [category, setCategory] = useState("all"),
    [account, setAccount] = useState("all"),
    [listId, setListId] = useState<string | null>(null),
    [listKind, setListKind] = useState("all"),
    [showArchived, setShowArchived] = useState(false),
    [pageIndex, setPageIndex] = useState(0),
    [conversion, setConversion] = useState<any>(null),
    [purchaseEdit, setPurchaseEdit] = useState<any>(null),
    [purchaseRelink, setPurchaseRelink] = useState<any>(null),
    [purchaseUndo, setPurchaseUndo] = useState<any>(null),
    [purchaseReference, setPurchaseReference] = useState<any>(null),
    [reviewItem, setReviewItem] = useState<any>(null),
    [usageItem, setUsageItem] = useState<any>(null),
    [resolveSaving, setResolveSaving] = useState<any>(null),
    [itemEditor, setItemEditor] = useState<any>(null),
    [allItems, setAllItems] = useState(false),
    [copyListTarget, setCopyListTarget] = useState<any>(null),
    [listWizard, setListWizard] = useState(false),
    [reminderEditor, setReminderEditor] = useState<any>(null),
    [reminderData, setReminderData] = useState<any>({
      reminders: [],
      rules: [],
    });
  const [classification, setClassification] = useState(false),
    [fullGroup, setFullGroup] = useState<string | null>(null);
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
  const layoutMode = useLayoutMode();
  const [moreOpen, setMoreOpen] = useState(false);
  const userId = state?.user?.id || "guest";
  const [dates, setDates] = useState({
    start: `${localDate().slice(0, 7)}-01`,
    end: localDate(),
  });
  const navigationPrefs = useMemo(
    () => navigationFor(state?.user?.preferences),
    [state?.user?.preferences],
  );
  const layoutNavigation = navigationPrefs[layoutMode];
  const pageEntry = (key: PageKey) =>
    navigation.find((entry) => entry.key === key);
  const filterKey =
    page === "shopping" && !listId ? "shopping" : `${page}:${listId || ""}`;
  const filterFold = useFoldPreference(
    filterKey,
    layoutMode === "desktop",
    layoutMode,
    userId,
  );
  const actionsFold = useFoldPreference(
    `actions:${filterKey}`,
    layoutMode === "desktop",
    layoutMode,
    userId,
  );
  const savingFold = useFoldPreference(
    "savings-summary",
    false,
    layoutMode,
    userId,
  );
  const draftFold = useFoldPreference(
    `drafts:${filterKey}`,
    false,
    layoutMode,
    userId,
  );
  const listContextFold = useFoldPreference(
    "shopping-context",
    false,
    layoutMode,
    userId,
  );
  const listBudgetFold = useFoldPreference(
    `shopping-budget:${listId || ""}`,
    layoutMode === "desktop",
    layoutMode,
    userId,
  );
  const moreContainsPage =
    layoutNavigation.more.includes(page as NavigationKey) ||
    page === "settings" ||
    assistantOpen;
  useEffect(() => {
    if (moreContainsPage || assistantOpen) setMoreOpen(true);
  }, [moreContainsPage, assistantOpen]);
  const refresh = useCallback(async () => {
    try {
      const result = await api("state");
      setState(result);
      setError("");
      return result;
    } catch (e) {
      if ((e as Error).message === "请先登录") setState(null);
      else setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  const checkReminders = useCallback(async () => {
    try {
      const result = await api("mutate", { action: "reminderCheck" });
      setReminderData(result);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return { reminders: [], rules: [] };
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!userId) return;
    checkReminders();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkReminders();
    };
    const onFocus = () => checkReminders();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") checkReminders();
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [userId, checkReminders]);
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
    setAccount("all");
    setListKind("all");
    setPageIndex(0);
    setMore(false);
    setFullGroup(null);
  }
  function openAssistantReference(reference: any) {
    const closeOnMobile = () => {
      if (window.matchMedia("(max-width: 800px)").matches)
        setAssistantOpen(false);
    };
    if (reference.type === "item") {
      const record = state.items.find((item: any) => item.id === reference.id);
      if (record) setItemEditor({ record });
      setAssistantOpen(false);
      return;
    }
    if (reference.type === "list") {
      navigate("shopping");
      setListId(reference.id);
      closeOnMobile();
      return;
    }
    if (reference.type === "ledger") {
      if (reference.id) {
        const record = state.ledger.find(
          (entry: any) => entry.id === reference.id,
        );
        if (record) {
          setEditor({ entity: "ledger", record });
          setAssistantOpen(false);
          return;
        }
      }
      navigate("ledger");
      if (reference.start && reference.end)
        setDates({ start: reference.start, end: reference.end });
      closeOnMobile();
      return;
    }
    if (reference.type === "shopping") {
      const record = state.shopping.find(
        (item: any) => item.id === reference.id,
      );
      navigate("shopping");
      if (record?.listId) setListId(record.listId);
      closeOnMobile();
      return;
    }
    if (reference.type === "page") {
      navigate(reference.page);
      if (reference.page === "shopping") setListId(null);
      closeOnMobile();
      return;
    }
    if (reference.type === "reminders") {
      navigate("reminders");
      checkReminders();
      closeOnMobile();
    }
  }
  function openAssistantCapture(target: string, text?: string) {
    setAssistantOpen(false);
    setCapture({
      target,
      initialText: text,
      listId:
        target === "shopping" && page === "shopping" ? listId || undefined : undefined,
    });
  }
  function toggle(id: string) {
    setSelection((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  function openRecordEditor(record: any) {
    if (entity === "items") setItemEditor({ record });
    else setEditor({ entity, record });
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
        (account === "all" ||
          r.accountId === (account === "none" ? null : account) ||
          r.toAccountId === account) &&
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
      : records.filter(
          (r) =>
            (showArchived || !r.archived) &&
            (listKind === "all" || (r.kind || "shopping") === listKind),
        );
  if (page === "items")
    records = records.filter((r) => r.costEnabled !== false);
  if (fullGroup !== null && ["ledger", "savings"].includes(page))
    records = (state[entity] || []).filter(
      (r: any) => (r.groupId || "") === fullGroup,
    );
  const csvFilter = new URLSearchParams({
    format: "csv",
    entity: page,
    scope: "filtered",
  });
  if (fullGroup !== null) csvFilter.set("groupId", fullGroup || "none");
  else {
    csvFilter.set("start", dates.start);
    csvFilter.set("end", dates.end);
    if (query) csvFilter.set("q", query);
    if (type !== "all") csvFilter.set("type", type);
    if (category !== "all")
      csvFilter.set(page === "ledger" ? "categoryId" : "source", category);
    if (page === "ledger" && account !== "all")
      csvFilter.set("accountId", account);
    if (page === "savings" && !showArchived)
      csvFilter.set("hideRevoked", "true");
  }
  const grouped =
    ["ledger", "savings"].includes(page) &&
    state.user.preferences[`${page}View`] === "grouped";
  const groupIds = [...new Set<string>(records.map((r) => r.groupId || ""))];
  const visible = grouped
    ? groupIds
        .slice(pageIndex * 20, pageIndex * 20 + 20)
        .flatMap((id) =>
          records
            .filter((r) => (r.groupId || "") === id)
            .slice(0, groupLimits[`${entity}:${id}`] || 20),
        )
    : records.slice(pageIndex * 20, pageIndex * 20 + 20);
  const pageCount = grouped ? groupIds.length : records.length;
  const pending = state.drafts.filter((d: any) =>
    ["pending", "ready", "failed"].includes(d.state),
  ).length;
  const selectedRecords = (state[entity] || []).filter((r: any) =>
    selection.includes(r.id),
  );
  const isShoppingRecord = (record: any) =>
    state.lists.find((row: any) => row.id === record.listId)?.kind !==
    "travel" &&
    state.lists.find((row: any) => row.id === record.listId)?.kind !==
      "normal";
  const heading = pageCopy[page];
  const list = state.lists.find((l: any) => l.id === listId);
  const desktopPageName =
    page === "shopping" && list ? list.name : heading?.[0];
  const mobilePageName =
    page === "shopping" && list ? list.name : pageEntry(page as PageKey)?.name || heading?.[0];
  const primaryAction =
    page === "shopping" && !listId
      ? {
          label: "新建清单",
          run: () => setEditor({ entity: "lists" }),
        }
      : page === "shopping" && listId
        ? {
            label: "添加物品",
            run: () => setCapture({ target: "shopping", listId }),
          }
        : {
            label: "快速记录",
            run: () =>
              setCapture({
                target:
                  page === "shopping"
                    ? "shopping"
                    : ["items", "storage", "expiry"].includes(page)
                      ? "items"
                      : page === "savings"
                        ? "savings"
                        : "ledger",
                listId,
              }),
          };
  const filterCategoryLabel =
    category === "all"
      ? ""
      : page === "savings"
        ? sourceLabels[category] || category
        : category === "none"
          ? "未分类"
          : state.categories.find((c: any) => c.id === category)?.name || category;
  const filterConditions = [
    query,
    page === "ledger" && type !== "all",
    page === "ledger" && category !== "all",
    page === "ledger" && account !== "all",
    page === "savings" && type !== "all",
    page === "savings" && category !== "all",
    page === "shopping" && !listId && listKind !== "all",
    ["ledger", "savings"].includes(page) &&
      (dates.start !== `${localDate().slice(0, 7)}-01` ||
        dates.end !== localDate()),
    page === "savings" && showArchived,
    page === "shopping" && !listId && showArchived,
  ].filter(Boolean).length;
  const filterSummary = [
    query && `“${query}”`,
    ["ledger", "savings"].includes(page) &&
      (dates.start === `${localDate().slice(0, 7)}-01` &&
      dates.end === localDate()
        ? "本月"
        : `${dates.start} 至 ${dates.end}`),
    page === "shopping" &&
      !listId &&
      ({
        all: "全部清单",
        shopping: "购物",
        travel: "出行",
        normal: "普通",
      } as Record<string, string>)[listKind],
    page === "ledger" &&
      (type === "all"
        ? "全部类型"
        : entryTypes[type as keyof typeof entryTypes]),
    page === "savings" &&
      (type === "all"
        ? "全部类型"
        : savingTypes[type as keyof typeof savingTypes]),
    filterCategoryLabel,
    page === "ledger" &&
      account !== "all" &&
      (account === "none"
        ? "未指定账户"
        : state.accounts.find((a: any) => a.id === account)?.name || account),
  ]
    .filter(Boolean)
    .join(" · ");
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
    <div className={`app-shell ${page === "settings" ? "is-settings" : ""}`}>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="UCost 首页">
          <span className="brand-mark">
            <BookOpen size={25} strokeWidth={1.5} />
          </span>
          <span>
            UCost<small>日常有数</small>
          </span>
        </Link>
        <div className="sidebar-scroll">
          <div className="sidebar-caption">我的生活账页</div>
          <nav aria-label="电脑常用导航">
            {layoutNavigation.main.map((key) => {
              const entry = pageEntry(key);
              if (!entry) return null;
              const Icon = entry.icon;
              return (
                <button
                  key={key}
                  className={page === key ? "active" : ""}
                  onClick={() => navigate(key)}
                >
                  <Icon size={19} strokeWidth={1.6} />
                  <span>{entry.name}</span>
                  {key === "drafts" && pending > 0 && <em>{pending}</em>}
                  {key === "reminders" &&
                    reminderData.reminders.length > 0 && (
                      <em>{reminderData.reminders.length}</em>
                    )}
                </button>
              );
            })}
          </nav>
          <details
            className="sidebar-more"
            open={moreOpen}
            onToggle={(event) => setMoreOpen(event.currentTarget.open)}
          >
            <summary>
              <Ellipsis size={18} aria-hidden="true" />
              <span>更多</span>
              <ChevronRight size={15} className="sidebar-more-chevron" />
            </summary>
            <div className="sidebar-more-list">
              {layoutNavigation.more.map((key) => {
                const entry = pageEntry(key);
                if (!entry) return null;
                const Icon = entry.icon;
                return (
                  <button
                    key={key}
                    className={page === key ? "active" : ""}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={17} strokeWidth={1.6} />
                    <span>{entry.name}</span>
                    {key === "drafts" && pending > 0 && <em>{pending}</em>}
                    {key === "reminders" &&
                      reminderData.reminders.length > 0 && (
                        <em>{reminderData.reminders.length}</em>
                      )}
                  </button>
                );
              })}
              <button
                className={page === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <Settings size={17} strokeWidth={1.6} />
                <span>设置</span>
              </button>
              <button
                className={`assistant-nav-entry ${assistantOpen ? "active" : ""}`}
                onClick={() => setAssistantOpen(true)}
                aria-expanded={assistantOpen}
              >
                <Sparkles size={17} strokeWidth={1.6} aria-hidden="true" />
                <span>小数管家</span>
              </button>
            </div>
          </details>
        </div>
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
            <small>生活账本</small>
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
            <h1>
              <span className="page-title-desktop">{desktopPageName}</span>
              <span className="page-title-mobile">{mobilePageName}</span>
            </h1>
            <p className="page-description">{heading[1]}</p>
          </div>
          <button
            className="button quick-record"
            onClick={primaryAction.run}
          >
            <Plus size={18} />
            {primaryAction.label}
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
            reminders={reminderData.reminders}
            openLedger={(id?: string | null) => {
              navigate("ledger");
              if (id !== undefined) setCategory(id || "none");
            }}
          />
        ) : page === "storage" ? (
          <StoragePage
            state={state}
            mutate={mutate}
            notify={setToast}
            checkReminders={checkReminders}
            openItem={(record: any, defaults: any, copy: boolean) =>
              setItemEditor({ record, defaults, copy })
            }
            openAll={() => setAllItems(true)}
          />
        ) : page === "expiry" ? (
          <ExpiryPage
            state={state}
            mutate={mutate}
            notify={setToast}
            checkReminders={checkReminders}
            openItem={(record: any, defaults: any, copy: boolean) =>
              setItemEditor({ record, defaults, copy })
            }
            openAll={() => setAllItems(true)}
          />
        ) : page === "reminders" ? (
          <ReminderCenter
            state={state}
            data={reminderData}
            check={checkReminders}
            mutate={mutate}
            notify={setToast}
            openReminder={(rule?: any, target?: any) =>
              setReminderEditor({ rule, target })
            }
          />
        ) : page === "settings" ? (
          <SettingsPage
            state={state}
            mutate={mutate}
            edit={(entity: string, record?: any) =>
              setEditor({ entity, record })
            }
            notify={setToast}
            refresh={refresh}
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
              <CollapsibleSection
                title="当前筛选已省"
                summary={
                  filterSummary
                    ? `${filterSummary} · 有效记录`
                    : "当前筛选范围 · 有效记录"
                }
                badge={
                  <strong className="saving-fold-total">
                    ¥
                    {money(
                      records
                        .filter((s: any) => effectiveSaving(s))
                        .reduce((a: number, s: any) => a + s.amount, 0),
                    )}
                  </strong>
                }
                open={savingFold.open}
                onToggle={savingFold.setOpen}
                className="saving-fold"
              >
                <div className="saving-overview">
                  <Jar small />
                  <div>
                    <small>当前筛选范围 · 有效记录</small>
                    <strong>
                      ¥
                      {money(
                        records
                          .filter((s: any) => effectiveSaving(s))
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
                            records
                              .filter(
                                (s: any) =>
                                  effectiveSaving(s) && s.type === key,
                              )
                              .reduce((a: number, s: any) => a + s.amount, 0),
                          )}
                        </b>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleSection>
            )}
            {page === "shopping" && listId && (
              <CollapsibleSection
                title="清单说明与操作"
                summary={list?.description || "复制、AI 补充建议"}
                open={listContextFold.open}
                onToggle={listContextFold.setOpen}
                className="list-context-fold"
              >
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
                <span className="pill">
                  {(
                    {
                      shopping: "购物",
                      travel: "出行",
                      normal: "普通",
                    } as Record<string, string>
                  )[list?.kind || "shopping"]}
                </span>
                {list?.archived && <span className="pill">已归档</span>}
                <p>{list?.description}</p>
                <button
                  className="button secondary compact"
                  onClick={() => setCopyListTarget(list)}
                >
                  复制清单
                </button>
                {!list?.archived && (
                  <button
                    className="button secondary compact"
                    onClick={() =>
                      setCapture({
                        target: "shopping",
                        listId: list.id,
                        initialText: "",
                      })
                    }
                  >
                    <Sparkles size={15} />
                    AI 补充建议
                  </button>
                )}
              </div>
              </CollapsibleSection>
            )}
            {page === "shopping" && list && list.kind === "shopping" && (
              <CollapsibleSection
                title="预算与结算"
                summary={
                  list.budget == null
                    ? "未设置预算"
                    : `总预算 ¥${money(list.budget)}`
                }
                open={listBudgetFold.open}
                onToggle={listBudgetFold.setOpen}
                className="list-budget-fold"
              >
                <ListActions state={state} list={list} mutate={mutate} />
              </CollapsibleSection>
            )}
            {page === "shopping" && !listId && (
              <div className="tabs list-kind-tabs" aria-label="清单类型">
                {[
                  ["all", "全部"],
                  ["shopping", "购物"],
                  ["travel", "出行"],
                  ["normal", "普通"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={listKind === value ? "selected" : ""}
                    aria-pressed={listKind === value}
                    onClick={() => {
                      setListKind(value);
                      setSelection([]);
                      setPageIndex(0);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {["ledger", "items", "savings"].includes(page) && (
              <DraftSection
                state={state}
                refresh={refresh}
                notify={setToast}
                target={page}
                foldOpen={draftFold.open}
                onFoldChange={draftFold.setOpen}
              />
            )}
            {page === "shopping" && (
              <DraftSection
                state={state}
                refresh={refresh}
                notify={setToast}
                target="shopping"
                listId={listId}
                foldOpen={draftFold.open}
                onFoldChange={draftFold.setOpen}
              />
            )}
            <CollapsibleSection
              title="搜索与筛选"
              icon={<Search size={15} aria-hidden="true" />}
              summary={filterSummary}
              badge={
                filterConditions > 0 ? (
                  <span className="fold-badge">已筛选 {filterConditions} 项</span>
                ) : undefined
              }
              open={filterFold.open}
              onToggle={filterFold.setOpen}
            >
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
                      setPageIndex(0);
                    }}
                  />
                  <input
                    aria-label="结束日期"
                    type="date"
                    value={dates.end}
                    onChange={(e) => {
                      setDates({ ...dates, end: e.target.value });
                      setSelection([]);
                      setPageIndex(0);
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
                      setPageIndex(0);
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
                  {page === "ledger" && (
                    <select
                      aria-label="账户筛选"
                      value={account}
                      onChange={(e) => {
                        setAccount(e.target.value);
                        setSelection([]);
                        setPageIndex(0);
                      }}
                    >
                      <option value="all">全部账户</option>
                      <option value="none">未指定账户</option>
                      {state.accounts.map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {page === "savings" && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => {
                      setShowArchived(e.target.checked);
                      setSelection([]);
                      setPageIndex(0);
                    }}
                  />
                  显示已撤销
                </label>
              )}
              {page === "shopping" && !listId && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => {
                      setShowArchived(e.target.checked);
                      setSelection([]);
                      setPageIndex(0);
                    }}
                  />
                  含已归档
                </label>
              )}
            </div>
            <div className="filter-footer">
              <small>
                {filterConditions
                  ? `已筛选 ${filterConditions} 项 · ${records.length} 条结果`
                  : `按当前条件展示 ${records.length} 条记录`}
              </small>
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setType("all");
                  setCategory("all");
                  setAccount("all");
                  setListKind("all");
                  setShowArchived(false);
                  setDates({
                    start: `${localDate().slice(0, 7)}-01`,
                    end: localDate(),
                  });
                  setSelection([]);
                  setPageIndex(0);
                }}
              >
                重置筛选
              </button>
            </div>
            </CollapsibleSection>
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
                  {grouped ? "全选当前已展开记录" : "全选当前页"}
                </label>
                <span>{records.length} 条记录</span>
                <button
                  type="button"
                  className="text-button mobile-actions-toggle"
                  aria-expanded={actionsFold.open}
                  aria-controls={`record-actions-${filterKey}`}
                  onClick={() => actionsFold.setOpen(!actionsFold.open)}
                >
                  <SlidersHorizontal size={14} />
                  操作
                </button>
              </div>
              {["ledger", "savings", "shopping", "items"].includes(page) && (
                <div className="record-actions">
                  <div
                    className={`record-actions-body ${actionsFold.open ? "open" : ""}`}
                    id={`record-actions-${filterKey}`}
                  >
                  {["ledger", "savings"].includes(page) && (
                    <>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setPageIndex(0);
                          run(() =>
                            mutate({
                              action: "viewPreference",
                              entity: page,
                              mode: grouped ? "flat" : "grouped",
                            }),
                          );
                        }}
                      >
                        {grouped ? "切换为平铺" : "切换为分组"}
                      </button>
                      <GroupControls
                        state={state}
                        entity={entity}
                        selected={selectedRecords}
                        mutate={mutate}
                        notify={setToast}
                      />
                    </>
                  )}
                  {page === "ledger" && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setEditor({ entity: "ledger" })}
                    >
                      <Plus size={16} />
                      手动添加
                    </button>
                  )}
                  {page === "shopping" && !listId && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setListWizard(true)}
                    >
                      <Sparkles size={16} />
                      AI 帮我建清单
                    </button>
                  )}
                  {page === "shopping" && listId && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setEditor({
                          entity: "shopping",
                          record: { listId },
                        })
                      }
                    >
                      <Plus size={16} />
                      手动添加
                    </button>
                  )}
                  {page === "items" && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setItemEditor({
                          defaults: {
                            costEnabled: true,
                            storageEnabled: false,
                          },
                        })
                      }
                    >
                      <Plus size={16} />
                      登记成本物品
                    </button>
                  )}
                  {page === "shopping" &&
                    list?.kind === "shopping" &&
                    !list?.archived && (
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          setCapture({ target: "shopping", listId })
                        }
                      >
                        <MicIcon />
                        口述 / AI 添加
                      </button>
                    )}
                  {(entity === "ledger" ||
                    (entity === "shopping" && list?.kind === "shopping")) && (
                    <>
                      <div className="record-actions-ai">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => setClassification(true)}
                        >
                          AI 分类
                          {selection.length
                            ? `（${selection.length} 条）`
                            : "未分类记录"}
                        </button>
                        <AiStatus ai={state.ai} compact />
                      </div>
                    </>
                  )}
                  {["ledger", "savings"].includes(page) && (
                    <a
                      className="button secondary"
                      href={`/api/export?${csvFilter}`}
                      download
                    >
                      导出当前筛选 CSV
                    </a>
                  )}
                  {fullGroup !== null && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setFullGroup(null)}
                    >
                      返回筛选范围
                    </button>
                  )}
                  </div>
                </div>
              )}
              {visible.length ? (
                visible.map((record: any, index: number) => (
                  <Fragment key={record.id}>
                    {grouped &&
                      (index === 0 ||
                        visible[index - 1].groupId !== record.groupId) && (
                        <GroupHeading
                          state={state}
                          entity={entity}
                          groupId={record.groupId}
                          records={records.filter(
                            (r) => r.groupId === record.groupId,
                          )}
                          viewAll={() => {
                            setFullGroup(record.groupId || "");
                            setPageIndex(0);
                          }}
                        />
                      )}
                    <div
                      className="record-row"
                      key={record.id}
                      onClick={(event) => {
                        if (layoutMode !== "mobile") return;
                        const target = event.target as HTMLElement;
                        if (
                          target.closest(
                            "input, button, a, .row-actions, .record-amount, .list-title",
                          )
                        )
                          return;
                        openRecordEditor(record);
                      }}
                    >
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
                        {entity === "shopping" && isShoppingRecord(record) && (
                          <button
                            className="text-button"
                            onClick={() => setPurchaseReference(record)}
                          >
                            购买参考
                          </button>
                        )}
                        {entity === "shopping" &&
                          isShoppingRecord(record) &&
                          ["considering", "planned"].includes(
                            record.status,
                          ) && (
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
                        {entity === "shopping" &&
                          isShoppingRecord(record) &&
                          record.status === "purchased" && (
                            <>
                              {record.ledgerId &&
                              state.ledger.some(
                                (entry: any) => entry.id === record.ledgerId,
                              ) ? (
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    const entry = state.ledger.find(
                                      (item: any) =>
                                        item.id === record.ledgerId,
                                    );
                                    if (entry)
                                      setEditor({
                                        entity: "ledger",
                                        record: entry,
                                      });
                                  }}
                                >
                                  查看账单
                                </button>
                              ) : (
                                <button
                                  className="button secondary compact"
                                  onClick={() => setPurchaseRelink(record)}
                                >
                                  补记账
                                </button>
                              )}
                              <button
                                className="text-button"
                                onClick={() => setPurchaseEdit(record)}
                              >
                                修改购买信息
                              </button>
                              <button
                                className="text-button danger-text"
                                onClick={() => setPurchaseUndo(record)}
                              >
                                撤销购买
                              </button>
                            </>
                          )}
                        {entity === "shopping" &&
                          isShoppingRecord(record) &&
                          record.status === "skipped" && (
                            <button
                              className="text-button"
                              onClick={() =>
                                run(
                                  () =>
                                    mutate({
                                      action: "purchaseRestore",
                                      id: record.id,
                                      version: record.version,
                                    }),
                                  "已恢复为待购买",
                                )
                              }
                            >
                              恢复待购
                            </button>
                          )}
                        {entity === "shopping" &&
                          !isShoppingRecord(record) && (
                            <>
                              <button
                                className="button secondary compact"
                                onClick={() =>
                                  run(
                                    async () => {
                                      await mutate({
                                        action: "save",
                                        entity: "shopping",
                                        id: record.id,
                                        version: record.version,
                                        data: { done: !record.done },
                                      });
                                      await checkReminders();
                                    },
                                    record.done ? "已恢复为未完成" : "已标记完成",
                                  )
                                }
                              >
                                {record.done ? "恢复未完成" : "标记完成"}
                              </button>
                              {state.lists.find(
                                (row: any) => row.id === record.listId,
                              )?.kind === "travel" && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setReminderEditor({
                                      target: {
                                        type: "listItem",
                                        id: record.id,
                                      },
                                    })
                                  }
                                >
                                  设提醒
                                </button>
                              )}
                            </>
                          )}
                        {entity === "shopping" &&
                          isShoppingRecord(record) &&
                          ["considering", "planned"].includes(
                            record.status,
                          ) && (
                            <button
                              className="text-button"
                              onClick={() =>
                                setReminderEditor({
                                  target: {
                                    type: "shopping",
                                    id: record.id,
                                  },
                                })
                              }
                            >
                              设提醒
                            </button>
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
                            {record.expiryEnabled && record.expiresOn && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  setReminderEditor({
                                    target: { type: "item", id: record.id },
                                  })
                                }
                              >
                                设提醒
                              </button>
                            )}
                            <button
                              className="icon-button"
                              aria-label="复制物品"
                              onClick={() =>
                                setItemEditor({ record, copy: true })
                              }
                            >
                              <Copy size={16} />
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
                          className="icon-button row-actions-primary"
                          aria-label="编辑"
                          onClick={() => {
                            if (entity === "items")
                              setItemEditor({ record });
                            else setEditor({ entity, record });
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button row-actions-primary"
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
                    {grouped &&
                      (index === visible.length - 1 ||
                        visible[index + 1].groupId !== record.groupId) &&
                      records.filter((r) => r.groupId === record.groupId)
                        .length >
                        (groupLimits[`${entity}:${record.groupId || ""}`] ||
                          20) && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            setGroupLimits((current) => ({
                              ...current,
                              [`${entity}:${record.groupId || ""}`]:
                                (current[`${entity}:${record.groupId || ""}`] ||
                                  20) + 20,
                            }))
                          }
                        >
                          展开本组更多记录（组小计包含全部匹配记录）
                        </button>
                      )}
                  </Fragment>
                ))
              ) : (
                <Empty
                  title={
                    query || filterConditions
                      ? "没有找到匹配记录"
                      : entity === "lists"
                        ? "建一张自己的购物清单"
                        : "这一页还没有记录"
                  }
                  text={
                    query || filterConditions
                      ? "换一个条件，或清除筛选后再看看。"
                      : "可以手动添加，也可以把一段话交给 AI 整理。"
                  }
                  action={
                    filterConditions ? (
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          setQuery("");
                          setType("all");
                          setCategory("all");
                          setAccount("all");
                          setListKind("all");
                          setShowArchived(false);
                          setDates({
                            start: `${localDate().slice(0, 7)}-01`,
                            end: localDate(),
                          });
                          setSelection([]);
                          setPageIndex(0);
                        }}
                      >
                        清除筛选
                      </button>
                    ) : undefined
                  }
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
                  第 {pageIndex + 1} / {Math.max(1, Math.ceil(pageCount / 20))}{" "}
                  页
                </span>
                <button
                  className="button secondary compact"
                  disabled={(pageIndex + 1) * 20 >= pageCount}
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
      <nav className="mobile-nav" aria-label="手机导航">
        {layoutNavigation.main.map((key) => {
          const entry = pageEntry(key);
          if (!entry) return null;
          const Icon = entry.icon;
          return (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={20} />
              {entry.name}
            </button>
          );
        })}
        <button
          className={
            more || layoutNavigation.more.includes(page as NavigationKey)
              ? "active"
              : ""
          }
          aria-haspopup="dialog"
          aria-expanded={more}
          onClick={() => setMore(true)}
        >
          <MoreHorizontal size={22} />
          更多
        </button>
      </nav>
      {more && (
        <Modal title="更多" close={() => setMore(false)} sheet>
          <div className="mobile-more">
            <div className="more-grid">
              {layoutNavigation.more.map((key) => {
                const entry = pageEntry(key);
                if (!entry) return null;
                const Icon = entry.icon;
                return (
                  <button
                    key={key}
                    className={page === key ? "active" : ""}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={18} />
                    <span>{entry.name}</span>
                    {key === "drafts" && pending > 0 && <em>{pending}</em>}
                    {key === "reminders" &&
                      reminderData.reminders.length > 0 && (
                        <em>{reminderData.reminders.length}</em>
                      )}
                  </button>
                );
              })}
            </div>
            <div className="more-utilities">
              <button
                className={page === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <Settings size={18} />
                设置
              </button>
              <button
                onClick={() => {
                  setMore(false);
                  setAssistantOpen(true);
                }}
              >
                <Sparkles size={18} aria-hidden="true" />
                小数管家
              </button>
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
          </div>
        </Modal>
      )}
      <Assistant
        state={state}
        page={page}
        listId={listId}
        list={list}
        reminders={reminderData.reminders}
        open={assistantOpen}
        setOpen={setAssistantOpen}
        onReference={openAssistantReference}
        onCapture={openAssistantCapture}
        onRefresh={refresh}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {itemEditor && (
        <ItemEditor
          record={itemEditor.record}
          state={state}
          defaults={itemEditor.defaults}
          copy={itemEditor.copy}
          close={() => setItemEditor(null)}
          remove={
            itemEditor.record?.id && !itemEditor.copy
              ? async () => {
                  await mutate({
                    action: "batch",
                    entity: "items",
                    mode: "delete",
                    records: [
                      {
                        id: itemEditor.record.id,
                        version: itemEditor.record.version,
                      },
                    ],
                  });
                  setToast("物品已删除，账单和其他用途记录不受影响");
                  await checkReminders();
                }
              : undefined
          }
          save={async (data: any, reminder: any) => {
            const saved = await mutate({
              action: "save",
              entity: "items",
              id: itemEditor.record?.id,
              version: itemEditor.record?.version,
              data,
            });
            if (reminder && data.expiryEnabled && data.expiresOn) {
              await mutate({
                action: "reminderSave",
                targetType: "item",
                targetId: saved.id,
                triggerType: "relative",
                offsetDays: reminder.offsetDays,
                localTime: reminder.localTime,
                timezone: state.user.timezone,
              });
            }
            setToast("物品已保存");
            await checkReminders();
          }}
        />
      )}
      {allItems && (
        <AllItemsModal
          state={state}
          close={() => setAllItems(false)}
          openItem={(record: any) => setItemEditor({ record })}
        />
      )}
      {purchaseReference && (
        <PurchaseReferenceModal
          state={state}
          item={purchaseReference}
          close={() => setPurchaseReference(null)}
          onReference={(reference: any) => {
            setPurchaseReference(null);
            openAssistantReference(reference);
          }}
        />
      )}
      {copyListTarget && (
        <CopyListModal
          list={copyListTarget}
          close={() => setCopyListTarget(null)}
          save={async (data: any) => {
            const copy = await mutate({
              action: "copyList",
              id: copyListTarget.id,
              version: copyListTarget.version,
              ...data,
            });
            setListId(copy.id);
            setPageIndex(0);
            setToast("已复制清单，请核对内容");
          }}
        />
      )}
      {listWizard && (
        <AiListWizard
          close={() => setListWizard(false)}
          save={async (data: any) => {
            const { prompt, ...listData } = data;
            const saved = await mutate({
              action: "save",
              entity: "lists",
              data: listData,
            });
            setListId(saved.id);
            setPageIndex(0);
            setToast("清单已创建，确认 AI 建议后才会写入条目");
            if (prompt)
              setCapture({
                target: "shopping",
                listId: saved.id,
                initialText: prompt,
              });
          }}
        />
      )}
      {reminderEditor && (
        <ReminderEditor
          state={state}
          rule={reminderEditor.rule}
          target={reminderEditor.target}
          close={() => setReminderEditor(null)}
          save={async (data: any) => {
            await mutate({ action: "reminderSave", ...data });
            setToast("提醒已保存");
            await checkReminders();
          }}
        />
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
            if (["lists", "shopping"].includes(editor.entity))
              await checkReminders();
            setToast("已保存");
          }}
        />
      )}
      {classification && (
        <Classification
          state={state}
          entity={entity}
          records={(selection.length
            ? selectedRecords
            : records.filter((r) => !r.categoryId)
          ).filter(
            (r: any) =>
              entity === "shopping" || ["expense", "income"].includes(r.type),
          )}
          refresh={refresh}
          close={() => setClassification(false)}
          createCategory={() => {
            setClassification(false);
            navigate("settings");
            setEditor({ entity: "categories" });
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
            await checkReminders();
          }}
        />
      )}
      {purchaseEdit && (
        <PurchaseEdit
          item={purchaseEdit}
          state={state}
          close={() => setPurchaseEdit(null)}
          save={async (data: any) => {
            await mutate({
              action: "purchaseEdit",
              id: purchaseEdit.id,
              version: purchaseEdit.version,
              ...data,
            });
            setToast("购买信息与关联记录已同步");
          }}
        />
      )}
      {purchaseRelink && (
        <PurchaseRelink
          item={purchaseRelink}
          state={state}
          close={() => setPurchaseRelink(null)}
          save={async (data: any) => {
            await mutate({
              action: "purchaseRelink",
              id: purchaseRelink.id,
              version: purchaseRelink.version,
              ...data,
            });
            setToast("补记账完成");
            await checkReminders();
          }}
        />
      )}
      {purchaseUndo && (
        <PurchaseUndo
          item={purchaseUndo}
          state={state}
          close={() => setPurchaseUndo(null)}
          save={async (data: any) => {
            await mutate({
              action: "purchaseUndo",
              id: purchaseUndo.id,
              version: purchaseUndo.version,
              ...data,
            });
            setToast("已撤销购买，物品回到待购买");
            await checkReminders();
          }}
        />
      )}
      {reviewItem && (
        <CreateReview
          item={reviewItem}
          state={state}
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
function AiListWizard({ close, save }: any) {
  const [data, setData] = useState({
      name: "",
      kind: "travel",
      departureDate: "",
      description: "",
      prompt: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const kindCopy: Record<string, string> = {
    travel: "出行准备会按证件、衣物、防晒、洗漱等分组，不产生预算或账单。",
    normal: "普通清单适合家务、搬家或日常安排，不会关联库存或消费。",
    shopping: "购物清单保留预算和分类；AI 只给候选，确认后才写入。",
  };
  return (
    <Modal title="AI 帮我建清单" close={close}>
      <p className="hint">
        先说清用途和场景。下一步会打开这份清单的建议整理，候选由你逐条确认，不会直接新增条目。
      </p>
      <div className="form-grid">
        <FieldInput
          field={{ key: "name", label: "清单名称", required: true }}
          value={data.name}
          set={(value) => setData({ ...data, name: value })}
        />
        <FieldInput
          field={{
            key: "kind",
            label: "用途",
            type: "select",
            options: [
              { value: "travel", label: "出行清单" },
              { value: "normal", label: "普通清单" },
              { value: "shopping", label: "购物清单" },
            ],
          }}
          value={data.kind}
          set={(value) => setData({ ...data, kind: value })}
        />
        {data.kind === "travel" && (
          <FieldInput
            field={{ key: "departureDate", label: "出发日期", type: "date" }}
            value={data.departureDate}
            set={(value) => setData({ ...data, departureDate: value })}
          />
        )}
        <FieldInput
          field={{ key: "description", label: "说明", type: "textarea" }}
          value={data.description}
          set={(value) => setData({ ...data, description: value })}
        />
      </div>
      <label className="field">
        <span>想准备什么</span>
        <textarea
          rows={4}
          value={data.prompt}
          onChange={(event) =>
            setData({ ...data, prompt: event.target.value })
          }
          placeholder={
            data.kind === "travel"
              ? "两大一小，海边三天，想轻装，防晒和常用药别忘了……"
              : data.kind === "normal"
                ? "周末大扫除，按房间列一下要准备的工具……"
                : "这周想补牛奶、鸡蛋和洗衣液，洗衣液要无香的……"
          }
        />
        <small className="hint">{kindCopy[data.kind]}</small>
      </label>
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button"
          disabled={busy || !data.name.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await save({
                name: data.name.trim(),
                kind: data.kind,
                description: data.description,
                departureDate:
                  data.kind === "travel" ? data.departureDate || null : null,
                prompt: data.prompt.trim(),
              });
              close();
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "创建并开始建议"}
        </button>
      </footer>
    </Modal>
  );
}
function CopyListModal({ list, close, save }: any) {
  const [resetDone, setResetDone] = useState(true);
  const [departureDate, setDepartureDate] = useState(
    list.departureDate || "",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={`复制 · ${list.name}`} close={close}>
      <p className="hint">
        新清单独立保存。购物清单不会复制实付、账单、物品关联、结算、评议和省钱记录。
      </p>
      <label className="check-field">
        <input
          type="checkbox"
          checked={resetDone}
          onChange={(e) => setResetDone(e.target.checked)}
        />
        重置完成状态
      </label>
      {list.kind === "travel" && (
        <FieldInput
          field={{
            key: "departureDate",
            label: "新出发日期",
            type: "date",
            hint: "复制后请核对出发日期；提醒不会自动复制。",
          }}
          value={departureDate}
          set={setDepartureDate}
        />
      )}
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
            setError("");
            try {
              await save({
                resetDone,
                ...(list.kind === "travel"
                  ? { departureDate: departureDate || null }
                  : {}),
              });
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "创建副本"}
        </button>
      </footer>
    </Modal>
  );
}

function PurchaseReferenceModal({ state, item, close, onReference }: any) {
  const timezone = state.user.timezone || "Asia/Shanghai";
  const list = state.lists.find((row: any) => row.id === item.listId);
  const answer = answerAssistant(`上次${item.name}多少钱？`, state, {
    page: "shopping",
    listId: item.listId,
    listName: list?.name || null,
    today: localDate(new Date(), timezone),
    timezone,
    reminders: [],
  });
  return (
    <Modal title="购买参考" wide close={close}>
      <article className="purchase-reference">
        <h3>{answer.title}</h3>
        <p>{answer.body}</p>
        {answer.facts?.length ? (
          <div className="assistant-facts">
            {answer.facts.map((fact: any) => (
              <div
                className="assistant-fact"
                key={`${fact.label}:${fact.value}`}
              >
                <small>{fact.label}</small>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {answer.rows?.length ? (
          <div className="assistant-rows">
            {answer.rows.map((row: any) =>
              row.reference ? (
                <button
                  className="assistant-row is-link"
                  key={row.id}
                  onClick={() => onReference(row.reference)}
                >
                  <span className="assistant-row-copy">
                    <b>{row.title}</b>
                    <small>{row.meta}</small>
                    {row.detail && <em>{row.detail}</em>}
                  </span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ) : (
                <div className="assistant-row" key={row.id}>
                  <span className="assistant-row-copy">
                    <b>{row.title}</b>
                    <small>{row.meta}</small>
                    {row.detail && <em>{row.detail}</em>}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : null}
        {answer.caution && (
          <p className="assistant-caution">{answer.caution}</p>
        )}
      </article>
      <footer>
        <button className="button secondary" onClick={close}>
          关闭
        </button>
      </footer>
    </Modal>
  );
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
  if (entity === "ledger") {
    const category = state.categories.find((c: any) => c.id === r.categoryId);
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
            {category ? (
              <span className="inline-category">
                <CategoryMark category={category} size={13} />
                {category.name}
              </span>
            ) : (
              "未分类"
            )}
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
  }
  if (entity === "lists")
    return (
      <>
        <span className="entry-symbol">
          <ShoppingBasket size={20} />
        </span>
        <button className="record-content list-title" onClick={openList}>
          <b>
            {r.name}
            <span className="pill">
              {(
                {
                  shopping: "购物",
                  travel: "出行",
                  normal: "普通",
                } as Record<string, string>
              )[r.kind || "shopping"]}
            </span>
            {r.archived && <span className="pill">已归档</span>}
          </b>
          <small>
            {state.shopping.filter((s: any) => s.listId === r.id).length}{" "}
            {r.kind === "shopping" || !r.kind ? "件物品" : "个条目"}
            {r.kind === "travel" && r.departureDate
              ? ` · 出发 ${r.departureDate}`
              : ""}
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
  if (entity === "shopping") {
    const list = state.lists.find((row: any) => row.id === r.listId);
    if (list && list.kind !== "shopping") {
      return (
        <>
          <span className="entry-symbol">
            {list.kind === "travel" ? (
              <Plane size={19} />
            ) : (
              <Check size={19} />
            )}
          </span>
          <div className="record-content">
            <b>
              {r.name}
              <span className={`pill ${r.done ? "yellow" : ""}`}>
                {r.done ? "已完成" : "待准备"}
              </span>
              {r.groupName && <span className="pill">{r.groupName}</span>}
            </b>
            <small>
              {r.quantity ? `${r.quantity} · ` : ""}
              {r.note || "还没有备注"}
            </small>
          </div>
          <div className="record-amount">
            <strong>{r.done ? "已勾选" : "准备中"}</strong>
            <small>{list.kind === "travel" ? "出行准备" : "普通清单"}</small>
          </div>
        </>
      );
    }
    const category = state.categories.find((c: any) => c.id === r.categoryId);
    const hasLedger =
      !!r.ledgerId &&
      state.ledger.some((entry: any) => entry.id === r.ledgerId);
    const unrecorded =
      r.status === "purchased" && !hasLedger && r.purchaseAmount !== 0;
    return (
      <>
        <span className="entry-symbol">
          <ShoppingBasket size={19} />
        </span>
        <div className="record-content">
          <b>
            {r.name} <span className="pill">{shoppingStatuses[r.status]}</span>
            {unrecorded && (
              <span className="pill yellow">
                {r.purchaseNeedsReview ? "已购·待补信息" : "已购·未记账"}
              </span>
            )}
            {r.status === "purchased" && r.purchaseAmount === 0 && (
              <span className="pill">零元获得</span>
            )}
          </b>
          <small>
            {category && (
              <span className="inline-category">
                <CategoryMark category={category} size={13} />
                {category.name} ·{" "}
              </span>
            )}
            {r.quantity && `${r.quantity} · `}
            {r.reason || r.requirements || r.note || "还没有备注"}
          </small>
          {r.status === "purchased" && r.purchasedAt && (
            <small>
              {r.purchasedAt} 购入
              {r.purchaseDiscount > 0
                ? ` · 优惠 ¥${money(r.purchaseDiscount)}`
                : ""}
              {unrecorded && r.ledgerId ? " · 原账单已删除" : ""}
            </small>
          )}
        </div>
        <div className="record-amount">
          <strong>
            {r.status === "purchased" && r.purchaseAmount != null
              ? `¥${money(r.purchaseAmount)}`
              : r.budget == null
                ? "预算未定"
                : `¥${money(r.budget)}`}
          </strong>
          <small>
            {r.status === "purchased" && r.purchaseAmount != null
              ? "实付快照"
              : "预计总预算"}
          </small>
        </div>
      </>
    );
  }
  if (entity === "items") {
    const ledger = state.ledger.find((e: any) => e.id === r.ledgerId);
    const refunds = ledger
      ? state.ledger
          .filter((e: any) => e.refundOfId === ledger.id)
          .reduce((s: number, e: any) => s + e.amount, 0)
      : 0;
    const count = state.usage
      .filter((u: any) => u.itemId === r.id)
      .reduce((s: number, u: any) => s + u.count, 0);
    const view = itemCostView(r, { ledger, refunds, usageCount: count });
    return (
      <>
        <span className="entry-symbol">
          <Package size={20} />
        </span>
        <div className="record-content">
          <b>
            {r.name}
            <span className="pill">
              {r.retiredDate
                ? "已退役"
                : r.status === "used"
                  ? "已用完"
                  : r.status === "discarded"
                    ? "已丢弃"
                    : r.status === "archived"
                      ? "已归档"
                      : "使用中"}
            </span>
          </b>
          <small>
            {r.purchaseDate
              ? `${r.purchaseDate} 购入 · 陪伴 ${heldDays(r.purchaseDate, r.retiredDate)} 天`
              : "未登记购入信息"}
            {" · "}使用 {count} 次
          </small>
          <small>
            {r.quantity ?? 1} {r.unit || "件"}
            {r.location ? ` · ${r.location}` : ""}
            {r.expiresOn ? ` · ${r.expiresOn} 到期` : ""}
          </small>
          {r.note && <small>{r.note}</small>}
        </div>
        <div className="record-amount">
          <strong>
            {view.value == null ? view.label : `¥${money(view.value)}`}
            {view.value != null && <small>{view.unit}</small>}
          </strong>
          <small>
            {view.secondary
              ? view.secondary.value == null
                ? view.secondary.label
                : `另：¥${money(view.secondary.value)}${view.secondary.unit}`
              : view.label}
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
        <small>
          {r.supersededBySettlementId
            ? "已被整单结算替代"
            : r.suppressed
              ? "已主动停用"
              : r.status !== "valid"
                ? "不计入累计"
                : "省下了"}
        </small>
      </div>
    </>
  );
}

function Auth({ done, error: initialError }: any) {
  const [registerMode, setRegisterMode] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [inviteCode, setInviteCode] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError || "");
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <span className="brand auth-brand">
          <span className="brand-mark">
            <BookOpen size={20} aria-hidden="true" />
          </span>
          <span>
            UCost
            <small>日常有数</small>
          </span>
        </span>
        <h1>
          把生活的账，
          <br />
          轻轻记下来。
        </h1>
        <p>
          花了多少，想买什么，还有那些悄悄省下来的钱。每天几分钟，给日子留一页清楚的底稿。
        </p>
        <div className="auth-jar-stage">
          <Jar />
          <span className="hand-note">日常有数，心里有底。</span>
        </div>
      </section>
      <section className="auth-form panel">
        <span className="auth-form-stamp" aria-hidden="true">
          UC
          <small>账本</small>
        </span>
        <header className="auth-form-head">
          <h2>{registerMode ? "翻开你的第一本账" : "欢迎回来"}</h2>
          <p>
            {registerMode
              ? "创建账号，开始记录日常收支。"
              : "登录，接着记下今天的生活。"}
          </p>
        </header>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`auth/${registerMode ? "register" : "login"}`, {
                username,
                password,
                ...(registerMode ? { inviteCode } : {}),
              });
              await done();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="auth-field">
            <label htmlFor="auth-username">用户名</label>
            <div className="auth-input">
              <UserRound size={16} aria-hidden="true" />
              <input
                id="auth-username"
                autoComplete="username"
                value={username}
                required
                minLength={2}
                maxLength={40}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">密码</label>
            <div className="auth-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  registerMode ? "new-password" : "current-password"
                }
                minLength={8}
                maxLength={100}
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-eye"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          {registerMode && (
            <div className={`auth-invite ${inviteCode.trim() ? "filled" : ""}`}>
              <div className="auth-invite-head">
                <span>
                  <Ticket size={15} aria-hidden="true" />
                  邀请码
                </span>
                <small>{inviteCode.trim() ? "已填写" : "可选"}</small>
              </div>
              <input
                id="auth-invite"
                aria-label="邀请码（可选）"
                placeholder="请输入邀请码"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              />
              <p>填写有效邀请码才能使用 AI，系统 AI 不限使用次数。</p>
            </div>
          )}
          {error && (
            <p className="error auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="button auth-submit" disabled={busy}>
            {busy ? (
              <Busy />
            ) : (
              <>
                {registerMode ? "创建账号" : "登录账本"}
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>
        </form>
        <button
          className="text-button auth-switch"
          onClick={() => {
            setRegisterMode(!registerMode);
            setError("");
            setShowPassword(false);
          }}
        >
          {registerMode ? "已有账号，去登录" : "第一次来？创建账号"}
        </button>
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
    shopping: [
      "listId",
      "name",
      "quantity",
      "budget",
      "categoryId",
      "note",
      "status",
      "groupName",
      "done",
    ],
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
  const affectedShopping =
    entity === "ledger"
      ? state.shopping.filter((item: any) =>
          records.some((record: any) => record.id === item.ledgerId),
        ).length
      : 0;
  const affectedSavings =
    entity === "ledger"
      ? state.savings.filter((saving: any) =>
          records.some((record: any) => record.id === saving.ledgerId),
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
              关联购物项 {affectedShopping}{" "}
              个，会保留“已购买”事实和实付快照，之后可补记账；自动优惠省钱{" "}
              {affectedSavings}{" "}
              条会撤销；物品档案保留金额快照；有退款的原支出必须先处理退款。
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
  const quantitySuggestion = /^(\d+)\s*(.*)$/.exec(
    String(item.quantity || "").trim(),
  );
  const defaultAccount =
    item.purchaseAccountId ||
    (state.accounts.some(
      (account: any) =>
        account.id === state.user.defaultExpenseAccountId && !account.archived,
    )
      ? state.user.defaultExpenseAccountId
      : "");
  const [data, setData] = useState<any>({
      mode: skip ? "skip" : "buy",
      date: localDate(),
      paid: item.purchaseAmount ?? item.budget,
      discount: item.purchaseDiscount ?? 0,
      discountDetails: item.purchaseDiscountDetails || "",
      planned: item.budget,
      createLedger: !skip,
      createItem: false,
      createSaving: skip,
      registerStorage: false,
      registerExpiry: false,
      expiresOn: "",
      location: "",
      registerQuantity: quantitySuggestion
        ? Number(quantitySuggestion[1])
        : 1,
      registerUnit: quantitySuggestion?.[2] || "件",
      accountId: defaultAccount,
      categoryId: item.categoryId || "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, v: any) => setData({ ...data, [key]: v });
  return (
    <Modal title={`${skip ? "不买了" : "买到了"} · ${item.name}`} close={close}>
      <div className="purchase-summary">
        <span>
          数量
          <b>{item.quantity || "未填写"}</b>
        </span>
        <span>
          预计总预算
          <b>{item.budget == null ? "未设置" : `¥${money(item.budget)}`}</b>
        </span>
        <small>
          实际付款填本次全部数量的合计金额，不按数量乘预算。
        </small>
      </div>
      <div className="form-grid">
        <FieldInput
          field={{ key: "date", label: "日期", type: "date" }}
          value={data.date}
          set={(v) => set("date", v)}
        />
        {!skip && (
          <>
            <FieldInput
              field={{
                key: "paid",
                label: "实际付款（全部数量合计，元）",
                type: "money",
                hint: "零元获得请填 0，不会自动生成支出。",
              }}
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
                  ...state.accounts
                    .filter((a: any) => !a.archived || a.id === data.accountId)
                    .map((a: any) => ({
                      value: a.id,
                      label: a.name,
                    })),
                ],
              }}
              value={data.accountId}
              set={(v) => set("accountId", v)}
            />
            <FieldInput
              field={{
                key: "categoryId",
                label: "支出分类",
                type: "select",
                options: [
                  { value: "", label: "未分类" },
                  ...state.categories
                    .filter(
                      (c: any) =>
                        c.type === "expense" &&
                        (!c.archived || c.id === data.categoryId),
                    )
                    .map((c: any) => ({ value: c.id, label: c.name })),
                ],
              }}
              value={data.categoryId}
              set={(v) => set("categoryId", v)}
            />
            <FieldInput
              field={{
                key: "discountDetails",
                label: "优惠说明",
              }}
              value={data.discountDetails}
              set={(v) => set("discountDetails", v)}
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
            同时计算物品成本（以本次实付作为购入金额）
          </label>
          <div className="registration-box">
            <b>顺手登记到生活管家</b>
            <p className="hint">
              只保存来源说明，不把账单金额分摊给物品，也不自动建立成本关联。
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={data.registerStorage}
                onChange={(e) => set("registerStorage", e.target.checked)}
              />
              登记收纳位置
            </label>
            {data.registerStorage && (
              <FieldInput
                field={{
                  key: "location",
                  label: "放在哪里",
                  hint: "例如：厨房 / 上层柜",
                }}
                value={data.location}
                set={(v) => set("location", v)}
              />
            )}
            {(data.registerStorage || data.registerExpiry) && (
              <div className="quantity-field">
                <FieldInput
                  field={{
                    key: "registerQuantity",
                    label: "登记数量",
                    type: "number",
                    hint: quantitySuggestion
                      ? "已从清单数量带入，请核对。"
                      : "清单数量不是精确数字，请确认。",
                  }}
                  value={data.registerQuantity}
                  set={(v) => set("registerQuantity", v ?? 1)}
                />
                <FieldInput
                  field={{ key: "registerUnit", label: "单位" }}
                  value={data.registerUnit}
                  set={(v) => set("registerUnit", v)}
                />
              </div>
            )}
            <label className="check-field">
              <input
                type="checkbox"
                checked={data.registerExpiry}
                onChange={(e) => set("registerExpiry", e.target.checked)}
              />
              登记保质期
            </label>
            {data.registerExpiry && (
              <FieldInput
                field={{ key: "expiresOn", label: "到期日", type: "date" }}
                value={data.expiresOn}
                set={(v) => set("expiresOn", v)}
              />
            )}
          </div>
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
          : data.paid === 0
            ? "零元获得，不新增支出。"
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
            setError("");
            try {
              if (!skip && (data.paid === null || data.paid === undefined)) {
                setError("请填写本次全部数量的实际付款；零元获得请填 0");
                return;
              }
              if (data.createSaving && !data.planned) {
                setError("记录省钱需要填写原计划金额");
                return;
              }
              if (data.registerExpiry && !data.expiresOn) {
                setError("登记保质期需要填写到期日");
                return;
              }
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

function PurchaseEdit({ item, state, save, close }: any) {
  const entry = state.ledger.find((row: any) => row.id === item.ledgerId);
  const [data, setData] = useState<any>({
      amount: item.purchaseAmount ?? entry?.amount ?? null,
      date: item.purchasedAt || entry?.date || localDate(),
      discount: item.purchaseDiscount ?? entry?.discount ?? 0,
      discountDetails:
        item.purchaseDiscountDetails || entry?.discountDetails || "",
      categoryId: item.categoryId || "",
      accountId: item.purchaseAccountId || "",
      syncLedgerCategory: true,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, value: any) => setData({ ...data, [key]: value });
  return (
    <Modal title={`修改购买信息 · ${item.name}`} close={close}>
      {item.purchaseNeedsReview && (
        <p className="warning">
          这条旧记录缺少完整购买信息，请补齐实付、日期和分类，不要用预算代替实付。
        </p>
      )}
      <div className="form-grid">
        <FieldInput
          field={{
            key: "date",
            label: "购买日期",
            type: "date",
            required: true,
          }}
          value={data.date}
          set={(value) => set("date", value)}
        />
        <FieldInput
          field={{
            key: "amount",
            label: "实际付款（元）",
            type: "money",
            required: true,
          }}
          value={data.amount}
          set={(value) => set("amount", value)}
        />
        <FieldInput
          field={{ key: "discount", label: "真实优惠（元）", type: "money" }}
          value={data.discount}
          set={(value) => set("discount", value)}
        />
        <FieldInput
          field={{ key: "discountDetails", label: "优惠说明" }}
          value={data.discountDetails}
          set={(value) => set("discountDetails", value)}
        />
        <FieldInput
          field={{
            key: "categoryId",
            label: "支出分类",
            type: "select",
            options: [
              { value: "", label: "未分类" },
              ...state.categories
                .filter(
                  (category: any) =>
                    category.type === "expense" &&
                    (!category.archived || category.id === data.categoryId),
                )
                .map((category: any) => ({
                  value: category.id,
                  label: category.name,
                })),
            ],
          }}
          value={data.categoryId}
          set={(value) => set("categoryId", value)}
        />
        <FieldInput
          field={{
            key: "accountId",
            label: "付款账户",
            type: "select",
            options: [
              { value: "", label: "不指定账户" },
              ...state.accounts
                .filter(
                  (account: any) =>
                    !account.archived || account.id === data.accountId,
                )
                .map((account: any) => ({
                  value: account.id,
                  label: account.name,
                })),
            ],
          }}
          value={data.accountId}
          set={(value) => set("accountId", value)}
        />
      </div>
      {entry && (
        <>
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.syncLedgerCategory}
              onChange={(event) =>
                set("syncLedgerCategory", event.target.checked)
              }
            />
            同步修改关联账单分类
          </label>
          <p className="hint">
            保存后会同步更新关联账单、自动优惠省钱和物品成本；已有退款时金额与日期不能冲突。
          </p>
        </>
      )}
      {!entry && (
        <p className="hint">
          当前没有有效账单，只更新购买快照；之后可继续补记账。
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button"
          disabled={busy || data.amount == null}
          onClick={async () => {
            setBusy(true);
            setError("");
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
          {busy ? <Busy /> : "保存并同步"}
        </button>
      </footer>
    </Modal>
  );
}

function PurchaseRelink({ item, state, save, close }: any) {
  const defaultAccount =
    item.purchaseAccountId ||
    (state.accounts.some(
      (account: any) =>
        account.id === state.user.defaultExpenseAccountId && !account.archived,
    )
      ? state.user.defaultExpenseAccountId
      : "");
  const [data, setData] = useState<any>({
      amount: item.purchaseAmount ?? null,
      date: item.purchasedAt || localDate(),
      discount: item.purchaseDiscount ?? 0,
      discountDetails: item.purchaseDiscountDetails || "",
      categoryId: item.categoryId || "",
      accountId: defaultAccount,
      planned: item.budget ?? null,
      createItem: !item.ownedItemId,
      createSaving: item.budget != null,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, value: any) => setData({ ...data, [key]: value });
  return (
    <Modal title={`补记账 · ${item.name}`} close={close}>
      <p className="hint">
        这件物品保留了“已购买”事实，但当前没有有效账单。补记会新建一笔支出并重新关联购买快照。
      </p>
      <div className="form-grid">
        <FieldInput
          field={{
            key: "date",
            label: "购买日期",
            type: "date",
            required: true,
          }}
          value={data.date}
          set={(value) => set("date", value)}
        />
        <FieldInput
          field={{
            key: "amount",
            label: "实际付款（元）",
            type: "money",
            required: true,
          }}
          value={data.amount}
          set={(value) => set("amount", value)}
        />
        <FieldInput
          field={{ key: "discount", label: "真实优惠（元）", type: "money" }}
          value={data.discount}
          set={(value) => set("discount", value)}
        />
        <FieldInput
          field={{ key: "discountDetails", label: "优惠说明" }}
          value={data.discountDetails}
          set={(value) => set("discountDetails", value)}
        />
        <FieldInput
          field={{
            key: "categoryId",
            label: "支出分类",
            type: "select",
            options: [
              { value: "", label: "未分类" },
              ...state.categories
                .filter(
                  (category: any) =>
                    category.type === "expense" &&
                    (!category.archived || category.id === data.categoryId),
                )
                .map((category: any) => ({
                  value: category.id,
                  label: category.name,
                })),
            ],
          }}
          value={data.categoryId}
          set={(value) => set("categoryId", value)}
        />
        <FieldInput
          field={{
            key: "accountId",
            label: "付款账户",
            type: "select",
            options: [
              { value: "", label: "不指定账户" },
              ...state.accounts
                .filter(
                  (account: any) =>
                    !account.archived || account.id === data.accountId,
                )
                .map((account: any) => ({
                  value: account.id,
                  label: account.name,
                })),
            ],
          }}
          value={data.accountId}
          set={(value) => set("accountId", value)}
        />
        <FieldInput
          field={{
            key: "planned",
            label: "原计划金额（元，可选）",
            type: "money",
          }}
          value={data.planned}
          set={(value) => set("planned", value)}
        />
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={data.createItem}
          onChange={(event) => set("createItem", event.target.checked)}
        />
        {item.ownedItemId ? "关联已有物品档案" : "同时建立物品档案"}
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={data.createSaving}
          onChange={(event) => set("createSaving", event.target.checked)}
        />
        记录降级购买省下的差额
      </label>
      <div className="preview-note">
        将新增一笔支出 ¥{money(data.amount || 0)}
        {data.discount ? `，并记录优惠 ¥${money(data.discount)}` : ""}。
      </div>
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button"
          disabled={busy || data.amount == null || data.amount <= 0}
          onClick={async () => {
            setBusy(true);
            setError("");
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
          {busy ? <Busy /> : "确认补记账"}
        </button>
      </footer>
    </Modal>
  );
}

function PurchaseUndo({ item, state, save, close }: any) {
  const entry = state.ledger.find((row: any) => row.id === item.ledgerId);
  const linkedSavings = state.savings.filter(
    (row: any) =>
      row.shoppingItemId === item.id &&
      row.source === "shopping" &&
      row.status !== "revoked",
  );
  const [keepItem, setKeepItem] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={`撤销购买 · ${item.name}`} close={close}>
      <p>
        撤销后物品会回到“待购买”。这会删除关联支出，并撤销购物决定产生的省钱记录；不会删除其他账单。
      </p>
      <div className="delete-summary">
        <ul>
          <li>
            关联账单：
            {entry
              ? `${entry.title} · ¥${money(entry.amount)} · ${entry.date}`
              : "无有效账单"}
          </li>
          <li>
            系统派生省钱：
            {linkedSavings.length
              ? linkedSavings
                  .map((row: any) => `${row.title} ¥${money(row.amount)}`)
                  .join("；")
              : "无"}
          </li>
          <li>
            物品档案：
            {item.ownedItemId
              ? keepItem
                ? "保留，并解除账单关联"
                : "尝试删除（已有使用记录时会被拒绝）"
              : "无"}
          </li>
        </ul>
      </div>
      {item.ownedItemId && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={keepItem}
            onChange={(event) => setKeepItem(event.target.checked)}
          />
          保留物品档案
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <footer>
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await save({ keepItem });
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "确认撤销购买"}
        </button>
      </footer>
    </Modal>
  );
}

function CreateReview({ item, state, save, close }: any) {
  const aiAllowed = !!state.ai?.allowed;
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
        disabled={busy || !data.description || !aiAllowed}
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

function SettingsPage({ state, mutate, edit, notify, refresh }: any) {
  const [autoBatch, setAutoBatch] = useState(state.user.autoBatch),
    [batchSize, setBatchSize] = useState(state.user.batchSize),
    [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState(
      state.user.defaultExpenseAccountId || "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="settings-grid">
      <NavigationSettings state={state} mutate={mutate} notify={notify} />
      <PersonalAi state={state} refresh={refresh} />
      <InviteCodePanel state={state} mutate={mutate} notify={notify} />
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
              className="pill category-pill"
              key={c.id}
              onClick={() => edit("categories", c)}
            >
              <CategoryMark category={c} size={14} />
              {c.type === "income" ? "+ " : "− "}
              {c.name}
              {c.archived && "（归档）"}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>默认支出账户</h2>
        <p className="hint">
          新支出、购物入账和 AI 确认会预填这个账户，每一笔仍可更改或清空。
        </p>
        <label className="field">
          <span>默认账户</span>
          <select
            value={defaultExpenseAccountId}
            onChange={(e) => setDefaultExpenseAccountId(e.target.value)}
          >
            <option value="">不设置</option>
            {state.accounts
              .filter(
                (account: any) =>
                  !account.archived || account.id === defaultExpenseAccountId,
              )
              .map((account: any) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.archived ? "（已归档）" : ""}
                </option>
              ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await mutate({
                action: "settings",
                autoBatch,
                batchSize,
                defaultExpenseAccountId: defaultExpenseAccountId || null,
              });
              notify("默认支出账户已保存");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          保存默认账户
        </button>
      </section>
      <section className="panel">
        <h2>AI 整理</h2>
        <p className="hint">
          {state.ai.configured
            ? "AI 服务已就绪"
            : state.ai.allowed
              ? "AI 服务暂不可用，可继续暂存与手动整理"
              : "未绑定邀请码，暂不能使用 AI；可先手动记账、暂存与导入导出"}
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
                await mutate({
                  action: "settings",
                  autoBatch,
                  batchSize,
                  defaultExpenseAccountId: defaultExpenseAccountId || null,
                });
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
            disabled={busy || !state.ai.allowed}
            onClick={async () => {
              setBusy(true);
              try {
                await api("ai-test", {});
                notify("AI 服务配置检查完成");
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
      <ExchangePanel state={state} refresh={refresh} />
    </div>
  );
}

function InviteCodePanel({ state, mutate, notify }: any) {
  const bound = !!state.ai?.inviteCode;
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel invite-panel">
      <div className="panel-heading">
        <h2>邀请码</h2>
        <span className={`invite-status ${bound ? "active" : ""}`}>
          <i aria-hidden="true" />
          {bound ? "已生效" : "未绑定"}
        </span>
      </div>
      {bound ? (
        <div className="invite-bound">
          <span className="invite-bound-icon" aria-hidden="true">
            <TicketCheck size={20} />
          </span>
          <div className="invite-bound-copy">
            <small>已绑定邀请码</small>
            <strong>{state.ai.inviteCode}</strong>
            <p className="hint">系统 AI 不限使用次数，无需再填写。</p>
          </div>
          <span className="invite-bound-check" aria-hidden="true">
            <Check size={16} />
          </span>
        </div>
      ) : (
        <form
          className="invite-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!code.trim() || busy) return;
            setBusy(true);
            setError("");
            try {
              await mutate({ action: "redeemInvite", code: code.trim() });
              setCode("");
              notify("邀请码已绑定");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="hint">
            未绑定邀请码暂不能使用 AI；已经注册的账号可以补填邀请码，绑定后即可使用且不限次数。
          </p>
          <div className={`invite-ticket ${code.trim() ? "filled" : ""}`}>
            <div className="invite-ticket-head">
              <label htmlFor="settings-invite-code">
                <Ticket size={15} aria-hidden="true" />
                邀请码
              </label>
              <small>{code.trim() ? "待绑定" : "选填"}</small>
            </div>
            <input
              id="settings-invite-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-describedby="settings-invite-hint"
            />
          </div>
          <div className="invite-actions">
            <button className="button" disabled={busy || !code.trim()}>
              {busy ? <Busy /> : "绑定邀请码"}
            </button>
            <small className="hint" id="settings-invite-hint">
              绑定后不能更换，请核对后提交。
            </small>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
