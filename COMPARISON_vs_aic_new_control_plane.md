# 对比：另一个 AI 的打榜产物 vs 我们的 `aic_leaderboard`

**日期**：2026-09-23
**对比对象**：`WRw5w/aic_new`（本机克隆在 `D:\02_Projects\ML\jinyinsai1\aic_new_review`，commit `d4ebbae`）
及其引用的两个实体目录 `D:\02_Projects\ML\jinyinsai`（远端 `WRw5w/lihao.git`）与
`D:\02_Projects\ML\agent\my_auto_kaggle`。

---

## 0. 一句话结论

**对方的产物不是棒材赛的答案，也不是同一个赛题的解题代码。**

在对 `/aic_new_review`、`/jinyinsai`、`/my_auto_kaggle` 三个目录里搜
`棒材 | knives | yield_rate | 锯切` —— **零命中**。对方做的是：

| 对方的东西 | 是什么 | 赛题 |
|---|---|---|
| `project/`（`aic_new`） | CLIP ViT-B/32 的 Lora/posembed 鲁棒微调 | **图像识别**（噪声标签细粒度分类） |
| `jinyinsai/`（`lihao.git`） | 同上赛题的实验仓，最好合法分 **78.9122** | **图像识别** |
| `leaderboard_control/` + `my_auto_kaggle/` | **AIC 平台自动打榜控制面**（`jinyinsai_submit` MCP） | **平台通用，与赛题无关** |

⇒ 真正可比的是**最后一行：打榜基础设施**。我们的 `aic_leaderboard` 和它是同一层东西。
它的 78.9 分是图像赛题的，和我们棒材的 94.7 **不可比**。

---

## 1. 两边的定位差异（一句话）

| | 对方 `jinyinsai_submit` | 我们 `aic_leaderboard` |
|---|---|---|
| 设计模型 | **不可信操作员 + MCP 独占 durable state** | **守卫 + 一条命令** |
| 调用方 | 只读沙箱 agent，**不得写任何控制面文件** | 就是 agent 自己，随便写 |
| 复杂度 | 20+ 具名工具、9 态状态机、契约版本化 | 7 个 MCP 工具、7 步流水线 |
| 适用 | 多 agent 协作、多人交接、长周期多赛段 | 单人单机、当天要交 |

两者不是"谁抄谁"，是**同一个问题的两种工程取舍**。

---

## 2. 逐项对比

| 维度 | 对方 | 我们 | 谁强 |
|---|---|---|---|
| **赛程截止闸门** | ✗ 未见 | ✓ `AIC_LEADERBOARD_DEADLINE`，默认 10-05 20:00 | **我们** |
| **每日配额闸门** | ✗ 未见（只有"一小时一个"） | ✓ 默认 5 次/天，对齐官方通知 | **我们** |
| **同包重提** | ✓ 内容 hash + logical identity，**无 override** | ✓ sha256 + stage，但 `--force` 可绕 | 对方 |
| **每小时节奏** | ✓ "一小时一个 effective submission" | ✗ 无 | **对方** |
| **抓分时机** | ✓ `expected_publish_at` / `capture_start_at`，等小时边界 | ✗ 20 s 轮询到超时 | **对方** |
| **分数归属证据** | ✓ 必须 `teamSubmitTime` 与 accepted 时间**闭环** | △ 只要求"比上次新"（方向对，但弱） | 对方 |
| **一次性抓分 claim** | ✓ claim 文件，消费后不可重放 | ✗ 可反复 `capture` | **对方** |
| **provenance 绑定** | ✓ schema v2：实验 ID + 候选 ID/路径/ZIP sha256 + 模型 ID + 每级 parent sha256 | ✗ 无 | **对方** |
| **exact intent 令牌** | ✓ 每次突变需上一步 `queue_status` 签发的 intent | ✗ 只有布尔 `confirm_real_submit` | **对方** |
| **未派发可安全重试** | ✓ `submit_not_dispatched_reconcile_required` + bounded runner 证据 | △ rc=5 → `no_click`，但无 reconcile 协议 | 对方 |
| **身份损坏 fail-closed** | ✓ `blocked_identity_corruption`，禁止手改 JSON | ✗ 我**手改过** `aic_leaderboard_state.json` | **对方** |
| **契约版本握手** | ✓ 启动查 `contractVersion` / `queueSchemaVersion`，防**旧 MCP 进程** | ✗ 无 | **对方** |
| **Chrome 生命周期** | ✗ 需人工起 Chrome（有 `aicomp_start_chrome.ps1` 但非自动） | ✓ 自动起 + `-Restart` 清僵死实例 | **我们** |
| **登录墙等待** | ✗ 契约里没有 | ✓ 检测登录墙 → 轮询等你登录 → 自动继续 | **我们** |
| **一条命令可用性** | ✗ 需 agent 逐调用遵守契约 | ✓ 单命令 + 明确退出码 | **我们** |
| **从多个包里挑最好的** | ✗ 未见 | ✓ `--pick-best` | **我们** |
| **安全测试** | ✓ 专门 safety 测试 + 72 条回归 | ✓ 20 条（含闸门/确认门） | 平 |

