# 《电子羊会发疯》技术栈建议

## 1. 当前阶段冻结口径

以下内容是当前 MVP 试玩版实施时已经冻结的工程前提，不再只是建议：

- 客户端引擎：`Cocos Creator 3.8.x`
- 开发语言：`TypeScript`
- 运行与包管理：`Node.js LTS + pnpm`
- 代码规范：`ESLint + Prettier`
- 逻辑测试：`Vitest`
- 数据配置：`Excel/CSV -> JSON` 导表流程
- 存档：本地存档
- 广告：先实现广告接口抽象与 mock 成功路径，不要求当前阶段真接平台 SDK
- 后端：当前阶段不进入范围

当前阶段测试分层同样冻结为：

- 自动化测试覆盖：配置加载与校验、购买范围计算、合成规则、解锁记录、离线收益结算、坏档恢复判定
- 手工验证覆盖：地图切换动画、羊走动表现、拖拽手感、HUD 刷新、图鉴显示

## 2. 结论

如果你准备使用 `Cocos`，我建议不要只把它当“引擎选择”，而是直接配一套能支撑小游戏开发的完整技术栈。  
对于这个项目（放置 + 合成 + 点击加速 + 图鉴收集，且明显偏竖屏小游戏/IAA），我建议的主组合是：

- 客户端引擎：`Cocos Creator 3.8.x`
- 开发语言：`TypeScript`
- 运行与包管理：`Node.js LTS + pnpm`
- 代码规范：`ESLint + Prettier`
- 测试：`Vitest`
- 版本管理：`Git`
- 大资源管理：`Git LFS`
- 数据配置：`Excel/CSV -> JSON` 导表流程
- 平台接入：小游戏平台 SDK 封装层（优先按抖音小游戏适配）
- 错误与性能监控：`Sentry`
- 后端：MVP 阶段可不做；需要排行榜、云存档、运营活动时再补 `NestJS`

## 3. 为什么只用 Cocos 不够

`Cocos Creator` 解决的是“游戏内容运行与跨平台发布”，但它并不自动解决下面这些问题：

- 代码如何组织得可维护
- 配置表如何从策划表安全导入项目
- 多平台差异如何隔离
- 报错、卡顿、资源问题如何定位
- 后期排行榜、云存档、活动配置如何扩展

所以合理做法不是“Cocos + 一堆随手写脚本”，而是从第一天就把工程化、配置流和平台层搭起来。

## 4. 必需技术栈

### 4.1 引擎与语言

- `Cocos Creator 3.8.x`
- `TypeScript`

原因：

- Cocos 官方文档明确支持 `TypeScript` 和 `JavaScript`，但 `JavaScript` 仅支持作为插件脚本导入；对正式项目来说，`TypeScript` 更合适。
- 你这个项目后面一定会有数值表、图鉴配置、平台分支和状态逻辑，越早用 `TypeScript`，后面越省事。

### 4.2 Node.js 与包管理

- `Node.js LTS`
- `pnpm`

原因：

- 你需要一个稳定的前端/工具链运行时来跑 lint、测试、导表脚本和 CI。
- `pnpm` 适合这种“客户端主工程 + 若干工具脚本”的项目，依赖安装和工作区管理都更稳。

### 4.3 代码规范

- `ESLint`
- `Prettier`

原因：

- `ESLint` 负责发现潜在问题和不一致写法。
- `Prettier` 负责统一格式，减少无意义 diff。
- 这种配置驱动的游戏项目，字段、枚举、配置解析一多，没有 lint 很容易积累隐性 bug。

### 4.4 测试

- `Vitest`

建议测试范围：

- 数值公式
- 合成规则
- 招聘机购买范围计算
- 离线收益结算
- 配置表解析与校验

说明：

- 不需要一开始就测 UI。
- 这个项目最值得测的是“纯逻辑”和“配置导入后是否符合预期”。

### 4.5 数据与配置流水线

- 策划源文件：`Excel` / `CSV`
- 游戏运行配置：`JSON`
- 导表脚本：`Node.js` 脚本

建议做法：

- 策划继续在表格里维护羊配置、科技、世界参数、广告限制、图鉴文案。
- 用导表脚本把表格转成 `JSON`，再由客户端读取。
- 不建议把大量数值直接写死在 `TypeScript` 代码里。

这个项目尤其应该坚持配置驱动，因为你已经有较多 Markdown 和 Excel 规划文档，后续迭代频率会很高。

### 4.6 本地存档

- Cocos 内置本地存储能力

建议存什么：

- 当前资源
- 已解锁羊
- 地图进度
- 科技等级
- 每日广告次数
- 时间戳与离线收益结算信息

MVP 阶段本地存档足够，不要急着上云存档。

### 4.7 平台适配层

建议单独做一层 `platform adapter`，不要把平台 API 直接散落在业务代码里。

至少抽象这些接口：

- 登录/启动
- 广告播放
- 分享
- 存档
- 设备信息
- 排行榜
- 埋点

