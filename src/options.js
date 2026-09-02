// Version: 0.24.8
const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  transcriptionProvider: "openai_compatible",
  transcriptionApiKey: "",
  transcriptionBaseUrl: "https://openrouter.ai/api/v1/audio/transcriptions",
  transcriptionModel: "openai/whisper-large-v3-turbo",
  transcriptionChunkSeconds: 300,
  transcriptionRequestTimeoutSeconds: 180,
  transcriptionPollTimeoutSeconds: 3600,
  maxTranscriptChars: 120000,
  panelMaxHeight: 640,
  summaryFontSize: 13,
  hideDanmakuList: true,
  sidebarOrder: "summary-first",
  themeMode: "system",
  compactTimeline: false,
  selectionAskEnabled: true,
  providerDataConsent: true,
  autoSummarize: false
};

const CACHE_PREFIX = "bsa-summary-cache:";
const selectedHistoryKeys = new Set();
let historyEntries = [];
let historySearchToken = 0;

const els = {
  apiKey: document.querySelector("#apiKey"),
  baseUrl: document.querySelector("#baseUrl"),
  model: document.querySelector("#model"),
  transcriptionProvider: document.querySelector("#transcriptionProvider"),
  transcriptionApiKey: document.querySelector("#transcriptionApiKey"),
  transcriptionBaseUrl: document.querySelector("#transcriptionBaseUrl"),
  transcriptionModel: document.querySelector("#transcriptionModel"),
  transcriptionBaseUrlField: document.querySelector("#transcriptionBaseUrlField"),
  transcriptionChunkSeconds: document.querySelector("#transcriptionChunkSeconds"),
  transcriptionChunkSecondsField: document.querySelector("#transcriptionChunkSecondsField"),
  transcriptionRequestTimeoutSeconds: document.querySelector("#transcriptionRequestTimeoutSeconds"),
  transcriptionPollTimeoutSeconds: document.querySelector("#transcriptionPollTimeoutSeconds"),
  transcriptionPollTimeoutSecondsField: document.querySelector("#transcriptionPollTimeoutSecondsField"),
  cookieStatus: document.querySelector("#cookieStatus"),
  refreshCookies: document.querySelector("#refreshCookies"),
  exportCookies: document.querySelector("#exportCookies"),
  importCookies: document.querySelector("#importCookies"),
  clearCookies: document.querySelector("#clearCookies"),
  cookieFile: document.querySelector("#cookieFile"),
  exportSettings: document.querySelector("#exportSettings"),
  importSettings: document.querySelector("#importSettings"),
  settingsFile: document.querySelector("#settingsFile"),
  settingsFileStatus: document.querySelector("#settingsFileStatus"),
  providerDataConsent: document.querySelector("#providerDataConsent"),
  autoSummarize: document.querySelector("#autoSummarize"),
  maxTranscriptChars: document.querySelector("#maxTranscriptChars"),
  panelMaxHeight: document.querySelector("#panelMaxHeight"),
  summaryFontSize: document.querySelector("#summaryFontSize"),
  hideDanmakuList: document.querySelector("#hideDanmakuList"),
  sidebarOrder: document.querySelector("#sidebarOrder"),
  themeMode: document.querySelector("#themeMode"),
  compactTimeline: document.querySelector("#compactTimeline"),
  selectionAskEnabled: document.querySelector("#selectionAskEnabled"),
  save: document.querySelector("#save"),
  status: document.querySelector("#status"),
  historyMeta: document.querySelector("#historyMeta"),
  historyList: document.querySelector("#historyList"),
  refreshHistory: document.querySelector("#refreshHistory"),
  settingsPage: document.querySelector("#settingsPage"),
  historyPage: document.querySelector("#historyPage"),
  historyToolbar: document.querySelector("#historyToolbar"),
  selectAllHistory: document.querySelector("#selectAllHistory"),
  selectedMeta: document.querySelector("#selectedMeta"),
  deleteSelected: document.querySelector("#deleteSelected"),
  historySearch: document.querySelector("#historySearch"),
  historySearchMode: document.querySelector("#historySearchMode"),
  historySearchQuery: document.querySelector("#historySearchQuery"),
  historySearchSubmit: document.querySelector("#historySearchSubmit"),
  historySearchClear: document.querySelector("#historySearchClear"),
  historySearchStatus: document.querySelector("#historySearchStatus")
};

