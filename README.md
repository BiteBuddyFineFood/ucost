# UCost · 日常有数

个人消费管理：账本、购物清单、物品成本、省钱罐、购物评议、AI 表单整理。保留 Next.js 页面和手绘 UI，当前运行后端为 **Cloudflare Workers + D1**。

当前仅交付本地版本，未创建云端资源或部署。按本轮要求，**原 SQLite 数据不迁移**；原数据库、`.env` 和 `uploads/` 保留，新 D1 从空库开始。历史 SQLite 说明归档在 [docs/SQLITE_LEGACY_README.md](docs/SQLITE_LEGACY_README.md)。

## 本地运行

需要 Node.js 22、npm；端到端测试需要 Chrome。Windows PowerShell 可将 npm 换为 npm.cmd。

完整安装、环境变量、数据库初始化、更新流程和排障见 [本地环境部署指南](docs/本地环境部署指南.md)。

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run build:workers
npm.cmd run preview:workers
```

打开 [http://localhost:8787](http://localhost:8787)，创建新账号。`npm start` 同样启动本地 Workers。D1 状态保存在 `.wrangler/state`，重启预览不会清空。迁移命令明确带 `--local`，不会连接云端。

日常页面开发也可运行 `npm run dev`，Next 开发服务器通过 OpenNext 接入同一套本地 D1；最终验收仍使用 Workers 预览。构建和预览脚本会检查 8787 与 Durable Object 产物；若已有预览，会先给出明确提示并保持现有构建产物不变。原本已启动的其他服务不会被这些命令关闭。

构建方案固定为 OpenNext 1.20.16、Wrangler 4.148.0；数据库为 Drizzle 0.45.4 + D1 batch。Next 16.4.6、React 19.3.1 未降级。Workers compatibility date 固定为本地 workerd 支持的 2026-10-13。

## AI 与截图

无需 AI 配置也可以手动记账、暂存文字/口述、手动整理和导入导出。需要 AI 时，将 `.dev.vars.example` 复制为 `.dev.vars`，自行填写服务地址、密钥和模型；配置文件已忽略。**Workers 本地脚本不载入旧 `.env`**，不自动复用真实服务配置。

- 截图仅在当前请求发送给配置的识别服务，不写文件、数据库、任务输入/结果、R2、localStorage 或 IndexedDB。应用无法承诺模型供应商不留存。
- 识别失败时当前页面保留所选文件以便重试；刷新或关闭后需重新选择。成功后保存文字、候选、模块、清单和固定采集时间，稍后确认入账。
- “先存着”继续支持纯文字和口述；带截图须先识别。批量文字整理每次 HTTP 请求处理一条，页面逐条推进，同一批任务只占一次额度；关闭页面后不保证继续执行，过期任务在下次访问时恢复额度/状态。
- 系统和个人地址均要求 HTTPS 且位于 `AI_ALLOWED_ORIGINS` 的精确 origin 列表中；禁止重定向。默认允许 OpenAI/DeepSeek，可由部署者添加可信服务。原可自由填任意公网地址/本地模型的行为已收紧，普通用户不能开放内网。
- 个人密钥用 AES-256-GCM 保存，需要 `AI_CONFIG_ENCRYPTION_KEY`（64 位十六进制）。自行生成并安全备份，不写入 Git、业务导出或日志。bcrypt cost=12 保留。

## 邀请码

邀请码保存在本地 D1，单个邀请码默认最多绑定 10 个用户。**未绑定邀请码的账号不能使用 AI**（系统 AI、个人 AI 配置、AI 分析、AI 整理、截图识别等均被拒绝），但仍可手动记账、暂存、手动整理和导入导出。注册时填写有效邀请码，或在“设置 → 邀请码”中补填的已注册账号，即可使用系统 AI 且不限次数。每个账号只能绑定一个邀请码，绑定后不能更换。个人 AI 配置仍不占系统额度。

```powershell
npm.cmd run invite:new -- --note "首批体验"
npm.cmd run invite:new -- --note "合作伙伴" --max 10
npm.cmd run invite:list
npm.cmd run invite:disable -- UC-XXXX-XXXX
npm.cmd run invite:enable -- UC-XXXX-XXXX
```

邀请码只保存于 `InviteCode`，绑定记录保存在 `InviteRedemption`；增量迁移为 `d1/migrations/0002_invite_codes.sql`。停用不会解除已绑定用户的使用资格，只会阻止新用户继续使用该码。部署者可通过 `AI_REQUIRE_INVITE=false` 临时关闭该门槛（默认启用；仅建议在自托管/测试环境使用）。

## 验证命令

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run db:verify
npm.cmd run build:workers
npm.cmd run test:e2e:workers
```

`npm test` 的数据库测试真正使用隔离的本地 D1/workerd，数据位于 `data/d1-tests/<随机ID>`。`db:verify` 验证建表、SQL 失败回滚和重新打开后的持久化。E2E 脚本建立另一空 D1、添加合成演示账号、启动 8788 的 Worker 与本地 AI 替身并运行 Playwright，结束后仅关闭自己启动的进程，不调用外部模型。UI 截图只在内存中生成，不覆盖历史验收图片。

验证记录与未验证项见 [docs/PROGRESS.md](docs/PROGRESS.md)。真实 AI 语义、真实手机语音硬件、云端 CPU/网络和免费套餐表现不能用这些本地测试代替。

## 数据交换与备份

设置页支持 JSON v2、账本/省钱 CSV v2、旧格式导入、预检、显式映射、冲突处理和身份去重。导入仍整批成功或整批回滚；**单文件上限 500KB、300 条（含兼容回填）**，超限在任何写入前拒绝。金额为整数分，统计由代码计算。

业务导出不包含密码、会话、个人 AI 密钥/配额、有效分享资格或截图二进制。完整恢复另用 D1 原生导出，恢复演练和以后部署步骤见 [docs/CLOUDFLARE_LOCAL.md](docs/CLOUDFLARE_LOCAL.md)。旧附件元信息可导入，但原图不会上传；未识别的旧图片草稿明确要求重新选择，原本地文件不删除。

`db:migrate:legacy`、Prisma schema/历史 SQL 仅为旧 SQLite 辅助工具，当前应用不再使用 Prisma Client。`scripts/verify-ai.ts` / `verify-p4*.mjs` 是历史验收脚本，当前验证使用上述 D1 命令；不要将旧 SQLite 成功记录当作 D1 结果。

## 以后部署

本轮没有执行登录 Cloudflare、远端建库、远端迁移或部署。以后获授权后，再创建 D1、替换配置中的占位 database ID、设置 HTTPS APP_URL 与 secrets、备份后执行远端迁移、部署和冒烟验证。具体命令仅列在 [部署说明](docs/CLOUDFLARE_LOCAL.md)，没有加入默认 npm 脚本。

分发时请包含 `d1/migrations/`、Wrangler/OpenNext 配置、schema/字段元信息、锁文件和本文档；不要分发 `.env`、`.dev.vars`、`.wrangler/`、`data/` 或原截图。
