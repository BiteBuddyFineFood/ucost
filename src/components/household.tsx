"use client";
import { useMemo, useState } from "react";
import {
  Bell,
  Box,
  CalendarClock,
  Check,
  Copy,
  Package,
  Pencil,
  Plus,
  Search,
  Undo2,
} from "lucide-react";
import { Busy, Empty, FieldInput, Modal } from "./ui";
import { localDate } from "@/lib/domain";
import {
  formatReminderTime,
  reminderDueLabel,
  todayIn,
  utcToZonedInput,
  zonedDateTimeToUtc,
} from "@/lib/reminder-time";

const itemStatuses: Record<string, string> = {
  active: "在用",
  used: "已用完",
  discarded: "已丢弃",
  archived: "已归档",
};

function boxOf(item: any, state: any) {
  return state.boxes?.find((box: any) => box.id === item.boxId);
}

function itemPlace(item: any, state: any) {
  const box = boxOf(item, state);
  if (box) return `${box.name}${box.location ? ` · ${box.location}` : ""}`;
  return item.location || "未登记位置";
}

function expiryBucket(item: any, today: string) {
  if (!item.expiresOn) return "none";
  const days = Math.round(
    (Date.parse(item.expiresOn) - Date.parse(today)) / 86_400_000,
  );
  if (days < 0) return "expired";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

function expiryText(item: any, today: string) {
  if (!item.expiresOn) return "未设置到期日";
  const days = Math.round(
    (Date.parse(item.expiresOn) - Date.parse(today)) / 86_400_000,
  );
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  return `${item.expiresOn} · 还有 ${days} 天`;
}

function copyDraft(item: any) {
  return {
    name: item.name,
    quantity: item.quantity ?? 1,
    unit: item.unit || "件",
    note: item.note || "",
    status: "active",
    storageEnabled: !!item.storageEnabled,
    expiryEnabled: !!item.expiryEnabled,
    costEnabled: false,
    location: item.location || "",
    boxId: item.boxId || null,
    expiresOn: item.expiresOn || null,
    sourceNote: "",
    mode: "day",
    recovery: 0,
  };
}

export function ItemEditor({
  record,
  state,
  defaults,
  copy = false,
  save,
  close,
  remove,
}: any) {
  const initial = copy ? copyDraft(record) : record || {};
  const [data, setData] = useState<any>({
    name: initial.name || "",
    quantity: initial.quantity ?? 1,
    unit: initial.unit || "件",
    note: initial.note || "",
    status: initial.status || "active",
    storageEnabled: initial.storageEnabled ?? defaults?.storageEnabled ?? false,
    expiryEnabled: initial.expiryEnabled ?? defaults?.expiryEnabled ?? false,
    costEnabled: initial.costEnabled ?? defaults?.costEnabled ?? false,
    location: initial.location || "",
    boxId: initial.boxId || null,
    expiresOn: initial.expiresOn || null,
    purchaseDate: initial.purchaseDate || localDate(),
    price: initial.price ?? null,
    recovery: initial.recovery ?? 0,
    retiredDate: initial.retiredDate || null,
    mode: initial.mode || "day",
    sourceNote: initial.sourceNote || "",
  });
  const [reminder, setReminder] = useState({
    enabled: false,
    offsetDays: 7,
    localTime: "09:00",
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (key: string, value: any) =>
    setData((current: any) => ({ ...current, [key]: value }));
  return (
    <Modal
      title={
        copy
          ? `复制 · ${record.name}`
          : record?.id
            ? `编辑 · ${record.name}`
            : "登记一件物品"
      }
      close={close}
      wide
    >
      {copy && (
        <p className="warning">
          这是复制出的新物品。请核对数量和到期日；来源说明、成本、使用记录和提醒不会复制。
        </p>
      )}
      <div className="item-form">
        <section className="item-form-section">
          <h3>这件东西是什么</h3>
          <div className="form-grid">
            <FieldInput
              field={{ key: "name", label: "名称", required: true }}
              value={data.name}
              set={(v) => set("name", v)}
            />
            <div className="quantity-field">
              <FieldInput
                field={{
                  key: "quantity",
                  label: "当前数量",
                  type: "number",
                  hint: "非负整数；重量可写进单位。",
                }}
                value={data.quantity}
                set={(v) => set("quantity", v ?? 0)}
              />
              <FieldInput
                field={{ key: "unit", label: "单位" }}
                value={data.unit}
                set={(v) => set("unit", v)}
              />
            </div>
            <FieldInput
              field={{
                key: "status",
                label: "状态",
                type: "select",
                options: Object.entries(itemStatuses).map(([value, label]) => ({
                  value,
                  label,
                })),
              }}
              value={data.status}
              set={(v) => set("status", v)}
            />
            <FieldInput
              field={{ key: "note", label: "备注", type: "textarea" }}
              value={data.note}
              set={(v) => set("note", v)}
            />
          </div>
          {data.sourceNote && (
            <p className="hint">来源说明（登记时快照）：{data.sourceNote}</p>
          )}
        </section>

        <section className="item-form-section">
          <h3>放在哪里</h3>
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.storageEnabled}
              onChange={(e) => set("storageEnabled", e.target.checked)}
            />
            开启收纳
          </label>
          {data.storageEnabled && (
            <div className="form-grid">
              <FieldInput
                field={{
                  key: "boxId",
                  label: "放进箱子（可不选）",
                  type: "select",
                  options: [
                    { value: "", label: "不装箱，直接记位置" },
                    ...state.boxes.map((box: any) => ({
                      value: box.id,
                      label: `${box.name}${box.location ? ` · ${box.location}` : ""}`,
                    })),
                  ],
                  hint: "装箱后位置跟随箱子，移动箱子即可更新全部物品。",
                }}
                value={data.boxId}
                set={(v) => set("boxId", v || null)}
              />
              {!data.boxId && (
                <FieldInput
                  field={{
                    key: "location",
                    label: "位置",
                    hint: "例如：卧室 / 衣柜上层",
                  }}
                  value={data.location}
                  set={(v) => set("location", v)}
                />
              )}
            </div>
          )}
        </section>

        <section className="item-form-section">
          <h3>什么时候到期</h3>
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.expiryEnabled}
              onChange={(e) => set("expiryEnabled", e.target.checked)}
            />
            开启保质期
          </label>
          {data.expiryEnabled && (
            <div className="form-grid">
              <FieldInput
                field={{ key: "expiresOn", label: "到期日", type: "date" }}
                value={data.expiresOn}
                set={(v) => set("expiresOn", v)}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={reminder.enabled}
                  onChange={(e) =>
                    setReminder({ ...reminder, enabled: e.target.checked })
                  }
                />
                到期前提醒我
              </label>
              {reminder.enabled && (
                <div className="form-grid">
                  <FieldInput
                    field={{
                      key: "offsetDays",
                      label: "提前几天",
                      type: "number",
                    }}
                    value={reminder.offsetDays}
                    set={(v) =>
                      setReminder({
                        ...reminder,
                        offsetDays: Number(v || 0),
                      })
                    }
                  />
                  <FieldInput
                    field={{ key: "localTime", label: "当天几点", type: "time" }}
                    value={reminder.localTime}
                    set={(v) =>
                      setReminder({ ...reminder, localTime: v || "09:00" })
                    }
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <section className="item-form-section">
          <h3>要不要计算成本</h3>
          <label className="check-field">
            <input
              type="checkbox"
              checked={data.costEnabled}
              onChange={(e) => set("costEnabled", e.target.checked)}
            />
            主动计算这件物品的成本
          </label>
          {data.costEnabled && (
            <div className="form-grid">
              <FieldInput
                field={{
                  key: "purchaseDate",
                  label: "购入日期",
                  type: "date",
                  required: true,
                }}
                value={data.purchaseDate}
                set={(v) => set("purchaseDate", v)}
              />
              <FieldInput
                field={{
                  key: "price",
                  label: "购入金额（元）",
                  type: "money",
                  required: true,
                  disabled: !!initial.ledgerId,
                  hint: initial.ledgerId
                    ? "跟随关联账单，修改价格请去账本。"
                    : undefined,
                }}
                value={data.price}
                set={(v) => set("price", v)}
              />
              <FieldInput
                field={{ key: "recovery", label: "回收金额（元）", type: "money" }}
                value={data.recovery}
                set={(v) => set("recovery", v)}
              />
              <FieldInput
                field={{
                  key: "retiredDate",
                  label: "退役日期（仍在使用可留空）",
                  type: "date",
                }}
                value={data.retiredDate}
                set={(v) => set("retiredDate", v)}
              />
              <FieldInput
                field={{
                  key: "mode",
                  label: "主成本口径",
                  type: "select",
                  options: [
                    { value: "day", label: "按天" },
                    { value: "use", label: "按次" },
                  ],
                }}
                value={data.mode}
                set={(v) => set("mode", v)}
              />
            </div>
          )}
        </section>
      </div>
      {error && <p className="error">{error}</p>}
      <footer className="item-form-footer">
        {record?.id && !copy && remove && (
          <button
            className="button danger"
            onClick={async () => {
              if (
                !window.confirm(
                  "删除整件物品？它会从收纳、保质期和成本页移除，相关提醒也会删除；账单不会删除。",
                )
              )
                return;
              setBusy(true);
              try {
                await remove();
                close();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            删除物品
          </button>
        )}
        <span className="spacer" />
        <button className="button secondary" onClick={close}>
          取消
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setError("");
            if (!String(data.name || "").trim()) {
              setError("请填写物品名称");
              return;
            }
            if (data.storageEnabled && !data.boxId && !data.location.trim()) {
              setError("开启收纳时请填写位置或选择箱子");
              return;
            }
            if (data.expiryEnabled && !data.expiresOn) {
              setError("开启保质期时请填写到期日");
              return;
            }
            if (
              data.costEnabled &&
              (!data.purchaseDate || data.price == null)
            ) {
              setError("计算成本需要购入日期和金额");
              return;
            }
            setBusy(true);
            try {
              await save(data, reminder.enabled ? reminder : null);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "保存"}
        </button>
      </footer>
    </Modal>
  );
}

export function BoxEditor({ record, save, close }: any) {
  const [data, setData] = useState<any>({
    name: record?.name || "",
    location: record?.location || "",
    note: record?.note || "",
    color: record?.color || "",
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={record?.id ? "编辑收纳箱" : "新建收纳箱"} close={close}>
      <div className="form-grid">
        <FieldInput
          field={{ key: "name", label: "箱子名称", required: true }}
          value={data.name}
          set={(v) => setData({ ...data, name: v })}
        />
        <FieldInput
          field={{
            key: "location",
            label: "所在位置",
            hint: "例如：卧室 / 衣柜上层",
          }}
          value={data.location}
          set={(v) => setData({ ...data, location: v })}
        />
        <FieldInput
          field={{ key: "note", label: "备注", type: "textarea" }}
          value={data.note}
          set={(v) => setData({ ...data, note: v })}
        />
        <FieldInput
          field={{
            key: "color",
            label: "标签颜色",
            type: "select",
            options: [
              { value: "", label: "默认纸色" },
              { value: "#6F7F63", label: "苔绿" },
              { value: "#B7794B", label: "陶土" },
              { value: "#C4A24A", label: "麦黄" },
              { value: "#8C6A8E", label: "梅紫" },
              { value: "#5B7C99", label: "雾蓝" },
            ],
          }}
          value={data.color}
          set={(v) => setData({ ...data, color: v || "" })}
        />
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
              await save(data);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "保存"}
        </button>
      </footer>
    </Modal>
  );
}

export function StoragePage({
  state,
  mutate,
  notify,
  checkReminders,
  openItem,
  openAll,
}: any) {
  const [view, setView] = useState<"items" | "boxes">("items"),
    [query, setQuery] = useState(""),
    [showInactive, setShowInactive] = useState(false),
    [boxEditor, setBoxEditor] = useState<any>(null);
  const today = todayIn(state.user.timezone);
  const items = state.items.filter(
    (item: any) =>
      item.storageEnabled &&
      (showInactive || item.status === "active") &&
      (!query ||
        [item.name, item.location, boxOf(item, state)?.name, item.note].some(
          (value) => String(value || "").toLowerCase().includes(query.toLowerCase()),
        )),
  );
  const active = state.items.filter(
    (item: any) => item.storageEnabled && item.status === "active",
  );
  const boxes = state.boxes.filter(
    (box: any) =>
      !query ||
      [box.name, box.location, box.note].some((value) =>
        String(value || "").toLowerCase().includes(query.toLowerCase()),
      ),
  );
  async function status(item: any, patch: any, message: string) {
    try {
      await mutate({
        action: "save",
        entity: "items",
        id: item.id,
        version: item.version,
        data: patch,
      });
      notify(message);
      await checkReminders();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="household-page">
      <div className="household-stats">
        <div>
          <span>收纳中的物品种类</span>
          <strong>{active.length}</strong>
        </div>
        <div>
          <span>收纳箱</span>
          <strong>{state.boxes.length}</strong>
        </div>
        <div>
          <span>已过期 / 7 天内</span>
          <strong>
            {
              active.filter(
                (item: any) =>
                  item.expiryEnabled &&
                  ["expired", "week"].includes(expiryBucket(item, today)),
              ).length
            }
          </strong>
        </div>
        <button className="text-button" onClick={openAll}>
          查看全部已登记物品
        </button>
      </div>
      <div className="household-toolbar">
        <div className="tabs">
          <button
            className={view === "items" ? "selected" : ""}
            onClick={() => setView("items")}
          >
            按物品
          </button>
          <button
            className={view === "boxes" ? "selected" : ""}
            onClick={() => setView("boxes")}
          >
            按收纳箱
          </button>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="搜索收纳"
            placeholder="搜名称、位置或箱名"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          显示已用完/归档
        </label>
        <button
          className="button secondary"
          onClick={() =>
            openItem(null, { storageEnabled: true, costEnabled: false })
          }
        >
          <Plus size={16} />
          登记物品
        </button>
        <button className="button" onClick={() => setBoxEditor({})}>
          <Box size={16} />
          新建箱子
        </button>
      </div>

      {view === "items" ? (
        <div className="household-list">
          {items.length ? (
            items.map((item: any) => {
              const box = boxOf(item, state);
              return (
                <article className="household-row" key={item.id}>
                  <span className="entry-symbol">
                    <Package size={19} />
                  </span>
                  <div className="record-content">
                    <b>
                      {item.name}
                      <span className={`pill ${item.status !== "active" ? "yellow" : ""}`}>
                        {itemStatuses[item.status]}
                      </span>
                    </b>
                    <small>
                      {item.quantity} {item.unit || "件"} · {itemPlace(item, state)}
                      {item.expiryEnabled &&
                        ` · ${expiryText(item, today)}`}
                    </small>
                    {item.quantityConfirmedAt && (
                      <small>
                        数量确认于{" "}
                        {new Date(item.quantityConfirmedAt).toLocaleDateString(
                          "zh-CN",
                        )}
                      </small>
                    )}
                    {box && <small>箱内物品 · {box.name}</small>}
                  </div>
                  <div className="row-actions">
                    <button
                      className="text-button"
                      onClick={() => openItem(item)}
                    >
                      编辑
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        status(item, { confirmQuantity: true }, "数量已确认")
                      }
                    >
                      确认数量
                    </button>
                    <button
                      className="icon-button"
                      aria-label="复制"
                      onClick={() => openItem(item, undefined, true)}
                    >
                      <Copy size={16} />
                    </button>
                    {item.status === "active" ? (
                      <>
                        <button
                          className="text-button"
                          onClick={() =>
                            status(item, { quantity: 0, status: "used" }, "已标记用完")
                          }
                        >
                          用完
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={() =>
                            status(
                              item,
                              { quantity: 0, status: "discarded" },
                              "已标记丢弃",
                            )
                          }
                        >
                          丢弃
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() =>
                          status(
                            item,
                            {
                              quantity: Math.max(1, item.quantity || 0),
                              status: "active",
                            },
                            "已恢复在用",
                          )
                        }
                      >
                        <Undo2 size={14} />
                        恢复
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <Empty
              title={query ? "没有找到收纳物品" : "还没有开启收纳的物品"}
              text="登记护照、冬衣或日用品的位置，不填价格也可以。"
              action={
                <button
                  className="button"
                  onClick={() =>
                    openItem(null, {
                      storageEnabled: true,
                      costEnabled: false,
                    })
                  }
                >
                  登记第一件
                </button>
              }
            />
          )}
        </div>
      ) : (
        <div className="box-grid">
          {boxes.map((box: any) => {
            const contents = state.items.filter(
              (item: any) => item.boxId === box.id && item.status === "active",
            );
            const expiring = contents.filter((item: any) =>
              item.expiryEnabled
                ? ["expired", "week"].includes(expiryBucket(item, today))
                : false,
            ).length;
            return (
              <article
                className="box-card"
                key={box.id}
                style={{ "--box-color": box.color || "#DDE3D9" } as any}
              >
                <header>
                  <Box size={20} />
                  <b>{box.name}</b>
                </header>
                <p>{box.location || "未登记位置"}</p>
                {box.note && <small>{box.note}</small>}
                <div className="box-card-stats">
                  <span>{contents.length} 类物品</span>
                  <span>{expiring} 项临期</span>
                </div>
                {contents.length > 0 && (
                  <ul className="box-contents">
                    {contents.slice(0, 6).map((item: any) => (
                      <li key={item.id}>
                        <span>{item.name}</span>
                        <small>
                          {item.quantity} {item.unit || "件"}
                          {item.expiryEnabled && item.expiresOn
                            ? ` · ${item.expiresOn}`
                            : ""}
                        </small>
                      </li>
                    ))}
                    {contents.length > 6 && (
                      <li className="hint">还有 {contents.length - 6} 类…</li>
                    )}
                  </ul>
                )}
                <div className="row-actions">
                  <button
                    className="text-button"
                    onClick={() => setBoxEditor(box)}
                  >
                    编辑 / 移动
                  </button>
                  <button
                    className="text-button danger-text"
                    onClick={async () => {
                      if (!window.confirm("删除这个空箱子？箱内有物品时不会删除。"))
                        return;
                      try {
                        await mutate({
                          action: "batch",
                          entity: "boxes",
                          mode: "delete",
                          records: [{ id: box.id, version: box.version }],
                        });
                        notify("箱子已删除");
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
          {!boxes.length && (
            <Empty
              title="还没有收纳箱"
              text="箱子可以整体移动，里面的物品会一起更新位置。"
              action={
                <button className="button" onClick={() => setBoxEditor({})}>
                  新建箱子
                </button>
              }
            />
          )}
        </div>
      )}

      {boxEditor && (
        <BoxEditor
          record={boxEditor}
          close={() => setBoxEditor(null)}
          save={async (data: any) => {
            await mutate({
              action: "save",
              entity: "boxes",
              id: boxEditor.id,
              version: boxEditor.version,
              data,
            });
            notify(boxEditor.id ? "箱子已更新" : "箱子已创建");
          }}
        />
      )}
    </div>
  );
}

export function ExpiryPage({
  state,
  mutate,
  notify,
  checkReminders,
  openItem,
  openAll,
}: any) {
  const today = todayIn(state.user.timezone);
  const [filter, setFilter] = useState("active"),
    [showHistory, setShowHistory] = useState(false);
  const all = state.items.filter((item: any) => item.expiryEnabled);
  const active = all.filter(
    (item: any) =>
      item.status === "active" && (item.quantity ?? 1) > 0 && item.expiresOn,
  );
  const counts = {
    expired: active.filter((item: any) => expiryBucket(item, today) === "expired")
      .length,
    week: active.filter((item: any) => expiryBucket(item, today) === "week")
      .length,
    month: active.filter((item: any) => expiryBucket(item, today) === "month")
      .length,
    later: active.filter((item: any) => expiryBucket(item, today) === "later")
      .length,
  };
  const records = (showHistory ? all : active)
    .filter((item: any) => {
      if (filter === "active" || showHistory) return true;
      return expiryBucket(item, today) === filter;
    })
    .sort((a: any, b: any) =>
      String(a.expiresOn || "9999").localeCompare(String(b.expiresOn || "9999")),
    );
  async function status(item: any, patch: any, message: string) {
    try {
      await mutate({
        action: "save",
        entity: "items",
        id: item.id,
        version: item.version,
        data: patch,
      });
      notify(message);
      await checkReminders();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="household-page">
      <div className="expiry-stats">
        {[
          ["expired", "已过期", counts.expired],
          ["week", "今天～7 天", counts.week],
          ["month", "8～30 天", counts.month],
          ["later", "30 天后", counts.later],
        ].map(([key, label, value]) => (
          <button
            key={key as string}
            className={`${filter === key ? "selected" : ""} ${key === "expired" && Number(value) ? "alert" : ""}`}
            onClick={() => {
              setFilter(key as string);
              setShowHistory(false);
            }}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </div>
      <div className="household-toolbar">
        <button
          className={`button secondary compact ${filter === "active" ? "selected" : ""}`}
          onClick={() => {
            setFilter("active");
            setShowHistory(false);
          }}
        >
          全部有效
        </button>
        <label className="check-field">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />
          查看用完 / 丢弃 / 归档
        </label>
        <span className="spacer" />
        <button className="button secondary" onClick={openAll}>
          为已有物品开启保质期
        </button>
        <button
          className="button"
          onClick={() =>
            openItem(null, { expiryEnabled: true, costEnabled: false })
          }
        >
          <Plus size={16} />
          登记临期物品
        </button>
      </div>
      <div className="household-list">
        {records.length ? (
          records.map((item: any) => (
            <article className="household-row expiry-row" key={item.id}>
              <span className="entry-symbol">
                <CalendarClock size={19} />
              </span>
              <div className="record-content">
                <b>
                  {item.name}
                  <span className={`pill ${expiryBucket(item, today) === "expired" ? "red" : expiryBucket(item, today) === "week" ? "yellow" : ""}`}>
                    {expiryBucket(item, today) === "expired"
                      ? "已过期"
                      : expiryBucket(item, today) === "week"
                        ? "临期"
                        : itemStatuses[item.status]}
                  </span>
                </b>
                <small>
                  {item.quantity} {item.unit || "件"} · {expiryText(item, today)}
                </small>
                <small>
                  {itemPlace(item, state)}
                  {item.note ? ` · ${item.note}` : ""}
                </small>
              </div>
              <div className="row-actions">
                <button className="text-button" onClick={() => openItem(item)}>
                  编辑
                </button>
                <button
                  className="icon-button"
                  aria-label="复制"
                  onClick={() => openItem(item, undefined, true)}
                >
                  <Copy size={16} />
                </button>
                {item.status === "active" ? (
                  <>
                    <button
                      className="text-button"
                      onClick={() =>
                        status(item, { quantity: 0, status: "used" }, "已标记用完")
                      }
                    >
                      用完
                    </button>
                    <button
                      className="text-button danger-text"
                      onClick={() =>
                        status(
                          item,
                          { quantity: 0, status: "discarded" },
                          "已标记丢弃",
                        )
                      }
                    >
                      丢弃
                    </button>
                  </>
                ) : (
                  <button
                    className="text-button"
                    onClick={() =>
                      status(
                        item,
                        {
                          quantity: Math.max(1, item.quantity || 0),
                          status: "active",
                        },
                        "已恢复",
                      )
                    }
                  >
                    <Undo2 size={14} />
                    恢复
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty
            title={showHistory ? "没有符合条件的记录" : "没有临期物品"}
            text="到期日当天会显示“今天到期”，不会提前算作过期。"
          />
        )}
      </div>
    </div>
  );
}

export function AllItemsModal({ state, close, openItem }: any) {
  const [query, setQuery] = useState("");
  const items = state.items
    .filter(
      (item: any) =>
        !query ||
        [item.name, item.note, item.location].some((value) =>
          String(value || "").toLowerCase().includes(query.toLowerCase()),
        ),
    )
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  return (
    <Modal title="全部已登记物品" close={close} wide>
      <label className="search-box">
        <Search size={16} />
        <input
          aria-label="搜索全部物品"
          placeholder="搜索名称、位置或备注"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="all-items-list">
        {items.map((item: any) => (
          <button
            className="all-item-row"
            key={item.id}
            onClick={() => {
              close();
              openItem(item);
            }}
          >
            <span>
              <b>{item.name}</b>
              <small>
                {item.quantity} {item.unit || "件"} · {itemPlace(item, state)}
              </small>
            </span>
            <span className="usage-pills">
              {item.storageEnabled && <em>收纳</em>}
              {item.expiryEnabled && <em>保质期</em>}
              {item.costEnabled && <em>成本</em>}
              {!item.storageEnabled && !item.expiryEnabled && !item.costEnabled && (
                <em>仅登记</em>
              )}
            </span>
            <Pencil size={15} />
          </button>
        ))}
        {!items.length && <Empty title="还没有登记物品" />}
      </div>
    </Modal>
  );
}

export function ReminderEditor({ state, rule, target, save, close }: any) {
  const targetOptions = useMemo(() => {
    const options: any[] = [];
    for (const item of state.items) {
      if (item.expiryEnabled && item.status === "active")
        options.push({
          value: `item:${item.id}`,
          type: "item",
          id: item.id,
          label: `物品 · ${item.name}`,
          anchorDate: item.expiresOn,
        });
    }
    for (const item of state.shopping) {
      const list = state.lists.find((row: any) => row.id === item.listId);
      if (!list || list.archived) continue;
      if (list.kind === "shopping" && ["considering", "planned"].includes(item.status))
        options.push({
          value: `shopping:${item.id}`,
          type: "shopping",
          id: item.id,
          label: `购物 · ${list.name} · ${item.name}`,
          anchorDate: null,
        });
      if (list.kind !== "shopping" && !item.done)
        options.push({
          value: `listItem:${item.id}`,
          type: "listItem",
          id: item.id,
          label: `${list.kind === "travel" ? "出行" : "清单"} · ${list.name} · ${item.name}`,
          anchorDate: list.kind === "travel" ? list.departureDate : null,
        });
    }
    return options;
  }, [state]);
  const initialKey = rule
    ? `${rule.targetType}:${rule.targetId}`
    : target
      ? `${target.type}:${target.id}`
      : targetOptions[0]?.value || "";
  const initialTarget = targetOptions.find(
    (option: any) => option.value === initialKey,
  );
  const [targetKey, setTargetKey] = useState(initialKey);
  const [triggerType, setTriggerType] = useState(
    rule?.triggerType || (initialTarget?.anchorDate ? "relative" : "fixed"),
  );
  const [fixedAt, setFixedAt] = useState(() =>
    rule?.fixedAt
      ? utcToZonedInput(rule.fixedAt, rule.timezone)
      : utcToZonedInput(
          new Date(Date.now() + 3_600_000),
          state.user.timezone,
        ),
  );
  const [offsetDays, setOffsetDays] = useState(rule?.offsetDays ?? 1);
  const [localTime, setLocalTime] = useState(rule?.localTime || "09:00");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = targetOptions.find(
    (option: any) => option.value === targetKey,
  );
  const timezone = rule?.timezone || state.user.timezone;
  return (
    <Modal title={rule?.id ? "编辑提醒" : "新建提醒"} close={close}>
      <div className="form-grid">
        <FieldInput
          field={{
            key: "target",
            label: "提醒哪件事",
            type: "select",
            options: targetOptions.map((option: any) => ({
              value: option.value,
              label: option.label,
            })),
          }}
          value={targetKey}
          set={setTargetKey}
        />
        <FieldInput
          field={{
            key: "triggerType",
            label: "什么时候提醒",
            type: "select",
            options: [
              ...(selected?.anchorDate
                ? [{ value: "relative", label: "按日期提前" }]
                : []),
              { value: "fixed", label: "指定日期和时间" },
            ],
          }}
          value={triggerType}
          set={setTriggerType}
        />
        {triggerType === "relative" ? (
          <>
            <p className="hint">
              目标日期：{selected?.anchorDate || "未设置"}，时区 {timezone}。
            </p>
            <FieldInput
              field={{ key: "offsetDays", label: "提前几天", type: "number" }}
              value={offsetDays}
              set={(v) => setOffsetDays(Number(v || 0))}
            />
            <FieldInput
              field={{ key: "localTime", label: "当天几点", type: "time" }}
              value={localTime}
              set={(v) => setLocalTime(v || "09:00")}
            />
          </>
        ) : (
          <FieldInput
            field={{
              key: "fixedAt",
              label: "提醒时间",
              type: "datetime-local",
              hint: `按 ${timezone} 保存为固定时刻。`,
            }}
            value={fixedAt}
            set={setFixedAt}
          />
        )}
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
            setError("");
            if (!selected) {
              setError("请选择提醒目标");
              return;
            }
            if (triggerType === "relative" && !selected.anchorDate) {
              setError("这个目标没有可用于提前提醒的日期");
              return;
            }
            setBusy(true);
            try {
              const fixed =
                triggerType === "fixed"
                  ? zonedDateTimeToUtc(
                      fixedAt.slice(0, 10),
                      fixedAt.slice(11, 16),
                      timezone,
                    ).toISOString()
                  : null;
              await save({
                id: rule?.id,
                version: rule?.version,
                targetType: selected.type,
                targetId: selected.id,
                triggerType,
                fixedAt: fixed,
                offsetDays: triggerType === "relative" ? offsetDays : null,
                localTime,
                timezone,
              });
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Busy /> : "保存提醒"}
        </button>
      </footer>
    </Modal>
  );
}

export function ReminderCenter({
  state,
  data,
  check,
  mutate,
  notify,
  openReminder,
}: any) {
  const [snooze, setSnooze] = useState<any>(null);
  const [snoozeAt, setSnoozeAt] = useState(() =>
    utcToZonedInput(new Date(Date.now() + 3_600_000), state.user.timezone),
  );
  async function handle(item: any, mode: string, until?: string) {
    try {
      await mutate({
        action: "reminderHandle",
        id: item.id,
        mode,
        until,
      });
      notify(mode === "done" ? "这次提醒已处理" : "提醒设置已更新");
      await check();
      setSnooze(null);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="household-page reminder-page">
      <div className="reminder-hero">
        <div>
          <span>当前待处理</span>
          <strong>{data.reminders.length}</strong>
        </div>
        <p>
          只在网页打开时检查。关闭网页不会推送；回到页面会补查一次。
        </p>
        <button className="button secondary" onClick={check}>
          刷新检查
        </button>
        <button className="button" onClick={() => openReminder()}>
          <Plus size={16} />
          新建提醒
        </button>
      </div>
      <section className="reminder-section">
        <h2>现在要处理</h2>
        {data.reminders.length ? (
          data.reminders.map((item: any) => (
            <article className="reminder-row" key={item.id}>
              <span className="entry-symbol">
                <Bell size={19} />
              </span>
              <div className="record-content">
                <b>{item.title}</b>
                <small>
                  {reminderDueLabel(
                    item.dueAt,
                    todayIn(state.user.timezone),
                    item.rule?.timezone || state.user.timezone,
                  )}
                  {item.targetDate ? ` · 目标日期 ${item.targetDate}` : ""}
                </small>
              </div>
              <div className="row-actions">
                <button
                  className="button secondary compact"
                  onClick={() => handle(item, "done")}
                >
                  <Check size={14} />
                  已处理
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setSnooze(item);
                    setSnoozeAt(
                      utcToZonedInput(
                        new Date(Date.now() + 3_600_000),
                        state.user.timezone,
                      ),
                    );
                  }}
                >
                  稍后提醒
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() => handle(item, "close")}
                >
                  关闭规则
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title="现在没有待处理提醒"
            text="临期物品、清单条目和固定日期提醒会在这里出现。"
          />
        )}
      </section>
      <section className="reminder-section">
        <h2>全部提醒规则</h2>
        {data.rules.length ? (
          data.rules.map((rule: any) => (
            <article className="reminder-rule-row" key={rule.id}>
              <div>
                <b>{rule.targetTitle}</b>
                <small>
                  {rule.triggerType === "relative"
                    ? `提前 ${rule.offsetDays} 天 ${rule.localTime}`
                    : rule.nextDueAt
                      ? formatReminderTime(rule.nextDueAt, rule.timezone)
                      : "固定时间已过"}
                  {rule.targetDate ? ` · 目标 ${rule.targetDate}` : ""}
                  {!rule.enabled ? " · 已关闭" : ""}
                </small>
              </div>
              <div className="row-actions">
                <button className="text-button" onClick={() => openReminder(rule)}>
                  编辑
                </button>
                <button
                  className="text-button danger-text"
                  onClick={async () => {
                    if (!window.confirm("删除这条提醒规则？目标记录不会删除。"))
                      return;
                    try {
                      await mutate({
                        action: "reminderDelete",
                        id: rule.id,
                        version: rule.version,
                      });
                      notify("提醒规则已删除");
                      await check();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title="还没有提醒规则"
            text="可以从物品、清单条目或这里新建一条提醒。"
          />
        )}
      </section>
      {snooze && (
        <Modal title="稍后提醒" close={() => setSnooze(null)}>
          <p className="hint">到新时间前不会出现在待处理列表，刷新也会保留。</p>
          <FieldInput
            field={{
              key: "snoozeAt",
              label: "提醒时间",
              type: "datetime-local",
            }}
            value={snoozeAt}
            set={setSnoozeAt}
          />
          <footer>
            <button className="button secondary" onClick={() => setSnooze(null)}>
              取消
            </button>
            <button
              className="button"
              onClick={() =>
                handle(
                  snooze,
                  "snooze",
                  zonedDateTimeToUtc(
                    snoozeAt.slice(0, 10),
                    snoozeAt.slice(11, 16),
                    snooze.rule?.timezone || state.user.timezone,
                  ).toISOString(),
                )
              }
            >
              确认稍后
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
