"use client";
import { useState } from "react";
import { api, Busy } from "./ui";
import { money } from "@/lib/domain";
const entityLabels: Record<string, string> = {
  accounts: "账户",
  categories: "分类",
  groups: "记录组",
  lists: "清单",
  shopping: "购物项",
  ledger: "账单",
  savings: "省钱",
  settlements: "结算",
  drafts: "草稿",
  items: "物品",
  usage: "使用记录",
  attachments: "附件",
  rules: "分类规则",
  reviews: "评议",
  votes: "投票",
};
export function ExchangePanel({ state, refresh }: any) {
  const [content, setContent] = useState(""),
    [fileName, setFileName] = useState(""),
    [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<any>(null),
    [report, setReport] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({}),
    [decisions, setDecisions] = useState<Record<string, string>>({});
  const [scope, setScope] = useState("all"),
    [entity, setEntity] = useState("ledger"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [category, setCategory] = useState(""),
    [account, setAccount] = useState(""),
    [group, setGroup] = useState("");
  const params = new URLSearchParams({
    format: "csv",
    entity,
    scope,
    ...(scope === "filtered"
      ? { start, end, categoryId: category, accountId: account, groupId: group }
      : {}),
  });
  async function preflight() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const split = (k: string) => {
        const i = k.indexOf(":");
        return { entity: k.slice(0, i), sourceId: k.slice(i + 1) };
      };
      setPreview(
        await api("import/preview", {
          content,
          sourceId: sourceId || undefined,
          mappings: Object.entries(mappings)
            .filter(([, v]) => v)
            .map(([k, v]) => ({ ...split(k), localId: v })),
          decisions: Object.entries(decisions)
            .filter(([, v]) => v)
            .map(([k, v]) => ({ ...split(k), choice: v })),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel exchange-panel">
      <h2>导入与导出</h2>
      <p>
        JSON v2 导出全部业务数据及来源关系；CSV 每条正式记录一行，金额单位为分。
      </p>
      <div className="row-actions">
        <a className="button secondary" href="/api/export" download>
          全部数据 JSON v2
        </a>
        <a
          className="button secondary"
          href="/templates/ledger-v2.csv"
          download
        >
          账本 CSV 模板
        </a>
        <a
          className="button secondary"
          href="/templates/savings-v2.csv"
          download
        >
          省钱本 CSV 模板
        </a>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>CSV 模块</span>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setCategory("");
              setAccount("");
            }}
          >
            <option value="ledger">账本</option>
            <option value="savings">省钱本</option>
          </select>
        </label>
        <label className="field">
          <span>导出范围</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">全部数据</option>
            <option value="filtered">当前筛选范围</option>
          </select>
        </label>
        {scope === "filtered" && (
          <>
            <label className="field">
              <span>开始日期</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="field">
              <span>结束日期</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            {entity === "ledger" && (
              <>
                <label className="field">
                  <span>分类筛选</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">全部分类</option>
                    <option value="none">未分类</option>
                    {state.categories.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>账户筛选</span>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">全部账户</option>
                    <option value="none">未指定账户</option>
                    {state.accounts.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="field">
              <span>记录组筛选</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">全部分组</option>
                <option value="none">未分组</option>
                {state.groups.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <a className="button secondary" href={`/api/export?${params}`} download>
        {scope === "all" ? "导出全部" : "导出筛选范围"}
        {entity === "ledger" ? "账本" : "省钱本"} CSV v2
      </a>
      <hr />
      <p>
        合并新增，不覆盖已有记录。先选择文件并预检，解决映射和冲突后确认；单文件最多
        8MB、10000 条记录。
      </p>
      <label className="field">
        <span>导入文件（JSON / CSV）</span>
        <input
          type="file"
          accept=".json,.csv,application/json,text/csv"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setPreview(null);
            setReport(null);
            setError("");
            setMappings({});
            setDecisions({});
            setContent("");
            if (!file) return;
            if (file.size > 8_000_000) {
              setError("单文件最多 8MB，请拆分导入");
              return;
            }
            try {
              setContent(await file.text());
              setFileName(file.name);
            } catch {
              setError("文件读取失败，请重新选择");
            }
          }}
        />
      </label>
      <label className="field">
        <span>旧格式来源标识（v1 必填，同一旧库沿用同一个标识）</span>
        <input
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            setPreview(null);
          }}
          placeholder="例如：旧电脑账本-2026"
        />
      </label>
      <button
        className="button secondary"
        disabled={!content || busy}
        onClick={preflight}
      >
        {busy ? <Busy /> : "预检导入"}
      </button>
      {fileName && (
        <p className="hint">
          当前文件：{fileName}。本页筛选只用于 CSV 导出；JSON 始终导出全部数据。
        </p>
      )}
      {preview && (
        <div className="import-preview" aria-live="polite">
          <h3>导入预览</h3>
          <p>
            {preview.format} · 新增 {preview.added} 条 · 重复{" "}
            {preview.duplicates} 条 · 冲突 {preview.conflicts.length} 条 ·
            待映射 {preview.unresolved.length} 项
          </p>
          <p>
            导入前 → 导入后：支出 {money(preview.before.expense)} →{" "}
            {money(preview.after.expense)}；退款 {money(preview.before.refund)}{" "}
            → {money(preview.after.refund)}；有效省钱{" "}
            {money(preview.before.saving)} → {money(preview.after.saving)}
          </p>
          {preview.warnings.map((s: string, i: number) => (
            <p className="hint" key={i}>
              {s}
            </p>
          ))}
          {preview.errors.map((s: string, i: number) => (
            <p className="error" key={i}>
              {s}
            </p>
          ))}
          {preview.unresolved.map((r: any) => {
            const k = `${r.entity}:${r.sourceId}`;
            return (
              <label className="field" key={k}>
                <span>
                  {entityLabels[r.entity] || r.entity} 来源 {r.sourceId} 映射到
                </span>
                <select
                  value={mappings[k] || ""}
                  onChange={(e) => {
                    setMappings({ ...mappings, [k]: e.target.value });
                    setPreview({ ...preview, canCommit: false });
                  }}
                >
                  <option value="">
                    请选择本地记录，或先导入包含来源的 JSON
                  </option>
                  {(state[r.entity] || [])
                    .filter((r: any) => !r.archived)
                    .map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.title || r.id}
                      </option>
                    ))}
                </select>
              </label>
            );
          })}
          {preview.conflicts.map((r: any) => {
            const k = `${r.entity}:${r.sourceId}`;
            return (
              <label className="field" key={k}>
                <span>
                  {r.title}：{r.reason}
                </span>
                <select
                  value={decisions[k] || ""}
                  onChange={(e) => {
                    setDecisions({ ...decisions, [k]: e.target.value });
                    setPreview({ ...preview, canCommit: false });
                  }}
                >
                  <option value="">请选择后重新预检</option>
                  <option value="keep">保留现有记录</option>
                  <option value="new">
                    作为新记录（关联完整性仍需通过预检）
                  </option>
                </select>
              </label>
            );
          })}
          <button
            className="button"
            disabled={!preview.canCommit || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await api("import/commit", {
                  jobId: preview.jobId,
                });
                setReport(result);
                setPreview(null);
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            确认事务导入
          </button>
        </div>
      )}
      {report && (
        <div role="status">
          <h3>导入完成</h3>
          <p>
            新增 {report.imported} 条，跳过 {report.skipped} 条。支出{" "}
            {money(report.after.expense)}，有效省钱 {money(report.after.saving)}
            。
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        不导出密码、会话、AI 密钥或有效分享链接。JSON
        不含附件文件，导入后显示“附件未迁移”。完整恢复使用 D1 数据库导出，步骤见 README。旧 uploads 文件仍保留在原电脑，当前版本不再存储截图。
        单个导入文件最多 500KB、300 条，超限会在写入前拒绝。
      </p>
    </section>
  );
}
