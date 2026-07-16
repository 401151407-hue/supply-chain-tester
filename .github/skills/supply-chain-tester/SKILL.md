---
name: supply-chain-tester
description: '供应链测试工具 (Supply Chain Tester) — Electron桌面应用。用于在此项目中进行开发、调试、打包、发布。涉及Python脚本解析、变量配置面板、AI助手、自动更新、产品线管理等。'
argument-hint: '[开发|打包|发布|变量|脚本|产品线]'
---

# 供应链测试工具 (Supply Chain Tester)

## 项目概述

基于 Electron 的供应链业务自动化测试桌面应用，支持5条产品线，可执行 Python 测试脚本，提供 AI 助手、变量配置面板、自动更新等功能。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron + electron-vite v3.1.0 + Vite 6 |
| 前端 | React 19, TypeScript 5.7, Tailwind CSS v3.4 |
| 状态管理 | zustand v5 |
| 打包 | electron-builder v26.15.3 |
| 浏览器自动化 | Playwright (Chromium) |
| AI | 多轮对话 + SSE 流式 |
| 脚本执行 | Python 3.11 (macOS 系统 / Windows portable) |
| 更新 | GitHub Release + LAN P2P |
| CI/CD | GitHub Actions (`.github/workflows/build.yml`) |

## Git 仓库

- **GitHub**: `ssh://git@github.com/401151407-hue/supply-chain-tester.git` (origin)
- **Gitee**: `git@gitee.com:liaochenglu/supply-chain-tester.git` (gitee)
- **推送规则**: 每次代码提交必须同时推送到两边，使用 `git push-all` 别名

## 环境配置

```bash
# Node.js 路径
export PATH="$HOME/local/node-v20.19.0-darwin-x64/bin:$PATH"

# GitHub 发布配置（已写入 ~/.zshrc，新终端自动生效）
export GH_OWNER="your-github-username"
export GH_REPO="your-repo-name"

# 项目根目录
cd /Users/liaochenglu/Desktop/supply-chain-tester

# 开发
npm run dev

# 仅提交代码（不构建不发布）
git add -A && git commit -m "描述" && git push-all
# ↑ git push-all 同时推送到 GitHub (origin) + Gitee (gitee)

# 发布新版本（通过 CI 流水线构建全平台安装包）
npm version patch && git push-all && git push-all --tags
# ↑ 推送 tag 后 GitHub Actions 自动构建 Mac(x64+arm64) + Windows(x64) 并发布 Release

## CI/CD 构建与发布

推送 `v*` tag 后 GitHub Actions 自动触发，流程如下：

```
git push --tags
  → build-windows (Windows runner) → .exe
  → build-mac-x64  (macOS runner)  → .dmg (Intel)
  → build-mac-arm64 (macOS runner) → .dmg (Apple Silicon)
  → publish-github → GitHub Release
  → publish-gitee  → Gitee Release (通过 GITEE_TOKEN API)
```

| 仓库 | 用途 |
|------|------|
| GitHub Release | 官方发布 + 自动更新检测 |
| Gitee Release | 国内镜像下载（解决 GitHub 访问问题） |

> ⚠️ 需要在 GitHub Secrets 中配置 `GITEE_TOKEN`（Gitee 私人令牌，勾选 projects 权限）

```
```

## 项目结构

```
test-suites/         # Python 测试脚本（⚠️ .gitignore，含公司接口，不入库）
  信e融/             # → 侧边栏 key: xinerong
  订e融/             # → 侧边栏 key: dingerong
  货e融/             # → 侧边栏 key: huoerong
  账e融/             # → 侧边栏 key: zhangerong
  票e融/             # → 侧边栏 key: piaoerong
  common/            # 通用脚本 (UtilsPage)
  utils/             # 工具库 (UtilsPage)
  config/            # 配置模板 (UtilsPage)
