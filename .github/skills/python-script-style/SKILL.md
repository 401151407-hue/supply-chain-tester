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

## 4. 禁止模式

- ❌ 驼峰变量（respData, requestBody, jsonPayload）
- ❌ 中间插 import
- ❌ 用 `.get()` 访问 `b1['respCode']`
- ❌ `env_config['属性名']` 方括号访问
- ❌ 忘记 `print_current_line_number()` 在失败分支
- ❌ 步骤不编号
- ❌ 成功分支不加 `step += 1`
