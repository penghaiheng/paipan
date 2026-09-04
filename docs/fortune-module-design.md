# 运势分析模块设计（骨架阶段）

## 1. 模块目的与范围

本模块新增“运势分析”独立区域，包含：

- 当天运势（Today）
- 指定时刻运势（Custom Time）
- 已发生事件回看（Review）

本次仅完成 **设计 + 接口 + 页面骨架**，**不修改现有四柱、神煞、岁运推算算法逻辑**。

## 2. 页面结构

页面新增 `fortune-panel` 主容器，并拆分为 3 个子区：

- `fortune-today-card`：当天运势结果
- `fortune-custom-form`：指定时刻输入与计算按钮
- `fortune-review-list`：回看历史列表
- `fortune-evidence-list`：证据链展示

每个结果区均显示“当前为占位结果 / 待接入算法”标签，并显示：

- 计算时间（`meta.calculated_at`）
- 输入时间（`meta.input_datetime`）

## 3. 接口定义（稳定字段）

当前仓库为前端页面直出，使用 `js/fortune-panel.js` 中的 service 模拟 API，后续可无缝替换真实后端。

### 3.1 `GET /api/fortune/profiles`

返回可选计算配置（当前写死默认值）：

```json
{
  "profiles": [
    {
      "id": "default-v1",
      "name": "默认配置",
      "year_boundary": "lichun",
      "month_boundary": "jieqi",
      "day_boundary": "zi_00",
      "time_basis": "standard",
      "dayun_method": "rough"
    }
  ]
}
```

### 3.2 `POST /api/fortune/snapshot`

入参：

```json
{
  "datetime": "2026-09-04T10:30:00",
  "mode": "today",
  "profile_id": "default-v1",
  "context": {
    "note": "可选"
  }
}
```

出参（占位实现，字段稳定）：

```json
{
  "summary": { "score": 78, "level": "良", "text": "当前结果为页面骨架占位输出，尚未接入真实运势算法。" },
  "layers": [
    { "name": "本命", "weight": 0.2, "score": 76, "evidence_count": 1 }
  ],
  "evidences": [
    { "id": "today-0", "layer": "本命", "title": "本命占位证据", "detail": "当前为占位结果，后续将接入真实算法证据链。", "polarity": "positive", "weight": 0.2 }
  ],
  "meta": {
    "calculated_at": "2026-09-04T03:00:00.000Z",
    "input_datetime": "2026-09-04T10:30:00",
    "profile_id": "default-v1",
    "is_mock": true
  }
}
```

### 3.3 `POST /api/fortune/review`

保存回看记录：

```json
{
  "event_time": "2026-09-04T09:00:00",
  "event_label": "面试",
  "note": "一面",
  "snapshot": { "...": "snapshot payload" }
}
```

当前存储方式：`localStorage`（key: `paipan_fortune_review_v1`）。

### 3.4 `GET /api/fortune/review`

返回回看历史：

```json
{
  "items": [
    {
      "id": "review-123",
      "event_time": "2026-09-04T09:00:00",
      "event_label": "面试",
      "note": "一面",
      "snapshot": { "...": "snapshot payload" },
      "created_at": "2026-09-04T03:00:00.000Z"
    }
  ]
}
```

## 4. 与现有能力的兼容与隔离

- 不改动 `fatemaps()`、`GetShensha()` 及其返回结构。
- 新增逻辑使用独立命名空间 `window.PaipanFortuneApi`。
- 新 UI 区域与原排盘文本区域并存，不替换原有输出链路。

## 5. 后续接入真实算法 TODO

1. 将 `snapshot` mock 计算替换为后端真实推演服务。
2. 引入可切换 profile 的真实口径（年界/月界/日界/时制/起运法）。
3. 把 `layers` 与 `evidences` 映射到真实“大运/流年/流月/流日/流时”计算证据。
4. 为 review 增加服务端持久化与跨端同步。
5. 为 mock 与真实返回增加版本号字段，保障兼容升级。
