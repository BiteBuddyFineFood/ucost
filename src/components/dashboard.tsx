"use client";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import {
  defaultWidgets,
  widgetNames,
  totals,
  money,
  savingTypes,
  heldDays,
} from "@/lib/domain";
import { Modal, Empty, Jar, api, Busy } from "./ui";

export default function Dashboard({
  state,
  refresh,
  openLedger,
  openPage,
  dates,
  setDates,
}: any) {
  const [customize, setCustomize] = useState(false),
    [analysis, setAnalysis] = useState<any>(null),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const widgets = state.user.preferences.widgets || defaultWidgets;
  const [order, setOrder] = useState<string[]>(widgets),
    [sizes, setSizes] = useState<Record<string, string>>(
      state.user.preferences.sizes || {},
    );
  const [dragged, setDragged] = useState<string | null>(null);
  const entries = useMemo(
    () =>
      state.ledger.filter(
        (x: any) => x.date >= dates.start && x.date <= dates.end,
      ),
    [state.ledger, dates],
  );
  const sum = totals(entries);
  const shiftMonth = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    const previous = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(
      Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0),
    ).getUTCDate();
    previous.setUTCDate(Math.min(d, last));
    return previous.toISOString().slice(0, 10);
  };
  const previousStart = shiftMonth(dates.start),
    previousEnd = shiftMonth(dates.end);
  const previous = totals(
    state.ledger.filter(
      (e: any) => e.date >= previousStart && e.date <= previousEnd,
    ),
  );
  const categories = [...state.categories, { id: null, name: "未分类" }]
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      value: entries
        .filter((x: any) => x.type === "expense" && x.categoryId === c.id)
        .reduce((s: number, x: any) => s + x.amount, 0),
    }))
    .filter((x: any) => x.value > 0);
  const duration = Math.min(
    366,
    Math.max(
      0,
      Math.floor((Date.parse(dates.end) - Date.parse(dates.start)) / 86400000) +
        1,
    ),
  );
  const days = Array.from({ length: duration }, (_, i) =>
    new Date(Date.parse(dates.start) + i * 86400000).toISOString().slice(0, 10),
  );
  const trend = days.map((day) => {
    const t = totals(entries.filter((e: any) => e.date === day));
    return {
      date: day.slice(5),
      income: t.income / 100,
      expense: t.expense / 100,
    };
  });
  const savings = state.savings.filter(
    (x: any) =>
      x.status === "valid" && x.date >= dates.start && x.date <= dates.end,
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
              {dates.start} 至 {dates.end}
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
            上月同期 {previousStart} 至 {previousEnd}：结余 ¥
            {money(previous.balance)} · 净支出
            {sum.net >= previous.net ? "增加" : "减少"} ¥
            {money(Math.abs(sum.net - previous.net))}
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
    if (key === "savings")
      return (
        <section key={key} className="panel saving-widget">
          <div className="panel-heading">
            <h2>一点点省下来</h2>
            <span className="pill">省钱罐</span>
          </div>
          <div className="jar-total">
            <Jar />
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
            <h2>账户余额</h2>
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
      const list = state.shopping.filter((s: any) =>
        ["planned", "considering"].includes(s.status),
      );
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <h2>还在考虑的愿望</h2>
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
        </section>
      );
    }
    if (key === "items") {
      const costs = state.items
        .map((item: any) => {
          const ledger = state.ledger.find((e: any) => e.id === item.ledgerId);
          const refunds = ledger
            ? state.ledger
                .filter((e: any) => e.refundOfId === ledger.id)
                .reduce((a: number, e: any) => a + e.amount, 0)
            : 0;
          return {
            ...item,
            cost:
              ((ledger?.amount ?? item.price) - refunds - item.recovery) /
              heldDays(item.purchaseDate, item.retiredDate),
          };
        })
        .sort((a: any, b: any) => b.cost - a.cost)
        .slice(0, 5);
      return (
        <section key={key} className="panel">
          <div className="panel-heading">
            <h2>物品成本排行</h2>
            <button className="text-button" onClick={() => openPage("items")}>
              截至现在
            </button>
          </div>
          {costs.length ? (
            costs.map((item: any) => (
              <button
                className="split-row cost-row"
                key={item.id}
                onClick={() => openPage("items")}
              >
                <span>{item.name}</span>
                <b>¥{money(item.cost)} / 天</b>
              </button>
            ))
          ) : (
            <Empty title="记录一件常用物品" text="让每一次使用，都有迹可循。" />
          )}
        </section>
      );
    }
    return null;
  };
  return (
    <>
      <div className="dashboard-toolbar">
        <div className="date-range">
          <label>
            从
            <input
              aria-label="统计开始日期"
              type="date"
              value={dates.start}
              onChange={(e) => setDates({ ...dates, start: e.target.value })}
            />
          </label>
          <span>至</span>
          <input
            aria-label="统计结束日期"
            type="date"
            value={dates.end}
            onChange={(e) => setDates({ ...dates, end: e.target.value })}
          />
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
          <button className="button" disabled={busy} onClick={runAnalysis}>
            {busy ? <Busy /> : "分析账目"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {analysis && (
          <div className="analysis-result">
            <small>
              {analysis.filter.start} 至 {analysis.filter.end} ·{" "}
              {new Date(analysis.createdAt).toLocaleString("zh-CN")}
              {analysis.cached && " · 已缓存"}
            </small>
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
