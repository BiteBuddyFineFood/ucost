# 实施进度

## 第 3 期 AI 整理扩展（2026-11-13）

- 快速记录支持一条原话拆分到账本、清单、轻量物品、已有物品更新和网页内提醒；物品与依赖提醒可在一次原子操作中保存，也可分别确认。
- 物品更新绑定真实 ID 和版本，预览显示现有数量/位置/到期日；多件同名物品要求选择，不自动合并。
- 清单列表新增“AI 帮我建清单”，先建空清单，再交给用户确认建议；购物、出行和普通清单均支持 AI 补充建议。
- 同名清单条目默认不选中；相近名称只提示，不自动合并；预览后新增同名条目时确认会被拒绝，避免静默重复添加。
- 出行和普通清单候选移除预算、分类、购买字段，不产生账单、结算或库存变化；单轮建议最多 20 条。
- 购物条目新增“购买参考”，只查当前用户账本、已购清单和物品，区分精确与同用途记录，缺少规格时不伪造单价。
- 用户明确取消“未分类名称 / 疑似重复记录整理”；相关代码、意图、推荐问题和测试已移除，不提供入口。
- `npm run typecheck`、`npm run lint` 通过；完整 `npm test` 94/94（9 个文件）；`npm run build:workers` 通过。8787 已用新产物重启，首页 200，`/api/platform` 返回 Workers + D1；针对 8787 的 `assistant` + `list-wizard` E2E 2/2 通过。详见 [生活管家第3期-交付记录.md](生活管家第3期-交付记录.md)。

## 第 4 期小数管家建议问题（2026-11-13，只读切片）

- 新增全局悬浮“小数管家”和侧栏/移动端“更多”入口；桌面可拖动、可收起和隐藏，移动端为底部抽屉。关闭保留本次会话，隐藏悬浮按钮后仍可从导航重新打开。
- 首屏建议问题由当前账页数据生成，覆盖物品位置、本周支出、未完成清单、最近购买、临期物品和提醒；无数据时不展示对应问题。回答由程序按现有领域数据计算，不调用 AI，不消耗额度，不产生账单、预算或库存写入。
- 回答可跳转到物品、清单、账本、提醒等原记录；“先存着”把问题带入快速记录并预填原文，仍由用户确认后保存。面板标注“只读查询”，对话只保存在当前浏览器。
- `npm run typecheck`、`npm run lint` 通过；`npm test` 88/88（9 个文件）；`npx playwright test e2e/assistant.spec.ts` 通过。已查看桌面欢迎/回答、拖动/收起及 390px 底部抽屉截图。未运行完整 Workers 构建与 Workers E2E，未部署，未修改数据库。
- 推荐问题保留“帮我生成本周生活摘要。”，摘要按已保存账目和当前清单计算净支出、分类、省钱、临期、清单和提醒。
- 边界：本轮未接入 AI 自然语言推理、流式回复、对话中的确认写入卡片和跨设备会话；这些仍属于第 4 期后续工作包。详见 [生活管家第4期-小数管家建议问题交付记录.md](生活管家第4期-小数管家建议问题交付记录.md)。

## 首页视觉与点击反馈（2026-11-13）

- 首页趋势、分类、购物、物品、账户和提醒组件新增轻浅分区底色，沿用现有排版与手绘风格；新增代码绘制的钱包、购物袋、沙漏 SVG，图形不覆盖统计内容。
- 省钱罐新增可鼠标/触屏/键盘触发的投币与轻晃动画，仅更新组件视觉状态，不请求 API 或修改金额；提供可访问名称、焦点样式及 reduced-motion 支持。周期、成本和导航操作新增轻微按下反馈，购物统计增加实际清单入口。
- `npm run typecheck`、`npm run lint`、`npm run build` 实际通过，退出 0。浏览器在 Next 开发服务使用合成 API 数据验证，不写真实数据库、不调用 AI；1440px / 390px / 360px 无横向溢出，浏览器 pageerror 为 0。
- 浏览器验证通过：重复点击与 Enter 触发省钱罐不改金额/不写数据、减少动态效果关闭动画、周期与成本切换、隐藏组件并保存布局、购物入口导航。已人工查看桌面和390px完整页面截图。临时验证脚本及截图在被忽略的 `data/dashboard-ui-review.mjs` 和 `data/dashboard-ui-review/`。
- 本轮未构建新的 OpenNext Worker 产物，原8787预览不是本轮视觉验收对象；新界面可在本轮启动的 `http://localhost:3000` 查看。未部署云端。

