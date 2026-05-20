# 《电子羊会发疯》开发进度

## 1. 当前里程碑

- 日期：2026-05-18
- 当前阶段：`issue #4《第一图购买、出生点与容量失败反馈》` 已完成，工程已从“第一图可自动产出并可在 HUD 观察资源跳动”推进到“第一图可通过招聘入口购买 001，并具备合法出生点与失败无副作用反馈”的阶段
- 当前核心决定：地图不使用格子，羊在双地图漫游区域内自由走动，第二图由 `020 -> 021` 解锁
- 当前已实现边界：`MainScene.scene` 内启动协调、`map_01` 最小骨架、双地图状态骨架、新档赠送 `1` 只 `001`、最高解锁羊/已解锁列表/图鉴初始状态同步、本地存档启动入口、第一图自动产出、核心 HUD、Node 逻辑验证

## 1.1 最近完成事项
- 已启动主场景组件化重构第一轮：
  - 新增 `MainSceneHudView`，把顶部 HUD 创建、贴图加载和文本刷新从 `MainSceneController` 拆出
  - 新增 `MainSceneMapSheepLayerView`，把第一图羊群渲染和自动产出飘字从 `MainSceneController` 拆出
  - 新增 `MainSceneRecruitmentPanelView`，把招聘入口按钮、招聘弹窗、招聘卡片和反馈文案从 `MainSceneController` 拆出
  - 新增 `uiNodeFactory`，统一基础 UI 节点、文本、贴图、矩形、圆角底板和椭圆创建入口
  - `MainSceneController` 继续作为启动和流程协调入口，但表现层细节已开始向独立组件迁移
  - 本轮重构不改变玩法规则、存档结构或资源数值

- 已补齐第一图购买闭环：
  - 新增 `buySheepOnCurrentMap` 公共接口
  - `map_01` 默认开放 `001` 购买
  - 购买成功会扣除资源并占用下一个合法出生点
  - 容量满员、无出生点、资源不足都会明确失败且无副作用
- 已把第一图羊实例扩展为正式出生点模型：
  - 新档赠送羊也会占用出生点
  - 存档羊实例补齐 `position` 与 `source`
  - `saveVersion` 提升到 `2`
- 已在主场景接入最小招聘 UI：
  - 新增“招聘”按钮与招聘弹窗
  - 购买结果会同步刷新 HUD、第一图羊群渲染与文本反馈

- 已在 `Crazy-Electronic-Sheep/` 子工程内建立可运行的 Cocos 主场景启动壳
- 已建立 `map_01` 可视骨架，并保留 `map_02` 锁定占位骨架
- 已落地新档初始化规则：
  - 固定赠送 `1` 只 `001`
  - `最高解锁羊 = 001`
  - `已解锁列表 = {001}`
  - 图鉴 `001` 初始已解锁
- 已补齐 `createNewGameState` / `bootGameState` / 自动产出与 HUD 快照逻辑测试
- 已补齐第一图自动产出主循环：
  - 羊基础秒产配置已接入 `001-025`
  - 当前主场景按整秒推进 `摸鱼能量`
  - 每次结算后会同步写回本地存档
- 已把主场景顶部说明区替换为核心 HUD：
  - 当前资源
  - 全局总秒产
  - 羊钻占位数值
- 已移除钻石面板底部“最高解锁羊”小字，避免和真实羊钻区语义混淆
- 已把第一图羊影子从圆角条改成椭圆表现
- 已为第一图赠送羊补上每秒自动产出的羊头飘字反馈：
  - 显示摸鱼能量图标与 `+x`
  - 缓慢上浮
  - 逐步变淡后消失
- 已完成手工预览验证：在干净 Playwright 预览页中，`001` 新档场景显示 `1/秒`，资源从 `18` 增长到 `20`，符合约 `2.2` 秒内两次整秒结算预期
- 已清理上一轮误建的根目录 Web 脚手架

## 1.2 当前未实现但仍在 MVP 范围内

- 科技
- 拖拽合成
- 第二图解锁与切图
- 离线收益

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

- 当前正式实施范围是 `2 张地图 + 25 只羊 + 单货币 + 最小科技集`
- 当前正式保留的一阶外围系统是一键合成、超频摸鱼、离线广告 `3 倍` 领取
- 免费随机羊、排行榜、真实广告 SDK、`026+` 内容明确后置
- 当前阶段使用自由漫游地图，不再使用格子模型
- 羊是单一贴图，左右转向通过水平翻转贴图完成
- 当前阶段没有后端数据库，只有本地存档结构
- 当前代码现状已完成 issue #2、issue #3 与 issue #4；招聘机范围扩展、拖拽合成、第二图正式玩法与离线收益仍未实现

## 4. 下一步开发入口

进入任何代码实现前，优先阅读：

1. `memory-bank/architecture.md`
2. `memory-bank/game-design-document.md`
3. `memory-bank/basic-game-implementation-plan.md`
4. `memory-bank/tech-stack.md`

接下来的直接开发入口应从以下能力继续推进：