---

## 3. 从它那里学到的三件真事

### 3.1 公开榜只显示"最近一次发布"，**不是历史最高** —— 但这条不推翻我们的规则

对方 `PROJECT_STATE.md` 的 *AICOMP Score Semantics* 原文：

> Public leaderboard rows show the team's latest published submission score, **even when it is lower
> than the previous score**. They do not preserve the historical best and are not a complete
> per-submission score history.

**初看像和我们冲突**（我们 `RULES.md §11.1` 写"取复赛阶段最高成绩，提过的分不会掉"）。
核对来源后确认**两者并存、不矛盾**：

- **最终成绩** = 复赛阶段最高成绩 —— 这条来自**官方书面通知**
  （`www.aicomp.cn/notice/notice-3/5248.html`，全智赛组委会〔2026〕37号），效力高于口语转述。
- **公开榜页面的显示** = 最近一次发布 —— 这是**页面语义**，对方说的是这个，并明确补了一句
  "公开榜当前分数低于 78.9122 并不代表历史成绩丢失"。

**对我们的实际影响**（这条是真有价值的）：

1. **抓分时必须按 `teamSubmitTime` 归属**。榜上那行可能是你**上一次**提交的，不是刚交的这次。
   对方为此专门有个错误码：`PUBLIC_LEADERBOARD_PREVIOUS_SUBMISSION_BEFORE_ACTIVE_ACCEPTED_AT`。
   → 我们的 `capture` 要求 `submitted > previous`，**方向是对的**，正好避开这个坑；
   但应该把"绑定到本次提交的 accepted 时间"写成显式断言，并把不匹配的错误码命名出来。
2. **不要因为榜面数字掉了就慌**（也不要用榜面数字去标定引擎）。标定用的是**本次提交**
   对应的那一行，历史最好分要去平台记录里找。

### 3.2 平台**每小时最多发布一个有效榜分** → 抓分要等小时边界，别盲轮询

对方原文：

> AICOMP publishes at most one effective leaderboard score per hour. Use known
> `expected_publish_at` / `capture_start_at` windows with a single capture attempt and watcher;
> **do not repeatedly check inside the hour.**

我们的 `RULES.md §11.1` 也有对应的一条（来自官方）："排行榜非实时更新（算分有延迟），
官方提示避免截止前卡点提交"。

**我该改的**：现在我的 `step_capture` 每 20 s 轮一次、直到 `--score-timeout` 1800 s 用尽 ——
既浪费又可能触发平台风控，而且**方向是错的**（分根本没发布，轮也没用）。
应改成：算出**下一个整点 + 5 min** 作为 `capture_start_at`，睡到点再做**一次**抓分。

### 3.3 契约版本握手 —— 防"MCP 进程还在跑旧代码"

对方要求每次任务首次调用先校验：

```
contractVersion == aicomp-submit-agent-contract/v4
queueSchemaVersion == 3
```

版本不符就**停止一切突变**、要求重启 MCP，且"不得通过改 prompt / 改 JSON 继续执行"。

**这条正中我的软肋**：本轮我刚给 `mcp.py` 加了 3 个工具、又改了 `mcp.json` 的 `args`/`env`
（`-X utf8` + `TEAM_ID`）。**如果 host 还挂着旧的 MCP 进程，它会继续暴露 4 个工具、且用旧参数**，
而我完全看不出来。加一个 `contractVersion` 字段 + 启动断言，就能把这类"改了代码没生效"变成显式失败。

---

## 4. 其他值得吸收的（按性价比排序）