## Cloudflare 实施（2026-11-12，本地五阶段完成）

最新用户指令覆盖原方案的数据迁移项：**不迁移当前 SQLite 数据**。旧库、uploads、.env 均保留；新 D1 从空库开始。所有迁移验证使用独立合成数据。

### 阶段一：构建兼容性与路径（已验证）

- 初始 `git -c safe.directory=E:/code/ucost status --short` 无修改；使用命令级 safe.directory，未改全局 Git 配置。docs/SQL 等被原忽略规则忽略，不代表文件不存在。
- 安装版本 Next 16.4.6 / React 19.3.1 / Prisma 6.19.0 / Node 22.22.2。基线 `npm run typecheck`、`npm run lint`、`npm run build` 均退出 0；隔离 `cloudflare-baseline.db` 执行原 53 项测试全部通过，非 D1 证据。
- 查询 npm 官方元数据：OpenNext 1.20.16 支持 `next >=15.5.29 <16 || >=16.4.5`；vinext 1.4.5 需要 Vite 8 和 RSC 新构建链。选择 OpenNext 保留当前 Next/React。已读取 OpenNext 官方入门与 Cloudflare Next/D1 文档、当前 Next route/cookies/serverExternalPackages 指南。
- 官方 Prisma D1 adapter 6.19.0 源码 `startTransaction` 明确警告事务被忽略，故不采用。使用 Drizzle 0.45.4 + D1 batch，Prisma 仅保留旧库辅助工具；Worker 不使用 Prisma runtime。
- OpenNext 在 Windows 生成 traced directory symlink 遇到 EPERM，`scripts/build-workers.mjs` 对目录使用 junction，未改 node_modules。`node scripts/build-workers.mjs --skipNextBuild` 成功生成 `.open-next/worker.js`。
- Wrangler 4.148.0 的 workerd 最高支持 2026-10-13；实测 2026-11-12 被拒绝，故配置固定 2026-10-13，保留 `nodejs_compat` / `global_fetch_strictly_public`。
- 本地 `wrangler dev --local --port 8787` + HTTP：首页 200；`/api/platform` 两次响应 cookie=false/true，D1 SELECT 成功。首页包含原登录 UI。此时业务 API 尚未完成迁移，不以此宣称完成。
- `node scripts/verify-d1.mjs --schema` 退出 0：25 个业务表、索引、D1 读写、唯一约束失败整批回滚、重新启动持久化通过。只写 `data/d1-probe`。
- 本地 Wrangler/Miniflare 的运行目录已隔离到项目内 `data/wrangler-*`，不依赖或修改用户目录；默认禁用从原 .env 载入，避免真实 AI 配置进入本地测试。没有注册、云端建库、付费或部署。

### 阶段二：schema / 数据层（已验证）