1. 继续把主场景启动协调和后续玩法入口拆到应用协调层/服务层
2. 全局招聘机与按地图截断的购买范围
3. 拖拽合成与 `020 -> 021` 跨地图解锁
4. 第二图玩法闭环与存档扩展
5. 科技、点击收益与外围系统逐步接入

## 5. 规则审查结果

本轮 agent 规则已人工审查，确认满足以下要求：

- 已设置 `Always` 级规则，强制在任何代码生成前阅读核心文档
- 已明确要求每个重大功能或里程碑后更新 `memory-bank/architecture.md`
- 已明确强调模块化、多文件、单一职责
- 已明确禁止单体巨文件、God Object、混合 UI/状态/网络/存储职责
- 已将当前“无数据库、仅本地存档”的事实写入 `memory-bank/architecture.md`
- 已补充强制注释规则，要求代码中明确说明关键变量和函数的职责、输入输出与副作用

## 6. 2026-05-19 组件化重构继续进展

- 已新增 `MainSceneIdleProductionLoop` 运行时组件，把自动产出 `schedule/unschedule`、整秒补齐、owner token 保护和 `settleIdleProduction` 调用从 `MainSceneController` 拆出。
- 已新增 `gameStateSaveService`，集中封装当前主游戏存档 key；boot、清档、购买成功和自动产出写回不再在控制器里直接拼 `GAME_CONFIG.storageKey`。
- 已新增 `MainSceneFoundationView` 运行时组件，把 Canvas/Camera 尺寸同步、兜底背景、`map_01` 背景贴图、HUD 根节点、羊锚点、顶部提示文案、清档按钮和启动失败画面从 `MainSceneController` 拆出。
- `MainSceneController` 当前降到约 523 行，职责进一步收敛为启动、状态协调、组件装配和少量业务入口；自动产出循环与基础场景视图已由独立 Cocos 组件持有。
- 本轮未改动存档结构、玩法数值、购买规则和资源素材，只调整模块边界。
- 验证状态：`npm run check` 通过，`npm test` 的 Node 逻辑测试 10 项通过。
- 已开始从“运行时 addComponent”迁移到 Cocos 场景挂载方式：`MainScene.scene` 的 `ContentRoot` 已直接挂载 `MainSceneFoundationView` 和 `MainSceneIdleProductionLoop`，并由 `MainSceneController` 的 `@property` 字段引用。
- 已在 `ContentRoot` 下新增 `WorldRoot` 和 `ScreenUiRoot` 两个一级根节点，区分地图/世界内容与屏幕固定 UI。
- `BackgroundRoot`、`SheepArtAnchor` 和 `MapSheepLayerRoot` 已归入 `WorldRoot`；`CoreHudRoot`、`SheepStatusRoot`、`DebugControlsRoot` 和 `RecruitmentPanelRoot` 已归入 `ScreenUiRoot`。
- `CoreHudRoot` 已直接挂载 `MainSceneHudView`；稳定根节点已进入 Cocos 层级面板，HUD 内部文字节点和贴图挂点已进入场景节点绑定。
- `MapSheepLayerRoot` 和 `RecruitmentPanelRoot` 分别挂载 `MainSceneMapSheepLayerView` 与 `MainSceneRecruitmentPanelView`，并由 `MainSceneController` 的 `@property` 字段引用。
- `MainSceneController` 已支持递归查找场景挂载节点，并避免把已有父级的表现层强制挪回 `ContentRoot`，保证可视化层级调整不会在启动时被控制器覆盖。
- `MainSceneFoundationView` 不再销毁 `ContentRoot` 的其他子节点，避免刷新基础视图时误删场景挂载的地图羊群层和招聘弹窗层。
- 已继续迁移 HUD 内部固定层级：`CoreHudRoot` 下已有 `IdleEnergyHud`、`HighestUnlockedHud`、贴图挂点、文本层和 3 个 `cc.Label` 节点，`MainSceneHudView` 通过 `@property` 复用这些场景节点。
- 已把 `map_01` 背景图、摸鱼能量 HUD 面板图和羊钻 HUD 面板图迁为 `@property(SpriteFrame)` 资源绑定；旧场景未绑定时仍保留 `resources.load` 路径兜底。
- 已继续把 `map_01` 背景图、摸鱼能量 HUD 面板图和羊钻 HUD 面板图迁为场景内真实 `cc.Sprite` 节点；`BackgroundArtLayer`、`Map01BackgroundSprite`、`IdleEnergyHudSprite` 和 `HighestUnlockedHudSprite` 现在都能在 Cocos 层级面板中直接选中和调整。
- 已把招聘入口与招聘弹窗稳定结构继续迁为场景子节点：`RecruitButton`、`RecruitmentModalRoot`、遮罩、面板框、标题、关闭按钮、双招聘卡、翻页按钮、页码指示器和容量文案都已进入 `MainScene.scene`；弹窗底部独立反馈文案已删除。
- 招聘 UI 当前遵循“Cocos 场景优先、TS 只兜底”的规则：静态节点的位置、尺寸、字号、层级由场景承载，`MainSceneRecruitmentPanelView` 运行时只负责容量/卡片文本刷新、按钮回调、动态卡面资源更新和旧场景缺节点兜底；招聘反馈统一上收到主场景顶部提示。
- 已把原底部带边框状态条改为顶部纯文字提示：`SheepStatusRoot` 下挂载 `MainSceneStatusView`，并预挂载 `SheepStatusLabel` 场景节点；提示文本会在顶部停留后像秒产飘字一样缓慢上浮并淡出。
- 招聘反馈、空地图提示和清档结果已统一收口到 `MainSceneStatusView.showMessage(...)`；`MainSceneController` 不再依赖 `MainSceneFoundationView` 内部提示实现，也不再直接改场景里的 `Label.string`。
- 已新增 `MainSceneDebugControlsView`：`DebugControlsRoot` 现在直接挂载该组件，并预挂载 `ClearSaveButton` 与 `ClearSaveButtonLabel`；`MainSceneFoundationView` 不再直接运行时创建清档按钮，调试入口改为“Cocos 场景优先、TS 只兜底”。
- `MainSceneDebugControlsView` 会根据当前按钮节点尺寸用 `Graphics` 重画圆角底板，并把点击转发给控制器传入的 `onClearSave`；这样后续在 Cocos 里调整按钮位置或尺寸时，运行时不会再把布局强制改回旧 TS 默认值。
- `MainSceneFoundationView` 的子节点清理策略已完成最终收口：`clearManagedRootChildren(...)` 不再靠节点名字白名单保留 `BackgroundArtLayer`、HUD 或提示条结构，而是统一只删除 `uiNodeFactory` 标记过的运行时临时节点。这样场景预挂载结构与旧场景 fallback 节点的边界更清晰，后续继续组件化时也不需要再维护一份新的保留名单。
- 本轮新增验证状态：`MainScene.scene` JSON 解析通过，组件引用结构校验通过，`npm.cmd run check` 通过，`npm.cmd test` 的 Node 逻辑测试 10 项通过。