scripts/             # 项目工具链（正常入库，不含业务接口）
  git-commit.bat     # git 提交脚本
  patch-blockmap.mjs # electron-builder 打包补丁
  setup-python.ps1   # Python 便携版安装
  test-run.ps1       # 测试运行
src/main/            # Electron 主进程
  index.ts           # IPC 处理器、脚本扫描、变量解析
  auto-updater.ts    # 三层更新检查 (GitHub → API → LAN P2P)
  browser-manager.ts # Playwright 浏览器封装 (动态 import)
  ai-service.ts      # AI 对话服务
  test-runner.ts     # Python 脚本执行器
src/preload/         # contextBridge 桥接层
src/renderer/        # React 渲染进程
  src/pages/         # 页面组件
    ProductPage.tsx  # 产品线页面（流程管线布局+变量面板）
    ScriptRunner.tsx # 脚本执行器
    UtilsPage.tsx    # 通用工具页（Common/Config/Utils + Playwright安装）
    ApiDebugger.tsx  # API 调试
    Reports.tsx      # 测试报告
    TestEditor.tsx   # 测试用例编辑器
  src/components/    # 通用组件
    Sidebar.tsx      # 侧边栏导航
    AIAssistant.tsx  # AI 助手面板
electron-builder.config.cjs  # 打包配置
```

## 关键设计规则

### 1. 变量配置面板 (ProductPage.tsx)

- 解析 Python 脚本中 `# ===== 可配置项...可配置项结束 =====` 标记块内的变量
- **标签名**: 注释中第一个逗号(中英文)前的内容；无逗号则用整个注释；无注释则用变量 key
- **输入框提示**: 逗号后的内容；无逗号则用 `请输入{注释}`；无注释则用 `请输入{key}的值`
- **清空按钮**: 所有变量清为空字符串，swipeOut 动画效果 (0.2s)
- **执行优先级**: 手动输入值 > 脚本默认值（脚本默认值仅用于预填输入框）

### 2. 导航与路由 (store/index.ts)

- `navigateTo(tab, sub?)` **必须始终设置 `selectedSubProduct: sub ?? null`**
- 不加 `?? null` 会导致切换到不同产品线时残留旧的 subProduct，过滤出空结果
- 产品主 tab: `xinerong | dingerong | huoerong | zhangerong | piaoerong`
- 子产品 tab: `zhangerong_nengliang | zhangerong_guolian`

### 3. 打包与发布 (electron-builder.config.cjs)

- **🚫 extraResources 必须为空** —— 严禁添加任何内容！
  - `test-suites/` 包含公司内部接口地址、数据库连接等敏感信息，**绝对不能打包进安装程序**
  - `resources/python-portable/`、`resources/ms-playwright/` 体积过大且平台相关，也不打包
  - 当前配置：`files: ['out/**/*']` + `extraResources: []`，只打包编译后的 JS 代码
  - ⚠️ 如果在另一台机器上重建仓库或修改配置，**务必确认 `extraResources` 未被重新添加**
- **APP 与辅助文件分离**：APP 安装包只含 Electron + 业务代码（`app.asar`），以下内容由用户单独获取：
  - Chromium 浏览器 → 解压 `chrome-win64.zip` 到 `resources/chrome-win64/`
  - Python + 依赖 → 解压 `python-portable.zip` 到 `resources/python-portable/`
  - 测试脚本 → 解压 `test-suites.zip` 到 `test-suites/`
- 见「Windows 用户分发包」章节了解完整的分发模型
- Windows NSIS 安装脚本 (`build/installer.nsh`) 负责：
  - **全新安装**：创建空 `test-suites/` 目录在安装根目录下（与 `.exe` 同级）
  - **覆盖安装/升级**：卸载前用 `xcopy /E` 备份整个 `test-suites/` 到临时目录，安装后恢复，**确保用户脚本不丢失**
- **发布配置使用环境变量**（`GH_OWNER`、`GH_REPO`），不在代码中暴露 GitHub 账号
- **Windows 架构**：固定为 `x64`（`arch: ['x64']`），避免交叉编译 ARM64 导致用户无法运行

