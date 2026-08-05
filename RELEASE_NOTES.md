# v0.2.17

## 修复
- 修复普通（TipTap 原生）表格中文输入法光标跳到下一格开头：v0.2.16 的 IME 守卫返回 `false` 会令 ProseMirror 继续跑 keymap，把 IME 确认键误触发为 `Tab→goToNextCell` / `Enter→splitBlock`；改为返回 `true`，明确阻止 ProseMirror 处理合成期间的按键，IME 仍走浏览器/OS 层正常工作（不影响中文输入）。
