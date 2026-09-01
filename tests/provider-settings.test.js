// Version: 0.24.8
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const syncData = {
  apiKey: "legacy-key",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  providerDataConsent: true
};
const localData = {};
const permissionRequests = [];
const permissionRemovals = [];
const fetchRequests = [];
let fetchImpl = async (...args) => {
  fetchRequests.push(args);
  return createStreamResponse('{"overview":"ok","chapters":[],"highlights":[]}');
};

const chrome = {
  runtime: {
    onMessage: { addListener() {} },
    onConnect: { addListener() {} }
  },
  storage: {
    sync: {
      async get(query) {
        if (query === null) return { ...syncData };
        return { ...query, ...syncData };
      },
      async set(values) {
        Object.assign(syncData, values);
      },
      async remove(key) {
        for (const item of Array.isArray(key) ? key : [key]) delete syncData[item];
      }
    },
    local: {
      async get(key) {
        if (key === null) return { ...localData };
        if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, localData[item]]));
        return { [key]: localData[key] };
      },
      async set(values) {
        Object.assign(localData, values);
      },
      async remove(key) {
        for (const item of Array.isArray(key) ? key : [key]) delete localData[item];
      }
    }
  },
  permissions: {
    async contains({ origins }) {
      return origins.every((origin) => permissionRequests.includes(origin));
    },
    async request({ origins }) {
      permissionRequests.push(...origins);
      return true;
    },
    async remove({ origins }) {
      permissionRemovals.push(origins[0]);
      return true;
    }
  }
};

const sourcePath = path.join(__dirname, "..", "src", "background.js");
const source = `${fs.readFileSync(path.join(__dirname, "..", "src", "audio-utils.js"), "utf8")}\n${fs.readFileSync(path.join(__dirname, "..", "src", "history-search.js"), "utf8")}\n${fs.readFileSync(sourcePath, "utf8")}\n` +
  "globalThis.__test = { getSettings, saveSettings, getProviderOriginPermissionStatus, getOptionalProviderOrigin, requiredProviderOrigins, callDeepSeekStream, searchHistoryWithAi, recordHistorySearchDebug, sanitizeHistorySearchDebugData };";
const context = {
  chrome,
  URL,
  AbortController,
  TextDecoder,
  console,
  importScripts() {},
  fetch: (...args) => fetchImpl(...args)
};
vm.runInNewContext(source, context, { filename: sourcePath });