**安装包命名规则**（`artifactName` 配置）：

| 平台 | 架构 | 文件名示例 |
|---|---|---|
| Mac Intel | x64 | `SupplyChainTester-0.1.18-Mac-x64.dmg` |
| Mac Apple Silicon (M系列) | arm64 | `SupplyChainTester-0.1.18-Mac-arm64.dmg` |
| Windows | — | `SupplyChainTester-0.1.18-Windows.exe` |
| Mac ZIP (Intel) | x64 | `SupplyChainTester-0.1.18-Mac-x64.zip` |
| Mac ZIP (M系列) | arm64 | `SupplyChainTester-0.1.18-Mac-arm64.zip` |

**构建与发布命令**：

| 命令 | 作用 |
|---|---|
| `npm run build` | 仅编译 TypeScript → `out/` |
| `npm run dist` | 编译 + 打包安装包到 `dist/`（不上传，仅本地验证） |
| `npm version patch && git push && git push --tags` | 升版本 + 打 tag → **CI 自动构建 Mac + Windows 并发布** |

**🚫 禁止本地构建发布**：除非用户明确要求，否则**不执行** `npm run release`。所有平台的安装包由 GitHub Actions 在 tag 推送后自动构建。

**完整发布流程**（全平台 CI 自动）：
```bash
# 1. 提交代码
git add -A && git commit -m "描述" && git push

# 2. 触发 CI 构建发布（Mac + Windows 一键）
npm version patch && git push && git push --tags
```
- CI 自动构建 Mac x64/arm64 DMG + Windows x64 exe
- Release 页面：https://github.com/401151407-hue/supply-chain-tester/releases

### 4. 脚本扫描 (src/main/index.ts)

- `scanScriptsDirectory()` 扫描 `getScriptsDir()` 返回的目录
- 打包后路径：`<安装目录>/test-suites/`（与 .exe 同级），由 NSIS 安装程序创建
- 开发模式路径：项目根目录 `test-suites/`
- 产品 key 通过目录名推断：包含 `信|xin` → `xinerong`，以此类推
- 子目录作为 subProduct，`.py` 文件作为脚本列表
- 同时扫描 `common/`, `config/`, `utils/` 目录
- ⚠️ `test-suites/` 已加入 `.gitignore`，**不会提交到 Git**，每台机器需自行维护

### 5. AI 助手

- 支持多轮对话，线程持久化到 localStorage
- 自动命名线程
- 工具：文件读写、目录列表、浏览器打开/点击/输入/截图
- 危险操作（文件写入、浏览器交互）需用户确认

### 6. Playwright + Chromium 一键安装 (UtilsPage)

- **不打包 Chromium** 到安装包中（节省 ~150MB）
- 用户在 UtilsPage 点击「一键安装」自动完成：
  1. `pip install playwright` — 安装 Python 包
  2. `playwright install chromium` — 下载 Chromium 浏览器
- **全程无需用户任何额外操作**，等待进度条完成即可

**检测逻辑**（`app:check-playwright` IPC → `src/main/index.ts`）：
- 真正检测 Chromium 浏览器可执行文件是否存在，而非仅检查 `import playwright`
- 三种状态：
  - ✅ 绿色：Playwright + Chromium 均就绪
  - ⚠️ 黄色 + 按钮可点击：Playwright 已装但 Chromium 缺失
  - ⚠️ 黄色 + 按钮可点击：均未安装
- 之前误报「已安装」是因为只检查了 `import playwright`，现在改为检查 `p.chromium.executable_path` 文件是否存在

**常见问题**：
- 报 `Executable doesn't exist at ...\ms-playwright\chromium-xxx\chrome.exe` → 点「一键安装」重新下载浏览器
- 版本不匹配（如 Playwright 期待 chromium-1223 但本地是 chromium-1208）→ 同样点「一键安装」即可自动匹配

### 6.2 脚本完成状态标记 (`# WIP`)

