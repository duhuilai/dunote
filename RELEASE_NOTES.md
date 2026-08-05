# v0.2.18

## 修复
- 彻底修复普通（TipTap 原生）表格中文输入法光标跳到下一格 / 多出换行：v0.2.17 仅拦截「合成中」与「keyCode 229」两类按键，仍漏掉 IME 在 `compositionend` 之后补发的 `isComposing=false` 且 `keyCode≠229` 确认键。`NoteEditor` 新增 `handleDOMEvents` 追踪合成态 + 150ms 宽限期（`composingRef`），`handleKeyDown` 在宽限期内拦截会移动光标的 `Tab`/`Enter`，彻底阻止 `goToNextCell`/`splitBlock`。

## 新增
- 任务管理：多字段组合排序。支持按 姓名 / 结束日期 / 开始日期 / 任务名称 排序，可叠加多条规则，用上移/下移调整优先级顺序；空值恒排末尾，姓名/任务名走中文拼音序。
- 人员管理：默认显示在岗人员，可切换「离职」「全部」；显示全部时离职人员排在岗人员下方。

## 优化
- 任务管理卡片紧凑化：缩小内边距、间距与字号，一屏可显示更多任务。
