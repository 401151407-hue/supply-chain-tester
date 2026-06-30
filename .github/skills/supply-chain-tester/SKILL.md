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
git add -A && git commit -m "描述" && git push

# 完整发布（仅用户明确要求时才执行）
git add -A && git commit -m "描述" && npm version patch && git push && git push --tags && npm run release
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
  - 当前配置：`extraResources` 字段已彻底删除，不存在于配置文件中
  - ⚠️ 如果在另一台机器上重建仓库或修改配置，**务必确认 `extraResources` 未被重新添加**
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

### 7. 输出变量高亮 (`!!` 标记语法)

Python 脚本中在 `print()` 内容最前面加 `!!`（两个 ASCII 感叹号）或 `！！`（两个中文全角感叹号），输出中的变量值会自动**金色加粗+金色背景**高亮。

**语法**：

```python
# ✅ 方式1：key: value 格式 — 值高亮
print(f'!! 客户名称: {name}')      # "客户名称:" 白色，"张三" 金色

# ✅ 方式2：任意文字 + 变量 — 行内搜索变量值并高亮
print(f'!! 啊山莨菪碱阿里上课的 {abc}')  # "啊山莨菪碱阿里上课的" 白色，abc的值 金色

# ✅ 方式3：纯变量值 — 整行金色
print(f'!! {result}')              # 整行金色

# ❌ 无 !! 前缀 — 不高亮（包括 # 可配置项 中的变量也不自动高亮）
print(f'客户名称: {name}')         # 全白色
```

**规则**：
- `!!` 必须放在 print 字符串的**最前面**（行首）
- 支持 ASCII `!!` 和中文全角 `！！`
- 高亮仅在用户填入的变量值与输出匹配时生效
- `# 可配置项` 中定义的变量**不会自动高亮**，只有 `!!` 标记才触发
- **`!!` 行会正常显示在输出区**（不再被隐藏），仅做高亮不做变量注入
- `!!-` 前缀的行会被完全隐藏（`highlightOutput` 中 `continue`），仅用于兼容旧脚本
- 实现文件：`src/renderer/src/utils/highlight.ts`

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
  ├─ stdout ──→ print() ──→ 显示在输出区（!! 前缀用于高亮）
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

## 用户安装 Python 便携版（Windows 必需）

安装包不内置 Python，用户需手动放置便携版：

1. 从 https://www.python.org/downloads/windows/ 下载 **Windows embeddable package (64-bit)**
   - 文件名如 `python-3.11.9-embed-amd64.zip`
2. 解压到安装目录下：`<安装目录>/resources/resources/python-portable/`
   - 路径是双层 `resources/resources/`，最终 `python.exe` 在 `python-portable/` 下
3. 重启应用即可

> 注意：Mac 用户一般系统自带 Python 3，无需此操作。

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
