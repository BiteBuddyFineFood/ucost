# 历史归档：SQLite 版本 UCost（迁移前）

> 下面是迁移前的原始说明，保留用于理解旧库和旧附件。当前运行命令以根目录 README.md 为准。不要用本归档中的启动/备份命令操作当前 D1 版本。

2026-11-12 P4：已完成 JSON v2、账本/省钱本 CSV v2、旧格式兼容、导入预检/事务确认和独立新库往返验收。入口为设置 → 导入与导出；见 [P4 实施与验收](docs/P4-实施与验收.md) 和 [数据交换规范](docs/数据交换规范-v2.md)。

2026-11-12：已增加记录分组、清单全部记账/预算结算，以及个人 AI 配置、统一每日额度和批量分类。已有数据库请按 [P2/P3 升级说明](docs/P2-P3-实施与验证.md) 先备份并执行迁移；不要对已有库用下文面向首次建库的 `db push` 替代数据迁移。

一个在本机运行的个人消费管理网站：记账、购物清单、物品成本、省钱罐、购物评议，以及 AI 辅助整理。技术栈为 Next.js 16、React 19、Prisma 6 和 SQLite。

## 先看这里

为了让仓库可以直接分享，以下内容没有提交到 Git：

- `.env`、`.env.example`
- Prisma 的 `migration.sql`
- `data/`、`uploads/`
- `docs/`、`AGENTS.md`、`IMPLEMENTATION_PLAN.md`

本地工作区已有四份增量迁移，分发时必须显式带上全部 `prisma/migrations/` SQL 和 migration_lock.toml（当前被 .gitignore 忽略）。首次启动手动创建 `.env`，然后执行 `npm run db:migrate`；已有数据库先按 P4 说明备份和演练。

## 1. 环境要求

- Node.js 20.9 或更高版本，推荐 Node.js 22 LTS
- npm（仓库使用 `package-lock.json`）
- Windows PowerShell 如果提示无法运行 `npm`，把命令里的 `npm` 换成 `npm.cmd`
- 可选：Google Chrome，用于端到端测试和真实 AI 验证
- 不需要单独安装数据库，SQLite 会在本地创建文件

## 2. 首次启动

### 2.1 安装依赖

macOS / Linux：

```bash
npm install
```

Windows PowerShell：

```powershell
npm.cmd install
```

### 2.2 创建数据目录

macOS / Linux：

```bash
mkdir -p data uploads
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force data, uploads | Out-Null
```

### 2.3 创建 `.env`

在项目根目录新建 `.env`，内容如下：

```dotenv
DATABASE_URL="file:../data/ucost.db"
APP_URL="http://localhost:3000"

# 使用者自己的 OpenAI-compatible 服务；AI 三项都必填
AI_BASE_URL=""
AI_API_KEY=""
AI_TEXT_MODEL=""
AI_VISION_MODEL=""

# 可选：仅本地演示 seed 使用
SEED_PASSWORD=""

# 可选：E2E 测试账号密码；不填会随机生成
E2E_TEST_PASSWORD=""
```

变量说明：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | SQLite 文件地址。`file:../data/ucost.db` 是相对 `prisma/schema.prisma` 的路径，最终文件在项目根目录的 `data/ucost.db` |
| `APP_URL` | 是 | 本地用 `http://localhost:3000`；部署到 HTTPS 时改成公网地址，登录 Cookie 会根据它决定是否启用 Secure |
| `AI_BASE_URL` | AI 功能必填 | 使用者自己的 OpenAI-compatible 接口地址，应用会请求 `${AI_BASE_URL}/chat/completions`；不要把 `/chat/completions` 写进这个变量 |
| `AI_API_KEY` | AI 功能必填 | 使用者自己的密钥，只由服务端读取，不会下发到浏览器。留空时应用仍可启动，但 AI 整理不可用 |
| `AI_TEXT_MODEL` | AI 功能必填 | 处理文字记录的模型名 |
| `AI_VISION_MODEL` | 图片识别必填 | 处理截图的模型名，必须支持图片输入 |
| `SEED_PASSWORD` | 可选 | 运行 `npm run db:seed` 时给演示账号设置的密码 |
| `E2E_TEST_PASSWORD` | 可选 | Playwright 测试注册账号使用的密码；不设置时每次运行随机生成 |