在脚本**第一行**加上 `# WIP`（Work In Progress），APP 会自动将其图标变为**黄色三角**，表示该脚本尚未写完。写完删除该行即恢复绿色。

```python
# WIP
# 这是还没写完的脚本，APP 中显示黄色图标
import sys
...
```

**实现**：
- 主进程扫描脚本时读取第一行，检测 `# WIP` 前缀（`src/main/index.ts` → `isWipScript()`）
- 渲染进程根据 `wip` 字段切换绿色/黄色（`src/renderer/src/pages/UtilsPage.tsx`）

### 6.1 通用工具页变量输入框 + 问号提示 (UtilsPage.tsx)

`src/renderer/src/pages/UtilsPage.tsx` 顶部有 4 个变量输入框，每个右侧有一个 `?` 图标（`HelpCircle`），hover 时显示变量使用说明。

**修改问号提示内容**：直接编辑 `UtilsPage.tsx`，搜索 `<HelpCircle` 即可定位到 4 处提示：

| 输入框 | 行号（约） | 变量名 | 提示内容示例 |
|--------|-----------|--------|-------------|
| 项目ID | ~302 | `projectId` | `项目ID = projectId\n下游脚本可通过 projectId 引用` |
| 证件号 | ~320 | `certNo` | `证件号 = certNo\n下游脚本可通过 certNo 引用` |
| 金额 | ~338 | `amount` | `金额(分) = amount\n给钱包充值时单位则为(元)\n下游脚本可通过 amount 引用` |
| 多功能 | ~358 | `multi_func` | `多功能 = multi_func\n多功能输入框变量名是multi_func 供下游脚本使用` |

**提示内容格式**：内联 JSX `<span>`，直接写文本，`<br />` 换行。

**清空按钮**：点击清空时，4 个输入框内容会有粒子消散动画（`animate-particle-out`，0.35s），动画结束后变量值被清空。

### 7. 输出变量高亮 (`!!...!!` 包裹语法)

Python 脚本中用 `!!` 和 `!!` 把要高亮的内容**包裹**起来（两个 ASCII 感叹号开头 + 两个 ASCII 感叹号结尾），中间内容自动**金色加粗+金色背景**高亮。支持中文全角 `！！`。

**语法**：

```python
# ✅ 行中任意位置：!! 内容 !! — 中间内容高亮
print(f'已给!!{phone}!!发送短信验证码')   # "已给" 白色，"18526795199" 金色，"发送短信验证码" 白色

# ✅ 数字、字母、混合内容均可
print(f'借款人ID:!!{borrowerId}!!已提取') # "BI6a0fc578d5de4f9e" 金色
print(f'验证码:!!123456!!已填入')         # "123456" 金色

# ❌ 无 !!...!! 包裹 — 不高亮
print(f'已给{phone}发送短信验证码')       # 全白色
```

**规则**：
- `!!` 和 `!!` 之间的**任意内容**都会被高亮（不限于数字）
- 可在同一行中使用多次（非贪婪匹配，每对独立高亮）
- 支持 ASCII `!!` 和中文全角 `！！`
- 实现文件：`src/renderer/src/utils/highlight.ts`

**旧版兼容**（仍支持但不推荐）：
| 语法 | 说明 |
|------|------|
| `!! key: value` | 行首 `!!` + 冒号格式，值高亮 |
| `!!-key: value` | 行首 `!!-` 前缀，行完全隐藏（变量注入用） |

**系统自动高亮**（无需 `!!`）：
| 输出模式 | 条件 | 效果 |
|----------|------|------|
| `>>> SIT环境` | `>>>` 前缀 | 金色加粗 |
| `❌ 错误信息` | `❌`/`⏹` 前缀 | 红色加粗 |
| `────────` | 分隔线 | 淡化 |

### 8. 脚本变量注入（stderr 方式）

脚本中通过 **stderr** 输出 `key:value` 或 `key=value` 格式，执行过程中**实时注入到 APP 全局变量**，后续脚本可直接引用。**不再使用 `print()` 方式注入。**

