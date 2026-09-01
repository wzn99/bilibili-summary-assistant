<!-- Version: 0.24.8 -->
# B站视频总结助手

## 这个工具是做什么的

这是一个运行在 B 站视频页面里的 Chrome 扩展。它把一条较长的视频整理成可以快速阅读和继续追问的内容：

- 一段视频概览，先了解视频主要讲了什么
- 按时间排列的章节，点击即可跳到对应位置
- 带时间点的亮点原话，方便回看关键表达
- 基于视频内容继续提问，也可以选中一段文字直接引用

它适合用来快速筛选教程、访谈、讲解、资讯和长视频，减少为了找一个观点而从头拖进度条的时间。

本 README 只介绍 `扩展本体/` 下的浏览器扩展。外层目录中的 MCP、桌面 GUI 和其他实验项目是独立工具，不属于本扩展的安装步骤。

## 它怎样生成总结

扩展采用“字幕优先，音频回退”的顺序：

1. 读取当前视频的信息和可用的公开字幕。
2. 有字幕时，直接把字幕整理为带时间锚点的文本。
3. 没有可用字幕时，在用户授权后读取 B 站登录状态，取得视频音频并调用配置的转写服务。
4. 将字幕或转写文本发送给用户配置的 OpenAI 兼容 LLM 服务，流式生成总结。
5. 扩展把模型返回的时间锚点映射回视频时间，所以章节和亮点可以点击跳转。

扩展本身不提供 AI 模型，也不经过开发者服务器中转。总结模型、转写服务、API Key 和费用均由使用者自行配置和承担。

## 主要功能

- 优先使用中文字幕，其次使用英文或其他公开字幕
- 流式显示总结结果
- 展示视频概览、章节时间线和亮点
- 点击章节或亮点跳转到视频对应时间
- 根据总结和字幕继续提问
- 选中文字后直接带入问题
- 支持普通视频、合集、多 P、番剧播放页和稍后再看页面
- 支持手动总结，也支持进入视频后自动总结
- 本地保存总结和最近问答，支持历史查看、重新总结、删除单条或批量删除
- 历史记录支持标题关键词、总结关键词和自然语言 AI 筛选
- 支持浅色、深色、跟随系统、面板折叠、时间线紧凑模式、侧栏顺序、面板最大高度和总结正文字号设置
- 支持自动读取、导入、导出和清除 B 站 Cookie

## 安装

1. 下载或克隆本项目。
2. 打开 Chrome 的 `chrome://extensions/`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目中的 `扩展本体/` 目录，而不是外层总目录。
6. 刷新已经打开的 B 站视频页面。

当前扩展版本为 `0.24.8`，对应目录中的 `manifest.json`。本版本修复了视频内设置弹窗因内容脚本无法调用权限 API 而无法保存的问题，并将 OpenRouter 纳入内置服务域名。

## 第一次使用

### 1. 配置总结模型

打开扩展设置，填写：

- `API Key`
- `Base URL`
- `Model`

默认配置为：

- Base URL：`https://api.deepseek.com`
- Model：`deepseek-v4-flash`

也可以填写其他 OpenAI Chat Completions 兼容服务的根地址、`/v1` 地址或完整的 `/chat/completions` 地址。使用自定义地址时，扩展会请求该服务对应的站点权限。

### 2. 确认数据发送授权

“允许发送给所配置的 LLM 服务”默认开启；关闭后，扩展不会把字幕、转写文本、引用内容或问题发送给你配置的服务。

### 3. 打开视频并总结

打开 B 站视频页面，右侧会出现“视频总结”面板。点击“总结”即可开始；如果已经生成过，会显示“重新总结”。

## 没有字幕时怎么处理

无字幕回退需要两项额外条件：

- B 站登录 Cookie，扩展用它读取当前账号可访问的视频音频
- 一个可用的音频转写服务配置

设置页支持两种转写方式：

### DashScope Filetrans

默认方式是 DashScope 原生异步 Filetrans。扩展把 B 站音频直链交给 DashScope，由 DashScope 完成转写，适合直接使用 DashScope 的 Filetrans 模型，例如 `qwen-audio-3.0-asr-flash-filetrans`。

这条路线要求 DashScope 的服务器能够直接访问 B 站音频直链。B 站 CDN 可能要求 Referer、Cookie 或特定域名权限；如果返回 `FILE_403_FORBIDDEN` 或 `FILE_DOWNLOAD_FAILED`，通常是云端无法下载该直链，不等于本地 Cookie 一定失效。

### OpenAI 兼容转写

选择 `openai_compatible` 时，扩展会在浏览器侧下载 B 站音频，再转换为单声道、16 kHz、64 kbps MP3，按片段上传到 `/audio/transcriptions` 接口。默认切片为 300 秒，单段实际最多使用 540 秒，以避开常见的 600 秒限制。

这种方式要求转写服务支持 OpenAI 兼容的音频上传接口。若服务支持 `verbose_json` 和 segment 时间戳，生成的章节和亮点可以使用更精确的时间；服务只返回纯文本时，转写内容只能从 `0:00` 建立起始锚点。

OpenRouter 使用同一个转写服务选项，但请求格式会自动切换为 Base64 JSON。配置示例：服务 URL 为 `https://openrouter.ai/api/v1/audio/transcriptions`，模型为 `openai/whisper-large-v3-turbo`。其他 OpenAI 兼容服务仍使用 multipart 文件上传。

浏览器下载 B 站音频时会通过会话级请求规则设置 B 站 Referer、移除扩展 Origin，并使用 Range 请求，以兼容会拒绝扩展来源请求的 B 站 CDN。规则只匹配本扩展发往允许名单内 B 站音频域名的请求。

## 数据与隐私

- API Key、B 站 Cookie 和转写 API Key 保存在当前浏览器的 `chrome.storage.local` 中。
- 总结、时间线、亮点和问答历史保存在浏览器本地，最多保留 100 条视频记录。
- 不使用开发者控制的服务器，不上传广告或统计数据。
- 只有在用户开启授权并主动使用总结或提问时，相关视频内容和问题才会发送到用户选择的模型服务。
- Cookie 和转写 API Key 不进入总结缓存、同步设置、导出总结或日志。

完整隐私说明见 [PRIVACY.md](PRIVACY.md)。

## 已知限制

- B 站页面结构和接口可能变化，页面更新后可能需要重新适配。
- 无字幕回退依赖有效的 B 站登录状态和可用的转写服务。
- 音频直链具有时效性；Cookie 失效、权限变化或 CDN 防盗链都可能导致音频下载失败。
- DashScope Filetrans 由云端直接下载 B 站直链，不能携带扩展浏览器侧的完整请求状态；出现 `FILE_403_FORBIDDEN` 时，应优先改用能接收浏览器上传音频的 OpenAI 兼容转写服务。
- 超长字幕会按设置中的字符上限截断。
- 没有时间戳的转写结果无法生成精确章节位置。

## 开发与打包

以下命令请在 `扩展本体/` 目录中运行。项目使用 Chrome Manifest V3，运行扩展本身不需要安装 npm 依赖。

语法检查和测试：

```powershell
node --check src/background.js
node --check src/content.js
node --check src/options.js
node --check src/audio-utils.js
node --check src/offscreen.js
node tests/offscreen.test.js
node tests/provider-settings.test.js
node tests/transcription.test.js
```

生成发布包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

ZIP 文件输出到 `release/`。商店文案、权限说明和审核测试步骤见 [STORE_LISTING.md](STORE_LISTING.md)。