init();

async function init() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (!response?.ok) throw new Error(response?.error || "设置读取失败");
  const settings = { ...DEFAULT_SETTINGS, ...response.data };
  applyThemeMode(settings.themeMode);
  const page = location.hash === "#history" ? "history" : "settings";
  document.body.dataset.page = page;
  document.title = page === "history" ? "总结历史 - B站视频总结助手" : "设置 - B站视频总结助手";
  els.settingsPage.hidden = page !== "settings";
  els.historyPage.hidden = page !== "history";

  if (page === "settings") {
    applySettingsToForm(settings);
    els.transcriptionProvider.addEventListener("change", () => updateTranscriptionVisibility(true));
    els.refreshCookies.addEventListener("click", refreshCookieStatus);
    els.exportCookies.addEventListener("click", exportCookies);
    els.importCookies.addEventListener("click", () => els.cookieFile.click());
    els.cookieFile.addEventListener("change", importCookies);
    els.clearCookies.addEventListener("click", clearImportedCookies);
    els.exportSettings.addEventListener("click", exportSettings);
    els.importSettings.addEventListener("click", () => els.settingsFile.click());
    els.settingsFile.addEventListener("change", importSettings);
    await refreshCookieStatus();
    els.save.addEventListener("click", save);
    return;
  }

  els.refreshHistory.addEventListener("click", loadHistory);
  els.selectAllHistory.addEventListener("change", toggleSelectAll);
  els.deleteSelected.addEventListener("click", deleteSelectedHistory);
  els.historyList.addEventListener("change", handleHistorySelection);
  els.historyList.addEventListener("click", handleHistoryAction);
  els.historySearch.addEventListener("submit", handleHistorySearch);
  els.historySearchClear.addEventListener("click", clearHistorySearch);
  els.historySearchMode.addEventListener("change", updateHistorySearchMode);
  updateHistorySearchMode();
  await loadHistory();
}

async function save() {
  const settings = {
    apiKey: normalizeApiKey(els.apiKey.value),
    baseUrl: normalizeBaseUrl(els.baseUrl.value),
    model: els.model.value.trim() || DEFAULT_SETTINGS.model,
    transcriptionProvider: els.transcriptionProvider.value,
    transcriptionApiKey: normalizeApiKey(els.transcriptionApiKey.value),
    transcriptionBaseUrl: normalizeOptionalBaseUrl(els.transcriptionBaseUrl.value),
    transcriptionModel: els.transcriptionModel.value.trim() || DEFAULT_SETTINGS.transcriptionModel,
    transcriptionChunkSeconds: Number(els.transcriptionChunkSeconds.value || DEFAULT_SETTINGS.transcriptionChunkSeconds),
    transcriptionRequestTimeoutSeconds: Number(els.transcriptionRequestTimeoutSeconds.value || DEFAULT_SETTINGS.transcriptionRequestTimeoutSeconds),
    transcriptionPollTimeoutSeconds: Number(els.transcriptionPollTimeoutSeconds.value || DEFAULT_SETTINGS.transcriptionPollTimeoutSeconds),
    providerDataConsent: els.providerDataConsent.checked,
    autoSummarize: els.autoSummarize.checked,
    maxTranscriptChars: Math.max(
      Number(els.maxTranscriptChars.value || DEFAULT_SETTINGS.maxTranscriptChars),
      DEFAULT_SETTINGS.maxTranscriptChars
    ),
    panelMaxHeight: Number(els.panelMaxHeight.value || DEFAULT_SETTINGS.panelMaxHeight),
    summaryFontSize: Number(els.summaryFontSize.value || DEFAULT_SETTINGS.summaryFontSize),
    hideDanmakuList: els.hideDanmakuList.checked,
    sidebarOrder: els.sidebarOrder.value === "author-first" ? "author-first" : "summary-first",
    themeMode: new Set(["light", "dark"]).has(els.themeMode.value) ? els.themeMode.value : "system",
    compactTimeline: els.compactTimeline.checked,
    selectionAskEnabled: els.selectionAskEnabled.checked
  };

  els.save.disabled = true;
  els.status.textContent = "正在保存并检查域名权限...";
  try {
    await requestProviderOrigins(settings);
    const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
    if (!response?.ok) throw new Error(response?.error || "设置保存失败");
    const savedSettings = response.data?.settings || settings;
    applySettingsToForm(savedSettings);
    applyThemeMode(savedSettings.themeMode);
    els.status.textContent = "已保存";
  } catch (error) {
    els.status.textContent = error?.message || String(error);
  } finally {
    els.save.disabled = false;
  }
  setTimeout(() => {
    els.status.textContent = "";
  }, 3200);
}

