# v0.2.12

> 修复智能表格在历史记录预览中不显示内容的问题。

## 修复
- 现象：点击历史记录「预览」按钮后，笔记中的智能表格区域显示空白（只有标题等文本内容，表格不渲染）。
- 根因：智能表格（dataTable）是 TipTap atom 节点 + React NodeView，其 `renderHTML` 只输出占位标签 `<div data-type="data-table" data-columns="..." data-rows="...">`。历史预览用 `dangerouslySetInnerHTML` 渲染原始 HTML，没有 TipTap 编辑器实例，NodeView 组件不会加载，占位标签显示为空。
- 修复：新增 `dataTablePreview.ts` 工具函数，用 DOMParser 解析 HTML，将所有 dataTable 占位标签转换为静态 HTML 表格，支持全部 10 种字段类型（文本/数字/日期/单选/多选/人员/勾选/链接/评分/进度）的只读渲染。
