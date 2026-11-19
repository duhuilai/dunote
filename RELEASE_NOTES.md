# v0.2.37

本次更新修复 AI 服务连接测试失败，并补充千问AI平台预设与地址校验。

## AI 连接修复

- 修复桌面端 HTTP 插件前后端版本不一致导致的 `missing client-config header` 错误。
- 将 Tauri HTTP 插件的前端与 Rust 依赖统一锁定到兼容版本。
- AI 请求现在可以正常进入所配置的服务端，并显示真实的鉴权或模型错误。

## 千问AI平台

- 新增「千问AI平台（Token Plan）」和「千问AI平台（按量计费）」供应商预设。
- 支持千问 OpenAI-compatible Chat Completions 接口。
- 当 Base URL 少写 `api` 时直接给出明确提示，避免请求无效域名。
- 千问预设默认关闭录音转写，因为千问语音识别使用独立协议，不等同于 OpenAI `/audio/transcriptions` 接口。

## 配置提示

- 千问 Token Plan 地址为 `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1`。
- 千问按量计费地址为 `https://maas.qianwenaiapi.com/compatible-mode/v1`。
- 使用千问进行文本生成时，请填写账号可用的文本模型；录音转写需要另选支持 OpenAI-compatible transcription 接口的供应商。

## 升级说明

- 本版本支持 Windows 安装包（MSI、EXE）和 macOS 安装包（DMG）。
- 如果仍看到 `missing client-config header`，说明运行的不是 v0.2.37 或更新版本，请安装本次发布包后重试。