const SETTING_FIELDS = [
  "apiKey", "baseUrl", "model", "transcriptionProvider", "transcriptionApiKey",
  "transcriptionBaseUrl", "transcriptionModel", "transcriptionChunkSeconds",
  "transcriptionRequestTimeoutSeconds", "transcriptionPollTimeoutSeconds",
  "providerDataConsent", "autoSummarize", "maxTranscriptChars", "panelMaxHeight", "summaryFontSize", "hideDanmakuList",
  "sidebarOrder", "themeMode", "compactTimeline", "selectionAskEnabled"
];

function applySettingsToForm(settings) {
  els.apiKey.value = normalizeApiKey(settings.apiKey);
  els.baseUrl.value = normalizeBaseUrl(settings.baseUrl);
  els.model.value = String(settings.model || DEFAULT_SETTINGS.model);
  els.transcriptionProvider.value = settings.transcriptionProvider || DEFAULT_SETTINGS.transcriptionProvider;
  els.transcriptionApiKey.value = normalizeApiKey(settings.transcriptionApiKey);
  els.transcriptionBaseUrl.value = normalizeOptionalBaseUrl(settings.transcriptionBaseUrl || DEFAULT_SETTINGS.transcriptionBaseUrl);
  els.transcriptionModel.value = String(settings.transcriptionModel || DEFAULT_SETTINGS.transcriptionModel);
  els.transcriptionChunkSeconds.value = Number(settings.transcriptionChunkSeconds || DEFAULT_SETTINGS.transcriptionChunkSeconds);
  els.transcriptionRequestTimeoutSeconds.value = Number(settings.transcriptionRequestTimeoutSeconds || DEFAULT_SETTINGS.transcriptionRequestTimeoutSeconds);
  els.transcriptionPollTimeoutSeconds.value = Number(settings.transcriptionPollTimeoutSeconds || DEFAULT_SETTINGS.transcriptionPollTimeoutSeconds);
  els.providerDataConsent.checked = settings.providerDataConsent === true;
  els.autoSummarize.checked = settings.autoSummarize === true;
  els.maxTranscriptChars.value = Math.max(Number(settings.maxTranscriptChars || DEFAULT_SETTINGS.maxTranscriptChars), DEFAULT_SETTINGS.maxTranscriptChars);
  els.panelMaxHeight.value = Math.min(1200, Math.max(420, Number(settings.panelMaxHeight || DEFAULT_SETTINGS.panelMaxHeight)));
  els.summaryFontSize.value = Math.min(18, Math.max(11, Number(settings.summaryFontSize || DEFAULT_SETTINGS.summaryFontSize)));
  els.hideDanmakuList.checked = settings.hideDanmakuList !== false;
  els.sidebarOrder.value = settings.sidebarOrder === "author-first" ? "author-first" : "summary-first";
  els.themeMode.value = new Set(["light", "dark"]).has(settings.themeMode) ? settings.themeMode : "system";
  els.compactTimeline.checked = settings.compactTimeline === true;
  els.selectionAskEnabled.checked = settings.selectionAskEnabled !== false;
  updateTranscriptionVisibility();
}