**语法**：

```python
# ✅ 应用已预导入 sys，无需 import
sys.stderr.write(f'projectId:{row[0]}\n')
sys.stderr.write(f'projectName:{row[1]}\n')

# ✅ 等号分隔也可以
sys.stderr.write(f'amount={money}\n')

# ✅ 中文冒号也支持
sys.stderr.write(f'客户名称：{name}\n')

# ❌ 错误：用 print 不会注入变量（print 走 stdout，仅用于显示）
print(f'projectId: {row[0]}')     # 只显示，不注入！

# ⚠️ 如果脚本需要单独测试（不通过 APP 运行），请加上 import sys
```

**工作原理**：

```
Python 脚本
  ├─ stdout ──→ print() ──→ 显示在输出区（!!...!! 包裹内容高亮）
  └─ stderr ──→ sys.stderr.write('key:value\n') ──→ 实时注入到全局变量
```

1. 主进程监听 stderr，按行解析 `key:value` 或 `key=value` 模式
2. 匹配成功 → 发送 `script:vars` IPC 事件 → 渲染进程合并到 `scpExtractedVars` / `globalVars`
3. 匹配失败（如 Python 异常）→ 转发到输出区，带 `[stderr]` 前缀，确保错误可见
4. 打开下一个脚本时，注入的变量自动合并到变量面板的默认值中
5. 用户在后续脚本中即可通过 `{{projectId}}` 引用该值

**示例** — 查询项目信息后自动填充到下一个脚本：

```python
# 查询项目信息.py（先执行）
row = db.query("SELECT ...")
sys.stderr.write(f'projectId:{row[0]}\n')
sys.stderr.write(f'projectName:{row[1]}\n')
sys.stderr.write(f'certNo={row[2]}\n')

# 企业发起授信.py（后执行，变量面板自动出现 projectId、projectName、certNo）
# projectId: P001          ← 自动填充
# projectName: 测试项目     ← 自动填充
# certNo: 91110000XXXXXX   ← 自动填充
```

**规则**：

| 要求 | 说明 |
|---|---|
| 输出通道 | **必须是 stderr**，`sys.stderr.write()` |
| import | **不需要** `import sys`，应用已预导入 |
| 格式 | `key:value` 或 `key=value`（冒号中英文均可） |
| 变量名 | 英文驼峰推荐，只含字母数字下划线 |
| 换行 | 每条变量单独一行，末尾需要 `\n` |
| 时机 | **实时注入**，不等脚本执行完 |
| 非变量 stderr | Python 异常等非 key:value 行会显示在输出区（带 `[stderr]` 前缀） |

**命名建议**：统一使用英文驼峰命名（camelCase），如 `projectId`、`partnerPlatformName`，便于后续脚本变量面板自动识别。

**正确示例**：
```python
sys.stderr.write(f'amount:{ppp}\n')           # ✅ amount = ppp的值
sys.stderr.write(f'certNo={cert}\n')          # ✅ certNo = cert的值
sys.stderr.write(f'客户名称：{name}\n')        # ✅ 客户名称 = name的值
```

**错误示例**：
```python
print(f'projectId: {pid}')                    # ❌ print 走 stdout，不会注入！
sys.stderr.write(f'projectId {pid}\n')        # ❌ 少了冒号或等号
sys.stderr.write(f'projectId:{pid}')          # ❌ 末尾少 \n，可能不解析
```

- 用户手动填写的值优先级高于自动注入的值
- 实现：`src/main/index.ts`（stderr 解析 + `script:vars` IPC）+ `src/preload/index.ts`（`onScriptVars` 监听）+ `src/renderer/src/pages/ScriptRunner.tsx`（变量合并）+ `src/renderer/src/pages/UtilsPage.tsx`（工具页变量合并）

