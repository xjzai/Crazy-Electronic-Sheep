# 《电子羊会发疯》开发进度

## 1. 当前里程碑

- 日期：2026-05-16
- 当前阶段：基础游戏闭环的文档与规则基线已完成
- 当前核心决定：地图不使用格子，羊在单地图漫游区域内自由走动
- 当前实现边界：单地图、单货币、自动产出、购买、拖拽合成、图鉴、本地存档、离线收益

## 2. memory-bank 当前文档

核心文档：

- `memory-bank/architecture.md`
- `memory-bank/game-design-document.md`
- `memory-bank/basic-game-implementation-plan.md`
- `memory-bank/tech-stack.md`
- `memory-bank/progress.md`

参考文档：

- `memory-bank/references/电子羊会发疯_MVP正式开发方案_v0.1.md`
- `memory-bank/references/电子羊会发疯_100只羊图鉴台词与美术规格_v0.1.md`
- `memory-bank/references/电子羊会发疯_100只羊梯度重设计_v0.1.md`
- `memory-bank/references/电子羊会发疯_长期运营数值周期方案_v0.1.md`
- `memory-bank/references/电子羊会发疯_长期运营科技价格与进度测算_v0.1.md`
- `memory-bank/references/电子羊会发疯_100只羊正式数值表_v2.xlsx`

## 3. 当前高优先级事实

- 基础游戏阶段不做第二地图、科技、广告、排行榜、后端和活动系统
- 基础游戏阶段使用自由漫游地图，不再使用格子模型
- 羊是单一贴图，左右转向通过水平翻转贴图完成
- 当前阶段没有后端数据库，只有本地存档结构

## 4. 下一步开发入口

进入任何代码实现前，优先阅读：

1. `memory-bank/architecture.md`
2. `memory-bank/game-design-document.md`
3. `memory-bank/basic-game-implementation-plan.md`
4. `memory-bank/tech-stack.md`

## 5. 规则审查结果

本轮 agent 规则已人工审查，确认满足以下要求：

- 已设置 `Always` 级规则，强制在任何代码生成前阅读核心文档
- 已明确要求每个重大功能或里程碑后更新 `memory-bank/architecture.md`
- 已明确强调模块化、多文件、单一职责
- 已明确禁止单体巨文件、God Object、混合 UI/状态/网络/存储职责
- 已将当前“无数据库、仅本地存档”的事实写入 `memory-bank/architecture.md`
- 已补充强制注释规则，要求代码中明确说明关键变量和函数的职责、输入输出与副作用