补充：

- `AI_IMAGE_MODEL` 和 `UPLOAD_DIR` 不是当前版本需要的配置；附件固定写入项目根目录的 `uploads/`。
- 修改 `.env` 后需要重启开发或生产服务。

### 2.4 初始化数据库

确认分发包包含全部四份迁移后执行（Windows 使用 npm.cmd）：

```bash
npm run db:generate
npm run db:migrate
```

`npm run db:migrate` 创建数据库文件并执行 `prisma migrate deploy`，空库按顺序初始化，现有库只执行尚未应用的迁移。不要对旧库使用 db push、reset 或重新建库。迁移 SQL 不在分发包时，先补齐与当前 schema 对应的完整迁移历史；不要绕过数据保护步骤。

### 2.5 启动

开发模式：

```bash
npm run dev
```

Windows：

```powershell
npm.cmd run dev
```

打开 http://localhost:3000 ，第一次进入时自行注册账号。系统没有预置管理员账号。

生产模式本地运行：

```bash
npm run build
npm run start
```

`dev` 和 `start` 默认绑定 `0.0.0.0`，同一局域网内的手机可以通过 `http://电脑局域网IP:3000` 访问。Windows 防火墙需要允许 Node.js 的本地监听端口。

### 2.6 可选：演示数据

先在 `.env` 中设置：

```dotenv
SEED_PASSWORD="自己设置一个演示密码"
```

然后运行：

```bash
npm run db:seed
```

会创建 `demo`、`reviewer1`、`reviewer2` 三个演示账号，密码都使用 `SEED_PASSWORD`。已有同名账号时不会覆盖密码。seed 在 `NODE_ENV=production` 时会拒绝执行。

### 2.7 可选：手机口述

开发服务绑定 `0.0.0.0:3000`。手机和电脑在同一局域网时，访问 `http://电脑局域网IP:3000`。

网页口述依赖浏览器的 Web Speech 能力、麦克风权限和安全上下文。局域网 HTTP 下浏览器可能禁止麦克风，此时可以直接使用手机键盘自带的语音输入，再把文字保存到应用里。

## 3. AI API 配置（使用者自己提供）

**`AI_BASE_URL` 和 `AI_API_KEY` 都由使用者自己提供。** 项目和作者不附带、不代配、不共享任何 API 地址或密钥。

- 每个在本机运行项目的人，在自己的 `.env` 中填写自己的 `AI_BASE_URL` 和 `AI_API_KEY`。
- 代码不再内置任何服务商地址；`AI_BASE_URL` 为空时 AI 功能会明确提示未配置。
- 如果多人共用同一个部署实例，当前版本是“实例级配置”：该实例的所有账号共用这个实例的 `AI_BASE_URL` 和 key。
- 如果需要同一个实例里每个账号使用各自的地址和 key，当前版本尚未实现用户级 AI 配置，需要额外开发。

### 3.1 调用方式

应用使用 OpenAI-compatible Chat Completions：

```text
POST ${AI_BASE_URL}/chat/completions
Authorization: Bearer ${AI_API_KEY}
```

要求：

- `AI_BASE_URL` 必须是 HTTPS 地址，只有 `http://localhost` 和 `http://127.0.0.1` 例外
- 文字记录使用 `AI_TEXT_MODEL`
- 截图识别使用 `AI_VISION_MODEL`
- 视觉模型必须支持 `image_url` 形式的图片输入
- 单次模型请求 90 秒超时，响应上限 2MB
- 每条记录最多 3 张截图，单张不超过 5MB，支持 PNG、JPG、WebP
- 密钥只在服务端读取，截图会以 Data URI 形式发送给配置的模型服务