function pickSettingFields(value) {
  return Object.fromEntries(SETTING_FIELDS
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => [key, value[key]]));
}

async function exportSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) throw new Error(response?.error || "配置读取失败");
    const payload = { format: "bsa-settings", version: 1, settings: pickSettingFields(response.data || {}) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: "bsa-settings.json", saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    els.settingsFileStatus.textContent = "配置已导出（包含 API Key，请妥善保管）";
  } catch (error) {
    els.settingsFileStatus.textContent = error?.message || String(error);
  }
}

async function importSettings() {
  const file = els.settingsFile.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const source = parsed && !Array.isArray(parsed) && parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : parsed;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("配置文件必须是 JSON 对象");
    const imported = pickSettingFields(source);
    if (!Object.keys(imported).length) throw new Error("配置文件中没有可识别的设置");
    const currentResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!currentResponse?.ok) throw new Error(currentResponse?.error || "当前配置读取失败");
    applySettingsToForm({ ...currentResponse.data, ...imported });
    els.settingsFileStatus.textContent = "配置已载入表单，请检查后点击保存";
  } catch (error) {
    els.settingsFileStatus.textContent = error?.message || String(error);
  } finally {
    els.settingsFile.value = "";
  }
}

function updateTranscriptionVisibility(applyPreset = false) {
  if (applyPreset) {
    const patch = getTranscriptionPresetPatch(
      els.transcriptionProvider.value, els.transcriptionBaseUrl.value, els.transcriptionModel.value
    );
    if (patch.transcriptionBaseUrl) els.transcriptionBaseUrl.value = patch.transcriptionBaseUrl;
    if (patch.transcriptionModel) els.transcriptionModel.value = patch.transcriptionModel;
  }
  els.transcriptionBaseUrlField.hidden = false;
  els.transcriptionBaseUrl.placeholder = els.transcriptionProvider.value === "dashscope_filetrans"
    ? "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
    : "https://api.example.com/v1/audio/transcriptions";
  const isDashscope = els.transcriptionProvider.value === "dashscope_filetrans";
  els.transcriptionChunkSecondsField.hidden = isDashscope;
  els.transcriptionPollTimeoutSecondsField.hidden = !isDashscope;
}

async function refreshCookieStatus() {
  els.cookieStatus.textContent = "正在读取 B 站登录状态...";
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_COOKIE_STATUS" });
    if (!response?.ok) throw new Error(response?.error || "Cookie 状态读取失败");
    els.cookieStatus.textContent = response.data.hasSessdata
      ? `已读取 ${response.data.count} 条 Cookie，检测到登录状态`
      : `已读取 ${response.data.count} 条 Cookie，但未发现 SESSDATA`;
  } catch (error) {
    els.cookieStatus.textContent = error?.message || String(error);
  }
}