## 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 产品页空白 | `selectedSubProduct` 残留 | `navigateTo` 加 `?? null` |
| DMG 过大 (~250MB) | Chromium 被打包 | 移除 extraResources 中的 Chromium |
| 变量面板显示 key 而非注释 | 注释无逗号时未用完整注释 | 无逗号时 `label = commentText` |
| 脚本找不到 | 文件名与硬编码不匹配 | 用动态扫描，文件名支持前缀如 `1_xxx.py` |
| CI 构建失败 `Resource not accessible` | 缺少 `contents: write` 权限 | workflow 加 `permissions: contents: write` |
| Windows exe 未出现在 Release | CI 用 `npm run dist` 未发布 | 改用 `action-gh-release` action 上传 |
| Chromium 浏览器报 Executable doesn't exist | Playwright 版本与 Chromium 版本不匹配 | 点 UtilsPage「一键安装」重新下载 |

## Windows 用户分发包（4 文件模型）

APP 安装包通过 GitHub Actions CI 自动构建发布，用户从 GitHub Releases 下载。其余 3 个辅助文件需单独提供，一次性放置后无需改动。

### 分发包清单

| 文件 | 大小 | 来源 | 解压后放置位置 |
|------|------|------|---------------|
| `SupplyChainTester-...-portable.zip` | ~120 MB | GitHub Releases 下载 | APP 主目录（解压即用） |
| `chrome-win64.zip` | ~180 MB | 单独提供 | `<APP>/resources/chrome-win64/` |
| `python-portable.zip` | ~38 MB | 单独提供 | `<APP>/resources/python-portable/` |
| `test-suites.zip` | ~170 KB | 单独提供 | `<APP>/test-suites/` |

### 解压后目录结构

```
SupplyChainTester/                        ← APP 主目录
├── SupplyChainTester.exe
├── resources/
│   ├── chrome-win64/                    ← 来自 chrome-win64.zip
│   └── python-portable/
│       ├── python.exe                   ← 来自 python-portable.zip
│       ├── python311.dll
│       ├── python311.zip                ← 标准库
│       └── site-packages/               ← 所有第三方依赖
└── test-suites/                          ← 来自 test-suites.zip
```

### 各文件说明

**1. APP 安装包** (`SupplyChainTester-...-portable.zip`)
- 由 GitHub Actions CI 在推送 tag 后自动构建
- 内含：Electron 运行时 + `app.asar`（编译后的业务代码 + Playwright Node.js 模块）
- 不含：Python、Chromium 浏览器、test-suites 脚本

**2. 浏览器** (`chrome-win64.zip`)
- Playwright 的 Windows Chromium 浏览器，用于录制 UI 和 API
- 下载地址：`https://playwright.azureedge.net/builds/chromium/1228/chromium-win64.zip`
- APP 启动时若 `resources/chrome-win64/chrome.exe` 存在则直接使用，否则自动调用 `npx playwright install chromium` 下载

**3. 便携版 Python** (`python-portable.zip`)
- Python 3.11.9 Windows embeddable + 全部脚本依赖，开箱即用
- APP 优先使用此 Python，找不到才尝试系统 Python
- 构建方式见下方「构建 python-portable.zip」章节

**4. 测试脚本** (`test-suites.zip`)
- 各产品线 `.py` 脚本文件，APP 运行时读取
- 来源：项目 `test-suites/` 目录打包（排除 `__pycache__`、`*.pyc`）

## 构建 python-portable.zip

在 macOS 上为 Windows 构建便携版 Python + 依赖包：

```bash
# 1. 下载 Python 3.11 embeddable (Windows amd64)
curl -L -o /tmp/python-embed.zip \
  "https://mirrors.huaweicloud.com/python/3.11.9/python-3.11.9-embed-amd64.zip"

# 2. 解压
mkdir -p /tmp/python-portable && unzip -qo /tmp/python-embed.zip -d /tmp/python-portable/

# 3. 安装 Windows 平台的第三方依赖（macOS 上交叉下载）
pip3 install \
  --target /tmp/python-portable/site-packages \
  --platform win_amd64 \
  --python-version 3.11 \
  --only-binary :all: \
  -r resources/python-portable/requirements.txt

# 4. 配置 python311._pth，启用 site-packages
cat > /tmp/python-portable/python311._pth << 'EOF'
python311.zip
.
site-packages
import site
EOF

# 5. 打包
cd /tmp/python-portable && zip -rq python-portable.zip .
```