1. **一次性抓分 claim**：同一提交的同一时间窗只允许抓一次，claim 落盘、消费后不可重放。
   我们现在的 `capture` 可以无限次跑。
2. **provenance 绑定**：候选 ZIP 必须绑定"实验 ID + 候选 ID + 规范路径 + sha256 + 模型/引擎版本"，
   防止"改个名把历史方案当新方案交"。我们目前只有 sha256，没绑实验来源。
   （对棒材赛的实际意义：防止把 `submission_ours_94` 改名重交来刷分 —— 虽然规则上无意义，但能防手误。）
3. **no-override 去重**：他们**没有** `--force`。我给闸门留了 `--force` 逃生口 ——
   逃生口是有用的，但应该**要求写明理由并落进 ledger**，而不是静默绕过。
4. **`reconcile` 状态**：rc=5（没点到提交按钮）时，他们的做法是"有界 runner 证据证明未派发 →
   同一 identity 可安全重试"，而不是新开一个 identity。我们的 rc=5 现在会**保守地吃掉一个额度**。
5. **禁止手改 durable state**：我为了清探测记录手改过 `aic_leaderboard_state.json`。
   但他们自己也承认这是"queue v3 + 迁移脚本"逼出来的复杂度 —— 我们的 **JSONL append-only**
   账本从设计上就不需要手改。这一条我们**结构上更优**，只是纪律上要守住。

---

## 5. 明确不采纳的

- **9 态状态机 / exact intent 令牌 / lease 锁 / bounded runner 证据**：
  它们是给"多个 agent 并发 + 多人交接 + 一个季度跨赛段"设计的。我们是单人单机、当天往返，
  引入这些会让"一条命令"变成"一套协议"，**收益小于维护成本**。
- **只读沙箱调用方**：我们的调用方就是我自己，强行只读会让我连 ledger 都写不了。
  折中做法：**durable state 只由代码写，我永远不手改**（纪律而非权限）。
- **对方自己也承认的可移植性缺口**：`SUBMISSION_RECORDS_HELPER` 是本机绝对路径、
  Node 是 Windows 固定路径、team ID/榜页 ID 硬编码在源码常量、helper hash 与源码强绑定。
  ⇒ 这不是"成熟到可以直接搬"的东西。

---

## 6. 建议落地的最小改动（3 条，都能进 `aic_leaderboard`）

| # | 改动 | 收益 | 成本 |
|---|---|---|---|
| 1 | `ledger` 加 **每小时窗口闸门**（默认 1 h，`AIC_SUBMIT_MIN_INTERVAL_MIN`）+ `capture_start_at = 下一整点+5min`，抓分改为**到点抓一次** | 对齐平台发布节奏，避免无效轮询与风控 | ~40 行 |
| 2 | MCP 加 **`contractVersion` / `schemaVersion` 字段 + 启动断言**，版本不符拒绝突变并提示重启 | 把"改了代码没生效"变成显式失败 | ~15 行 |
| 3 | 抓分加 **一次性 claim** + 显式断言"本行 `teamSubmitTime` ≥ 本次 accepted 时间"，不匹配则命名错误码 | 防重复抓分、防误把上一次的分当本次 | ~50 行 |

第 4 条（provenance 绑定）建议暂缓：棒材赛的候选都来自我们自己的 `runs/`，来源是可追溯的，
收益主要是防手误，优先级低于上面三条。

---

## 7. 附：证据位置

| 内容 | 路径 |
|---|---|
| 对方交接 README | `aic_new_review/README.md` |
| 对方的打榜手册（含三铁律） | `aic_new_review/docs/AUTO_LEADERBOARD_RUNBOOK.md` |
| 调用方契约 v4（9 态表） | `aic_new_review/leaderboard_control/docs/JINYINSAI_SUBMIT_AGENT_CONTRACT.md` |
| 平台语义断言（3.1 / 3.2 原文） | `D:\02_Projects\ML\agent\my_auto_kaggle\PROJECT_STATE.md` → *AICOMP Score Semantics* |
| 对方控制面实现 | `my_auto_kaggle/mak/mcp/jinyinsai_submit.py`、`mak/submission.py` |
| 对方成绩单（图像赛题） | `aic_new_review/docs/SCORECARD.csv` |
| 我们那条"取最高成绩"的官方出处 | `RULES.md` §11.1 ← `aicomp.cn/notice/notice-3/5248.html` |