async function exportCookies() {
  const response = await chrome.runtime.sendMessage({ type: "EXPORT_COOKIES" });
  if (!response?.ok) throw new Error(response?.error || "Cookie 导出失败");
  const blob = new Blob([JSON.stringify(response.data.payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: response.data.filename, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function importCookies() {
  const file = els.cookieFile.files?.[0];
  if (!file) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "IMPORT_COOKIES", payload: await file.text() });
    if (!response?.ok) throw new Error(response?.error || "Cookie 导入失败");
    els.cookieStatus.textContent = `已导入 ${response.data.count} 条 Cookie`;
  } catch (error) {
    els.cookieStatus.textContent = error?.message || String(error);
  } finally {
    els.cookieFile.value = "";
  }
}

async function clearImportedCookies() {
  const response = await chrome.runtime.sendMessage({ type: "CLEAR_COOKIES" });
  if (!response?.ok) throw new Error(response?.error || "Cookie 清除失败");
  await refreshCookieStatus();
}

function applyThemeMode(value) {
  document.documentElement.dataset.theme = new Set(["light", "dark"]).has(value) ? value : "system";
}

function normalizeApiKey(value) {
  return String(value || "")
    .replace(/^Bearer\s+/i, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.baseUrl;
}

function normalizeOptionalBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function originFromUrl(value) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && new Set(["localhost", "127.0.0.1"]).has(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("服务 URL 必须使用 HTTPS");
  return `${url.origin}/*`;
}

function requiredProviderOrigins(settings) {
  if (!settings.providerDataConsent) return [];
  const origins = [];
  const summaryOrigin = originFromUrl(settings.baseUrl || DEFAULT_SETTINGS.baseUrl);
  if (summaryOrigin !== "https://api.deepseek.com/*") origins.push(summaryOrigin);
  const transcriptionUrl = settings.transcriptionBaseUrl
    || (settings.transcriptionProvider === "dashscope_filetrans"
      ? DEFAULT_SETTINGS.transcriptionBaseUrl
      : "");
  if (transcriptionUrl) origins.push(originFromUrl(transcriptionUrl));
  return [...new Set(origins)];
}

async function requestProviderOrigins(settings) {
  if (typeof chrome.permissions?.request !== "function") {
    throw new Error("请在扩展设置页保存，浏览器才能申请服务域名权限");
  }
  const origins = requiredProviderOrigins(settings);
  if (!origins.length) return;
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins });
  } catch (error) {
    throw new Error(`无法申请服务域名权限：${error?.message || String(error)}`);
  }
  if (!granted) {
    const hosts = origins.map((origin) => new URL(origin.replace("/*", "")).host).join("、");
    throw new Error(`未获得 ${hosts} 的访问权限，设置未保存`);
  }
}

async function loadHistory() {
  const stored = await chrome.storage.local.get(null);
  const rawEntries = Object.entries(stored)
    .filter(([key]) => key.startsWith(CACHE_PREFIX))
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((a, b) => Number(b.lastAccessedAt || 0) - Number(a.lastAccessedAt || 0));
  const entries = [];
  const seenVideos = new Set();
  const staleKeys = [];
  for (const entry of rawEntries) {
    const identity = entry.bvid && entry.cid ? `${String(entry.bvid).toUpperCase()}|${entry.cid}` : entry.key;
    if (seenVideos.has(identity)) staleKeys.push(entry.key);
    else {
      seenVideos.add(identity);
      entries.push(entry);
    }
  }
  if (staleKeys.length) await chrome.storage.local.remove(staleKeys);

  historyEntries = entries;
  historySearchToken += 1;
  els.historySearchMode.value = "title";
  els.historySearchQuery.value = "";
  els.historySearchStatus.textContent = "";
  updateHistorySearchMode();
  renderHistoryEntries(entries);
}

function renderHistoryEntries(entries) {
  els.historyList.innerHTML = "";
  selectedHistoryKeys.clear();
  els.historyToolbar.hidden = !entries.length;
  updateSelectionState(entries.length);

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = historyEntries.length
      ? "没有符合条件的历史记录。"
      : "在 B 站视频页生成总结后，记录会出现在这里。";
    els.historyList.appendChild(empty);
    els.historyMeta.textContent = historyEntries.length
      ? `共 ${historyEntries.length} 条，当前显示 0 条`
      : "还没有缓存的总结";
    return;
  }

  els.historyMeta.textContent = entries.length === historyEntries.length
    ? `共 ${historyEntries.length} 条，按最近查看排序`
    : `共 ${historyEntries.length} 条，当前显示 ${entries.length} 条`;
  for (const entry of entries) {
    els.historyList.appendChild(createHistoryItem(entry));
  }
}