### 3.2 填写你自己的服务

```dotenv
AI_BASE_URL="https://你的服务商地址/v1"
AI_API_KEY="你的密钥"
AI_TEXT_MODEL="你的文本模型名"
AI_VISION_MODEL="你的图片理解模型名"
```

- `AI_BASE_URL` 填 API 根路径，应用会自动追加 `/chat/completions`
- 不要填写项目作者的地址或密钥
- 模型名称和额度以你的服务商控制台为准
- 当前应用不会自动调用图像生成模型，截图识别使用支持图片输入的对话模型

### 3.3 使用 OpenAI 或其他兼容服务

把 `AI_BASE_URL` 换成服务商的 OpenAI-compatible 地址，并填写该账号实际可用的模型名。例如：

```dotenv
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY="sk-..."
AI_TEXT_MODEL="你的文本模型名"
AI_VISION_MODEL="你的图片理解模型名"
```

不要使用 `NEXT_PUBLIC_` 前缀保存 `AI_API_KEY`，否则可能被打包到浏览器。

### 3.4 如何确认配置成功

1. 每个使用者填写自己的 `.env` 后重启服务。
2. 进入应用的“设置”页：
   - 显示“已读取本地服务端配置”表示读到了 `AI_BASE_URL` 和 `AI_API_KEY`
   - 显示“未配置 AI_BASE_URL / AI_API_KEY”表示地址或密钥为空
   - 设置页会显示当前读取到的文本模型和截图模型；为空表示未配置
3. 可选运行真实 AI 验证：

```bash
npm run test:ai
```

`test:ai` 会调用真实外部 API，在本地数据库创建隔离测试账号，并写入 `data/`、`uploads/` 下的测试材料。它会使用合成收据，不读取你的真实账目。测试需要已安装 Chrome。

### 3.5 常见 AI 错误

| 现象 | 常见原因 |
| --- | --- |
| `AI 尚未配置，请在 .env 中填写 ... 后重启` | `AI_BASE_URL`、`AI_API_KEY` 或对应模型为空，或修改后没有重启 |
| `AI_BASE_URL 不是有效的 URL` | 地址格式错误，检查是否包含协议和正确的 API 根路径 |
| `AI 服务返回 401/403` | 密钥错误、过期、额度不足，或模型未开通 |
| `AI 服务返回 404` | `AI_BASE_URL` 路径不对，或模型名不存在 |
| `AI 地址必须使用 HTTPS` | 使用了非 localhost 的 HTTP 地址 |
| `AI 请求超时或网络不可达` | 网络、代理、防火墙或服务商不可达 |
| `AI 返回空响应` | 模型或接口不兼容，检查是否支持 Chat Completions |
| 图片识别失败但文字正常 | `AI_VISION_MODEL` 不支持图片输入，或图片超过 5MB |

## 4. 数据、备份与安全

### 4.1 数据位置

- 数据库：`data/ucost.db`
- 附件：`uploads/`
- SQLite 运行时还可能生成 `data/ucost.db-wal`、`data/ucost.db-shm`

`data/` 和 `uploads/` 必须位于可持久化、可写的磁盘。不要把 SQLite 文件和附件放在 Vercel 等临时函数目录里。

### 4.2 完整备份

1. 停止所有正在使用数据库的 `dev`、`start` 和测试进程。
2. 复制整个 `data/` 和 `uploads/` 到同一个备份目录。
3. 单独妥善保存 `.env`。
4. 恢复时在服务停止状态下还原两个目录，再启动应用。

只复制 `ucost.db` 而不复制 `-wal`、`-shm`，或在写入过程中复制，可能得到不一致的备份。JSON/CSV 导出不包含密码、会话和附件原文件，不能替代完整备份。

### 4.3 不要提交的内容

建议在本地 `.gitignore` 中至少包含：

```gitignore
node_modules/
.next/
.env
.env.local
data/
uploads/
*.db
*.db-*
*.log
test-results/
playwright-report/
coverage/
*.tsbuildinfo
```