function createStreamResponse(content) {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({
    choices: [{ delta: { content } }]
  })}\n\ndata: [DONE]\n\n`);
  let read = false;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: bytes };
          }
        };
      }
    }
  };
}

function createJsonResponse(data) {
  return {
    ok: true,
    async json() {
      return data;
    }
  };
}

(async () => {
  const migrated = await context.__test.getSettings();
  assert.equal(migrated.apiKey, "legacy-key");
  assert.equal(migrated.themeMode, "system");
  assert.equal(migrated.autoSummarize, false);
  assert.equal(localData["bsa-provider-api-key"], "legacy-key");
  assert.equal("apiKey" in syncData, false);

  await assert.rejects(
    () => context.__test.saveSettings({
      baseUrl: "https://llm.example.com/v1",
      model: "example-model",
      providerDataConsent: true,
      autoSummarize: true
    }, { skipPermissionRequest: true }),
    /未获得 llm\.example\.com 的访问权限/
  );
  assert.deepStrictEqual(permissionRequests, []);
  assert.equal(syncData.autoSummarize, undefined);

  permissionRequests.push("https://llm.example.com/*", "https://dashscope.aliyuncs.com/*");
  await context.__test.saveSettings({
    baseUrl: "https://llm.example.com/v1",
    model: "example-model",
    providerDataConsent: true,
    autoSummarize: true
  }, { skipPermissionRequest: true });
  assert.deepStrictEqual(permissionRequests, ["https://llm.example.com/*", "https://dashscope.aliyuncs.com/*"]);
  assert.equal(syncData.apiKey, undefined);
  assert.equal(localData["bsa-provider-api-key"], "legacy-key");
  assert.equal(syncData.autoSummarize, true);
  const required = context.__test.requiredProviderOrigins({
      providerDataConsent: true,
      baseUrl: "https://llm.example.com/v1",
      transcriptionProvider: "dashscope_filetrans",
      transcriptionBaseUrl: "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
    });
  assert.equal(JSON.stringify(required), JSON.stringify(["https://llm.example.com/*","https://dashscope.aliyuncs.com/*"]));
  assert.equal(JSON.stringify((await context.__test.getProviderOriginPermissionStatus({
    baseUrl: "https://llm.example.com/v1",
    providerDataConsent: true
  })).missingOrigins), JSON.stringify([]));

  await context.__test.saveSettings({
    baseUrl: "https://api.deepseek.com",
    providerDataConsent: true
  });
  assert.equal(permissionRequests.length, 2);
  assert.equal(JSON.stringify(permissionRemovals), JSON.stringify(["https://llm.example.com/*"]));

  await context.__test.saveSettings({
    baseUrl: "https://disabled.example.com/v1",
    providerDataConsent: false,
    themeMode: "light"
  });
  assert.equal(permissionRequests.length, 2);
  assert.equal(syncData.themeMode, "light");
  assert.equal(context.__test.getOptionalProviderOrigin("http://localhost:11434/v1"), "http://localhost:11434/*");

  await context.__test.callDeepSeekStream({
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key",
    model: "deepseek-v4-flash"
  }, [], 100, () => {}, undefined, { jsonResponse: true });
  const deepSeekBody = JSON.parse(fetchRequests.at(-1)[1].body);
  assert.deepEqual(deepSeekBody.thinking, { type: "disabled" });
  assert.deepEqual(deepSeekBody.response_format, { type: "json_object" });

  await context.__test.callDeepSeekStream({
    baseUrl: "https://llm.example.com/v1",
    apiKey: "test-key",
    model: "example-model"
  }, [], 100, () => {}, undefined, { jsonResponse: true });
  const customBody = JSON.parse(fetchRequests.at(-1)[1].body);
  assert.equal("thinking" in customBody, false);
  assert.equal("response_format" in customBody, false);

  syncData.baseUrl = "https://api.deepseek.com";
  syncData.model = "deepseek-v4-flash";
  syncData.providerDataConsent = true;
  fetchImpl = async (...args) => {
    fetchRequests.push(args);
    return createJsonResponse({
      choices: [{
        message: {
          content: '{"matches":[{"record_id":"r1","reason":"主题相关"},{"record_id":"unknown"}]}'
        }
      }]
    });
  };
  const aiResult = await context.__test.searchHistoryWithAi({
    query: "找讲解性能优化的视频",
    entries: [
      { id: "cache-a", title: "前端性能优化", overview: "介绍缓存和渲染优化" },
      { id: "cache-b", title: "数据库入门", overview: "介绍表和索引" }
    ]
  });
  assert.equal(JSON.stringify(aiResult), JSON.stringify({ ids: ["cache-a"] }));
  const aiRequest = fetchRequests.findLast(([, options]) => String(options?.body || "").includes('"model"'));
  const aiBody = JSON.parse(aiRequest[1].body);
  assert.equal(aiBody.stream, false);
  assert.match(JSON.stringify(aiBody), /前端性能优化/);
  assert.match(JSON.stringify(aiBody), /\\"id\\":\\"r1\\"/);
  assert.doesNotMatch(JSON.stringify(aiBody), /cache-a/);
  assert.doesNotMatch(JSON.stringify(aiBody), /chapters|highlights|字幕/i);

  fetchImpl = async (...args) => {
    fetchRequests.push(args);
    return createJsonResponse({
      choices: [{ message: { content: "我推荐第一条记录" } }]
    });
  };
  assert.equal(
    JSON.stringify(await context.__test.searchHistoryWithAi({ query: "按顺序选择", entries: [{ id: "cache-a", title: "标题", overview: "概览" }] })),
    JSON.stringify({ ids: ["cache-a"] })
  );

  fetchImpl = async (...args) => {
    fetchRequests.push(args);
    return createJsonResponse({
      choices: [{ message: { content: "不是 JSON" } }]
    });
  };
  assert.equal(
    JSON.stringify(await context.__test.searchHistoryWithAi({ query: "非法返回", entries: [{ id: "cache-a", title: "标题", overview: "概览" }] })),
    JSON.stringify({ ids: [] })
  );

  const debugData = context.__test.sanitizeHistorySearchDebugData({
    entryPoint: "options",
    mode: "ai",
    queryLength: 12,
    candidateCount: 2,
    matchedCount: 1,
    errorType: "Error",
    version: "0.24.8",
    apiKey: "must-not-leak"
  });
  assert.equal(
    JSON.stringify(debugData),
    JSON.stringify({
      entryPoint: "options",
      mode: "ai",
      queryLength: 12,
      candidateCount: 2,
      matchedCount: 1,
      errorType: "Error",
      version: "0.24.8"
    })
  );
  localData["bsa-debug-ai-history-enter-search"] = [];
  await context.__test.recordHistorySearchDebug({
    hypothesisId: "H3",
    location: "test",
    msg: "debug-test",
    data: { entryPoint: "options", mode: "ai", candidateCount: 2, apiKey: "must-not-leak" }
  });
  const debugEvents = localData["bsa-debug-ai-history-enter-search"];
  assert.equal(debugEvents.length, 1);
  assert.equal(debugEvents[0].data.apiKey, undefined);

  fetchImpl = async () => { throw new Error("network down"); };
  await assert.rejects(
    () => context.__test.searchHistoryWithAi({ query: "请求失败", entries: [{ id: "cache-a", title: "标题", overview: "概览" }] }),
    /network down/
  );
  syncData.providerDataConsent = false;
  await assert.rejects(
    () => context.__test.searchHistoryWithAi({ query: "缺少配置", entries: [{ id: "cache-a", title: "标题", overview: "概览" }] }),
    /请先在设置中确认/
  );

  const contentSource = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  assert.match(contentSource, /postMessage\(\{ type: "PING" \}\)/);
  assert.match(contentSource, /bsa-modal-history-search/);
  assert.match(contentSource, /buildHistoryAiSearchRequest\(query, modalHistoryEntries\)/);
  assert.doesNotMatch(contentSource, /send\("SEARCH_HISTORY_AI"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")).content_scripts[0].js[0], "src/history-search.js");
  assert.match(contentSource, /setInterval\([\s\S]*?15000\)/);
    assert.match(contentSource, /state\.contextLoading = false;\s+updateSummaryButton\(panel\);/);
    assert.doesNotMatch(contentSource, /class="bsa-run-status"/);
  assert.match(contentSource, /BSA_TRANSCRIBE_STREAM/);
  assert.match(contentSource, /streamTranscription/);
  assert.match(contentSource, /function getTranscriptionFailureStage\(status\)/);
  assert.match(contentSource, /下载 B 站音频/);
  assert.match(contentSource, /切片音频/);
  assert.match(contentSource, /解析转写结果/);
  assert.match(contentSource, /上传并转写音频/);
  assert.match(contentSource, /function renderSummaryProgress\(panel, message\)/);
  assert.match(contentSource, /if \(requiresTranscription\) renderSummaryProgress\(panel, status\)/);
  assert.match(contentSource, /renderSummaryProgress\(panel, "LLM 正在生成\.\.\."\)/);
  assert.match(contentSource, /阶段：\$\{stage\}；/);
  assert.doesNotMatch(contentSource, /总结完成并已缓存/);
  assert.doesNotMatch(contentSource, /发现 .* 条字幕轨道，已准备好总结/);
  assert.doesNotMatch(contentSource, /data-action="save-modal-settings"/);
  assert.match(contentSource, /scheduleModalSettingsSave\(panel/);
  assert.match(contentSource, /await send\("SAVE_SETTINGS", \{ settings \}\);\s+await requestProviderOrigins\(settings\);/);
  assert.match(contentSource, /id="bsa-modal-transcription-api-key"/);
  assert.match(contentSource, /无字幕时的音频转写服务/);
  assert.match(contentSource, /推荐： deepseek-v4-flash、qwen3\.7-flash/);
  assert.match(contentSource, /推荐： openai\/whisper-large-v3-turbo/);
  assert.doesNotMatch(contentSource, /OpenRouter 可填写/);
  assert.match(contentSource, /id="bsa-modal-panel-max-height"/);
  assert.match(contentSource, /id="bsa-modal-summary-font-size"/);
  assert.match(contentSource, /send\("CHECK_PROVIDER_ORIGINS", \{ settings \}\)/);
  assert.doesNotMatch(contentSource, /typeof chrome\.permissions\?\.request/);
  assert.doesNotMatch(contentSource, /window\.innerHeight\s*-\s*120/);
  assert.match(contentSource, /--bsa-panel-max-height", `\$\{Math\.round\(state\.panelMaxHeight\)\}px`/);
  const contentCssSource = fs.readFileSync(path.join(__dirname, "..", "src", "content.css"), "utf8");
  assert.match(contentCssSource, /height:\s*calc\(var\(--bsa-panel-max-height\) - 74px\)/);
  assert.doesNotMatch(contentCssSource, /height:\s*min\(528px,\s*calc\(var\(--bsa-panel-max-height\)/);

  const optionsSource = fs.readFileSync(path.join(__dirname, "..", "src", "options.html"), "utf8");
  assert.match(optionsSource, /阿里云百炼提供的千问模型服务/);
  assert.match(optionsSource, /无字幕时的音频转写服务/);
  assert.match(optionsSource, /推荐： deepseek-v4-flash、qwen3\.7-flash/);
  assert.match(optionsSource, /推荐： openai\/whisper-large-v3-turbo/);
  assert.match(optionsSource, /id="transcriptionBaseUrl"/);
  assert.match(optionsSource, /id="transcriptionChunkSeconds"/);
  assert.match(optionsSource, /id="transcriptionRequestTimeoutSeconds"/);
  assert.match(optionsSource, /id="transcriptionPollTimeoutSeconds"/);
  assert.match(optionsSource, /id="panelMaxHeight"/);
  assert.match(optionsSource, /id="summaryFontSize"/);
  assert.match(optionsSource, /id="exportSettings"/);
  assert.match(optionsSource, /id="importSettings"/);
  assert.match(optionsSource, /id="settingsFile"/);
  const optionsJs = fs.readFileSync(path.join(__dirname, "..", "src", "options.js"), "utf8");
  assert.match(optionsJs, /await requestProviderOrigins\(settings\);/);
  assert.match(optionsJs, /chrome\.permissions\.request\(\{ origins \}\)/);
  assert.doesNotMatch(optionsJs, /permissions\.contains/);
  assert.match(optionsJs, /response\.data\?\.settings \|\| settings/);
  assert.match(optionsJs, /JSON\.stringify\(payload, null, 2\)/);
  assert.match(optionsJs, /配置已载入表单，请检查后点击保存/);
  assert.match(optionsJs, /SETTING_FIELDS/);
  assert.match(optionsJs, /chrome\.runtime\.sendMessage\(\{ type: "GET_SETTINGS" \}\)/);
  assert.match(optionsSource, /id="historySearchMode"/);
  assert.match(optionsSource, /id="historySearchQuery"/);
  assert.match(optionsSource, /id="historySearchSubmit"/);
  assert.match(optionsJs, /buildHistoryAiSearchRequest\(query, historyEntries\)/);
  assert.match(optionsJs, /DEBUG_HISTORY_SEARCH_EVENT/);
  assert.match(optionsJs, /filterHistoryEntries\(historyEntries, mode, query\)/);
  assert.doesNotMatch(optionsJs, /renderHistoryEntries\(\[\]\)/);
  assert.match(contentSource, /DEBUG_HISTORY_SEARCH_EVENT/);
  const manifestSource = fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8");
  assert.match(manifestSource, /"options_page": "src\/options\.html"/);
  assert.match(manifestSource, /"https:\/\/openrouter\.ai\/\*"/);
  assert.doesNotMatch(manifestSource, /"default_popup"/);
  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  assert.match(backgroundSource, /chrome\.runtime\.openOptionsPage\(\)/);
  assert.match(backgroundSource, /case "CHECK_PROVIDER_ORIGINS":/);

  console.log("provider settings tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