原因：

- Cocos 支持多个小游戏平台发布，但平台 API 差异一直存在。
- 你当前方向明显偏小游戏，平台层必须尽早隔离，否则后面迁移平台会很痛苦。

## 5. 中后期补强技术栈

### 5.1 资源分包与加载

- 使用 `Asset Bundle`

适合的拆分方式：

- `startup`：启动必需资源
- `ui`：公共 UI
- `map_01 ~ map_05`：按世界分包
- `atlas_extra`：大图鉴或非首屏资源

原因：

- 你的项目内容量会随着 100 只羊、图鉴、地图和特效迅速变大。
- 分包能明显降低首包压力，尤其适合小游戏场景。

### 5.2 错误与性能监控

- `Sentry`

建议监控内容：

- JS/TS 运行时报错
- 关键流程异常
- 资源加载失败
- 慢启动、慢场景切换
- 版本发布后的回归问题

这类小游戏最怕“线上偶发坏档、广告回调异常、个别机型黑屏”，没有监控会很难排查。

### 5.3 后端

只有在出现以下需求时再上后端：

- 真排行榜
- 云存档
- 活动配置下发
- 灰度开关
- 公告与邮件
- 数据回流与运营后台

如果需要，我建议从轻量后端开始：

- 服务端框架：`NestJS`
- 数据库：`PostgreSQL`
- 缓存：`Redis`

但这里要控制节奏：  
如果 MVP 只是验证玩法闭环，先不要为了“以后可能会用”就把后端整套上齐。

## 6. 我对这个项目的推荐组合

### 6.1 MVP 阶段

- `Cocos Creator 3.8.x`
- `TypeScript`
- `Node.js LTS`
- `pnpm`
- `ESLint + Prettier`
- `Vitest`
- `Git + Git LFS`
- `Excel/CSV -> JSON` 导表脚本
- 本地存档
- 平台 SDK 抽象层

这个阶段不要急着上：

- 重后端
- 复杂 ECS
- 过度通用的状态管理框架
- 复杂热更新体系

### 6.2 长期运营阶段

在 MVP 验证通过后，再补：

- `Asset Bundle` 分包
- `Sentry`
- 服务器排行榜/云存档
- 运营配置后台
- 更细的埋点系统

## 7. 不建议现在就做的事

- 不建议一开始就上很重的服务端体系
- 不建议把所有系统都抽象成超通用框架
- 不建议把数值硬编码在客户端
- 不建议过早投入“热更新大系统”

原因很简单：  
你现在最重要的是先把“放置 + 合成 + 数值 + 图鉴 + 双地图/多地图切层”这条主链路跑通。

## 8. 最终建议

如果只给一套最务实的答案，我建议你这样定：

```text
Cocos Creator 3.8.x
+ TypeScript
+ Node.js LTS
+ pnpm
+ ESLint
+ Prettier
+ Vitest
+ Git / Git LFS
+ Excel/CSV -> JSON 导表
+ 平台 SDK Adapter
+ 本地存档
+ 后期补 Asset Bundle / Sentry / NestJS
```

这套组合足够覆盖：

- 当前 MVP 快速开发
- 抖音小游戏发布
- 后续 100 只羊内容扩展
- 数值与配置频繁调整
- 长期运营所需的基础扩展能力

## 9. 参考资料

以下是我核对过的官方资料：

- Cocos Creator 语言支持：<https://docs.cocos.com/creator/3.1/manual/zh/scripting/language-support.html>
- Cocos Creator 小游戏平台发布：<https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-mini-game.html>
- Cocos Creator Asset Bundle：<https://docs.cocos.com/creator/3.8/manual/zh/asset/bundle.html>
- Cocos Creator 本地数据存储：<https://docs.cocos.com/creator/3.0/manual/en/advanced-topics/data-storage.html>
- Cocos Creator 热更新说明：<https://docs.cocos.com/creator/3.8/manual/en/advanced-topics/hot-update.html>
- pnpm 官方文档：<https://pnpm.io/>
- ESLint 官方文档：<https://eslint.org/docs/latest/>
- Prettier 官方文档：<https://prettier.io/docs/en/>
- Vitest 官方文档：<https://vitest.dev/>
- NestJS 官方文档：<https://docs.nestjs.com/>
- Sentry JavaScript 文档：<https://docs.sentry.io/platforms/javascript/>

## 10. 2026-05-19 TypeScript 检查配置说明

- `Crazy-Electronic-Sheep/tsconfig.json` 继承 Cocos Creator 生成的 `temp/tsconfig.cocos.json`，项目自定义部分当前显式补充 `lib: ["ES2020", "DOM"]`，保证 `padStart`、`Object.values`、`Object.entries`、WebGPU 类型等声明在命令行类型检查中可见。
- 当前同时启用 `skipLibCheck: true`，用于跳过 Cocos Creator 3.8.8 生成声明文件内部的编辑器/平台类型缺口；项目源码仍通过 `npm run check` 执行完整类型检查。
