# 神煞规则引擎（兼容模式）

## 范围声明
- 本次改造属于**实现形态重构**（硬编码 -> 规则表驱动）。
- 默认规则口径保持 `paipan_v2_default`，不做流派切换。
- `fatemaps()` 现有对外字段保持兼容：`shensha` / `shensha_detail` / `shensha_by_pillar`。

## 规则表位置
- `lib/shensha_rules.json`

每条规则至少具备以下语义字段（当前实现中部分字段名为兼容别名）：
- `id`：稳定规则标识
- `name`：神煞名称
- `trigger_type`：触发依据类型（年干/年支/月支/日干/日柱分组等）
- `trigger_pillars`：允许触发柱位（实现字段：`allowed_source_pillars`）
- `target_type`：命中目标类型（实现字段：`target_value_type`）
- `target_pillars`：允许命中柱位
- `mapping`：触发表（实现字段：`lookup` / `lookup_variants` / `offset_formula` / `pair` / `members`）
- `note`：规则说明（实现字段：`notes`）

## 执行流程
1. 读取规则集与规则集选项（`ruleset_presets`）。
2. 按 `rule_type` 解释映射并统一进入命中执行器。
3. 执行器在允许的 `target_pillars` 上判定命中并记录证据。
4. 输出结构化结果：
   - `items`（命中明细，含 `rule_id` / `trigger_type` / `target_type`）
   - `by_target_pillar`、`by_source_pillar`
   - `pillar_status`（每柱 `calculated`/命中数量/名称等）
   - 兼容字段 `by_pillar`、`lines`

## 如何新增神煞
1. 在 `lib/shensha_rules.json` 新增规则（优先复用现有 `rule_type`）。
2. 补充 `id`、`name`、触发与目标柱位、映射关系、说明。
3. 将名称加入 `display_order`（决定输出顺序）。
4. 运行 `php docs/check_shensha.php`，确保：
   - 规则完整性校验通过；
   - 既有回归样例通过；
   - PHP/JS 对拍一致。