- 新增显式 Drizzle schema、字段元信息及 `d1/migrations/0001_domain.sql`，覆盖所有 25 个业务表；生成器只读 schema 元信息，不打开旧库。
- 将业务服务的 Prisma 调用迁为有限的领域 repository 词汇；移除运行时 Prisma.dmmf 依赖。
- 写入方式为一致读快照 → 本地业务校验/规划 → 单个 D1 batch；首条 SQL 使用 revision + 唯一约束阻止陈旧写入并让整批回滚。不是模拟 D1 内运行 JS 交互事务；不拆批提交。
- 原 53 项测试已全部转到本地 D1；加 6 项 Workers/D1 专项，共 `npm test` **59/59**，退出 0。包含 SQL 约束失败回滚、revision 陈旧快照竞争仅一个成功、跨用户回滚、购买操作防重、评议容量、结算/退款联动及导入身份防重。
- `npm run db:migrate` 退出 0（108 条本地命令）；第二次运行退出 0，`No migrations to apply`。默认本地 D1 为空业务库，不 seed 用户数据。
- `npm run db:verify` 退出 0：D1 一致读写/回滚、25 表初始化、重启持久化、合成数据完整 SQL 导出 → 独立目标恢复。证据 `data/d1-probe/a441cfc8-5c12-400c-8db7-e67032fb15ea/report.json`：全部表数量相同，收入 200000 分、支出 80000 分、退款 2000 分、省钱 5000 分，购物→账单/物品/清单引用一致。未读取或迁移当前真实旧库。
- 为 D1 参数/查询限制，每表写入用 `json_each(?)`；导入预检限制 500KB/300 条（含回填），一次 batch 不拆分。计划超过45语句/8MB或单参数1.8MB时在提交前拒绝。当前仍适用个人规模快照，没有承诺大规模导入。

### 阶段三：AI / 截图 / 登录（已验证）

- bcrypt cost=12 实际注册/正确密码/错误密码测试通过；Cookie 和用户隔离由 Workers 页面测试验证。登录限流改为 D1 原子计数，第16次拒绝，不依赖进程 Map。
- 截图不创建 Attachment、不读写 uploads，不保存 data URL/base64；只在当前请求识别，保存文字/候选/原采集时间。模型回显图片编码也在持久化前拒绝。D1 专项覆盖失败释放/重试/无图片编码；实际 Workers HTTP 成功识别、确认入账、同一操作重放只有一条账单，无附件行和图片编码。
- 文字批量处理每个HTTP只处理一个草稿；同一 task 暂停/继续保留一次预占，部分结果进度、失败重试一次、过期释放均通过。关闭页面没有继续运行承诺。
- `node:dns`/http/https 固定IP连接替换为标准 fetch + 部署者 HTTPS origin 白名单 + manual 重定向并显式拒绝全部3xx，保留 ALS、AES-GCM 和任务权限。实际HTTP发现workerd不支持redirect:error，已据此修复而非取消保护。自由自定义公网/本地模型入口已收紧并在 README 说明；无真实外部模型请求。
- 发现 OpenNext 默认编译 `.env` 回退和复制 `.env` 到 traced output；构建脚本已加入限定输出路径过滤，不更改源文件。运行配置从 request binding 读取，测试端从动态环境读取。最终完整 `.open-next` 扫描1462个文件，旧`.env`中的秘密内容匹配数 **0**（只输出数量，不输出秘密）。

### 阶段四：完整回归（已验证）

