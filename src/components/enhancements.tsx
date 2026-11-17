"use client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api, Modal, Busy } from "./ui";
import { cents, money, localDate, effectiveSaving, totals } from "@/lib/domain";

export function AiStatus({ ai, compact = false }: any) {
  const allowed = ai?.allowed === true;
  const usage = !allowed
    ? "未绑定邀请码，暂不能使用 AI"
    : ai.providerMode === "personal"
      ? "个人配置 · 不扣系统额度"
      : ai.unlimited
        ? `系统服务 · 邀请码 ${ai.inviteCode} · 不限次数`
        : `系统服务 · 今日剩余 ${ai.remaining} / ${ai.limit} 次`;
  const unavailable = !allowed || !ai.configured;
  if (compact)
    return (
      <p
        className="hint ai-status-compact"
        title={
          !allowed
            ? "在设置中填写邀请码后即可使用 AI"
            : undefined
        }
      >
        {usage}
        {unavailable && " · 暂不可用"}。
      </p>
    );
  return (
    <p className="hint">
      {usage}
      {unavailable && " · 暂不可用"}。
      {!allowed && " 在“邀请码”一栏填写有效邀请码后即可使用。"}
    </p>
  );
}
export function PersonalAi({ state, refresh }: any) {
  const allowed = state.ai?.allowed === true;
  const [config, setConfig] = useState<any>(null),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!allowed) return;
    api("ai/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [allowed]);
  return (
    <section className="panel">
      <h2>AI 服务</h2>
      <AiStatus ai={state.ai} />
      {!allowed && (
        <p className="hint">
          未绑定邀请码的用户暂不能使用 AI；请先在“邀请码”一栏绑定有效邀请码。
        </p>
      )}
      <div className="ai-service-stack">
        <details className="ai-service-details">
          <summary
            className="button secondary ai-service-toggle"
            aria-disabled={!allowed}
            onClick={(e) => {
              if (!allowed) e.preventDefault();
            }}
          >
            <span>自定义 AI 服务</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          {allowed && config && (
            <form
              className="enhancement-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  setConfig(
                    await api("ai/config", {
                      ...config,
                      key: key || undefined,
                    }),
                  );
                  setKey("");
                  await refresh();
                  setMessage("个人配置已保存");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) =>
                    setConfig({ ...config, enabled: e.target.checked })
                  }
                />
                启用个人配置
              </label>
              {[
                ["baseUrl", "接口地址"],
                ["textModel", "文本模型"],
                ["visionModel", "图片模型（可选）"],
              ].map(([field, label]) => (
                <label className="field" key={field}>
                  <span>{label}</span>
                  <input
                    value={config[field]}
                    onChange={(e) =>
                      setConfig({ ...config, [field]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label className="field">
                <span>密钥{config.hasKey ? "（已保存，留空保留）" : ""}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={config.hasKey ? "••••••••" : "填写个人服务密钥"}
                />
              </label>
              <p className="hint">
                启用后所有 AI
                任务使用个人服务。连接失败时可停用，主动切回系统服务。
              </p>
              <button className="button" disabled={busy}>
                {busy ? <Busy /> : "保存 AI 配置"}
              </button>
            </form>
          )}
        </details>
        <button
          className="button secondary"
          disabled={busy || !allowed}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await api("ai/test", {});
              setMessage(
                r.inference
                  ? "个人服务连接成功"
                  : r.ok
                    ? "系统服务已配置（未发起推理）"
                    : "系统服务暂未配置",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          检查当前服务
        </button>
        {error && <p className="error">{error}</p>}
        {message && <p role="status">{message}</p>}
      </div>
    </section>
  );
}

export function GroupControls({
  state,
  entity,
  selected,
  mutate,
  notify,
}: any) {
  const [open, setOpen] = useState(false),
    [groupId, setGroupId] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(body: any) {
    setBusy(true);
    setError("");
    try {
      await mutate(body);
      setName("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        管理分组{selected.length ? ` / 移动 ${selected.length} 条` : ""}
      </button>
      {open && (
        <Modal title="记录分组" close={() => setOpen(false)}>
          <p className="hint">
            移动、移出或解散只改变显示归属，清单仍能找到来源账单，预算仍按来源计算。清单组在下一次记账时可能重新建立。
          </p>
          <div className="enhancement-form">
            <label className="field">
              <span>新组名称</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button
              disabled={busy || !name.trim()}
              className="button secondary"
              onClick={async () => {
                const groupName = name.trim();
                if (await run({ action: "groupSave", name: groupName })) {
                  notify?.(`已创建分组「${groupName}」`);
                  setOpen(false);
                }
              }}
            >
              创建组
            </button>
            <label className="field">
              <span>目标组</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">移出组（未分组）</option>
                {state.groups.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.sourceDeleted
                      ? " · 来源清单已删除"
                      : g.sourceListId
                        ? " · 清单来源"
                        : ""}
                  </option>
                ))}
              </select>
            </label>
            {selected.length > 0 && (
              <>
                <p>本次移动 {selected.length} 条记录，原清单来源与预算不变。</p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run({
                      action: "groupAssign",
                      entity,
                      groupId: groupId || null,
                      records: selected.map((r: any) => ({
                        id: r.id,
                        version: r.version,
                      })),
                    })
                  }
                >
                  {groupId ? "确认移入组" : "确认移出组"}
                </button>
              </>
            )}
            {groupId && (
              <>
                <p>
                  解散将解除这个组内全部账单和省钱记录的分组，保留全部账目及清单来源。
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    await run({
                      action: "groupDissolve",
                      id: groupId,
                      version: state.groups.find((g: any) => g.id === groupId)
                        .version,
                    });
                    setGroupId("");
                  }}
                >
                  确认解散组
                </button>
                {!state.groups.find((g: any) => g.id === groupId)
                  ?.sourceListId && (
                  <button
                    className="button secondary"
                    disabled={busy || !name.trim()}
                    onClick={() =>
                      run({
                        action: "groupSave",
                        id: groupId,
                        version: state.groups.find((g: any) => g.id === groupId)
                          .version,
                        name,
                      })
                    }
                  >
                    用新名称重命名
                  </button>
                )}
              </>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

export function GroupHeading({
  state,
  entity,
  records,
  groupId,
  viewAll,
}: any) {
  const group = state.groups.find((g: any) => g.id === groupId),
    summary = totals(records);
  return (
    <div className="group-heading">
      <div>
        <strong>{group?.name || "未分组"}</strong>
        {group?.sourceDeleted && <span className="pill">来源清单已删除</span>}
        <p className="hint">
          {records.map((r: any) => r.date).sort()[0]} —{" "}
          {records
            .map((r: any) => r.date)
            .sort()
            .at(-1)}{" "}
          · {records.length} 条 · 当前筛选小计
        </p>
      </div>
      <div>
        {entity === "ledger"
          ? `收入 ¥${money(summary.income)} · 支出 ¥${money(summary.expense)} · 退款 ¥${money(summary.refund)} · 净支出 ¥${money(summary.net)}`
          : `有效省钱 ¥${money(records.filter(effectiveSaving).reduce((s: number, r: any) => s + r.amount, 0))}`}
        <button className="text-button" onClick={viewAll}>
          查看全组
        </button>
      </div>
    </div>
  );
}

export function ListActions({ state, list, mutate }: any) {
  const [checkout, setCheckout] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const items = state.shopping.filter((i: any) => i.listId === list.id),
    paid = items
      .filter((i: any) => i.status === "purchased")
      .reduce((s: number, i: any) => s + (i.purchaseAmount || 0), 0);
  const entries = state.ledger.filter((e: any) =>
    items.some((i: any) => i.id === e.sourceShoppingItemId),
  );
  const refunded = state.ledger
    .filter((e: any) => entries.some((p: any) => p.id === e.refundOfId))
    .reduce((s: number, e: any) => s + e.amount, 0);
  const itemBudgetTotal = items.reduce(
      (s: number, i: any) => s + (i.budget || 0),
      0,
    ),
    linkedTotal = entries.reduce((s: number, e: any) => s + e.amount, 0),
    remaining = list.budget == null ? null : list.budget - paid,
    usedPercent =
      list.budget == null
        ? null
        : list.budget > 0
          ? Math.round((paid / list.budget) * 100)
          : paid > 0
            ? 100
            : 0,
    meterWidth =
      usedPercent == null ? 0 : Math.min(100, Math.max(0, usedPercent)),
    overBudget = remaining != null && remaining < 0,
    pendingCount = items.filter((i: any) =>
      ["planned", "considering"].includes(i.status),
    ).length,
    unrecordedCount = items.filter(
      (i: any) =>
        i.status === "purchased" && !i.ledgerId && i.purchaseAmount !== 0,
    ).length,
    settlement = state.settlements.find((s: any) => s.listId === list.id);
  async function run(body: any) {
    setBusy(true);
    setError("");
    try {
      await mutate(body);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openPreview() {
    setError("");
    setConfirmed(false);
    try {
      setPreview(
        await api("mutate", {
          action: "listSettlementPreview",
          id: list.id,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel list-budget">
      <header className="budget-head">
        <div className="budget-title">
          <span className="budget-title-mark" aria-hidden="true" />
          <h3>本单预算</h3>
        </div>
        <div className="budget-head-meta">
          <span className="budget-mode">
            {list.savingMode === "budget" ? "按整单预算结算" : "按商品记录"}
          </span>
          <button
            className="text-button budget-settle"
            disabled={busy}
            onClick={openPreview}
          >
            预算结算 / 核算方式
          </button>
        </div>
      </header>
      <div
        className={`budget-balance${overBudget ? " is-over" : ""}${
          list.budget == null ? " is-unset" : ""
        }`}
      >
        <div className="budget-balance-main">
          <span>{overBudget ? "已超出预算" : "剩余预算"}</span>
          <strong>
            {list.budget == null
              ? "未设置"
              : overBudget
                ? `−¥${money(Math.abs(remaining ?? 0))}`
                : `¥${money(remaining ?? 0)}`}
          </strong>
          <small>
            {list.budget == null
              ? "填入总预算后，这里会显示剩余可用"
              : overBudget
                ? `已用 ${usedPercent}% · 超出 ¥${money(
                    Math.abs(remaining ?? 0),
                  )}`
                : `已用 ${usedPercent}% · 总预算 ¥${money(list.budget)}`}
          </small>
        </div>
        <div className="budget-meter-wrap">
          <div
            className={`budget-meter${overBudget ? " is-over" : ""}${
              list.budget == null ? " is-unset" : ""
            }`}
            {...(list.budget == null
              ? {}
              : {
                  role: "progressbar",
                  "aria-label": "预算使用进度",
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                  "aria-valuenow": Math.min(100, usedPercent ?? 0),
                  "aria-valuetext": `已用 ${usedPercent}%`,
                })}
          >
            <span style={{ width: `${meterWidth}%` }} />
          </div>
          <div className="budget-flags">
            <span>
              <b>{pendingCount}</b> 项未购
            </span>
            <span>
              <b>{unrecordedCount}</b> 项已购未记账
            </span>
          </div>
        </div>
      </div>
      <dl className="budget-figures">
        <div>
          <dt>已购实付</dt>
          <dd>¥{money(paid)}</dd>
        </div>
        <div>
          <dt>已关联账本</dt>
          <dd>¥{money(linkedTotal)}</dd>
        </div>
        <div>
          <dt>退款</dt>
          <dd>¥{money(refunded)}</dd>
        </div>
      </dl>
      {settlement?.status === "pending" && (
        <p className="budget-note">预算结余待核对，已暂停计入有效省钱。</p>
      )}
      <div className="budget-actions">
        <button
          className="button"
          disabled={list.archived || !!list.closedAt}
          onClick={() => setCheckout(true)}
        >
          全部记账
        </button>
        <button
          className="button secondary"
          disabled={busy}
          title={`将物品预算合计 ¥${money(itemBudgetTotal)} 填入总预算`}
          onClick={() =>
            run({
              action: "save",
              entity: "lists",
              id: list.id,
              version: list.version,
              data: {
                budget: itemBudgetTotal,
              },
            })
          }
        >
          用物品预算合计填入总预算
        </button>
        {list.closedAt && (
          <button
            className="text-button"
            onClick={() =>
              run({ action: "listReopen", id: list.id, version: list.version })
            }
          >
            重新打开清单
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {checkout && (
        <Checkout
          state={state}
          list={list}
          mutate={mutate}
          close={() => setCheckout(false)}
        />
      )}
      {preview && (
        <Modal title="预算结算预览" close={() => setPreview(null)}>
          <div className="enhancement-form">
            <p>
              预算{" "}
              {preview.list.budget == null
                ? "未设置"
                : `¥${money(preview.list.budget)}`}{" "}
              − 实付 ¥{money(preview.paid)} = 结余 ¥
              {money(preview.surplus || 0)}。退款 ¥{money(preview.refunded)}{" "}
              单独展示。
            </p>
            <p>
              未购 {preview.pending} 项 · 实付待核对 {preview.unknown} 项 ·
              来源不明省钱 {preview.ambiguous.length} 项
            </p>
            <p>
              整单模式会替代以下 {preview.replaced.length}{" "}
              条商品省钱，保留优惠说明及主动停用状态：
            </p>
            {preview.replaced.map((s: any) => (
              <p key={s.id}>
                {s.title} · ¥{money(s.amount)}
                {s.suppressed ? " · 已主动停用" : ""}
              </p>
            ))}
            <label className="check-field">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已核对实付，确认本轮采购结束，采用整单预算模式
            </label>
            <button
              className="button"
              disabled={busy || !preview.canSettle || !confirmed}
              onClick={() =>
                run({
                  action: "listSettlementConfirm",
                  id: list.id,
                  fingerprint: preview.fingerprint,
                  confirmedClosed: true,
                  date: localDate(),
                })
              }
            >
              确认预算结余
            </button>
            {list.savingMode === "budget" && (
              <>
                <p>
                  切回按商品记录会撤销预算结余，恢复当前仍有效且未主动停用的商品省钱；原退款待核对状态继续保留。
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    run({
                      action: "listSavingMode",
                      mode: "item",
                      id: list.id,
                      fingerprint: preview.fingerprint,
                    })
                  }
                >
                  确认切回按商品记录
                </button>
              </>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}

function Checkout({ state, list, mutate, close }: any) {
  const items = state.shopping.filter((i: any) => i.listId === list.id);
  const [rows, setRows] = useState<any[]>(
    items.map((i: any) => ({
      id: i.id,
      version: i.version,
      selected: !i.ledgerId && i.status !== "skipped",
      paidText:
        i.purchaseAmount == null ? "" : (i.purchaseAmount / 100).toFixed(2),
      date: i.purchasedAt || localDate(),
      accountId:
        i.purchaseAccountId || state.user.defaultExpenseAccountId || "",
      categoryId: i.categoryId || "",
      discountText: ((i.purchaseDiscount || 0) / 100).toFixed(2),
      createItem: false,
      existingLedgerId: "",
    })),
  );
  const [preview, setPreview] = useState<any>(null),
    [settle, setSettle] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [operationId] = useState(() => crypto.randomUUID());
  function patch(index: number, changes: any) {
    setPreview(null);
    setRows(rows.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  }
  const checked = rows.filter((r) => r.selected);
  return (
    <Modal title="全部记账 · 逐项核对" close={close} wide>
      <div className="enhancement-form">
        <p className="hint">
          实付必须填写，预算仅供参考。已记账跳过、已放弃排除；取消选择的物品继续留在清单。零元可以建立物品档案，不生成零元支出。一批最多
          100 项。
        </p>
        <div className="filter-bar">
          <label className="field">
            <span>统一购买日期</span>
            <input
              type="date"
              onChange={(e) => {
                setPreview(null);
                setRows(rows.map((r) => ({ ...r, date: e.target.value })));
              }}
            />
          </label>
          <label className="field">
            <span>统一账户</span>
            <select
              defaultValue=""
              onChange={(e) => {
                setPreview(null);
                setRows(rows.map((r) => ({ ...r, accountId: e.target.value })));
              }}
            >
              <option value="">不指定</option>
              {state.accounts
                .filter((a: any) => !a.archived)
                .map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {rows.map((row, index) => {
          const item = items.find((i: any) => i.id === row.id);
          return (
            <fieldset
              className="checkout-row"
              key={row.id}
              disabled={!!item.ledgerId || item.status === "skipped"}
            >
              <legend>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) =>
                      patch(index, { selected: e.target.checked })
                    }
                  />
                  {item.name} ·{" "}
                  {item.ledgerId
                    ? "已记账，跳过"
                    : item.status === "skipped"
                      ? "已放弃"
                      : item.status === "purchased"
                        ? "已购未记账"
                        : "未购买，本次确认已购"}
                </label>
              </legend>
              <div className="checkout-fields">
                <label className="field">
                  <span>实付（元）</span>
                  <input
                    inputMode="decimal"
                    value={row.paidText}
                    onChange={(e) => patch(index, { paidText: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>购买日期</span>
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => patch(index, { date: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>分类{!row.categoryId && " · 未分类"}</span>
                  <select
                    value={row.categoryId}
                    onChange={(e) =>
                      patch(index, { categoryId: e.target.value })
                    }
                  >
                    <option value="">未分类</option>
                    {state.categories
                      .filter((c: any) => c.type === "expense" && !c.archived)
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>账户</span>
                  <select
                    value={row.accountId}
                    onChange={(e) =>
                      patch(index, { accountId: e.target.value })
                    }
                  >
                    <option value="">不指定</option>
                    {state.accounts
                      .filter((a: any) => !a.archived)
                      .map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>真实优惠（元）</span>
                  <input
                    inputMode="decimal"
                    value={row.discountText}
                    onChange={(e) =>
                      patch(index, { discountText: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>关联已有手工支出（可选）</span>
                  <select
                    value={row.existingLedgerId}
                    onChange={(e) =>
                      patch(index, { existingLedgerId: e.target.value })
                    }
                  >
                    <option value="">新增支出</option>
                    {state.ledger
                      .filter(
                        (e: any) =>
                          e.type === "expense" &&
                          !e.sourceShoppingItemId &&
                          !state.shopping.some((i: any) => i.ledgerId === e.id),
                      )
                      .map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.title} · {e.date} · ¥{money(e.amount)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={row.createItem}
                    onChange={(e) =>
                      patch(index, { createItem: e.target.checked })
                    }
                  />
                  建立物品档案{item.ownedItemId ? "（已有档案将复用）" : ""}
                </label>
              </div>
            </fieldset>
          );
        })}
        <label className="check-field">
          <input
            type="checkbox"
            checked={settle}
            onChange={(e) => {
              setSettle(e.target.checked);
              setPreview(null);
            }}
          />
          完成清单后，将预算结余记入省钱本（确认采购结束，并替代商品优惠/降级省钱）
        </label>
        {settle && (
          <p>
            整单预算 ¥{money(list.budget || 0)}。既有商品省钱{" "}
            {state.savings
              .filter(
                (s: any) =>
                  s.sourceListId === list.id &&
                  ["automatic", "shopping"].includes(s.source),
              )
              .map((s: any) => `${s.title} ¥${money(s.amount)}`)
              .join("、") || "无"}
            。未购项或未知实付将阻止结算。
          </p>
        )}
        <button
          className="button secondary"
          disabled={busy || !checked.length || checked.length > 100}
          onClick={async () => {
            setError("");
            setBusy(true);
            try {
              const submitted = checked.map(
                ({ paidText, discountText, existingLedgerId, ...r }) => ({
                  ...r,
                  paid: cents(paidText),
                  discount: cents(discountText),
                  categoryId: r.categoryId || null,
                  accountId: r.accountId || null,
                  ...(existingLedgerId
                    ? {
                        existingLedgerId,
                        ledgerVersion: state.ledger.find(
                          (e: any) => e.id === existingLedgerId,
                        )?.version,
                      }
                    : {}),
                }),
              );
              const p = await api("mutate", {
                action: "listCheckoutPreview",
                id: list.id,
                version: list.version,
                rows: submitted,
                settle,
              });
              setPreview({ ...p, submitted });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          预览本次记账
        </button>
        {preview && (
          <>
            <p>
              本次新增 {preview.count} 笔支出，合计 ¥{money(preview.total)}
              ，进入“{preview.groupName}”组。
              {settle
                ? `采购结束后生成预算结余 ¥${money(preview.projectedSurplus || 0)}，商品省钱不再累计。`
                : "保留按当前模式核算的省钱记录。"}
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await mutate({
                    action: "listCheckout",
                    operationId,
                    id: list.id,
                    version: list.version,
                    rows: preview.submitted,
                    fingerprint: preview.fingerprint,
                    settle,
                    date: localDate(),
                  });
                  close();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认全部记账
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}

export function Classification({
  state,
  entity,
  records,
  close,
  refresh,
  createCategory,
}: any) {
  const [taskOperationId, setTaskOperationId] = useState(""),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const saved = sessionStorage.getItem(
      `ucost-classification-${state.user.id}-${entity}`,
    );
    if (saved) {
      const parsed = JSON.parse(saved);
      setTaskOperationId(parsed.operationId);
      setSuggestions(parsed.suggestions);
    }
  }, [entity, state.user.id]);
  function update(rows: any[]) {
    setSuggestions(rows);
    sessionStorage.setItem(
      `ucost-classification-${state.user.id}-${entity}`,
      JSON.stringify({ operationId: taskOperationId, suggestions: rows }),
    );
  }
  return (
    <Modal title="AI 批量分类" close={close} wide>
      <div className="enhancement-form">
        <AiStatus ai={state.ai} />
        <button className="text-button" onClick={createCategory}>
          没有合适分类？创建分类
        </button>
        <p>
          本次 {records.length}{" "}
          条；未选记录时默认仅处理当前筛选范围的未分类记录。最多 50
          条。已有分类需主动选择。先生成建议，再逐条核对确认；只应用分类字段。
        </p>
        <button
          className="button secondary"
          disabled={
            busy ||
            !records.length ||
            records.length > 50 ||
            !state.ai.configured ||
            !state.ai.allowed
          }
          onClick={async () => {
            const operationId = crypto.randomUUID();
            setTaskOperationId(operationId);
            setBusy(true);
            setError("");
            try {
              const r = await api("classification/preview", {
                operationId,
                entity,
                records: records.map((r: any) => ({
                  id: r.id,
                  version: r.version,
                })),
              });
              const rows = r.suggestions.map((s: any) => ({
                ...s,
                selected: !!s.categoryId,
              }));
              setSuggestions(rows);
              sessionStorage.setItem(
                `ucost-classification-${state.user.id}-${entity}`,
                JSON.stringify({ operationId, suggestions: rows }),
              );
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          生成分类建议
        </button>
        {suggestions.map((s, index) => (
          <div className="checkout-row" key={s.id}>
            <label className="check-field">
              <input
                type="checkbox"
                checked={s.selected}
                onChange={(e) =>
                  update(
                    suggestions.map((r, i) =>
                      i === index ? { ...r, selected: e.target.checked } : r,
                    ),
                  )
                }
              />
              {s.title} · 原分类：
              {state.categories.find((c: any) => c.id === s.originalCategoryId)
                ?.name || "未分类"}
            </label>
            <label className="field">
              <span>建议分类</span>
              <select
                value={s.categoryId || ""}
                onChange={(e) =>
                  update(
                    suggestions.map((r, i) =>
                      i === index
                        ? { ...r, categoryId: e.target.value || null }
                        : r,
                    ),
                  )
                }
              >
                <option value="">保持未分类</option>
                {state.categories
                  .filter((c: any) => !c.archived && c.type === s.type)
                  .map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="hint">
              {s.reason} {s.reviewReason}
            </p>
          </div>
        ))}
        {suggestions.length > 0 && (
          <button
            className="button"
            disabled={busy || !suggestions.some((s) => s.selected)}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("classification/apply", {
                  taskOperationId,
                  rows: suggestions
                    .filter((s) => s.selected)
                    .map((s) => ({ id: s.id, categoryId: s.categoryId })),
                });
                sessionStorage.removeItem(
                  `ucost-classification-${state.user.id}-${entity}`,
                );
                await refresh();
                close();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            应用已确认分类
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
