# Cloudflare 本地运行、恢复和以后部署

日期：2026-11-12。本轮只实现本地环境；没有创建外部资源或部署。用户已明确不需要迁移现有 SQLite 数据，新 D1 从空库开始。

## 本地构建与启动

1. Node 22 + `npm ci`。
2. `npm run db:migrate`：仅对默认本地 D1 应用 `d1/migrations`。重复执行只报告无待应用迁移，不重复建业务记录。
3. 可选 `.dev.vars`（参考根目录示例），与旧 `.env` 独立。没有 AI 配置仍能使用手动功能。
4. `npm run build:workers`，再 `npm run preview:workers`，打开 `http://localhost:8787` 注册新账号。
5. 构建前停止 Workers 预览，避免 Windows assets 文件锁。构建和预览脚本会检查 8787 与必需 Durable Object 产物，发现冲突时在清理产物前退出。Windows 构建脚本将 OpenNext 的目录符号链接变为 junction，未改依赖源码。

`npm run dev` 是 Next 开发 UI，使用 OpenNext 提供的本地 binding；`npm start`/`preview:workers` 才是完整 workerd 运行时。

页面提示“AI 服务暂不可用”时，先确认存在被 Git 忽略的 `.dev.vars`，其中 `AI_BASE_URL`、`AI_API_KEY`、`AI_TEXT_MODEL` 等系统 AI 键非空，并重启 Workers 预览。迁移后的本地脚本不会从旧 `.env` 自动读取这些键；诊断时只检查键是否存在和格式，不输出密钥值。

页面提示“AI 请求超时或网络不可达”时，确认运行 Workers 的进程本身能访问 AI 主机的 HTTPS 443。在受限沙箱内启动的预览可能 DNS 正常但外连被阻断；应在普通本地终端启动预览。该检查不需要发送 API Key，实际推理请求是否计费仍由所配置的服务决定。

本地数据库 ID 是占位 ID，不指向真实云库。默认 `.wrangler/state` 与 `data/d1-tests`、`data/d1-e2e`、`data/d1-probe` 互相隔离。Wrangler/Miniflare 的 registry、XDG config/cache 也写入被 Git 忽略的 `data/wrangler-*`，不要求用户目录写权限。不要清理这些目录来处理迁移错误；先备份并核实目标。

## 数据层与原子性

- `schema.ts` / `fields.json` 明确保存 27 个业务表的字段、日期/布尔语义；`0001_domain.sql` 包含所有原唯一约束、归属/日期/关联索引，以及 revision 和持久登录限流表。邀请码增量表在 `0002_invite_codes.sql`。
- `scripts/generate-d1.mjs` 是构建期 schema 辅助器，不打开 SQLite。以后字段变更要写新的 D1 增量迁移，不能修改已经应用的 0001 来假装升级成功。
- 业务操作读取单个 SQL 一致快照，先执行现有校验并规划结果，之后调用一次 D1 batch。首条 SQL 在 revision 不匹配时主动触发唯一约束，后续表写入和操作回执全部回滚。不会把 0 行 UPDATE 当作 SQL 错误，也不会在部分提交后报告冲突。
- 写入通过每表 `json_each(?)` 参数输入，避免逐记录占用 100 参数限制和大量 D1 语句。单次计划最多 45 个变更语句、总计划约 8MB、单参数不超过 1.8MB；任何超限都在提交前拒绝。导入另限制 500KB/300 条，并保持单 batch。
- 快照适合当前个人规模，暂未分页重构。多用户写入可能因全局 revision 出现保守重试；这不影响归属校验，也没有引入锁服务或额外云产品。

## 完整本地备份与恢复演练

业务 JSON/CSV 适合交换，不能完整恢复用户密码、会话、AI 配置和任务。D1 完整导出可能包含密码哈希、个人密钥密文与会话，须放在 Git 忽略的私有目录，并单独安全备份加密主密钥。

以下均为 **local** 命令。停止写入后，使用新的文件名；不要覆盖现有备份。

```powershell
npx.cmd wrangler d1 export DB --local --output data/private-d1-backup.sql
```

恢复应先在独立配置（新的占位 database ID）和 `--persist-to data/d1-restore-drill` 中演练：

```powershell
npx.cmd wrangler d1 execute DB --local --config wrangler.restore.jsonc --persist-to data/d1-restore-drill --file data/private-d1-backup.sql
```

先从默认配置复制为 `wrangler.restore.jsonc`，将 name/database_name/database_id 改为独立本地值；不要对当前使用中的 D1 执行恢复文件。导出的 SQL 已含结构和 `d1_migrations`，不要先对恢复目标建立另一套相同表。恢复后比较各表数量、整数金额合计、来源图与身份映射，再在该独立路径重启预览核对。`db:verify` 自动演练 D1 重开持久化，业务往返由 D1 exchange 测试验证；用户真实数据恢复未执行。

本轮不提供自动迁移原 SQLite 的入口，避免误操作源库。用户以后主动选择业务 JSON 交换时，可从旧版本导出后用当前预检导入；账户身份及 AI 密钥不属于业务交换。

## 本地回归

`npm test`：D1 领域、服务、交换、AI 额度、截图不持久化、bcrypt 和 revision 回滚。AI 网络为确定性替身，不等于真实模型验收。

`npm run test:e2e:workers`：仅 local；建立随机独立状态，迁移、演示 seed、启动 8788 Worker 与 `ucost-ai-stub` service binding，再执行全部桌面/390px Playwright。测试配置不包含真实密钥。普通 `wrangler.jsonc` 没有 AI_TRANSPORT binding；默认预览需要用户配置真实 AI 才能识别。

`npm run db:verify`：独立 D1 读写、SQL 唯一约束失败整批回滚、27 表初始化、dispose 后重新打开核对；另外创建纯合成账户/收支/退款/省钱/购物关联/草稿/导入身份，使用 Wrangler 相同的 Miniflare 本地导出 API 生成 SQL，再用 `wrangler d1 execute --local` 恢复到另一随机目录，比较全部表数量、金额和关联。报告只含合成数据，位于 `data/d1-probe/<随机ID>/report.json`。

## 以后部署所需步骤（本轮均未执行）

只有用户另行授权后才执行下列远端操作；这里仅作说明。

1. 在用户自己的 Cloudflare 账号创建 D1；将返回的 ID 填入生产配置。binding 名保持 DB。将 `APP_URL` 改为最终 HTTPS 同源地址。
2. 配置 `AI_ALLOWED_ORIGINS` 和模型；通过 `wrangler secret put AI_API_KEY` / `wrangler secret put AI_CONFIG_ENCRYPTION_KEY` 交互设置秘密，不写在终端参数或 Git。个人配置加密主密钥需私下保管。
3. 先导出/保存远端旧库备份（若已有库）；本项目用户已决定不迁移当前 SQLite 数据，不能顺带上传本地旧库/附件。
4. **远端** schema：`npx wrangler d1 migrations apply DB --remote`。
5. 构建：`npm run build:workers`。**远端部署**：`npx opennextjs-cloudflare deploy`。此命令仅在本文出现，不由本地脚本调用。
6. 验证 HTTPS Cookie、注册/登录、归属隔离、账单/购物/结算、AI 失败释放、导出恢复及截图不留存，并实际测量 bcrypt cost=12 的 CPU、AI 网络和套餐限制。

本地 workerd 可运行不能证明免费云端 CPU 额度足够。遇到线上限制应记录测量并另行决定，不能悄悄削弱密码、不经授权启用付费套餐或删功能。
