## Agent 技能

### Issue 跟踪

规格、工单、issue 的发布与获取以及路径规划（wayfinding），使用 `.scratch/` 下的本地 Markdown，并遵循 `docs/agents/issue-tracker.md`。

### 领域文档

在探索代码库、进行架构工作或修改领域术语之前，先阅读 `docs/agents/domain.md`。本仓库当前采用单一上下文（single-context）布局。

### 测试与发布

- 用 `node --check` 对 `src/background.js`、`src/content.js`、`src/options.js`、`src/audio-utils.js`、`src/offscreen.js` 和 `src/history-search.js` 做语法检查。
- 用普通 `node` 运行 `tests/` 下的测试文件（无需 npm 依赖）：`offscreen.test.js`、`provider-settings.test.js`、`transcription.test.js`、`history-search.test.js`。`src/` 中新增共享模块时应附带对应的边界测试。
- 发布包由 `powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1` 生成到 `release/`；Cookie 和 API key 绝不能进入发布包。

### 配置存储与凭据

- 普通配置保存在 `chrome.storage.sync`；密钥只保存在 `chrome.storage.local` 的 `bsa-provider-api-key` 和 `bsa-transcription-api-key` 两个键下。`saveSettings()` 写入前必须从同步副本中删除 `apiKey`/`transcriptionApiKey`。读取时若在同步存储中发现旧版 `apiKey`，先迁移到本地，再从同步存储删除。
- `getSettings()` 是唯一的读取入口：合并 `DEFAULT_SETTINGS`、同步配置和本地密钥，再经过 `normalizeSettings()`。新增配置字段时，需同步更新后台默认值、`normalizeSettings()` 的范围钳制、设置页表单；若涉及第三方端点，还要一起更新 origin/权限计算。设置页自带的默认值只用于表单展示，运行时边界是 `normalizeSettings()`。
- 关键归一化边界：`transcriptionChunkSeconds` 60–3600（默认 300）、`transcriptionRequestTimeoutSeconds` 30–3600（默认 180）、`transcriptionPollIntervalSeconds` 1–60（默认 5）、`transcriptionPollTimeoutSeconds` 30–7200（默认 3600）、`maxTranscriptChars` 下限 120000、`transcriptionProvider` 只允许 `dashscope_filetrans` 或 `openai_compatible`。
- 展示设置边界：`panelMaxHeight` 420–1200（默认 640）、`summaryFontSize` 11–18（默认 13）；面板高度还需受当前浏览器视口限制。
- 运行时 `SAVE_SETTINGS` 消息传入 `skipPermissionRequest: true`；缺少所需 origin 时保存直接失败，而不是弹权限申请。

### 可选主机权限

- `chrome.permissions.request()` 必须在用户手势处理器中执行：设置页保存流程（`options.js` 的 `requestProviderOrigins()`）或页内设置弹窗（`content.js` 的 `requestProviderOrigins()`）。不要从 Service Worker 申请可选主机权限；Chrome 会以 `This function must be called during a user gesture` 拒绝。
- `providerDataConsent` 决定 LLM 和转写服务的 origin 是否成为权限申请目标。服务 URL 变化或同意开关关闭时，保存成功后会尽力移除旧 origin 的权限；移除失败不得导致保存失败。

### 运行时消息与流式端口

- 一次性消息统一返回 `{ ok: true, data }` 或 `{ ok: false, error }`；监听器返回 `true` 以保持异步 `sendResponse` 有效。未知类型返回错误。
- 流式工作（总结、问答、转写）使用命名端口 `BSA_SUMMARY_STREAM`、`BSA_QA_STREAM`、`BSA_TRANSCRIBE_STREAM`，遵循 `START`/`PING`/`PONG`/`DELTA`/`DONE`/`ERROR` 协议。一个端口只有第一个 `START` 会启动任务。端口断开会设置 `disconnected` 标志并调用 `AbortController.abort()`，该取消信号必须传入所有网络请求；断开的端口不再发送任何消息。
- 后台模块 `audio-utils.js` 和 `history-search.js` 通过 `importScripts` 装载，与 Service Worker 共享全局作用域，而非 ES module 导入。

### 总结缓存

- 缓存键使用 `bsa-summary-cache:` 前缀，淘汰机制最多保留 `CACHE_LIMIT`（100）条。
- `content.js` 声明 `SUMMARY_PROTOCOL_VERSION`（当前为 `anchors-v6`）；总结/锚点输出契约变化时必须提升版本号，避免复用过期缓存条目。

### B站音频回退

