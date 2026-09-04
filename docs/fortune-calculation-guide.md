# 运势年/月/日盘确定性计算指南

## 1. 计算边界口径

- 年盘（流年）：以**立春**换年。
- 月盘（流月）：以十二个“节”换月（立春寅、惊蛰卯……小寒丑）。
- 日盘（流日）：复用 `GetGZ()` 与 `zwz` 开关口径。
- 时间输入：沿用 `fatemaps()` / `GetGZ()`；当传入经纬度时沿用既有真太阳时路径。

## 2. API

### 2.1 `GetFortunePillars($yy, $mm, $dd, $hh = 0, $mt = 0, $ss = 0, $J = null, $W = null)`

返回目标时刻确定性流年/流月/流日信息（不把目标时刻当本命）。核心字段：

- `input`：输入时间与经纬度
- `time_basis`：`standard` / `true_solar`
- `effective_datetime`：实际参与计算的时间
- `profile`：`year_boundary=lichun`、`month_boundary=jieqi`、`day_boundary`
- `year_panel` / `month_panel` / `day_panel`：柱信息、边界信息、证据链

`month_panel` 额外返回 `wuhu_dun`（五虎遁核对信息）。

### 2.2 `AnalyzeFortuneAt($natalTg, $natalDz, ...target..., $options = [])`

组合分析 API（页面主入口）：

- 校验本命四柱输入；
- 计算目标时刻流年/流月/流日；
- 返回三个独立 panel（不混层）；
- `relations`：本命与目标层的客观干支关系（含参与柱位）；
- `shensha`：当前仅输出 `unsupported`（明确未启用跨组“本命触发→流转目标”判定）；
- `evidences`：每条包含 `id/layer/rule_id/title/detail/polarity/participants`。

同时返回 `natal_shensha`（本命神煞）供分区展示，避免与流转层混淆。

## 3. 页面展示约定

运势模块每次计算必须分区展示：

1. 流年盘：年柱 + 立春边界 + 关系 + 证据链
2. 流月盘：月柱 + 当前节/下一节 + 关系 + 证据链
3. 流日盘：日柱 + 日界设置（zwz） + 关系 + 证据链

并且显示：

- 输入时间
- 实际计算时间（真太阳时模式下会不同）
- 评分状态：**“评分暂未启用，当前展示为确定性历法和关系计算”**

## 4. “确定性计算”与“主观评分”边界

当前交付仅包含可复核、可追溯的历法与关系证据；不输出主观吉凶断语。
评分位保留但未启用。

## 5. 测试与向量

- CLI 校验脚本：`php docs/check_fortune.php`
- 共享测试向量：`docs/fortune_test_vectors.json`

说明：当前仓库已在前端接入真实确定性计算展示；向量文件用于后续持续扩展 PHP/JS 一致性自动校验。

## 6. 后续扩展建议

- 接入大运/流时分层 panel
- 接入“本命触发、流转目标”的神煞跨组判定并保留 `source_scope/target_scope`
- 评分体系在证据链稳定后再启用
- 增加事件回看的服务端持久化与对账能力