function updateHistorySearchMode() {
  const isAi = els.historySearchMode.value === "ai";
  els.historySearchQuery.placeholder = isAi
    ? "输入自然语言，例如：讲解性能优化的视频"
    : "输入关键词，多个词用空格或逗号分隔";
}

function setHistorySearchBusy(busy) {
  els.historySearchMode.disabled = busy;
  els.historySearchQuery.disabled = busy;
  els.historySearchSubmit.disabled = busy;
  els.historySearchClear.disabled = busy;
}

async function handleHistorySearch(event) {
  event.preventDefault();
  const mode = els.historySearchMode.value;
  const query = els.historySearchQuery.value.trim();
  const token = ++historySearchToken;
  // #region debug-point H1-H4:history-search-options-submit
  reportHistorySearchDebug({
    hypothesisId: mode === "ai" ? "H3" : "H2",
    location: "options.js:handleHistorySearch",
    msg: "ui-submit",
    data: {
      entryPoint: "options",
      mode,
      queryLength: query.length,
      candidateCount: historyEntries.length,
      version: "0.24.8"
    }
  });
  // #endregion

  if (!query) {
    els.historySearchStatus.textContent = "";
    renderHistoryEntries(historyEntries);
    return;
  }

  if (mode !== "ai") {
    // #region debug-point H2:history-search-options-local-branch
    reportHistorySearchDebug({
      hypothesisId: "H2",
      location: "options.js:handleHistorySearch",
      msg: "ui-local-branch",
      data: { entryPoint: "options", mode, queryLength: query.length, candidateCount: historyEntries.length, version: "0.24.8" }
    });
    // #endregion
    const filtered = filterHistoryEntries(historyEntries, mode, query);
    renderHistoryEntries(filtered);
    els.historySearchStatus.textContent = filtered.length
      ? `已找到 ${filtered.length} 条记录`
      : "没有符合条件的历史记录";
    return;
  }

  setHistorySearchBusy(true);
  els.historySearchStatus.textContent = "正在使用 AI 查询...";
  try {
    // #region debug-point H3-H4:history-search-options-ai-branch
    reportHistorySearchDebug({
      hypothesisId: historyEntries.length ? "H3" : "H4",
      location: "options.js:handleHistorySearch",
      msg: "ui-ai-branch",
      data: { entryPoint: "options", mode, queryLength: query.length, candidateCount: historyEntries.length, version: "0.24.8" }
    });
    // #endregion
    const response = await chrome.runtime.sendMessage(
      buildHistoryAiSearchRequest(query, historyEntries)
    );
    if (token !== historySearchToken) return;
    if (!response?.ok) throw new Error(response?.error || "AI 查询失败");
    const ids = new Set(Array.isArray(response.data?.ids) ? response.data.ids.map(String) : []);
    const filtered = historyEntries.filter((entry) => ids.has(String(entry.key)));
    reportHistorySearchDebug({
      hypothesisId: "H3",
      location: "options.js:handleHistorySearch",
      msg: "ui-result",
      data: { entryPoint: "options", mode, queryLength: query.length, candidateCount: historyEntries.length, matchedCount: filtered.length, version: "0.24.8" }
    });
    renderHistoryEntries(filtered);
    els.historySearchStatus.textContent = filtered.length
      ? `AI 查询找到 ${filtered.length} 条记录`
      : "AI 查询没有找到符合条件的记录";
  } catch (error) {
    if (token !== historySearchToken) return;
    reportHistorySearchDebug({
      hypothesisId: "H3",
      location: "options.js:handleHistorySearch",
      msg: "ui-error",
      data: { entryPoint: "options", mode, queryLength: query.length, candidateCount: historyEntries.length, errorType: error?.name || "Error", version: "0.24.8" }
    });
    renderHistoryEntries(historyEntries);
    els.historySearchStatus.textContent = `查询失败：${error?.message || String(error)}`;
  } finally {
    if (token === historySearchToken) setHistorySearchBusy(false);
  }
}

