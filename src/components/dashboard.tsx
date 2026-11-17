"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Bell,
} from "lucide-react";
import {
  defaultWidgets,
  widgetNames,
  totals,
  money,
  savingTypes,
  effectiveSaving,
  itemCostView,
  localDate,
} from "@/lib/domain";
import {
  addDays,
  comparisonLabel,
  comparisonRange,
  bucketRecords,
  daysBetween,
  equalLengthPrevious,
  periodLabel,
  periodRange,
  shiftPeriod,
  trendBuckets,
  trendGranularity,
  type DateRange,
  type NaturalPeriodMode,
  type PeriodMode,
} from "@/lib/period";
import { Modal, Empty, api, Busy } from "./ui";
import { DashboardSketch, PlayfulJar } from "./dashboard-art";

export default function Dashboard({
  state,
  refresh,
  openLedger,
  openPage,
  dates,
  setDates,
  reminders = [],
}: any) {
  const [customize, setCustomize] = useState(false),
    [analysis, setAnalysis] = useState<any>(null),
    [analysisRange, setAnalysisRange] = useState<DateRange | null>(null),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState<PeriodMode>("month"),
    [anchor, setAnchor] = useState(dates.start),
    [today, setToday] = useState(localDate(new Date(), state.user.timezone)),
    [costMode, setCostMode] = useState<"day" | "use">("day");
  const widgets = state.user.preferences.widgets || defaultWidgets;
  const [order, setOrder] = useState<string[]>(widgets),
    [sizes, setSizes] = useState<Record<string, string>>(
      state.user.preferences.sizes || {},
    );
  const [dragged, setDragged] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setToday(localDate(new Date(), state.user.timezone));
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    const timer = window.setInterval(update, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.clearInterval(timer);
    };
  }, [state.user.timezone]);
  const range: DateRange = useMemo(
    () =>
      mode === "custom"
        ? dates
        : periodRange(mode as NaturalPeriodMode, anchor, today),
    [mode, anchor, today, dates],
  );
  useEffect(() => {
    if (
      mode !== "custom" &&
      (dates.start !== range.start || dates.end !== range.end)
    )
      setDates(range);
  }, [mode, range, dates, setDates]);
  const entries = useMemo(
    () =>
      state.ledger.filter(
        (x: any) => x.date >= range.start && x.date <= range.end,
      ),
    [state.ledger, range],
  );
  const sum = totals(entries);
  const previousRange: DateRange & { partial?: boolean } =
    mode === "custom"
      ? equalLengthPrevious(range)
      : comparisonRange(mode as NaturalPeriodMode, range, today);
  const previous = totals(
    state.ledger.filter(
      (e: any) =>
        e.date >= previousRange.start && e.date <= previousRange.end,
    ),
  );
  const difference = sum.net - previous.net;
  const compareText =
    previous.net === 0
      ? sum.net === 0
        ? "持平"
        : `增加 ¥${money(sum.net)}（上期为 0，无可用百分比基数）`
      : `${difference > 0 ? "增加" : difference < 0 ? "减少" : "持平"} ¥${money(
          Math.abs(difference),
        )}`;
  const comparisonTruncated =
    previousRange.partial &&
    Date.parse(range.end) - Date.parse(range.start) !==
      Date.parse(previousRange.end) - Date.parse(previousRange.start);
  const nextDisabled =
    mode === "custom"
      ? range.end >= today ||
        addDays(range.end, daysBetween(range.start, range.end) + 1) > today
      : periodRange(
          mode as NaturalPeriodMode,
          shiftPeriod(mode as NaturalPeriodMode, anchor, 1),
          today,
        ).start > today;
  const categories = [...state.categories, { id: null, name: "未分类" }]
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      value: entries
        .filter((x: any) => x.type === "expense" && x.categoryId === c.id)
        .reduce((s: number, x: any) => s + x.amount, 0),
    }))
    .filter((x: any) => x.value > 0);
  const granularity = trendGranularity(mode, range);
  const buckets = trendBuckets(range, granularity);
  const groupedTrend = bucketRecords<any>(entries, buckets);
  const trend = buckets.map((bucket) => {
    const t = totals(groupedTrend.get(bucket.key) || []);
    return {
      date: bucket.label,
      full:
        bucket.start === bucket.end
          ? bucket.start
          : `${bucket.start} 至 ${bucket.end}`,
      income: t.income / 100,
      expense: t.expense / 100,
    };
  });
  const savings = state.savings.filter(
    (x: any) =>
      effectiveSaving(x) && x.date >= range.start && x.date <= range.end,
  );
  const colors = [
    "#356C5A",
    "#789BB7",
    "#E4C76D",
    "#A4B89F",
    "#D9ACA0",
    "#AAA3C2",
    "#C6D3CE",
  ];
  function chooseMode(next: PeriodMode) {
    setMode(next);
    if (next === "custom") return;
    setAnchor(today);
    setDates(periodRange(next, today, today));
  }
  function movePeriod(step: number) {
    if (mode === "custom") {
      const length =
        Math.round(
          (Date.parse(range.end) - Date.parse(range.start)) / 86_400_000,
        ) + 1;
      const start = new Date(
        Date.parse(range.start) + step * length * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      const end = new Date(
        Date.parse(range.end) + step * length * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      if (step > 0 && (start > today || end > today)) return;
      setDates({ start, end });
      return;
    }
    const nextAnchor = shiftPeriod(
      mode as NaturalPeriodMode,
      anchor,
      step,
    );
    const nextRange = periodRange(
      mode as NaturalPeriodMode,
      nextAnchor,
      today,
    );
    if (step > 0 && nextRange.start > today) return;
    setAnchor(nextAnchor);
    setDates(nextRange);
  }
  function backToCurrent() {
    if (mode === "custom") {
      chooseMode("month");
      return;
    }
    setAnchor(today);
    setDates(periodRange(mode as NaturalPeriodMode, today, today));
  }
  function move(key: string, step: number) {
    const next = [...order],
      i = next.indexOf(key),
      j = i + step;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }
  async function runAnalysis() {
    setBusy(true);
    setError("");
    try {
      const result = await api("analysis", {
        filter: { ...dates, type: "all" },
        question,
      });
      setAnalysis(result);
      setAnalysisRange({ start: result.filter.start, end: result.filter.end });
      setMode("custom");
      setDates({ start: result.filter.start, end: result.filter.end });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const render = (key: string) => {
    if (key === "summary")
      return (
        <section className="summary-sheet" key={key}>
          <div className="summary-top">
            <span>这段时间，日常有数</span>
            <span className="date-caption">
              {range.start} 至 {range.end}
            </span>
          </div>
          <div className="summary-values">
            <div>
              <span>
                <ArrowDownLeft size={15} /> 收入
              </span>
              <strong>¥{money(sum.income)}</strong>
            </div>
            <div>
              <span>
                <ArrowUpRight size={15} /> 净支出
              </span>
              <strong>¥{money(sum.net)}</strong>
              <small>
                支出 {money(sum.expense)} · 退款 {money(sum.refund)}
              </small>
            </div>
            <div>
              <span>留下来的</span>
              <strong>¥{money(sum.balance)}</strong>
              <small>期间收支结余</small>
            </div>
          </div>
          <div className="comparison-note">
            {comparisonLabel(mode, previousRange.partial)} ·{" "}
            {previousRange.start} 至 {previousRange.end}：净支出 {compareText}
            {comparisonTruncated &&
              "（上期较短，按相同已过天数截断）"}
          </div>
          <svg className="sheet-doodle" viewBox="0 0 130 45" aria-hidden="true">
            <path
              d="M3 28Q25 12 47 28T91 26Q104 21 122 4M108 5L123 3L121 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </section>
      );
    if (key === "trend")
      return (
        <section key={key} className="panel widget wide">
          <div className="panel-heading">
            <h2>钱的来来往往</h2>
            <div className="legend">
              <i />
              收入 <i className="blue" />
              支出
            </div>
          </div>
          {entries.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#A8C6AE" stopOpacity={0.45} />
                      <stop offset="1" stopColor="#A8C6AE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="#E8EBE4"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={22}
                    tick={{ fill: "#71817B", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: "#71817B", fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(v: any) => `¥${v}`}
                    labelFormatter={(_: any, payload: any) =>
                      payload?.[0]?.payload?.full || ""
                    }
                    labelStyle={{ color: "#283B38" }}
                  />
                  <Area
                    dataKey="income"
                    name="收入"
                    stroke="#356C5A"
                    fill="url(#incomeFill)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="expense"
                    name="支出"
                    stroke="#789BB7"
                    fill="transparent"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="还没有收支曲线"
              text="记下第一笔，变化就从这里开始。"
            />
          )}
        </section>
      );
    if (key === "reminders")
      return (
        <section key={key} className="panel reminder-widget">
          <div className="panel-heading">
            <h2>现在要处理</h2>
            <button className="text-button" onClick={() => openPage("reminders")}>
              提醒中心
            </button>
          </div>
          {reminders.length ? (
            reminders.slice(0, 4).map((item: any) => (
              <button
                className="split-row reminder-widget-row"
                key={item.id}
                onClick={() => openPage("reminders")}
              >
                <span>
                  <Bell size={15} />
                  {item.title}
                </span>
                <b>{item.targetDate || "待处理"}</b>
              </button>
            ))
          ) : (
            <Empty
              title="眼前没有待处理提醒"
              text="临期物品、清单准备和固定日期会出现在这里。"
            />
          )}
        </section>
      );
    if (key === "savings")
      return (
        <section key={key} className="panel saving-widget">
          <div className="panel-heading">
            <h2>一点点省下来</h2>
            <span className="pill">省钱罐</span>
          </div>
          <div className="jar-total">
            <PlayfulJar />
            <div>
              <small>记录省下</small>
              <strong>
                ¥{money(savings.reduce((s: number, x: any) => s + x.amount, 0))}
              </strong>
              <p>每个决定，都有回响</p>
            </div>
          </div>
          <div className="saving-splits">
            {Object.entries(savingTypes).map(([type, label]) => (
              <div key={type}>
                <span>{label}</span>
                <b>
                  ¥
                  {money(
                    savings
                      .filter((s: any) => s.type === type)
                      .reduce((a: number, s: any) => a + s.amount, 0),
                  )}
                </b>
              </div>
            ))}
          </div>
          <small className="hint">省下金额不计入收入与账户余额。</small>
        </section>
      );
    if (key === "categories")
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <h2>都花在哪儿了</h2>
            <span className="hint">按原始支出</span>
          </div>
          {categories.length ? (
            <>
              <div className="category-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      innerRadius={58}
                      outerRadius={83}
                      dataKey="value"
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={false}
                      onClick={(d: any) => openLedger(d.id)}
                    >
                      {categories.map((c: any, i: number) => (
                        <Cell key={c.name} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `¥${money(value)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="category-list">
                {categories.map((c: any, i: number) => (
                  <button key={c.name} onClick={() => openLedger(c.id)}>
                    <i style={{ background: colors[i % colors.length] }} />
                    <span>{c.name}</span>
                    <b>¥{money(c.value)}</b>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Empty title="还没有支出分类" text="已确认的支出会在这里汇总。" />
          )}
        </section>
      );
    if (key === "recent")
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <h2>最近几笔</h2>
            <button className="text-button" onClick={() => openLedger()}>
              查看账本
            </button>
          </div>
          {entries.length ? (
            entries.slice(0, 5).map((e: any) => (
              <button
                className="recent-row"
                key={e.id}
                onClick={() => openLedger()}
              >
                <span
                  className={`entry-symbol ${e.type === "income" ? "income" : ""}`}
                >
                  {e.type === "income" ? "↙" : e.type === "refund" ? "↶" : "↗"}
                </span>
                <span>
                  <b>{e.title}</b>
                  <small>
                    {e.date} ·{" "}
                    {state.categories.find((c: any) => c.id === e.categoryId)
                      ?.name || "未分类"}
                  </small>
                </span>
                <strong>
                  {["income", "refund"].includes(e.type)
                    ? "+"
                    : e.type === "transfer"
                      ? ""
                      : "−"}
                  {money(e.amount)}
                </strong>
              </button>
            ))
          ) : (
            <Empty title="账本等你落笔" />
          )}
        </section>
      );
    if (key === "accounts")
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <div className="illustrated-title">
              <DashboardSketch kind="wallet" />
              <h2>账户余额</h2>
            </div>
            <span className="hint">截至现在</span>
          </div>
          {state.accounts.map((a: any) => {
            let balance = a.opening;
            for (const e of state.ledger) {
              if (e.accountId === a.id)
                balance += ["income", "refund"].includes(e.type)
                  ? e.amount
                  : -e.amount;
              if (e.type === "transfer" && e.toAccountId === a.id)
                balance += e.amount;
            }
            return (
              <div className="split-row" key={a.id}>
                <span>
                  {a.name}
                  {a.archived && "（已归档）"}
                </span>
                <b>¥{money(balance)}</b>
              </div>
            );
          })}
        </section>
      );
    if (key === "shopping") {
      const shoppingListIds = new Set(
        state.lists
          .filter((list: any) => (list.kind || "shopping") === "shopping")
          .map((list: any) => list.id),
      );
      const list = state.shopping.filter(
        (s: any) =>
          shoppingListIds.has(s.listId) &&
          ["planned", "considering"].includes(s.status),
      );
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <div className="illustrated-title">
              <DashboardSketch kind="bag" />
              <h2>还在考虑的愿望</h2>
            </div>
            <span className="pill">{list.length} 件</span>
          </div>
          {list.length ? (
            list.slice(0, 4).map((s: any) => (
              <div key={s.id} className="split-row">
                <span>{s.name}</span>
                <b>{s.budget == null ? "预算未定" : `¥${money(s.budget)}`}</b>
              </div>
            ))
          ) : (
            <Empty
              title="购物清单很轻盈"
              text="想买的东西可以先记下来，慢慢考虑。"
            />
          )}
          <button className="text-button sketch-link" onClick={() => openPage("shopping")}>
            去看看愿望清单
          </button>
        </section>
      );
    }
    if (key === "items") {
      const costs = state.items
        .filter(
          (item: any) =>
            item.costEnabled !== false &&
            item.price != null &&
            item.purchaseDate,
        )
        .map((item: any) => {
          const ledger = state.ledger.find((e: any) => e.id === item.ledgerId);
          const refunds = ledger
            ? state.ledger
                .filter((e: any) => e.refundOfId === ledger.id)
                .reduce((a: number, e: any) => a + e.amount, 0)
            : 0;
          const usageCount = state.usage
            .filter((u: any) => u.itemId === item.id)
            .reduce((a: number, u: any) => a + u.count, 0);
          const view = itemCostView(
            { ...item, mode: costMode },
            { ledger, refunds, usageCount, today },
          );
          return {
            ...item,
            view,
          };
        })
        .filter((item: any) => item.view.value != null)
        .sort((a: any, b: any) => b.view.value - a.view.value)
        .slice(0, 5);
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <div className="illustrated-title">
              <DashboardSketch kind="hourglass" />
              <h2>物品成本排行</h2>
            </div>
            <div className="cost-mode-toggle">
              <button
                className={costMode === "day" ? "selected" : ""}
                onClick={() => setCostMode("day")}
              >
                按天
              </button>
              <button
                className={costMode === "use" ? "selected" : ""}
                onClick={() => setCostMode("use")}
              >
                按次
              </button>
            </div>
          </div>
          {costs.length ? (
            costs.map((item: any) => (
              <button
                className="split-row cost-row"
                key={item.id}
                onClick={() => openPage("items")}
              >
                <span>{item.name}</span>
                <b>
                  ¥{money(item.view.value)} {item.view.unit}
                </b>
              </button>
            ))
          ) : (
            <Empty
              title={
                costMode === "use" ? "还没有可排名的使用记录" : "记录一件常用物品"
              }
              text="让每一次使用，都有迹可循。"
            />
          )}
          <button className="text-button" onClick={() => openPage("items")}>
            查看截至今天的全部成本
          </button>
        </section>
      );
    }
    return null;
  };
  return (
    <>
      <div className="dashboard-toolbar">
        <div className="period-toolbar">
          <div className="period-tabs" aria-label="统计周期">
            {(
              [
                ["day", "日"],
                ["week", "周"],
                ["month", "月"],
                ["half", "半年"],
                ["year", "年"],
                ["custom", "自定义"],
              ] as [PeriodMode, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={mode === key ? "selected" : ""}
                onClick={() => chooseMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="period-nav">
            <button
              className="button secondary compact"
              onClick={() => movePeriod(-1)}
            >
              上一{{
                day: "天",
                week: "周",
                month: "月",
                half: "半年度",
                year: "年",
                custom: "段",
              }[mode]}
            </button>
            <button className="period-current" onClick={backToCurrent}>
              {periodLabel(mode, range, today)}
              <small>
                {range.start} 至 {range.end}
              </small>
            </button>
            <button
              className="button secondary compact"
              disabled={nextDisabled}
              onClick={() => movePeriod(1)}
            >
              下一{{
                day: "天",
                week: "周",
                month: "月",
                half: "半年度",
                year: "年",
                custom: "段",
              }[mode]}
            </button>
          </div>
          <div className="date-range">
            <label>
              从
              <input
                aria-label="统计开始日期"
                type="date"
                value={range.start}
                onChange={(e) => {
                  setMode("custom");
                  setDates({ start: e.target.value, end: range.end });
                }}
              />
            </label>
            <span>至</span>
            <input
              aria-label="统计结束日期"
              type="date"
              value={range.end}
              onChange={(e) => {
                setMode("custom");
                setDates({ start: range.start, end: e.target.value });
              }}
            />
          </div>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setOrder(widgets);
            setCustomize(true);
          }}
        >
          <SlidersHorizontal size={16} />
          自定义首页
        </button>
      </div>
      <div className="dashboard-grid">
        {widgets.map((key: string) => (
          <div
            className={`widget-wrap ${key === "summary" ? "full" : sizes[key] === "wide" ? "chosen-wide" : key === "trend" ? "span-wide" : ""}`}
            data-widget={key}
            key={key}
          >
            {render(key)}
          </div>
        ))}
      </div>
      <section className="panel analysis-panel">
        <div>
          <h2>让 AI 帮你读读账本</h2>
          <p className="hint">数字由账本计算，AI 只负责整理观察。</p>
        </div>
        <div className="analysis-input">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：看看这个月吃饭花了多少，和上个月比比"
          />
          <button
            className="button"
            disabled={busy || !state.ai?.allowed}
            onClick={runAnalysis}
          >
            {busy ? <Busy /> : "分析账目"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {analysis && (
          <div className="analysis-result">
            <small>
              {analysisRange?.start} 至 {analysisRange?.end} ·{" "}
              {new Date(analysis.createdAt).toLocaleString("zh-CN")}
              {analysis.cached && " · 已缓存"}
            </small>
            {analysisRange &&
              (analysisRange.start !== range.start ||
                analysisRange.end !== range.end) && (
                <p className="warning">
                  当前统计范围已改变，这份分析对应的是上方旧区间。
                </p>
              )}
            <p>{analysis.content}</p>
          </div>
        )}
      </section>
      {customize && (
        <Modal title="安排你的统计首页" close={() => setCustomize(false)}>
          <p className="hint">选择想看的内容，拖拽或用按钮调整顺序。</p>
          <div className="widget-options">
            {[
              ...order,
              ...defaultWidgets.filter((k) => !order.includes(k)),
            ].map((key) => (
              <div
                key={key}
                draggable={order.includes(key)}
                onDragStart={() => setDragged(key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragged && dragged !== key && order.includes(key)) {
                    const next = order.filter((k) => k !== dragged);
                    next.splice(next.indexOf(key), 0, dragged);
                    setOrder(next);
                  }
                  setDragged(null);
                }}
              >
                <GripVertical size={16} />
                <label>
                  <input
                    type="checkbox"
                    checked={order.includes(key)}
                    onChange={(e) =>
                      setOrder(
                        e.target.checked
                          ? [...order, key]
                          : order.filter((k) => k !== key),
                      )
                    }
                  />
                  {widgetNames[key]}
                </label>
                {order.includes(key) && (
                  <>
                    <select
                      aria-label={`${widgetNames[key]}宽度`}
                      value={sizes[key] || "normal"}
                      onChange={(e) =>
                        setSizes({ ...sizes, [key]: e.target.value })
                      }
                    >
                      <option value="normal">标准</option>
                      <option value="wide">宽</option>
                    </select>
                    <button
                      className="icon-button"
                      aria-label="上移"
                      onClick={() => move(key, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="下移"
                      onClick={() => move(key, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <footer>
            <button
              className="button secondary"
              onClick={() => {
                setOrder(defaultWidgets);
                setSizes({});
              }}
            >
              恢复默认
            </button>
            <button
              className="button"
              onClick={async () => {
                try {
                  await api("mutate", {
                    action: "preferences",
                    preferences: { schemaVersion: 1, widgets: order, sizes },
                  });
                  await refresh();
                  setCustomize(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              保存布局
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
