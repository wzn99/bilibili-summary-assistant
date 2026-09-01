// Version: 0.24.8
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const NativeURL = URL;
const ServiceWorkerURL = function ServiceWorkerURL(...args) {
  return new NativeURL(...args);
};
const localData = {};
const syncData = {};
const fetchCalls = [];
const cookieSets = [];
const splitMessages = [];
const dnrUpdates = [];
let splitResponse = {
  ok: true,
  data: {
    duration: 700,
    chunks: [
      { startSeconds: 0, durationSeconds: 300, audioBase64: Buffer.from("mp3-part-1").toString("base64"), name: "part-01.mp3", mimeType: "audio/mpeg" },
      { startSeconds: 300, durationSeconds: 300, audioBase64: Buffer.from("mp3-part-2").toString("base64"), name: "part-02.mp3", mimeType: "audio/mpeg" },
      { startSeconds: 600, durationSeconds: 125, audioBase64: Buffer.from("mp3-part-3").toString("base64"), name: "part-03.mp3", mimeType: "audio/mpeg" }
    ]
  }
};
let fetchImpl;

const chrome = {
  runtime: {
    id: "test-extension-id",
    onMessage: { addListener() {} },
    onConnect: { addListener() {} },
    getURL: (value) => `chrome-extension://test/${value}`,
    async getContexts() { return []; },
    async sendMessage(message) {
      if (message?.type === "CONVERT_AUDIO") {
        splitMessages.push(message);
        return splitResponse;
      }
      return { ok: false, error: "unexpected" };
    }
  },
  offscreen: {
    async createDocument() {},
    async closeDocument() {}
  },
  declarativeNetRequest: {
    async updateSessionRules(update) { dnrUpdates.push(update); }
  },
  cookies: {
    async getAll({ url }) {
      if (url.includes("www.bilibili.com")) return [{ domain: ".bilibili.com", path: "/", name: "SESSDATA", value: "session" }];
      return [];
    },
    async set(details) { cookieSets.push(details); return details; }
  },
  storage: {
    sync: {
      async get(query) {
        if (query === null) return { ...syncData, providerDataConsent: true };
        return query;
      },
      async set(values) { Object.assign(syncData, values); },
      async remove(key) { for (const item of (Array.isArray(key) ? key : [key])) delete syncData[item]; }
    },
    local: {
      async get(key) {
        if (key === null) return { ...localData };
        if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, localData[item]]));
        return { [key]: localData[key] };
      },
      async set(values) { Object.assign(localData, values); },
      async remove(key) { for (const item of (Array.isArray(key) ? key : [key])) delete localData[item]; }
    }
  },
  permissions: { async contains() { return true; }, async request() { return true; }, async remove() { return true; } }
};

const sourcePath = path.join(__dirname, "..", "src", "background.js");
const source = `${fs.readFileSync(path.join(__dirname, "..", "src", "audio-utils.js"), "utf8")}\n${fs.readFileSync(sourcePath, "utf8")}\n` +
  "globalThis.__test = { normalizeCookieList, belongsToBilibiliDomain, parseDashscopeResult, getAudioTranscriptionsEndpoint, getTranscriptionEndpoint, importBilibiliCookies, getBilibiliAudioUrl, collectAudioCandidateUrls, preferAudioUrls, planAudioChunks, needsAudioSplit, wrapNetworkError, transcribeAudio, transcribeOpenAiCompatible, effectiveTranscriptionChunkSeconds, normalizeSettings };";
const context = {
  chrome,
  URL: ServiceWorkerURL,
  FormData,
  Blob,
  atob,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  AbortController,
  setTimeout,
  clearTimeout,
  importScripts() {},
  fetch: (...args) => { fetchCalls.push(args); return fetchImpl(...args); }
};
vm.runInNewContext(source, context, { filename: sourcePath });

