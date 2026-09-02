# B站视频总结助手

一个运行在 B 站视频页面中的浏览器扩展。它优先读取视频字幕，在没有字幕时转写音频，再通过你配置的 LLM 生成可跳转的概览、时间线和亮点。

## 功能

- 字幕优先，无字幕时自动转写音频
- 流式生成概览、章节时间线和亮点
- 点击时间点跳转到对应画面
- 基于视频内容继续提问，支持选中文字提问
- 本地保存总结与问答历史
- 支持深浅色、紧凑时间线、面板高度和正文字号设置

扩展不提供模型，也不经过开发者服务器中转。API Key、服务费用和数据处理均由你选择的服务商负责。

## 安装

1. 下载或克隆本仓库。
2. 打开 Chrome/Edge 的扩展管理页。
3. 开启“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择本仓库根目录，然后刷新 B 站视频页面。

## 配置总结服务

在视频总结面板的设置中填写：

- `API Key`：总结服务的密钥
- `Base URL`：OpenAI Chat Completions 兼容接口地址
- `Model Name`：推荐 `deepseek-v4-flash` 或 `qwen3.7-flash`

默认 Base URL 为 `https://api.deepseek.com`。使用其他服务地址时，浏览器可能要求授予对应域名权限。

## 无字幕时的音频转写服务

无字幕视频需要有效的 B 站登录状态和一个转写服务。推荐使用能接收浏览器上传音频的 OpenAI 兼容接口；扩展会下载音频、转换并分片上传。

默认使用以下 OpenRouter 配置，填写自己的 API Key 即可（已有配置不会被覆盖）：

| 设置 | 值 |
| --- | --- |
| 转写服务 | `OpenAI 兼容接口` |
| API Key | 你的 OpenRouter API Key |
| Base URL | `https://openrouter.ai/api/v1/audio/transcriptions` |
| Model Name | `openai/whisper-large-v3-turbo` |

也可使用 DashScope Filetrans。该方式由云端直接读取 B 站音频地址；如果出现 `FILE_403_FORBIDDEN`，通常是云端无法访问 B 站 CDN，建议改用上述 OpenAI 兼容上传方式。

## 隐私

- API Key 和 B 站 Cookie 保存在浏览器本地。
- 总结、时间线、亮点和问答历史最多保留 100 条。
- 视频内容只会发送给你配置的模型或转写服务。
- 配置导出文件可能包含 API Key，请勿公开或提交到 Git。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## 开发

扩展使用 Manifest V3，无需安装 npm 依赖。运行测试：

```powershell
node tests/offscreen.test.js
node tests/provider-settings.test.js
node tests/transcription.test.js
node tests/history-search.test.js
```

生成发布包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```