## 7. 2026-05-17 琛ュ厖杩涘睍

- 宸插皢鐢ㄦ埛鎻愪緵鐨勪富鍦烘櫙鑳屾櫙鍥惧拰 `001` 缇婄礌鏉愭帴鍏?`Crazy-Electronic-Sheep/assets/resources/`锛屼富鍦烘櫙涓嶅啀鍙槸绋嬪簭缁樺埗鍗犱綅楠ㄦ灦銆?
- 宸茬粡鍦?`MainSceneController` 涓惤鍦扳€滅湡瀹炶儗鏅?+ 001 瀹炰範缇婂叆鍦衡€濈殑杩愯鏃跺姞杞芥祦绋嬶紝鍚屾椂淇濈暀 `map_02` 閿佸畾楠ㄦ灦鍜?issue #2 淇℃伅灞傘€?
- 宸插鍘熷 `001瀹炰範缇?.png` 鍋氫簡涓€娆￠潰鍚戝睍绀虹殑鐧藉簳閫忔槑鍖栧鐞嗭紝閬垮厤缇婄礌鏉愬湪鐪熷疄鍦烘櫙涓嚭鐜扮櫧鑹叉柟妗嗐€?
- 历史验证状态：当时 `npm.cmd test` 4 项通过；资源文件、`.meta` 和透明通道校验已通过。`npm.cmd run check` 曾被 Cocos TypeScript `lib` / `temp declarations` 问题阻塞，已在 2026-05-19 通过补齐项目 `tsconfig.json` 检查配置解决。
## 2026-05-20 issue #5 第一图自由漫游与等级可视区分

- 已确认 GitHub issue #4 为 `closed` 且 `state_reason=completed`，因此 issue #5 无前置 blocker。
- 第一图羊群表现层接入可视漫游状态机：羊会先停顿，再在 `map_01` 连续坐标边界内选择随机目标直线移动，到达后重新进入停顿。
- 当前漫游只作用于可见第一图表现层，不写回本地存档，不引入格子模型，不触碰拖拽、点击查岗、第二图或科技扩展。
- 羊贴图会按移动方向水平翻转；不同编号羊通过分段色调和渐进体型形成可视区分，不再显示头顶 `001` 编号徽标。
- 已补充 Node 逻辑测试覆盖：停顿到移动、边界内目标、朝向翻转、行走到达、等级视觉样式稳定性。
- 已修正 `sheep_001` 原始面向左导致的左右翻转反向问题，并把第一图出生点与漫游边界收紧到栅栏内圈，避免羊移动到屏幕外。
- 已补充旧存档越界位置兼容：创建或推进漫游表现态时会先把羊位置夹回第一图栅栏内圈。
- 已采用每次进入场景时从完整可移动边界中重新随机的初始表现位置替代“退出位置存档”：重进后羊群会分布到整片可漫游区域；该表现位置不写入存档，降低生命周期和频繁写档风险。