> ⚠️ 关键：必须用 `--platform win_amd64 --only-binary :all:` 确保下载 `.pyd`（Windows DLL），而非 macOS 的 `.so` 文件。最终包中应有 50 个 `.pyd`、0 个 `.so`。

### 依赖更新

当 `requirements.txt` 有变动时，重新执行第 3-5 步即可生成新的 `python-portable.zip`。

## Git 仓库

- 地址: `git@ssh.github.com:401151407-hue/supply-chain-tester.git`（SSH over HTTPS 端口 443）
- SSH key: `~/.ssh/id_ed25519`（已配置 `StrictHostKeyChecking=no`）
- 分支: `master`
- 版本号格式: `v0.1.x` (npm version patch)
- ⚠️ 2026-06-24 重建仓库：清除了含敏感脚本的旧历史，仅保留开源代码

## ⚠️ test-suites 目录说明

`test-suites/` 包含公司各产品线的 Python 自动化脚本，内容涉及内部接口地址、数据库连接等敏感信息，**已通过 `.gitignore` 永久排除，不会提交到 GitHub**。

### 目录结构

| 目录 | 产品线 | 子产品 |
|------|--------|--------|
| `test-suites/信e融/` | 信e融 | 药师帮个人信e融2 |
| `test-suites/订e融/` | 订e融 | 汇誉鑫订e融 |
| `test-suites/货e融/` | 货e融 | 测试专用 |
| `test-suites/账e融/` | 账e融 | 国联账e融、能良账e融 |
| `test-suites/票e融/` | 票e融 | 韶欢票e融 |
| `test-suites/common/` | 通用脚本 | — |
| `test-suites/config/` | 配置模板 | — |
| `test-suites/utils/` | 工具库 | — |

### 运行时行为

- **运行时路径**：打包后在 app 安装根目录下（与 `SupplyChainTester.exe` 同级）
- **Windows**：NSIS 安装程序创建空目录，用户自行放入 `.py` 脚本
- **Mac**：app 首次启动时自动创建空目录（`getScriptsDir()` 兜底）
- **升级保护**：NSIS 脚本在卸载前用 `xcopy /E` 递归备份到 `%TEMP%`，安装后恢复
- **严禁**将 `test-suites/` 加入 `extraResources` 打包，这会泄露敏感脚本

### 代码实现

| 文件 | 职责 |
|------|------|
| `build/installer.nsh` | NSIS 自定义脚本：创建空目录 + 升级备份恢复 |
| `src/main/index.ts` → `getScriptsDir()` | 返回 `join(process.resourcesPath, '..', 'test-suites')` |
| `electron-builder.config.cjs` | `extraResources` 清空 + `include: 'build/installer.nsh'` |
| `.gitignore` | 包含 `test-suites/`，确保不入库 |
| `test-suites/common/` | 通用查询 | 项目信息/客户信息/测试查询/授信类 |
| `test-suites/utils/` | 工具库 | 数据库/环境配置/导出/计数器/随机生成 |
| `test-suites/config/` | 配置模板 | Excel 导入模板 |

### 新机器设置

> 🔒 如果你在新机器上 clone 了项目，需要手动复制 `test-suites/` 目录到项目根目录，应用才能正常执行脚本。没有这个目录应用也能启动，但所有脚本列表为空，执行会报 File not found。

## Mac 打包签名与常见问题

### 未签名 Mac 应用提示"文件已损坏"

未购买 Apple Developer 账号时，打包的 `.app` 无签名，用户下载后可能提示"文件已损坏，无法打开"。

**原因**：macOS 给从网络下载的文件添加了 `com.apple.quarantine` 扩展属性，阻止未签名的应用运行。