- 扩展优先使用字幕。视频没有可用字幕时，Service Worker 读取 B站登录态，通过 `x/player/playurl`（`fnval=4048`、`fourk=1`、`qn=80`、Cookie + 视频页 Referer）解析音频流，并发送给配置的转写提供商。
- `playurl` 常把 PCDN 主机排在最前（`mcdn.bilivideo.cn` 自定义端口和第三方边缘域名）。`preferAudioUrls()` 只在允许名单（`bilivideo.com`、`bilivideo.cn`、`hdslb.com`、`akamaized.net`、`bilibili.com`）内排序，默认端口的 `bilivideo.com` 地址最优先；此路径上的 `Failed to fetch` 通常是缺少主机权限或命中 PCDN 地址。
- Service Worker 下载 B 站音频前必须通过 `declarativeNetRequest` 会话规则把 Referer 设为 `https://www.bilibili.com/` 并移除扩展 Origin，同时发送 `Range: bytes=0-`。规则用 `initiatorDomains` 限定为本扩展、用 `requestDomains` 限定为 B 站音频允许名单，避免影响普通页面请求。直接在 `fetch` headers 中设置 Referer/Origin 会受浏览器禁用请求头限制，不能替代该规则。
- OpenAI 兼容模式在扩展内下载音频。切分使用 `transcriptionChunkSeconds`（默认 300）；实际生效切片上限为 540 秒（`background.js` 钳制到 540，offscreen 钳制到 60–540），即使用户填 600——这是与 MCP 实现一致、低于常见 600 秒服务限制的安全余量。文件超过约 20 MiB 时即使时长不足也会强制切片。
- OpenAI 兼容转写上传请求 `response_format=verbose_json` 和 segment 时间戳；普通服务使用 multipart 的 `timestamp_granularities[]=segment`。OpenRouter 端点必须改用 Base64 JSON 的 `input_audio: { data, format }` 与 `timestamp_granularities: ["segment"]`，不能把 multipart 直接发送给它。不支持这些可选字段的服务可能返回错误或无时间戳文本。纯文本结果只能从 `0:00` 建立锚点；合并时间戳时必须应用返回的分段偏移加上每片的 `startSeconds`。
- OpenAI 兼容转写的音频在 offscreen 文档中通过 `CONVERT_AUDIO` 归一化：单声道、16 kHz、64 kbps MP3（lamejs）。MV3 Service Worker 没有 `URL.createObjectURL`，下载的 Blob 以 Base64 发送，由 offscreen 文档还原字节。Offscreen 消息最多重试 5 次；没有生成输出文件即转写失败。
- `openai_compatible` 的服务 URL、API key 和模型必须来自同一套配置。已验证的 MCP 路线是 `https://api.gpt.ge/v1/audio/transcriptions` 加 `whisper-large-v3-turbo`；OpenRouter 路线是 `https://openrouter.ai/api/v1/audio/transcriptions` 加 `openai/whisper-large-v3-turbo`。DashScope 的 key 不能用在这些端点上。
- DashScope `qwen-audio-3.0-asr-flash-filetrans` 是异步 Filetrans 路线（提交 `file_urls`、轮询 `task_id`）；不要把它发到 OpenAI 兼容的 `/audio/transcriptions` 端点。`dashscope_filetrans` 的 Base URL 路径为空、`/api`、`/api/v1` 或 `/compatible-mode` 时，会自动补全为 `/api/v1/services/audio/asr/transcription`。
- Cookie 和转写密钥只保存在 `chrome.storage.local`；不得进入总结缓存条目、日志、发布包、调试记录或同步设置。

### 历史搜索

- 历史筛选仅用于展示：本地标题搜索匹配 `videoTitle`，本地总结搜索匹配概览、章节标题/摘要和亮点引用，多关键词为全部匹配（AND）。AI 历史搜索只把短候选 ID（`r1`、`r2`）、标题（≤500 字符）和概览（≤2500 字符）、最多 100 条候选发送给现有总结提供商；Service Worker 按候选顺序把接受的短 ID 映射回真实缓存键，并兼容带解释文字的 JSON、数字/中文序号引用或返回标题，同时保持候选白名单。
- AI 历史搜索保持在专用非流式 Chat Completions 请求（`callDeepSeekJson`，`stream: false`）上，读取标准 assistant 消息内容；筛选场景的 UI 不需要逐 token 输出。
- UI 请求统一通过 `buildHistoryAiSearchRequest()` 构造，保证两个历史入口发送相同的 `{ type, payload }` 契约。候选字段保留在 `getHistoryAiRecordFields()` 和 `buildHistoryAiRecords()` 中，使设置页、内容脚本弹窗和 Service Worker 使用相同的可见标题/概览数据。旧缓存没有概览时，用其现有章节/亮点摘要文本兜底。
- AI 结果按有界候选列表解析：接受常见结果容器、带 ID 或标题的引用对象、数字/中文序号和包裹的 JSON，但绝不接受不在当前白名单中的 ID；`parseHistoryAiIds` 在没有白名单时直接返回空列表。结构合法但结果字段畸形的 JSON 响应不得回退到扫描任意文本。
- AI 请求失败时，保留当前显示的历史记录并展示错误；错误不得渲染为空搜索结果。
- B站内容面板中的历史按钮打开 `content.js` 弹窗，`options.html#history` 是独立的全页历史视图。任何历史搜索 UI 或行为变更都必须同时更新两个入口；`history-search.js` 必须在 `content.js` 之前加载，面板的本地和 AI 筛选才能工作（见 `manifest.json` 的 content script 顺序）。
- 历史搜索调试通过后台消息 `DEBUG_HISTORY_SEARCH_EVENT`（`recordHistorySearchDebug`）进行；调试记录不得包含 API key 或完整字幕。