(async () => {
  const defaultSettings = context.__test.normalizeSettings({});
  assert.equal(defaultSettings.providerDataConsent, true);
  assert.equal(defaultSettings.panelMaxHeight, 640);
  assert.equal(defaultSettings.summaryFontSize, 13);
  const clampedDisplaySettings = context.__test.normalizeSettings({ panelMaxHeight: 9999, summaryFontSize: 3 });
  assert.equal(clampedDisplaySettings.panelMaxHeight, 1200);
  assert.equal(clampedDisplaySettings.summaryFontSize, 11);

  const cookies = context.__test.normalizeCookieList({ cookies: [
    { domain: ".bilibili.com", name: "SESSDATA", value: "x" },
    { domain: ".example.com", name: "bad", value: "y" }
  ] });
  assert.equal(cookies.length, 2);
  assert.equal(context.__test.belongsToBilibiliDomain(cookies[0].domain), true);
  assert.equal(context.__test.belongsToBilibiliDomain(cookies[1].domain), false);

  const parsed = await context.__test.parseDashscopeResult({
    results: [{ text: "第一句", sentences: [{ begin_time: 0, end_time: 1200, text: "第一句" }] }, { text: "第二句" }]
  });
  assert.equal(parsed.text, "第一句\n第二句");
  assert.equal(parsed.sentences.length, 1);
  fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      assert.equal(url, "https://result.example.com/transcription.json");
      return { transcripts: [{ text: "远程结果" }] };
    }
  });
  const remoteParsed = await context.__test.parseDashscopeResult({
    results: [{ output: { transcription_url: "https://result.example.com/transcription.json" } }]
  });
  assert.equal(remoteParsed.text, "远程结果");
  assert.equal(context.__test.getAudioTranscriptionsEndpoint("https://example.com/v1"), "https://example.com/v1/audio/transcriptions");
  assert.equal(
    context.__test.getTranscriptionEndpoint({ transcriptionProvider: "dashscope_filetrans", transcriptionBaseUrl: "https://dashscope.aliyuncs.com/api/v1" }).pathname,
    "/api/v1/services/audio/asr/transcription"
  );
  assert.equal(
    context.__test.getTranscriptionEndpoint({ transcriptionProvider: "dashscope_filetrans", transcriptionBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }).pathname,
    "/api/v1/services/audio/asr/transcription"
  );

  fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      assert.match(String(url), /x\/player\/playurl/);
      return { code: 0, data: { dash: { audio: [{ bandwidth: 64, baseUrl: "https://audio.example.com/a.m4s" }] } } };
    }
  });
  const audioUrl = await context.__test.getBilibiliAudioUrl({ bvid: "BV1test", cid: 123 });
  assert.equal(audioUrl, "https://audio.example.com/a.m4s");

  const ranked = context.__test.preferAudioUrls([
    "https://xy.mcdn.bilivideo.cn:8082/a.m4s",
    "https://edge.mountaintoys.cn:4483/a.m4s",
    "https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s"
  ]);
  assert.equal(ranked[0], "https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s");
  assert.equal(
    JSON.stringify(context.__test.planAudioChunks(725, 300)),
    JSON.stringify([
      { start: 0, duration: 300 },
      { start: 300, duration: 300 },
      { start: 600, duration: 125 }
    ])
  );
  assert.equal(context.__test.needsAudioSplit(725, 1024, 300), true);
  assert.equal(context.__test.needsAudioSplit(120, 1024, 300), false);
  const fetchError = context.__test.wrapNetworkError(new TypeError("Failed to fetch"), "https://api.gpt.ge/v1/audio/transcriptions", "上传音频到转写服务");
  assert.match(fetchError.message, /无法连接api\.gpt\.ge/);
  assert.doesNotMatch(fetchError.message, /^Failed to fetch$/);

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.equal(manifest.version, "0.24.8");
  assert.equal(manifest.host_permissions.includes("*://*.bilivideo.com/*"), true);
  assert.equal(manifest.host_permissions.includes("*://*.bilivideo.cn/*"), true);
  assert.equal(manifest.permissions.includes("offscreen"), true);

  fetchCalls.length = 0;
  fetchImpl = async (url, options = {}) => {
    if (String(url).includes("x/player/playurl")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { code: 0, data: { dash: { audio: [{ bandwidth: 64, baseUrl: "https://audio.example.com/a.m4s" }] } } };
        }
      };
    }
    if (String(url).includes("bilivideo.com") || String(url).includes("audio.example.com")) {
      return { ok: true, status: 200, async blob() { return new Blob(["audio-bytes"]); } };
    }
    assert.match(String(url), /audio\/transcriptions$/);
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("response_format"), "verbose_json");
    assert.equal(options.body.get("timestamp_granularities[]"), "segment");
    const file = options.body.get("file");
    assert.equal(file.type, "audio/mpeg");
    assert.match(file.name, /\.mp3$/);
    const part = fetchCalls.filter((item) => String(item[0]).includes("transcriptions")).length;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          text: "part-" + part,
          segments: [{ start: 1, end: 2, text: "part " + part }]
        };
      }
    };
  };
  const progressMessages = [];
  const transcribed = await context.__test.transcribeOpenAiCompatible(
    {
      picked: "https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s",
      urls: [
        "https://xy.mcdn.bilivideo.cn:8082/a.m4s",
        "https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s"
      ],
      bvid: "BV1test"
    },
    context.__test.normalizeSettings({
      providerDataConsent: true,
      transcriptionProvider: "openai_compatible",
      transcriptionApiKey: "sk-test",
      transcriptionBaseUrl: "https://api.gpt.ge/v1/audio/transcriptions",
      transcriptionModel: "whisper-large-v3-turbo",
      transcriptionChunkSeconds: 300,
      transcriptionRequestTimeoutSeconds: 120
    }),
    { duration: 725 },
    (message) => progressMessages.push(message)
  );
  assert.equal(transcribed.text, "part-1\npart-2\npart-3");
  assert.equal(
    JSON.stringify(transcribed.sentences.map((item) => [item.start, item.end])),
    JSON.stringify([[1, 2], [301, 302], [601, 602]])
  );
  assert.equal(fetchCalls.filter((item) => String(item[0]).includes("transcriptions")).length, 3);
  assert.equal(splitMessages.length, 1);
  assert.equal(typeof splitMessages[0].payload.audioBase64, "string");
  assert.equal(splitMessages[0].payload.audioBase64.length > 0, true);
  assert.equal("audioUrl" in splitMessages[0].payload, false);
  assert.equal(progressMessages.some((message) => /下载 B 站音频/.test(message)), true);
  assert.equal(progressMessages.some((message) => /转换为 MCP 兼容/.test(message)), true);
  assert.equal(progressMessages.some((message) => /上传并转写第 1\/3 段/.test(message)), true);
  assert.equal(progressMessages.some((message) => /解析第 1\/3 段转写结果/.test(message)), true);
  assert.equal(dnrUpdates.length > 0, true);
  const audioHeaderRule = dnrUpdates[0].addRules[0];
  assert.equal(audioHeaderRule.condition.initiatorDomains[0], "test-extension-id");
  assert.equal(audioHeaderRule.condition.requestDomains.includes("bilivideo.com"), true);
  assert.equal(audioHeaderRule.action.requestHeaders.some((item) => item.header === "Referer" && item.operation === "set"), true);
  assert.equal(audioHeaderRule.action.requestHeaders.some((item) => item.header === "Origin" && item.operation === "remove"), true);
  const audioDownloadCall = fetchCalls.find((item) => String(item[0]).includes("bilivideo.com"));
  assert.equal(audioDownloadCall[1].headers.Range, "bytes=0-");

  fetchCalls.length = 0;
  splitMessages.length = 0;
  splitResponse = {
    ok: true,
    data: {
      duration: 120,
      chunks: [{
        startSeconds: 30,
        durationSeconds: 120,
        audioBase64: Buffer.from("openrouter-mp3").toString("base64"),
        name: "part-01.mp3",
        mimeType: "audio/mpeg"
      }]
    }
  };
  fetchImpl = async (url, options = {}) => {
    if (String(url).includes("bilivideo.com")) {
      return { ok: true, status: 200, async blob() { return new Blob(["audio-bytes"]); } };
    }
    assert.equal(String(url), "https://openrouter.ai/api/v1/audio/transcriptions");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "openai/whisper-large-v3-turbo");
    assert.equal(body.input_audio.format, "mp3");
    assert.equal(Buffer.from(body.input_audio.data, "base64").toString(), "openrouter-mp3");
    assert.equal(body.response_format, "verbose_json");
    assert.equal(JSON.stringify(body.timestamp_granularities), JSON.stringify(["segment"]));
    assert.equal("file" in body, false);
    return {
      ok: true,
      status: 200,
      async json() {
        return { text: "openrouter-part", segments: [{ start: 1, end: 2, text: "openrouter part" }] };
      }
    };
  };
  const openRouterTranscribed = await context.__test.transcribeOpenAiCompatible(
    {
      picked: "https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s",
      urls: ["https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s"],
      bvid: "BV1test"
    },
    context.__test.normalizeSettings({
      providerDataConsent: true,
      transcriptionProvider: "openai_compatible",
      transcriptionApiKey: "sk-or-test",
      transcriptionBaseUrl: "https://openrouter.ai/api/v1/audio/transcriptions",
      transcriptionModel: "openai/whisper-large-v3-turbo",
      transcriptionChunkSeconds: 300,
      transcriptionRequestTimeoutSeconds: 120
    }),
    { duration: 120 },
    () => {}
  );
  assert.equal(openRouterTranscribed.text, "openrouter-part");
  assert.equal(JSON.stringify(openRouterTranscribed.sentences.map((item) => [item.start, item.end])), JSON.stringify([[31, 32]]));
  assert.equal(fetchCalls.filter((item) => String(item[0]).includes("openrouter.ai")).length, 1);

  fetchCalls.length = 0;
  splitMessages.length = 0;
  localData["bsa-transcription-api-key"] = "sk-test";
  const compatibleSettings = {
    transcriptionProvider: "openai_compatible",
    transcriptionBaseUrl: "https://api.gpt.ge/v1/audio/transcriptions",
    transcriptionModel: "whisper-large-v3-turbo",
    transcriptionChunkSeconds: 600,
    transcriptionRequestTimeoutSeconds: 120,
    providerDataConsent: true
  };
  await chrome.storage.sync.set(compatibleSettings);
  splitResponse = {
    ok: true,
    data: {
      duration: 725,
      chunks: [
        { startSeconds: 0, durationSeconds: 540, audioBase64: Buffer.from("mp3-part-1").toString("base64"), name: "part-01.mp3", mimeType: "audio/mpeg" },
        { startSeconds: 540, durationSeconds: 185, audioBase64: Buffer.from("mp3-part-2").toString("base64"), name: "part-02.mp3", mimeType: "audio/mpeg" }
      ]
    }
  };
  fetchImpl = async (url, options = {}) => {
    if (String(url).includes("x/player/playurl")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { code: 0, data: { dash: { audio: [{ bandwidth: 64, baseUrl: "https://audio.example.com/a.m4s" }] } } };
        }
      };
    }
    if (String(url).includes("bilivideo.com") || String(url).includes("audio.example.com")) {
      return { ok: true, status: 200, async blob() { return new Blob(["audio-bytes"]); } };
    }
    if (String(url).includes("audio/transcriptions")) {
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("model"), "whisper-large-v3-turbo");
      return { ok: true, status: 200, async json() { return { text: `compatible-part-${fetchCalls.filter((item) => String(item[0]).includes("audio/transcriptions")).length}` }; } };
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const compatibleTranscribed = await context.__test.transcribeAudio({
    bvid: "BV1test",
    cid: 123,
    duration: 725
  }, () => {}, undefined);
  assert.equal(compatibleTranscribed.text, "compatible-part-1\ncompatible-part-2");
  assert.equal(fetchCalls.filter((item) => String(item[0]).includes("audio/transcriptions")).length, 2);
  assert.equal(splitMessages.length, 1);
  assert.equal(splitMessages[0].payload.chunkSeconds, 540);
  assert.equal(context.__test.effectiveTranscriptionChunkSeconds(compatibleSettings), 540);

  const failureSettings = context.__test.normalizeSettings({
    providerDataConsent: true,
    transcriptionProvider: "openai_compatible",
    transcriptionApiKey: "sk-test",
    transcriptionBaseUrl: "https://api.gpt.ge/v1/audio/transcriptions",
    transcriptionModel: "whisper-large-v3-turbo",
    transcriptionChunkSeconds: 300,
    transcriptionRequestTimeoutSeconds: 120
  });
  const failureResolved = {
    picked: "https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s",
    urls: ["https://upos-sz-mirrorhwo1.bilivideo.com/a.m4s"],
    bvid: "BV1test"
  };

  fetchImpl = async () => ({ ok: false, status: 403, async blob() { return new Blob(); } });
  await assert.rejects(
    () => context.__test.transcribeOpenAiCompatible(failureResolved, failureSettings, { duration: 120 }, () => {}),
    /读取 B 站音频失败.*HTTP 403/
  );

  splitResponse = { ok: false, error: "音频解码失败" };
  fetchImpl = async (url) => {
    if (String(url).includes("bilivideo.com")) {
      return { ok: true, status: 200, async blob() { return new Blob(["audio-bytes"]); } };
    }
    throw new Error("unexpected URL: " + url);
  };
  await assert.rejects(
    () => context.__test.transcribeOpenAiCompatible(failureResolved, failureSettings, { duration: 725 }, () => {}),
    /音频解码失败/
  );
  splitResponse = {
    ok: true,
    data: {
      duration: 700,
      chunks: [{
        startSeconds: 0,
        durationSeconds: 120,
        audioBase64: Buffer.from("mp3-part-1").toString("base64"),
        name: "part-01.mp3",
        mimeType: "audio/mpeg"
      }]
    }
  };

  fetchImpl = async (url) => {
    if (String(url).includes("bilivideo.com")) {
      return { ok: true, status: 200, async blob() { return new Blob(["audio-bytes"]); } };
    }
    return {
      ok: false,
      status: 401,
      async json() { return { error: { message: "Unauthorized" } }; }
    };
  };
  await assert.rejects(
    () => context.__test.transcribeOpenAiCompatible(failureResolved, failureSettings, { duration: 725 }, () => {}),
    /Unauthorized/
  );

  fetchImpl = async (url) => {
    if (String(url).includes("bilivideo.com")) {
      return { ok: true, status: 200, async blob() { return new Blob(["audio-bytes"]); } };
    }
    return { ok: true, status: 200, async json() { return { text: "   " }; } };
  };
  await assert.rejects(
    () => context.__test.transcribeOpenAiCompatible(failureResolved, failureSettings, { duration: 120 }, () => {}),
    /转写接口返回了空文本/
  );
  const failureMessages = fetchCalls.map((item) => String(item[0])).join("\n");
  assert.doesNotMatch(failureMessages, /sk-test|SESSDATA|session|Cookie/i);

  await context.__test.importBilibiliCookies({ cookies: [{ domain: ".bilibili.com", path: "/", name: "SESSDATA", value: "imported" }] });
  assert.equal(cookieSets.length, 1);
  assert.equal(localData["bsa-imported-bilibili-cookies"].length, 1);
  console.log("transcription tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