**解决办法**（让用户执行）：
```bash
sudo xattr -rd com.apple.quarantine /Applications/SupplyChainTester.app
```

**或**：系统设置 → 隐私与安全性 → 仍要打开。

> 有的用户会遇到有的不会，取决于 macOS 版本和下载方式（浏览器下载会触发，AirDrop/USB 不会）。

### 签名方案

| 方案 | 费用 | 效果 |
|------|------|------|
| 不签名（当前） | $0 | 有时弹"已损坏"，需用户手动处理 |
| 买 Apple Developer 账号 | $99/年 | 签名后永不弹，需 CI 配置证书 |

## Python 脚本 API 调用风格规范

当用户提供接口数据（如 API 录制结果的 JSON 片段），要求「写调用接口」或「按我的风格写」时，必须严格遵循以下模板。

### 标准模板

```python
# 步骤描述（如：授信列表查询）
url = env_config.{服务名}+'{接口路径}'
json = {
    "参数1": 值1,
    "参数2": 值2
}
a1 = requests.post(url, headers=headers, json=json)   # GET 则用 requests.get
b1 = a1.json()
if b1['respCode'] == str(10000):
    step += 1
    print(f'[步骤{step}] {步骤描述}成功',
          '| 关键字段:', b1['body'].get('字段名', ''))
else:
    print('\n'+'*'*100)
    print_current_line_number()
    print(url)
    print(b1)
    print('*'*100+'\n')
    sys.exit()
```

### 规则要点

| 规则 | 说明 |
|------|------|
| 变量命名 | 统一用 `response`/`result`，或 `a1`/`b1` 命名，不递增 |
| 步骤计数 | 成功时 `step += 1`，`print` 中必须带 `[步骤{step}]` |
| 错误处理 | 失败时打印分隔线 + `print_current_line_number()` + URL + 响应体 + `sys.exit()` |
| respCode 判断 | 使用 `b1['respCode'] == str(10000)` 字符串比较 |
| headers | 统一用 `headers = {'token': token}`，token 由 `login()` 获取 |
| URL 拼接 | 用 `+` 直接拼接，不用 f-string：`env_config.xxx+'/path'` |
| import | 不在接口调用处重复 import，依赖顶部统一定义 |
| 循环场景 | 如有多笔造数，外层 `for` 循环包裹，内层接口递增变量名仍用 `a1/b1` |

### 服务名对应 env_config 变量

| 服务 | env_config 变量 |
|------|----------------|
| CMP 审批管理 | `wxsbank_supplychain_cmp` |
| 供应链 Web | `wxsbank_supplychain_web` |
| 供应链 Partner | `wxsbank_supplychain_partner` |
| 门户 Web | `wxsbank_supplychain_portal_web` |
| 产品 Partner | `wxsbank_supplychain_product_partner` |
| 小工具 | `wxsbank_scp_small_tool` |
| Adam | `wxsbank_supplychain_adam` |
| PCL Partner | `wxsbank_supplychain_pcl_partner` |
| 流动性 Partner | `wxsbank_scp_liquidity_partner` |

### 示例

用户提供接口数据后，生成如下代码：

```python
# 授信列表查询
url = env_config.wxsbank_supplychain_cmp+'/wxsbank-supplychain-cmp/manage/grant/credit/record/list'
json = {
    "auditStatus": "00",
    "pageSize": 10,
    "projectIdList": [],
    "socialCreditCode": socialCreditCode,
    "pageNum": 1
}
a1 = requests.post(url, headers=headers, json=json)
b1 = a1.json()
if b1['respCode'] == str(10000):
    pageList = b1['body'].get('pageList', [])
    step += 1
    print(f'[步骤{step}] 授信列表查询成功',
          '| 记录数:', b1['body'].get('totalNum', 0))
else:
    print('\n'+'*'*100)
    print_current_line_number()
    print(url)
    print(b1)
    print('*'*100+'\n')
    sys.exit()
```