- `npm test` 5文件59项通过；类型检查与 lint 通过。`npm run build:workers` 实际 Next+OpenNext 完整构建成功，未降级 Next/React。
- `npm run test:e2e:workers` 最终退出0，**7/7通过、无跳过**（32.9秒）：桌面记账/批量编辑/首页设置；演示账户1440/390px；桌面和手机整单记账/结算/分组；桌面和手机文件导入/映射/重复；Cookie/归属/截图即时识别与确认防重/公开评议/导出/跨站拒绝。
- 先前6/7的截图失败为真实workerd不支持redirect:error；改为manual并拒绝3xx后通过。单元测试另验证302不被跟随，不以“替身故障”为由跳过验收。
- 最终 `npm test` **59/59**（5文件、71.43秒），`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。npm安装报告23个依赖审计问题（9 moderate、12 high、2 critical），本轮未执行可能改变框架版本的audit fix/force；没有将依赖安全审计宣称通过。
- E2E证据 `data/cloudflare-verification/e2e.json`，独立状态 `data/d1-e2e/e5117cb6-bf14-40de-b410-718afc6a1bca`；金额/来源往返详见D1 exchange测试和独立恢复report。
- 新回归不保存 UI PNG、不开启 trace；原验收图片不覆盖。测试 D1 状态随机独立，与默认库和原 SQLite 分开。

### 阶段五：本地交付（已验证）

- README、`.dev.vars.example`、`docs/CLOUDFLARE_LOCAL.md` 已补齐；旧 README 原文归档保留。提供build/preview/local migrate/schema/seed/test/E2E及D1恢复演练脚本，默认命令不提供远端选项。
- 设置页“自定义 AI 服务”折叠项已改为与“检查当前服务”一致的次级按钮规格，增加标题区/操作区/展开表单间距并保留展开箭头；独立 Workers E2E 用计算样式和临时截图验证，截图检查后删除。
- `npm run preview:workers` 已实际启动默认本地版本，监听8787；最终冒烟：首页200，`/api/platform` 两次cookie=false/true，D1读取通过。默认库未添加用户业务数据，需在页面注册新账号。当前预览保留运行；以后构建前先停止它。
- 最小启动：`npm ci` → `npm run db:migrate` → `npm run build:workers` → `npm run preview:workers`。以后远端命令仅在部署说明出现，未执行。
- 未注册、远端建库、付费、部署或Git提交。真实AI语义、真实手机麦克风、云端免费CPU/网络、任意规模性能未验证。

### 启动故障修复（2026-11-12，已验证）

- 实际复现 `Could not resolve "./.build/durable-objects/sharded-tag-cache.js"`：同一时间有两个 Wrangler 预览占用 8787，重新构建会先清理 `.open-next`，正在运行的预览随即读到缺失的 Durable Object 产物。另一个启动阻塞为受限环境无权写 `C:\Users\...\AppData\Roaming\xdg.config\.wrangler\registry`，返回 `EPERM`。
- 新增 `scripts/workers-local-utils.mjs`：构建前检查 8787，已有预览时在删除任何产物前退出；预览前检查 worker 与 3 个 Durable Object 文件；Wrangler/Miniflare registry、XDG config/cache 固定到项目内 `data/`。`scripts/build-workers.mjs` 在构建后再次校验产物。
- E2E 使用每次运行独立的 registry 和 D1 状态，测试结束通过 stdin 优雅关闭自己启动的 Wrangler/workerd；`scripts/verify-d1.mjs` 在加载 Wrangler 前设置隔离路径；`scripts/local-tool.ts` 同样不再写用户目录。
- 验证命令与结果：`npm run build:workers` 退出 0；`npm run preview:workers` 在 8787 启动；首页 HTTP 200、`/api/platform` HTTP 200 且返回 `runtime=workers,database=d1`。预览运行时重复预览、重复构建均在产物清理前明确退出；构建产物哈希保持不变。
- 页面实际出现“AI 服务暂不可用”时，确认原因是只有旧 `.env`、缺少 Workers 读取的 `.dev.vars`。已仅复制 AI 相关键到被 Git 忽略的 `.dev.vars`，原 `.env` 保持不变；通过本地 binding 检查确认服务地址、密钥、文本/视觉模型、可信 origin 和加密主密钥格式均有效，未输出任何实际值。重启后预览已加载 `.dev.vars` 并在 8787 就绪。
- 随后的“AI 请求超时或网络不可达”进一步定位为运行环境网络隔离：Codex 沙箱内 DNS 正常但 TCP 443 失败，同一主机在授权的外网进程中 TCP 443 正常。已将本地 Workers 预览改为在可访问外网的进程运行；未主动发送 API Key 或模型推理请求。普通终端启动预览不受该 Codex 沙箱限制。
- 完整回归：`npm run typecheck`、`npm run lint` 退出 0；`npm test` 5 文件 **59/59**；`npm run test:e2e:workers` **7/7**（24.0 秒）并正常退出；`npm run db:verify` 的 D1 读写/回滚、25 表、重启持久化、导出到独立恢复全部通过；`npm run db:migrate` 返回 `No migrations to apply`。
- 未验证：其他 Windows 用户目录策略、非 Windows 环境、云端 8787 等价网络/CPU限制、真实外部 AI 与真实手机硬件。本轮仍只使用合成测试数据，未读取、覆盖或迁移旧 SQLite，未修改 `.env`、`uploads/`，未注册外部服务、创建云端资源、付费、部署或提交 Git。

## Cloudflare 迁移交接（2026-11-12，实施前历史记录）

- 已编写 [Cloudflare 迁移方案](CLOUDFLARE_MIGRATION_PLAN.md)，涵盖适配工具验证、D1 数据层及旧库迁移、无截图持久存储的 AI 流程、完整业务回归与部署说明五个阶段。
- 本次仅检查现有代码、已安装依赖版本及官方 Cloudflare 指南并编写文档。没有修改应用逻辑、迁移数据、安装适配工具、注册资源或部署。
- Workers 构建、D1 兼容性、免费套餐运行表现均尚未验证。以下已有测试记录属于原本地版本，不能作为 Cloudflare 迁移通过的证据。

## 原本地版本记录

2026-11-12 P4 更新：已新增 JSON v2、账本/省钱本 CSV v2、旧 JSON/CSV 导入、预检/显式映射/冲突处理、身份去重和整批事务确认。已实际演练独立旧结构库升级 → 导出 → 另一新库导入 → 重启，核对金额、分组、结算和来源图一致；桌面与390px手机文件导入流程通过。规范及证据见 [P4-实施与验收.md](P4-实施与验收.md)。

2026-11-12 更新：已增量实现 v2 的 P2（记录组、全部记账、预算结算）与 P3（个人 AI、统一任务额度、批量分类）。实际范围、升级备份和测试证据见 [P2-P3-实施与验证.md](P2-P3-实施与验证.md)。下面的首版真实 AI 验证记录不等于本次新网关已做真实外部调用。

日期：2026-11-11。已交付可运行的本地首版；以下为实际实现与验证范围。

| 阶段                 | 状态                         | 证据                                                                                                   |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1 基础应用与手动记账 | 已实现，基础验证通过         | Prisma 迁移、注册会话、四类账务、退款约束、账单批量操作；浏览器验证真实记账与首页配置持久化            |
| 2 购物、物品、省钱罐 | 已实现，领域测试通过         | 多清单、购买/放弃转换、使用日志和成本、省钱类型/来源；500→200 且优惠20 的拆分、幂等与回滚通过          |
| 3 AI 与草稿队列      | 已实现，真实 API 验证通过    | 逐条时间、领取与重试、确认预览、表单建议、文本和私有截图输入；真实识别、优惠、清单拆项和跨模块转换通过 |
| 4 多人评议           | 已实现，规则与 HTTP 验证通过 | 单/多人、全员/多数、结束锁定、访问隔离、重置/撤销；最后一票并发容量、HTTP 其他账号投票通过             |
| 5 分析、导出与交付   | 已实现，本地验证通过         | 汇总分析、JSON/CSV、README、截图、production build/start、空库迁移及备份副本恢复核对通过               |

## 已通过检查

- TypeScript 类型检查与 ESLint 通过。
- 18 项领域/数据库测试通过：金额、日期、优惠去重、购物转换、草稿时间与防重、批量事务回滚、数据归属、自动优惠删除不重建、评议容量并发等。
- 三项浏览器/HTTP 用例在开发与生产模式均通过：注册、记账、批量改备注、首页设置保存；1440px 与390px无横向溢出；匿名/其他用户不可读取附件；分享只返回选中字段；投票、导出、跨站写入拦截通过。截图已人工查看。
- 生产构建成功，限定 uploads 子目录后已无构建警告。`npm run start` 实际启动通过。
- 空数据库通过 `npm run db:migrate` 初始化成功；停服务复制数据库和附件，恢复副本 integrity_check=ok，主要表行数与附件完整匹配，见 BACKUP_VERIFICATION.json。
- Agnes 真实调用通过文本、延后整理日期、截图 Data URI 实付/优惠识别、清单拆项、已有购物项跨模块确认转换、统计汇总分析，见 AI_VERIFICATION.json。未调用 Image 2.5 生图接口。
- 各业务编辑器提供自然语言建议，先展示字段建议，再采用到可编辑表单。快速整理后可直接进入确认卡，不必离开当前清单。
- 未应用草稿可修改原话（保留采集时间）；剩余候选可忽略；自动优惠删除后可显式重新开启；部分退款后可人工核对保留优惠。

## 已知边界

- 首版快照接口一次返回当前用户的全部数据，客户端分页，适合个人规模；大量数据需要服务端模块化分页。
- 网页语音依赖浏览器和安全上下文，系统键盘语音输入可保底；没有独立 ASR 或离线同步，未验证真实手机麦克风录音。
- AI 不保证每次语义正确，实际测试曾有重复、无效 JSON、其他模块候选和字段类型不匹配。已增加约束、归一化、重复默认不选、失败保留与重试及人确认。成功报告不代表准确率承诺。
- 真实 AI 验证使用文字和合成收据，没有上传个人财务数据。未注册服务、购买套餐或互联网部署；分享链接仅对能连接本机服务的人可用。
- 复杂订单级多商品优惠目前以单来源防重和核对提示处理，没有完整电商订单/优惠分摊编辑器。
- 首页支持组件开关、顺序及宽度档位；不提供任意位置画布。狭窄窗口自动单列。
- P4 已实现跨库业务 JSON/CSV 导入器；完整附件、登录态、个人 AI 密钥仍走匹配版本的完整备份，不从业务导出恢复。
- frontend-design 已从 anthropics/skills 安装并应用，规范见 DESIGN.md；先前提到的 ui-ux-pro-max-skill 未找到，按用户最新指令采用 frontend-design。

P4 本轮最终检查：Lint/TypeScript/生产构建通过；53 项自动测试通过；开发与生产模式 Playwright 各 7/7 通过（包含演示账号，无跳过）。独立两库升级/导出/导入/重启的财务及来源图一致，证据入口 `data/p4-verification/latest.json`。当前开发库已增量升级，记录数/金额保持不变，1 条历史已购信息仍需核对并保留，详见 `data/p2-p3-verification/history-anomalies.json`。验收编号与实际覆盖边界见 P4 文档末尾。

## 生活管家第 4 期写入确认补齐（2026-11-16）

- 小数管家明确写入语句复用现有 capture/process/apply 链路，新增对话内候选预览、逐项修改、部分确认、冲突恢复、operation 幂等和已保存入口。
- “先存着”可直接保存当前原话与采集时间；AI 超时或网络不可达时保留草稿并明确降级，不显示已保存。
- 快速记录补齐自动、账本、购物、买到/不买了、出行、日常、登记物品、物品变动、到期提醒、省钱十种模式；采集和草稿编辑支持 `itemUpdate`、`reminder` 目标。
- 手机弹窗操作栏吸底，长候选和软键盘场景仍可保存；新增 `e2e/phase4.spec.ts`。
- `npm run typecheck`、`npm run lint` 通过；`npm test` **97/97**；小管家相关 E2E **3/3**。交付范围与边界见 [生活管家第4期-写入确认与快速记录交付记录](生活管家第4期-写入确认与快速记录交付记录.md)。