不要把 `.env`、`data/`、`uploads/`、真实截图、数据库文件或 API 密钥提交到 Git。

### 4.4 对外访问

应用默认开放注册，没有邀请码或管理员审批。不要把服务直接暴露到公网后再依赖“没人知道地址”来保护数据。需要公网访问时，至少应在反向代理层增加访问控制、HTTPS 和备份策略。

当前为人民币单币种、个人账本模型。购物评议的“公开”是应用内权限范围，不会自动产生互联网入口。

## 5. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` / `npm run test` | Vitest 单元测试 |
| `npm run test:e2e` | Playwright 浏览器测试，需要先启动应用和安装 Chrome |
| `npm run test:ai` | 真实调用外部 AI 的验证脚本，会产生本地测试数据 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:seed` | 创建演示数据，需要 `SEED_PASSWORD` |
| `npm run db:migrate` | 执行 `prisma migrate deploy`，需要仓库内有 migration SQL |
| `node scripts/verify-p4.mjs` | 隔离旧库升级、导出、新库导入与重启核对，证据写入 data/p4-verification |

测试补充：

- `test:e2e` 的普通用例会自动生成随机账号密码
- 演示布局用例需要先设置 `SEED_PASSWORD` 并运行 `npm run db:seed`，否则会自动跳过
- `test:ai` 会真实调用外部模型并消耗 API 额度

## 6. 项目结构

```text
prisma/
  schema.prisma         数据模型
  seed.ts               演示数据
src/
  app/                  Next.js 页面和 API 路由
  components/           前端界面
  lib/domain.ts         领域常量与工具
  server/               Prisma、认证、业务服务和 AI 调用
scripts/
  init-db.mjs           创建数据库文件并执行 migrate deploy
  verify-ai.ts          真实 AI 验证
e2e/                    Playwright 测试
tests/                  Vitest 测试
data/                   本地 SQLite 数据（不提交）
uploads/                本地附件（不提交）
```

## 7. 常见启动问题

| 现象 | 处理 |
| --- | --- |
| PowerShell 提示无法运行 `npm` | 使用 `npm.cmd install`、`npm.cmd run dev` |
| `npm run db:migrate` 后没有表 | 核对 DATABASE_URL 和分发包是否包含全部四份迁移 SQL；补齐后重新 migrate，旧库不要用 db push |
| `EPERM ... query_engine-windows.dll.node` | 先停止正在运行的 `dev`/`start`，再运行 `npm run db:generate` |
| 页面能打开但注册/登录报数据库错误 | 检查 `data/` 是否存在、`DATABASE_URL` 是否正确、是否执行过 `npm run db:migrate` |
| 上传图片失败 | 检查 `uploads/` 是否存在且可写 |
| 手机打不开 | 确认同一局域网、使用电脑局域网 IP、防火墙允许 3000 端口 |
| 手机网页麦克风不可用 | 局域网 HTTP 通常不是安全上下文，改用键盘语音输入或配置 HTTPS |
| AI 设置页显示未配置 | 检查 `.env` 中 `AI_API_KEY`，保存后重启服务 |

## 8. 当前边界

- 本阶段以本地运行和个人使用为主，不包含支付、银行同步、自动购物或原生 App
- AI 结果必须经过用户确认，识别错误、日期和分类偏差仍可能出现
- 自动批量默认关闭；开启后按设置的 5–10 条阈值触发
- 没有邮件找回、公共账号搜索、家庭共享账本或社区信息流



P4 数据交换：设置页支持 JSON 全量导出和账本/省钱本 CSV 全部或筛选导出。导入支持 JSON v1/v2、旧七列账本 CSV 和 CSV v2；旧格式需固定来源标识，先预检、解决来源映射与冲突，再事务确认。重复导入不重复计账，缺失必要关系阻止确认。JSON 不含附件文件，图片需完整备份。详细字段、限制和降级规则见 docs/数据交换规范-v2.md；实际证据与升级回退见 docs/P4-实施与验收.md。
