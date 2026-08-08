---
name: python-script-style
description: '供应链测试项目的 Python 脚本编写规范，包括接口调用风格、变量命名、步骤结构等。用于编写和重构业务脚本时保持一致风格。'
argument-hint: '[接口|变量|步骤|结构]'
---

# Python 脚本编写规范

## 1. 文件结构

```python
# -*- coding: utf-8 -*-
import sys, requests, random, datetime
from utils.line_counter import print_current_line_number
from utils.login_helper import login
from utils.environment import get_environment

# 获取环境
env = sys.argv[1]
print(f">>> {env}环境")

step = 0   # 步骤计数器

# ————————————————————步骤1：xxx————————————————————
# POST /path/to/api
url = env_config.xxx + '/path'
json = {...}
a1 = requests.post(url=url, json=json, headers=headers)
b1 = a1.json()
if b1['respCode'] == str(10000):
    step += 1
    print(f'[步骤{step}] xxx成功')
else:
    print('\n' + '*' * 100)
    print_current_line_number()
    print(url)
    print(b1)
    sys.exit()
```

## 2. 接口调用风格

### 变量命名
```python
url = env_config.xxx + '/path'      # url 独立一行
json = {"key": value}                # 请求体统一叫 json
a1 = requests.post(url=url, json=json, headers=headers)
b1 = a1.json()                       # 返回体统一叫 b1
```

### 成功/失败判断
```python
if b1['respCode'] == str(10000):     # 直接下标访问，str() 比较
    step += 1
    print(f'[步骤{step}] xxx成功')
else:
    print('\n' + '*' * 100)          # 失败分隔线
    print_current_line_number()       # 行号定位
    print(url)
    print(b1)
    sys.exit()
```

### 非关键接口（如挡板、配置）
```python
requests.post(url=url, json=json)    # 不校验返回
step += 1
print(f'[步骤{step}] xxx已完成')
```

## 3. 核心规则

- **无驼峰命名**：`json` 不是 `jsonBody`，`a1`/`b1` 不是 `resp`/`data`
- **step 计数器**：`step = 0` 置顶，每步 `step += 1`
- **env_config 点号访问**：SimpleNamespace 不支持 `[]`，必须用 `.属性名`
- **import 全在顶部**：不在中间插入 import
- **JSON 字段加中文注释**：每个字段行末对齐注释，说明含义和枚举值
- **脚本第一行 `# WIP`**：未完成脚本加此标记，APP 显示黄色图标

## 4. 弹窗交互（app_input / app_notify）

脚本执行到需要用户输入或选择的位置时，用弹窗阻塞等待，用户完成输入后脚本才继续。

```python
from utils.app_input import app_input, app_notify

# 文本输入框
projectId = app_input('请输入要充值的项目ID：')

# 单选列表（options 传入可选项）
submitter_type = app_input(
    '请选择发起方式：',
    options=['02=客户经理', '01=客户自主', '03=随便'],
    title='选择发起方式',
)

# 纯提示框（点击确定后继续）
app_notify('请先在界面上完成XX操作，完成后点击确定继续', title='操作提示')
```

规则：
- **app_input**：弹出输入框或单选列表，`sys.stdin.readline()` 阻塞等待
- **app_notify**：纯提醒，点确定继续
- options 参数存在时显示单选框，否则为文本输入
- title 参数自定义弹窗标题，默认「脚本交互」
- 弹窗标记通过 `sys.stderr` 输出，APP 主进程拦截后通知渲染进程弹窗

## 5. 禁止模式

- ❌ 驼峰变量（respData, requestBody, jsonPayload）
- ❌ 中间插 import
- ❌ 用 `.get()` 访问 `b1['respCode']`
- ❌ `env_config['属性名']` 方括号访问
- ❌ 忘记 `print_current_line_number()` 在失败分支
- ❌ 步骤不编号
- ❌ 成功分支不加 `step += 1`