function reportHistorySearchDebug(payload) {
  chrome.runtime.sendMessage({ type: "DEBUG_HISTORY_SEARCH_EVENT", payload }).catch(() => {});
}

function clearHistorySearch() {
  historySearchToken += 1;
  setHistorySearchBusy(false);
  els.historySearchMode.value = "title";
  els.historySearchQuery.value = "";
  els.historySearchStatus.textContent = "";
  updateHistorySearchMode();
  renderHistoryEntries(historyEntries);
}

function createHistoryItem(entry) {
  const item = document.createElement("article");
  item.className = "history-item";
  item.dataset.cacheKey = entry.key;

  const selection = document.createElement("label");
  selection.className = "history-select";
  selection.title = "选择此记录";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "history-checkbox";
  checkbox.value = entry.key;
  selection.appendChild(checkbox);

  const content = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "history-title";
  title.textContent = entry.videoTitle || entry.bvid || "未命名视频";

  const overview = document.createElement("p");
  overview.className = "history-overview";
  overview.textContent = entry.summaryData?.overview || "这条旧缓存没有简要总结。";

  const info = document.createElement("div");
  info.className = "history-info";
  const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString("zh-CN") : "时间未知";
  const questionCount = Array.isArray(entry.qaHistory)
    ? entry.qaHistory.filter((message) => message?.role === "user").length
    : 0;
  info.textContent = `${date} · ${entry.model || "未知模型"}${questionCount ? ` · ${questionCount} 轮问答` : ""}`;
  content.append(title, overview, info);

  const actions = document.createElement("div");
  actions.className = "history-actions";
  const link = document.createElement("a");
  link.className = "history-open";
  link.href = getVideoUrl(entry);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "打开视频";
  const remove = document.createElement("button");
  remove.className = "history-delete";
  remove.type = "button";
  remove.dataset.action = "delete-history";
  remove.dataset.cacheKey = entry.key;
  remove.textContent = "删除";
  actions.append(link, remove);

  item.append(selection, content, actions);
  return item;
}

function handleHistorySelection(event) {
  const checkbox = event.target.closest(".history-checkbox");
  if (!checkbox) return;
  if (checkbox.checked) selectedHistoryKeys.add(checkbox.value);
  else selectedHistoryKeys.delete(checkbox.value);
  updateSelectionState(document.querySelectorAll(".history-checkbox").length);
}

function toggleSelectAll() {
  const checked = els.selectAllHistory.checked;
  const checkboxes = document.querySelectorAll(".history-checkbox");
  selectedHistoryKeys.clear();
  for (const checkbox of checkboxes) {
    checkbox.checked = checked;
    if (checked) selectedHistoryKeys.add(checkbox.value);
  }
  updateSelectionState(checkboxes.length);
}

function updateSelectionState(total) {
  const selected = selectedHistoryKeys.size;
  els.selectedMeta.textContent = `已选择 ${selected} 条`;
  els.deleteSelected.disabled = selected === 0;
  els.selectAllHistory.checked = total > 0 && selected === total;
  els.selectAllHistory.indeterminate = selected > 0 && selected < total;
}

async function handleHistoryAction(event) {
  const button = event.target.closest('[data-action="delete-history"]');
  if (!button) return;
  if (!confirm("确定删除这条总结记录和缓存吗？")) return;
  await chrome.storage.local.remove(button.dataset.cacheKey);
  await loadHistory();
}

async function deleteSelectedHistory() {
  const keys = [...selectedHistoryKeys];
  if (!keys.length) return;
  if (!confirm(`确定删除选中的 ${keys.length} 条总结记录和缓存吗？`)) return;
  await chrome.storage.local.remove(keys);
  await loadHistory();
}

function getVideoUrl(entry) {
  if (/^https:\/\/www\.bilibili\.com\//.test(entry.videoUrl || "")) return entry.videoUrl;
  return entry.bvid ? `https://www.bilibili.com/video/${entry.bvid}` : "https://www.bilibili.com/";
}
