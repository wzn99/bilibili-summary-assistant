// Version: 0.24.11
(function boot() {
  const BSA_VERSION = "0.24.11";
  const SUMMARY_PROTOCOL_VERSION = "anchors-v6";
  const CACHE_PREFIX = "bsa-summary-cache:";
  const modalSelectedHistoryKeys = new Set();
  let modalHistoryEntries = [];
  let modalHistorySearchToken = 0;
  let modalSettingsSaveTimer = 0;
  let modalSettingsSaveRevision = 0;
  if (window.__bilibiliSummaryAssistantLoaded === BSA_VERSION) return;
  window.__bilibiliSummaryAssistantLoaded = BSA_VERSION;
  document.getElementById("bsa-root")?.remove();
  const previousMountTimer = window.__bilibiliSummaryAssistantMountTimer || 0;
  window.clearTimeout(previousMountTimer);
  window.cancelAnimationFrame(previousMountTimer);
  window.__bilibiliSummaryAssistantMountTimer = 0;
  window.__bilibiliSummaryAssistantMountRetryTimer = window.__bilibiliSummaryAssistantMountRetryTimer || 0;
  window.__bilibiliSummaryAssistantMountObserver?.disconnect();
  installExtensionContextRecovery();

  const state = {
    videoInfo: null,
    subtitles: [],
    selectedSubtitleIndex: -1,
    transcript: "",
    summary: "",
    summaryData: null,
    summaryPort: null,
    questionPort: null,
    transcribePort: null,
    qaHistory: [],
    qaDraft: "",
    qaAutoScroll: true,
    qaScrollTop: 0,
    qaScrollSync: false,
    qaScrollReleaseFrame: 0,
    activeSummaryTab: "chapters",
    summaryScrollPositions: { chapters: 0, highlights: 0 },
    questionQuote: "",
    pendingSelectionText: "",
    isAnswering: false,
    preparedSubtitle: null,
    textSource: "subtitle",
    cacheKey: "",
    hasCachedSummary: false,
    contextId: 0,
    routeKey: "",
    contextLoading: false,
    hideDanmakuList: true,
    sidebarOrder: "summary-first",
    panelCollapsed: false,
    themeMode: "system",
    compactTimeline: false,
    selectionAskEnabled: true,
    panelMaxHeight: 720,
    summaryFontSize: 13,
    autoSummarize: false,
    autoSummaryStartedContextId: 0,
    activeChapterIndex: 0,
    qaAnchors: [],
    displaySettingsLoaded: false,
    hiddenDanmakuSection: null,
    portalAuthorSection: null,
    portalReservationOrder: "",
    portalLayoutObserver: null
  };

  const panel = createPanel();
  bindPanel(panel);
  watchTextSelection(panel);
  watchDisplaySettings();
  watchPanelMount(panel);
  watchNavigation(panel);
  startVideoContext(panel, true);

  function createPanel() {
    const root = document.createElement("section");
    root.id = "bsa-root";
    root.dataset.theme = "system";
    root.innerHTML = `
      <div class="bsa-card">
        <div class="bsa-header">
          <div class="bsa-header-leading">
            <button class="bsa-icon bsa-collapse" type="button" data-action="toggle-collapse" data-tooltip="折叠" aria-label="折叠视频总结" aria-expanded="true">
              <span class="bsa-collapse-glyph" aria-hidden="true"></span>
            </button>
            <div class="bsa-title">视频总结</div>
          </div>
          <div class="bsa-header-actions">
            <span class="bsa-summary-action">
              <button class="bsa-primary" type="button" data-action="summarize" disabled>总结</button>
            </span>
            <button class="bsa-icon" type="button" data-action="open-history" data-tooltip="历史记录" aria-label="历史记录">
              <span>◷</span>
            </button>
            <button class="bsa-icon" type="button" data-action="open-options" data-tooltip="设置" aria-label="设置">
              <span>⚙</span>
            </button>
          </div>
        </div>
        <div class="bsa-body">
          <div class="bsa-status" role="alert"></div>
          <div class="bsa-result" aria-live="polite"></div>
        </div>
      </div>
      <div class="bsa-selection-popover" hidden>
        <button type="button" data-action="ask-selection">提问</button>
      </div>
      <div class="bsa-modal-layer" hidden>
        <button class="bsa-modal-backdrop" type="button" data-action="close-modal" aria-label="关闭弹窗"></button>
        <section class="bsa-modal" role="dialog" aria-modal="true" aria-labelledby="bsa-modal-title">
          <header class="bsa-modal-header">
            <h2 id="bsa-modal-title"></h2>
            <button class="bsa-modal-close" type="button" data-action="close-modal" aria-label="关闭">×</button>
          </header>
          <div class="bsa-modal-content"></div>
        </section>
      </div>
    `;

    return {
      root,
      status: root.querySelector(".bsa-status"),
      result: root.querySelector(".bsa-result"),
      summaryAction: root.querySelector(".bsa-summary-action"),
      summarizeButton: root.querySelector('[data-action="summarize"]'),
      collapseButton: root.querySelector('[data-action="toggle-collapse"]'),
      selectionPopover: root.querySelector(".bsa-selection-popover"),
      modalLayer: root.querySelector(".bsa-modal-layer"),
      modalTitle: root.querySelector("#bsa-modal-title"),
      modalContent: root.querySelector(".bsa-modal-content")
    };
  }

  function schedulePanelMount(panel) {
    if (window.__bilibiliSummaryAssistantMountTimer) return;
    window.__bilibiliSummaryAssistantMountTimer = requestAnimationFrame(() => {
      window.__bilibiliSummaryAssistantMountTimer = 0;
      mountPanel(panel);
    });
  }

  function watchPanelMount(panel) {
    clearInterval(window.__bilibiliSummaryAssistantMountRetryTimer);
    const observer = new MutationObserver(() => {
      checkVideoRoute(panel);
      applyDanmakuListVisibility();
      if (
        !panel.root.isConnected
        || panel.root.parentElement !== document.body
        || panel.root.dataset.relocating === "true"
        || !state.portalAuthorSection?.isConnected
      ) {
        schedulePanelMount(panel);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__bilibiliSummaryAssistantMountObserver = observer;
    document.addEventListener("load", (event) => {
      if (event.target instanceof HTMLImageElement) schedulePanelMount(panel);
    }, true);
    document.addEventListener("readystatechange", () => {
      applyDanmakuListVisibility();
      schedulePanelMount(panel);
    });
    window.addEventListener("resize", () => schedulePanelMount(panel));
    window.addEventListener("scroll", () => schedulePanelMount(panel), { passive: true });

    state.portalLayoutObserver = new ResizeObserver(() => schedulePanelMount(panel));
    state.portalLayoutObserver.observe(panel.root);

    window.__bilibiliSummaryAssistantMountRetryTimer = setInterval(() => {
      checkVideoRoute(panel);
      applyDanmakuListVisibility();
      if (
        !panel.root.isConnected
        || panel.root.parentElement !== document.body
        || panel.root.dataset.relocating === "true"
        || !state.portalAuthorSection?.isConnected
      ) {
        mountPanel(panel);
      }
    }, 500);
    schedulePanelMount(panel);
  }

  function watchNavigation(panel) {
    window.addEventListener("popstate", () => checkVideoRoute(panel));
    window.addEventListener("hashchange", () => checkVideoRoute(panel));
    window.addEventListener("pageshow", () => checkVideoRoute(panel));
    window.navigation?.addEventListener("currententrychange", () => checkVideoRoute(panel));
    document.addEventListener("DOMContentLoaded", () => {
      schedulePanelMount(panel);
      if (!state.contextLoading && !state.videoInfo) checkVideoRoute(panel, true);
    }, { once: true });
  }

  function watchDisplaySettings() {
    chrome.storage.sync.get({
      hideDanmakuList: true,
      sidebarOrder: "summary-first",
      panelCollapsed: false,
      themeMode: "system",
      compactTimeline: false,
      selectionAskEnabled: true,
      autoSummarize: false,
      providerDataConsent: true,
      panelMaxHeight: 720,
      summaryFontSize: 13
    }).then((settings) => {
      state.hideDanmakuList = settings.hideDanmakuList !== false;
      state.sidebarOrder = settings.sidebarOrder === "author-first" ? "author-first" : "summary-first";
      applyThemeMode(panel, settings.themeMode);
      state.compactTimeline = settings.compactTimeline === true;
      state.selectionAskEnabled = settings.selectionAskEnabled !== false;
      state.panelMaxHeight = clampNumber(settings.panelMaxHeight, 420, 1200, 720);
      state.summaryFontSize = clampNumber(settings.summaryFontSize, 11, 18, 13);
      applyPanelDisplaySize(panel);
      state.autoSummarize = settings.autoSummarize === true;
      applyPanelCollapsed(panel, settings.panelCollapsed === true);
      state.displaySettingsLoaded = true;
      applyDanmakuListVisibility();
      markPanelForRelocation();
      schedulePanelMount(panel);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      if (changes.hideDanmakuList) {
        state.hideDanmakuList = changes.hideDanmakuList.newValue !== false;
      }
      if (changes.sidebarOrder) {
        state.sidebarOrder = changes.sidebarOrder.newValue === "author-first"
          ? "author-first"
          : "summary-first";
      }
      if (changes.panelCollapsed) {
        applyPanelCollapsed(panel, changes.panelCollapsed.newValue === true);
      }
      if (changes.themeMode) {
        applyThemeMode(panel, changes.themeMode.newValue);
      }
      if (changes.compactTimeline) {
        state.compactTimeline = changes.compactTimeline.newValue === true;
        if (state.summaryData) renderSummary(panel, state.summaryData, state.summary);
      }
      if (changes.selectionAskEnabled) {
        state.selectionAskEnabled = changes.selectionAskEnabled.newValue !== false;
        if (!state.selectionAskEnabled) hideSelectionPopover(panel);
      }
      if (changes.panelMaxHeight || changes.summaryFontSize) {
        state.panelMaxHeight = clampNumber(changes.panelMaxHeight?.newValue ?? state.panelMaxHeight, 420, 1200, 720);
        state.summaryFontSize = clampNumber(changes.summaryFontSize?.newValue ?? state.summaryFontSize, 11, 18, 13);
        applyPanelDisplaySize(panel);
      }
      if (changes.autoSummarize) {
        state.autoSummarize = changes.autoSummarize.newValue === true;
        if (state.autoSummarize) maybeAutoSummarize(panel);
      }
      if (!changes.hideDanmakuList && !changes.sidebarOrder && !changes.panelCollapsed && !changes.themeMode && !changes.compactTimeline && !changes.selectionAskEnabled && !changes.autoSummarize && !changes.panelMaxHeight && !changes.summaryFontSize) return;
      state.displaySettingsLoaded = true;
      applyDanmakuListVisibility();
      markPanelForRelocation();
      schedulePanelMount(panel);
    });
  }

  function markPanelForRelocation() {
    panel.root.dataset.relocating = "true";
    panel.root.dataset.relocateUntil = String(Date.now() + 1200);
    panel.root.dataset.placementPending = "true";
  }

  function applyPanelCollapsed(panel, collapsed) {
    state.panelCollapsed = collapsed;
    panel.root.dataset.collapsed = collapsed ? "true" : "false";
    panel.collapseButton.dataset.tooltip = collapsed ? "展开" : "折叠";
    panel.collapseButton.setAttribute("aria-label", collapsed ? "展开视频总结" : "折叠视频总结");
    panel.collapseButton.setAttribute("aria-expanded", String(!collapsed));
    schedulePanelMount(panel);
  }

  function applyThemeMode(panel, value) {
    const themeMode = new Set(["light", "dark"]).has(value) ? value : "system";
    state.themeMode = themeMode;
    panel.root.dataset.theme = themeMode;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(number, minimum), maximum) : fallback;
  }

  function applyPanelDisplaySize(panel) {
    panel.root.style.setProperty("--bsa-summary-font-size", `${state.summaryFontSize}px`);
    panel.root.style.setProperty("--bsa-panel-max-height", `${Math.round(state.panelMaxHeight)}px`);
  }

  function checkVideoRoute(panel, force = false) {
    const routeKey = getVideoRouteKey();
    if (!force && routeKey === state.routeKey) return;
    startVideoContext(panel, force);
  }

  function startVideoContext(panel, force = false) {
    const routeKey = getVideoRouteKey();
    if (!force && routeKey === state.routeKey) return;

    state.routeKey = routeKey;
    const contextId = ++state.contextId;
    if (!panel.modalLayer.hidden) closeModal(panel);
    state.contextLoading = true;
    state.videoInfo = null;
    state.subtitles = [];
    state.selectedSubtitleIndex = -1;
    state.transcript = "";
    state.summary = "";
    state.summaryData = null;
    state.qaHistory = [];
    state.qaAnchors = [];
    state.qaAutoScroll = true;
    state.qaScrollTop = 0;
    state.qaScrollSync = false;
    cancelAnimationFrame(state.qaScrollReleaseFrame);
    state.qaScrollReleaseFrame = 0;
    state.activeSummaryTab = "chapters";
    state.summaryScrollPositions = { chapters: 0, highlights: 0 };
    state.questionQuote = "";
    state.pendingSelectionText = "";
    hideSelectionPopover(panel);
    state.activeChapterIndex = 0;
    state.qaDraft = "";
    state.isAnswering = false;
    state.preparedSubtitle = null;
    state.cacheKey = "";
    state.hasCachedSummary = false;
    state.autoSummaryStartedContextId = 0;
    state.summaryPort?.disconnect();
    state.summaryPort = null;
    state.questionPort?.disconnect();
    state.questionPort = null;

    panel.root.dataset.switching = "true";
    panel.root.dataset.relocating = "true";
    panel.root.dataset.relocateUntil = String(Date.now() + 5000);
    panel.root.dataset.placementPending = "true";
    panel.root.dataset.hasResult = panel.result.childElementCount ? "true" : "false";
    panel.summarizeButton.disabled = true;
    delete panel.root.dataset.noSubtitles;
    delete panel.summaryAction.dataset.tooltip;
    setStatus(panel, "正在读取视频信息...");
    schedulePanelMount(panel);
    window.setTimeout(() => {
      if (contextId === state.contextId) schedulePanelMount(panel);
    }, 190);

    refreshVideoContext(panel, contextId).catch((error) => {
      if (contextId !== state.contextId) return;
      state.contextLoading = false;
      delete panel.root.dataset.switching;
      delete panel.root.dataset.relocating;
      delete panel.root.dataset.relocateUntil;
      delete panel.root.dataset.placementPending;
      setStatus(panel, error.message, "error");
      showSummaryFailure(panel, error);
    });
  }

  function mountPanel(panel) {
    if (!state.displaySettingsLoaded || !document.body) return false;

    if (panel.root.parentElement !== document.body) {
      panel.root.removeAttribute("class");
      document.body.appendChild(panel.root);
    }

    const authorSection = findAuthorSection();
    if (!authorSection?.parentElement || !isRightAlignedContainer(authorSection.parentElement)) {
      clearPortalReservation();
      panel.root.dataset.placementPending = "true";
      return true;
    }

    // Width determines wrapping and therefore height. Finalize it before
    // reserving space, so the first frame and subsequent resize passes agree.
    panel.root.style.width = `${Math.round(authorSection.getBoundingClientRect().width)}px`;
    panel.root.style.setProperty("--bsa-panel-max-height", `${Math.round(state.panelMaxHeight)}px`);
    applyPortalReservation(authorSection);
    positionPortalPanel(authorSection);
    delete panel.root.dataset.placementPending;
    delete panel.root.dataset.relocating;
    delete panel.root.dataset.relocateUntil;
    return true;
  }

  function findAuthorSection() {
    const selectors = [
      "#v_upinfo",
      ".up-panel-container",
      ".up-info-container",
      ".video-owner-container"
    ];
    const rightColumn = findRightColumn();
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (node === panel.root || panel.root.contains(node)) continue;
        const text = compactText(node);
        if (!/(发消息|充电|关注|创作团队)/.test(text)) continue;
        const section = getDirectRightColumnChild(node, rightColumn) || expandAuthorSection(node);
        if (section) return section;
      }
    }

    const cue = findHeadingNode("创作团队") || findHeadingNode("发消息");
    return getDirectRightColumnChild(cue, rightColumn) || expandAuthorSection(cue);
  }

  function getDirectRightColumnChild(node, rightColumn) {
    if (!node || !rightColumn?.contains(node)) return null;
    let current = node;
    while (current.parentElement && current.parentElement !== rightColumn) {
      current = current.parentElement;
    }
    return current.parentElement === rightColumn ? current : null;
  }

  function applyPortalReservation(authorSection) {
    const orderChanged = state.portalReservationOrder !== state.sidebarOrder;
    if (state.portalAuthorSection !== authorSection || orderChanged) {
      clearPortalReservation();
      state.portalAuthorSection = authorSection;
      state.portalReservationOrder = state.sidebarOrder;
      const styles = getComputedStyle(authorSection);
      authorSection.style.setProperty("--bsa-author-margin-top", styles.marginTop || "0px");
      authorSection.style.setProperty("--bsa-author-margin-bottom", styles.marginBottom || "0px");
      authorSection.dataset.bsaPortalReserve = state.sidebarOrder;
      state.portalLayoutObserver.disconnect();
      state.portalLayoutObserver.observe(panel.root);
      state.portalLayoutObserver.observe(authorSection);
      state.portalLayoutObserver.observe(authorSection.parentElement);
    }

    const panelHeight = Math.ceil(panel.root.getBoundingClientRect().height);
    authorSection.style.setProperty("--bsa-portal-space", `${panelHeight + 12}px`);
  }

  function clearPortalReservation() {
    const authorSection = state.portalAuthorSection;
    if (authorSection) {
      delete authorSection.dataset.bsaPortalReserve;
      authorSection.style.removeProperty("--bsa-author-margin-top");
      authorSection.style.removeProperty("--bsa-author-margin-bottom");
      authorSection.style.removeProperty("--bsa-portal-space");
    }
    state.portalAuthorSection = null;
    state.portalReservationOrder = "";
    state.portalLayoutObserver?.disconnect();
    state.portalLayoutObserver?.observe(panel.root);
  }

  function positionPortalPanel(authorSection) {
    const authorRect = authorSection.getBoundingClientRect();
    // The host page may make body a positioned containing block after loading.
    // Compare viewport rectangles instead of treating CSS top/left as document
    // coordinates; this also handles a non-zero body offset and scrolling.
    if (!panel.root.style.top) panel.root.style.top = "0px";
    if (!panel.root.style.left) panel.root.style.left = "0px";
    const panelRect = panel.root.getBoundingClientRect();
    const panelHeight = Math.ceil(panelRect.height);
    const top = state.sidebarOrder === "author-first"
      ? authorRect.bottom + 12
      : authorRect.top - panelHeight - 12;
    panel.root.style.left = `${Math.round(parseFloat(panel.root.style.left) + authorRect.left - panelRect.left)}px`;
    panel.root.style.top = `${Math.round(parseFloat(panel.root.style.top) + top - panelRect.top)}px`;
  }

  function expandAuthorSection(node) {
    if (!node || !node.isConnected || panel.root.contains(node)) return null;
    let current = node;
    let candidate = null;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 240 && rect.height >= 40 && isRightAlignedContainer(current.parentElement)) {
        candidate = current;
      }
      const parent = current.parentElement;
      if (!parent || parent === document.body || parent.contains(panel.root)) break;
      const parentText = compactText(parent);
      if (
        parentText.includes("弹幕列表")
        || parentText.includes("接下来播放")
        || parentText.includes("稍后再看")
        || parentText.includes("订阅合集")
        || /\(\d+\/\d+\)/.test(parentText)
        || parentText.includes("视频总结")
      ) {
        break;
      }
      current = parent;
    }
    return candidate;
  }

  function isRightAlignedContainer(node) {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.width >= 260
      && rect.width <= 820
      && rect.right > window.innerWidth * 0.72
      && rect.left > window.innerWidth * 0.48;
  }

  function applyDanmakuListVisibility() {
    if (!state.displaySettingsLoaded) return;

    if (state.hiddenDanmakuSection && !state.hiddenDanmakuSection.isConnected) {
      state.hiddenDanmakuSection = null;
    }

    if (!state.hideDanmakuList) {
      delete document.documentElement.dataset.bsaHideDanmakuList;
      if (state.hiddenDanmakuSection) {
        delete state.hiddenDanmakuSection.dataset.bsaHiddenDanmakuList;
        state.hiddenDanmakuSection = null;
      }
      return;
    }

    if (document.readyState !== "complete") return;
    document.documentElement.dataset.bsaHideDanmakuList = "true";
    if (state.hiddenDanmakuSection?.isConnected) return;

    const section = findDanmakuListSection();
    if (!section || section.contains(panel.root)) return;
    section.dataset.bsaHiddenDanmakuList = "true";
    state.hiddenDanmakuSection = section;
  }

  function findDanmakuListSection() {
    const knownSection = findKnownDanmakuListSection();
    if (knownSection) return knownSection;

    const heading = findHeadingNode("弹幕列表");
    const rightColumn = findRightColumn();
    if (!heading || !rightColumn || !rightColumn.contains(heading)) return null;

    let current = heading;
    let candidate = heading.parentElement || heading;
    while (current?.parentElement && current.parentElement !== rightColumn) {
      const parent = current.parentElement;
      if (parent.contains(panel.root)) break;
      const text = compactText(parent);
      if (
        text.includes("接下来播放")
        || text.includes("稍后再看")
        || text.includes("视频总结")
        || text.includes("充电")
        || text.includes("关注")
      ) {
        break;
      }
      const rect = parent.getBoundingClientRect();
      if (rect.width >= 240 && rect.width <= 820 && text.includes("弹幕列表")) {
        candidate = parent;
      }
      current = parent;
    }
    return candidate;
  }

  function findKnownDanmakuListSection() {
    const section = document.querySelector("#danmukuBox, #danmakuBox");
    return section && !section.contains(panel.root) ? section : null;
  }

  function findRightColumn() {
    const selectors = [
      "#right-container-inner",
      "#right-container",
      ".video-container-v1 .right-container",
      ".right-container-inner",
      ".right-container",
      ".video-right-container",
      ".right-side",
      ".right-area"
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (isUsableRightColumn(node)) {
        return node;
      }
    }

    const heading = findHeadingNode("接下来播放") || findHeadingNode("稍后再看") || findHeadingNode("弹幕列表");
    if (heading) {
      let current = heading.parentElement;
      while (current && current !== document.body) {
        if (isUsableRightColumn(current)) {
          return current;
        }
        current = current.parentElement;
      }
    }

    const geometricMatch = Array.from(document.querySelectorAll("aside, div, section"))
      .filter(isUsableRightColumn)
      .map((node) => {
        const text = compactText(node);
        const rect = node.getBoundingClientRect();
        const score = [
          text.includes("接下来播放") ? 8 : 0,
          text.includes("稍后再看") ? 8 : 0,
          text.includes("弹幕列表") ? 2 : 0,
          text.includes("相关推荐") ? 3 : 0,
          rect.top < window.innerHeight ? 2 : 0
        ].reduce((total, value) => total + value, 0);
        return { node, score, area: rect.width * rect.height };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.area - a.area)[0]?.node;
    if (geometricMatch) {
      return geometricMatch;
    }

    return null;
  }

  function isUsableRightColumn(node) {
    if (!node || panel.root.contains(node)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width >= 260
      && rect.width <= 820
      && rect.height >= 80
      && rect.right > window.innerWidth * 0.58
      && rect.left > window.innerWidth * 0.32;
  }

  function compactText(node) {
    return (node.textContent || "").replace(/\s+/g, "").trim();
  }

  function findHeadingNode(prefix) {
    const nodes = Array.from(document.querySelectorAll("div, section, header, h2, h3, h4, span"));
    return nodes.find((node) => {
      if (panel.root.contains(node)) return false;
      const text = compactText(node);
      if (!text.startsWith(prefix) || text.length > 120) return false;
      const rect = node.getBoundingClientRect();
      return rect.right > window.innerWidth * 0.58 && rect.width > 40 && rect.height > 0;
    });
  }

  function bindPanel(panel) {
    panel.root.addEventListener("click", async (event) => {
      const actionNode = event.target?.closest("[data-action]");
      const action = actionNode?.dataset?.action;
      if (!action) return;

      try {

      if (action === "open-options") {
        await openSettingsModal(panel);
      }

      if (action === "open-full-options") {
        await chrome.runtime.openOptionsPage();
      }

      if (action === "open-history") {
        await openHistoryModal(panel);
      }

      if (action === "close-modal") {
        if (panel.modalContent.querySelector(".bsa-modal-form")) {
          clearTimeout(modalSettingsSaveTimer);
          modalSettingsSaveTimer = 0;
          await saveModalSettings(panel);
        }
        closeModal(panel);
      }

      if (action === "ask-selection") {
        useSelectedTextForQuestion(panel);
      }

      if (action === "clear-question-quote") {
        state.questionQuote = "";
        renderQuestionQuote(panel);
      }

      if (action === "refresh-modal-history") {
        await renderModalHistory(panel);
      }

      if (action === "clear-modal-history-search") {
        clearModalHistorySearch(panel);
      }

      if (action === "delete-modal-history") {
        const key = String(actionNode.dataset.cacheKey || "");
        if (key && confirm("确定删除这条总结记录和缓存吗？")) {
          await chrome.storage.local.remove(key);
          await renderModalHistory(panel);
        }
      }

      if (action === "delete-selected-modal-history") {
        const keys = [...modalSelectedHistoryKeys];
        if (keys.length && confirm(`确定删除选中的 ${keys.length} 条总结记录和缓存吗？`)) {
          await chrome.storage.local.remove(keys);
          await renderModalHistory(panel);
        }
      }

      if (action === "toggle-collapse") {
        const collapsed = !state.panelCollapsed;
        applyPanelCollapsed(panel, collapsed);
        await chrome.storage.sync.set({ panelCollapsed: collapsed });
      }

      if (action === "summarize") {
        await runSummary(panel);
      }

      if (action === "jump") {
        const seconds = Number(actionNode.dataset.seconds || 0);
        jumpTo(seconds);
      }

      if (action === "switch-tab") {
        switchTab(panel, actionNode.dataset.tab || "chapters");
      }

      if (action === "switch-chapter") {
        switchCompactChapter(panel, Number(actionNode.dataset.chapterIndex || 0));
      }

      if (action === "ask-question") {
        try {
          await runQuestion(panel);
        } catch (error) {
          setStatus(panel, error.message, "error");
        }
      }
      } catch (error) {
        if (recoverInvalidExtensionContext(error)) return;
        setStatus(panel, error?.message || String(error), "error");
      }
    });

    panel.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.modalLayer.hidden) {
        closeModal(panel);
        return;
      }
      if (event.target?.matches(".bsa-question-input") && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        runQuestion(panel).catch((error) => {
          if (recoverInvalidExtensionContext(error)) return;
          setStatus(panel, error.message, "error");
        });
      }
    });

    panel.selectionPopover.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });

    panel.root.addEventListener("change", (event) => {
      const checkbox = event.target?.closest(".bsa-modal-history-checkbox");
      if (checkbox) {
        if (checkbox.checked) modalSelectedHistoryKeys.add(checkbox.value);
        else modalSelectedHistoryKeys.delete(checkbox.value);
        updateModalHistorySelection(panel);
        return;
      }

      if (event.target?.matches("#bsa-modal-select-all")) {
        const checked = event.target.checked;
        modalSelectedHistoryKeys.clear();
        for (const item of panel.modalContent.querySelectorAll(".bsa-modal-history-checkbox")) {
          item.checked = checked;
          if (checked) modalSelectedHistoryKeys.add(item.value);
        }
        updateModalHistorySelection(panel);
      }

      if (event.target?.matches(".bsa-modal-history-search-mode")) {
        updateModalHistorySearchMode(panel);
      }
    });

    panel.root.addEventListener("submit", (event) => {
      if (!event.target?.matches(".bsa-modal-history-search")) return;
      event.preventDefault();
      handleModalHistorySearch(panel).catch((error) => {
        const status = panel.modalContent.querySelector(".bsa-modal-history-search-status");
        if (status) status.textContent = `查询失败：${error?.message || String(error)}`;
        setModalHistorySearchBusy(panel, false);
      });
    });

  }

  function watchTextSelection(panel) {
    let updateTimer = 0;
    const scheduleUpdate = () => {
      clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => updateSelectionPopover(panel), 20);
    };
    document.addEventListener("selectionchange", scheduleUpdate);
    panel.result.addEventListener("pointerup", scheduleUpdate);
    panel.result.addEventListener("keyup", scheduleUpdate);
    document.addEventListener("scroll", () => hideSelectionPopover(panel), true);
    window.addEventListener("resize", () => hideSelectionPopover(panel));
  }

  function updateSelectionPopover(panel) {
    if (!state.selectionAskEnabled || panel.root.dataset.collapsed === "true") {
      hideSelectionPopover(panel);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
      hideSelectionPopover(panel);
      return;
    }
    const range = selection.getRangeAt(0);
    const anchorElement = getSelectionElement(selection.anchorNode);
    const focusElement = getSelectionElement(selection.focusNode);
    if (
      !anchorElement
      || !focusElement
      || !panel.result.contains(anchorElement)
      || !panel.result.contains(focusElement)
      || anchorElement.closest("textarea, input, button")
      || focusElement.closest("textarea, input, button")
    ) {
      hideSelectionPopover(panel);
      return;
    }
    const selectedText = normalizeSelectedText(selection.toString()).slice(0, 2000);
    const rect = range.getBoundingClientRect();
    if (selectedText.length < 2 || (!rect.width && !rect.height)) {
      hideSelectionPopover(panel);
      return;
    }

    state.pendingSelectionText = selectedText;
    panel.root.dataset.selectionOpen = "true";
    panel.selectionPopover.hidden = false;
    panel.selectionPopover.style.visibility = "hidden";
    requestAnimationFrame(() => {
      if (panel.selectionPopover.hidden || state.pendingSelectionText !== selectedText) return;
      const popoverRect = panel.selectionPopover.getBoundingClientRect();
      const left = Math.min(
        window.innerWidth - popoverRect.width - 8,
        Math.max(8, rect.left + (rect.width - popoverRect.width) / 2)
      );
      const preferredTop = rect.top - popoverRect.height - 8;
      const top = preferredTop >= 8 ? preferredTop : Math.min(window.innerHeight - popoverRect.height - 8, rect.bottom + 8);
      panel.selectionPopover.style.left = `${Math.round(left)}px`;
      panel.selectionPopover.style.top = `${Math.round(top)}px`;
      panel.selectionPopover.style.visibility = "visible";
    });
  }

  function useSelectedTextForQuestion(panel) {
    const quote = state.pendingSelectionText;
    if (!quote) return;
    state.questionQuote = quote;
    hideSelectionPopover(panel);
    window.getSelection()?.removeAllRanges();
    switchTab(panel, "questions");
    renderQuestionQuote(panel);
    requestAnimationFrame(() => panel.root.querySelector(".bsa-question-input")?.focus());
  }

  function renderQuestionQuote(panel) {
    const preview = panel.root.querySelector(".bsa-question-quote");
    const text = preview?.querySelector(".bsa-question-quote-text");
    if (!preview || !text) return;
    const quote = String(state.questionQuote || "").trim();
    preview.hidden = !quote;
    text.textContent = quote;
  }

  function hideSelectionPopover(panel) {
    state.pendingSelectionText = "";
    delete panel.root.dataset.selectionOpen;
    panel.selectionPopover.hidden = true;
    panel.selectionPopover.style.visibility = "hidden";
  }

  function getSelectionElement(node) {
    if (node instanceof Element) return node;
    return node?.parentElement || null;
  }

  function normalizeSelectedText(value) {
    return String(value || "")
      .replace(/[\t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function openSettingsModal(panel) {
    const settings = await send("GET_SETTINGS");
    panel.modalTitle.textContent = "设置";
    panel.modalContent.innerHTML = `
      <div class="bsa-modal-form">
        <h3 class="bsa-modal-section-title">总结服务</h3>
        <label class="bsa-modal-field"><span>API Key</span><input id="bsa-modal-api-key" type="password" autocomplete="off" placeholder="sk-..."></label>
        <label class="bsa-modal-field"><span>Base URL</span><input id="bsa-modal-base-url" type="url" autocomplete="off" placeholder="https://api.deepseek.com"></label>
        <label class="bsa-modal-field"><span>Model Name</span><input id="bsa-modal-model" type="text" autocomplete="off"><small>推荐： deepseek-v4-flash、qwen3.7-flash</small></label>
        <div class="bsa-modal-disclosure"><strong>数据传输说明</strong><p>生成总结或提问时，当前视频的标题、字幕、引用文字和问题会直接发送给你配置的 LLM 服务。API Key 仅保存在当前浏览器本地，开发者不接收这些数据。</p></div>
        <label class="bsa-modal-toggle"><span><strong>允许发送给所配置的 LLM 服务</strong><small>这是生成总结和回答问题所必需的，可随时关闭。</small></span><input id="bsa-modal-provider-consent" type="checkbox" role="switch"></label>

        <h3 class="bsa-modal-section-title">无字幕时的音频转写服务</h3>
        <label class="bsa-modal-field"><span>转写服务</span><select id="bsa-modal-transcription-provider"><option value="dashscope_filetrans">DashScope Filetrans</option><option value="openai_compatible">OpenAI 兼容接口</option></select></label>
        <label class="bsa-modal-field"><span>API Key</span><input id="bsa-modal-transcription-api-key" type="password" autocomplete="off"></label>
        <label class="bsa-modal-field"><span>Base URL</span><input id="bsa-modal-transcription-base-url" type="url" autocomplete="off"></label>
        <label class="bsa-modal-field"><span>Model Name</span><input id="bsa-modal-transcription-model" type="text" autocomplete="off"><small>推荐： openai/whisper-large-v3-turbo</small></label>
        <label class="bsa-modal-field" data-transcription-mode="openai_compatible"><span>音频切片秒数</span><input id="bsa-modal-transcription-chunk-seconds" type="number" min="60" max="3600" step="30"></label>
        <label class="bsa-modal-field"><span>单次请求超时秒数</span><input id="bsa-modal-transcription-request-timeout" type="number" min="30" max="3600" step="10"></label>
        <label class="bsa-modal-field" data-transcription-mode="dashscope_filetrans"><span>DashScope 最长等待秒数</span><input id="bsa-modal-transcription-poll-timeout" type="number" min="30" max="7200" step="30"></label>

        <h3 class="bsa-modal-section-title">外观与行为</h3>
        <label class="bsa-modal-field"><span>外观</span><select id="bsa-modal-theme"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <label class="bsa-modal-toggle"><span><strong>进入视频后自动总结</strong><small>打开视频并完成字幕或音频准备后自动开始总结。</small></span><input id="bsa-modal-auto-summarize" type="checkbox" role="switch"></label>
        <label class="bsa-modal-field"><span>最大字幕字符数</span><input id="bsa-modal-max-chars" type="number" min="120000" step="1000"></label>
        <label class="bsa-modal-field"><span>插件区域最大高度（像素）</span><input id="bsa-modal-panel-max-height" type="number" min="420" max="1200" step="20"><small>取值范围 420–1200；面板可随网页一起滚动。</small></label>
        <label class="bsa-modal-field"><span>总结正文字号（像素）</span><input id="bsa-modal-summary-font-size" type="number" min="11" max="18" step="1"><small>只调整概览、时间线正文和亮点文字。</small></label>
        <label class="bsa-modal-toggle"><span><strong>紧凑时间线</strong><small>将章节做成时间线内的子标签，一次只显示一个时间段。</small></span><input id="bsa-modal-compact-timeline" type="checkbox" role="switch"></label>
        <label class="bsa-modal-toggle"><span><strong>选中文字后提问</strong><small>选中总结文字时显示“提问”，并把引用带入提问区。</small></span><input id="bsa-modal-selection-ask" type="checkbox" role="switch"></label>
        <label class="bsa-modal-toggle"><span><strong>屏蔽弹幕列表</strong><small>隐藏右侧弹幕列表，不影响播放器内弹幕。</small></span><input id="bsa-modal-hide-danmaku" type="checkbox" role="switch"></label>
        <label class="bsa-modal-field"><span>右栏顶部顺序</span><select id="bsa-modal-sidebar-order"><option value="summary-first">视频总结在上</option><option value="author-first">UP 主信息在上</option></select></label>
        <div class="bsa-modal-actions"><button class="bsa-modal-secondary" type="button" data-action="open-full-options">Cookie 与配置文件工具</button><span class="bsa-modal-status" role="status"></span></div>
      </div>
    `;
    panel.modalContent.querySelector("#bsa-modal-api-key").value = settings.apiKey || "";
    panel.modalContent.querySelector("#bsa-modal-base-url").value = settings.baseUrl || "https://api.deepseek.com";
    panel.modalContent.querySelector("#bsa-modal-model").value = settings.model || "deepseek-v4-flash";
    panel.modalContent.querySelector("#bsa-modal-transcription-provider").value = settings.transcriptionProvider || "openai_compatible";
    panel.modalContent.querySelector("#bsa-modal-transcription-api-key").value = settings.transcriptionApiKey || "";
    panel.modalContent.querySelector("#bsa-modal-transcription-base-url").value = settings.transcriptionBaseUrl ?? "https://openrouter.ai/api/v1/audio/transcriptions";
    panel.modalContent.querySelector("#bsa-modal-transcription-model").value = settings.transcriptionModel || "openai/whisper-large-v3-turbo";
    panel.modalContent.querySelector("#bsa-modal-transcription-chunk-seconds").value = clampNumber(settings.transcriptionChunkSeconds, 60, 3600, 300);
    panel.modalContent.querySelector("#bsa-modal-transcription-request-timeout").value = clampNumber(settings.transcriptionRequestTimeoutSeconds, 30, 3600, 180);
    panel.modalContent.querySelector("#bsa-modal-transcription-poll-timeout").value = clampNumber(settings.transcriptionPollTimeoutSeconds, 30, 7200, 3600);
    panel.modalContent.querySelector("#bsa-modal-theme").value = new Set(["light", "dark"]).has(settings.themeMode) ? settings.themeMode : "system";
    panel.modalContent.querySelector("#bsa-modal-provider-consent").checked = settings.providerDataConsent === true;
    panel.modalContent.querySelector("#bsa-modal-auto-summarize").checked = settings.autoSummarize === true;
    panel.modalContent.querySelector("#bsa-modal-max-chars").value = Math.max(Number(settings.maxTranscriptChars || 120000), 120000);
    panel.modalContent.querySelector("#bsa-modal-panel-max-height").value = clampNumber(settings.panelMaxHeight, 420, 1200, 720);
    panel.modalContent.querySelector("#bsa-modal-summary-font-size").value = clampNumber(settings.summaryFontSize, 11, 18, 13);
    panel.modalContent.querySelector("#bsa-modal-compact-timeline").checked = settings.compactTimeline === true;
    panel.modalContent.querySelector("#bsa-modal-selection-ask").checked = settings.selectionAskEnabled !== false;
    panel.modalContent.querySelector("#bsa-modal-hide-danmaku").checked = settings.hideDanmakuList !== false;
    panel.modalContent.querySelector("#bsa-modal-sidebar-order").value = settings.sidebarOrder === "author-first" ? "author-first" : "summary-first";
    const form = panel.modalContent.querySelector(".bsa-modal-form");
    form.addEventListener("input", () => scheduleModalSettingsSave(panel));
    form.addEventListener("change", () => scheduleModalSettingsSave(panel, 0));
    form.addEventListener("focusout", (event) => {
      if (event.target?.matches("input, select")) scheduleModalSettingsSave(panel, 0);
    });
    panel.modalContent.querySelector("#bsa-modal-transcription-provider").addEventListener("change", () => updateModalTranscriptionVisibility(panel.modalContent, true));
    updateModalTranscriptionVisibility(panel.modalContent);
    showModal(panel);
  }

  function scheduleModalSettingsSave(panel, delay = 450) {
    clearTimeout(modalSettingsSaveTimer);
    modalSettingsSaveTimer = window.setTimeout(() => {
      modalSettingsSaveTimer = 0;
      void saveModalSettings(panel);
    }, delay);
  }

  function updateModalTranscriptionVisibility(content, applyPreset = false) {
    const provider = content.querySelector("#bsa-modal-transcription-provider")?.value || "openai_compatible";
    if (applyPreset) {
      const url = content.querySelector("#bsa-modal-transcription-base-url");
      const model = content.querySelector("#bsa-modal-transcription-model");
      const patch = getTranscriptionPresetPatch(provider, url.value, model.value);
      if (patch.transcriptionBaseUrl) url.value = patch.transcriptionBaseUrl;
      if (patch.transcriptionModel) model.value = patch.transcriptionModel;
    }
    content.querySelectorAll("[data-transcription-mode]").forEach((field) => {
      field.hidden = field.dataset.transcriptionMode !== provider;
    });
  }

  async function saveModalSettings(panel) {
    const content = panel.modalContent;
    const settings = {
      apiKey: normalizeApiKey(content.querySelector("#bsa-modal-api-key")?.value),
      baseUrl: normalizeBaseUrl(content.querySelector("#bsa-modal-base-url")?.value),
      model: String(content.querySelector("#bsa-modal-model")?.value || "").trim() || "deepseek-v4-flash",
      transcriptionProvider: content.querySelector("#bsa-modal-transcription-provider")?.value === "openai_compatible" ? "openai_compatible" : "dashscope_filetrans",
      transcriptionApiKey: normalizeApiKey(content.querySelector("#bsa-modal-transcription-api-key")?.value),
      transcriptionBaseUrl: String(content.querySelector("#bsa-modal-transcription-base-url")?.value || "").trim().replace(/\/+$/, ""),
      transcriptionModel: String(content.querySelector("#bsa-modal-transcription-model")?.value || "").trim(),
      transcriptionChunkSeconds: Number(content.querySelector("#bsa-modal-transcription-chunk-seconds")?.value || 300),
      transcriptionRequestTimeoutSeconds: Number(content.querySelector("#bsa-modal-transcription-request-timeout")?.value || 180),
      transcriptionPollTimeoutSeconds: Number(content.querySelector("#bsa-modal-transcription-poll-timeout")?.value || 3600),
      themeMode: new Set(["light", "dark"]).has(content.querySelector("#bsa-modal-theme")?.value) ? content.querySelector("#bsa-modal-theme").value : "system",
      providerDataConsent: content.querySelector("#bsa-modal-provider-consent")?.checked === true,
      autoSummarize: content.querySelector("#bsa-modal-auto-summarize")?.checked === true,
      maxTranscriptChars: Math.max(Number(content.querySelector("#bsa-modal-max-chars")?.value || 120000), 120000),
      panelMaxHeight: Number(content.querySelector("#bsa-modal-panel-max-height")?.value || 720),
      summaryFontSize: Number(content.querySelector("#bsa-modal-summary-font-size")?.value || 13),
      compactTimeline: content.querySelector("#bsa-modal-compact-timeline")?.checked === true,
      selectionAskEnabled: content.querySelector("#bsa-modal-selection-ask")?.checked !== false,
      hideDanmakuList: content.querySelector("#bsa-modal-hide-danmaku")?.checked !== false,
      sidebarOrder: content.querySelector("#bsa-modal-sidebar-order")?.value === "author-first" ? "author-first" : "summary-first"
    };
    if (!content.querySelector(".bsa-modal-form")) return;
    const revision = ++modalSettingsSaveRevision;
    const status = content.querySelector(".bsa-modal-status");
    try {
      await send("SAVE_SETTINGS", { settings });
      await requestProviderOrigins(settings);
      if (revision === modalSettingsSaveRevision && status) status.textContent = "";
    } catch (error) {
      if (revision === modalSettingsSaveRevision && status) status.textContent = error?.message || String(error);
    }
  }

  async function openHistoryModal(panel) {
    panel.modalTitle.textContent = "总结历史";
    showModal(panel);
    await renderModalHistory(panel);
  }

  async function renderModalHistory(panel) {
    modalSelectedHistoryKeys.clear();
    modalHistorySearchToken += 1;
    panel.modalContent.innerHTML = `<div class="bsa-modal-loading">正在读取缓存...</div>`;
    const stored = await chrome.storage.local.get(null);
    const rawEntries = Object.entries(stored)
      .filter(([key]) => key.startsWith(CACHE_PREFIX))
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => Number(b.lastAccessedAt || 0) - Number(a.lastAccessedAt || 0));
    const entries = [];
    const seen = new Set();
    for (const entry of rawEntries) {
      const identity = entry.bvid && entry.cid ? `${String(entry.bvid).toUpperCase()}|${entry.cid}` : entry.key;
      if (seen.has(identity)) continue;
      seen.add(identity);
      entries.push(entry);
    }

    modalHistoryEntries = entries;
    panel.modalContent.innerHTML = "";
    const toolbar = document.createElement("div");
    toolbar.className = "bsa-modal-history-toolbar";
    toolbar.innerHTML = `
      <label><input id="bsa-modal-select-all" type="checkbox"><span>全选</span></label>
      <span class="bsa-modal-selected-meta">共 ${entries.length} 条</span>
      <button class="bsa-modal-danger" type="button" data-action="delete-selected-modal-history" disabled>删除所选</button>
      <button class="bsa-modal-secondary" type="button" data-action="refresh-modal-history">刷新</button>
    `;
    panel.modalContent.appendChild(toolbar);

    const search = document.createElement("form");
    search.className = "bsa-modal-history-search";
    search.innerHTML = `
      <label>
        <span class="bsa-modal-sr-only">查询方向</span>
        <select class="bsa-modal-history-search-mode" aria-label="查询方向">
          <option value="title">标题关键词</option>
          <option value="summary">总结关键词</option>
          <option value="ai">AI 智能查询</option>
        </select>
      </label>
      <label class="bsa-modal-history-search-input">
        <span class="bsa-modal-sr-only">查询内容</span>
        <input type="search" autocomplete="off" placeholder="输入关键词，多个词用空格或逗号分隔" aria-label="查询内容">
      </label>
      <button class="bsa-modal-primary" type="submit">查询</button>
      <button class="bsa-modal-secondary" type="button" data-action="clear-modal-history-search">清除筛选</button>
      <span class="bsa-modal-history-search-status" role="status"></span>
    `;
    panel.modalContent.appendChild(search);

    const list = document.createElement("div");
    list.className = "bsa-modal-history-list";
    panel.modalContent.appendChild(list);
    updateModalHistorySearchMode(panel);
    renderModalHistoryEntries(panel, entries);
  }

  function renderModalHistoryEntries(panel, entries) {
    modalSelectedHistoryKeys.clear();
    const list = panel.modalContent.querySelector(".bsa-modal-history-list");
    if (!list) return;
    list.innerHTML = "";
    if (!entries.length) {
      list.innerHTML = `<div class="bsa-modal-empty">${modalHistoryEntries.length ? "没有符合条件的历史记录。" : "还没有缓存的总结。"}</div>`;
    } else {
      for (const entry of entries) list.appendChild(createModalHistoryItem(entry));
    }
    updateModalHistorySelection(panel);
  }

  function updateModalHistorySearchMode(panel) {
    const mode = panel.modalContent.querySelector(".bsa-modal-history-search-mode")?.value || "title";
    const input = panel.modalContent.querySelector(".bsa-modal-history-search-input input");
    if (input) {
      input.placeholder = mode === "ai"
        ? "输入自然语言，例如：讲解性能优化的视频"
        : "输入关键词，多个词用空格或逗号分隔";
    }
  }

  function setModalHistorySearchBusy(panel, busy) {
    for (const control of panel.modalContent.querySelectorAll(".bsa-modal-history-search select, .bsa-modal-history-search input, .bsa-modal-history-search button")) {
      control.disabled = busy;
    }
  }

  async function handleModalHistorySearch(panel) {
    const mode = panel.modalContent.querySelector(".bsa-modal-history-search-mode")?.value || "title";
    const query = panel.modalContent.querySelector(".bsa-modal-history-search-input input")?.value.trim() || "";
    const status = panel.modalContent.querySelector(".bsa-modal-history-search-status");
    const token = ++modalHistorySearchToken;
    // #region debug-point H1-H4:history-search-modal-submit
    reportModalHistorySearchDebug({
      hypothesisId: mode === "ai" ? "H3" : "H2",
      location: "content.js:handleModalHistorySearch",
      msg: "ui-submit",
      data: {
        entryPoint: "modal",
        mode,
        queryLength: query.length,
        candidateCount: modalHistoryEntries.length,
        version: BSA_VERSION
      }
    });
    // #endregion
    if (!query) {
      if (status) status.textContent = "";
      renderModalHistoryEntries(panel, modalHistoryEntries);
      return;
    }

    if (mode !== "ai") {
      // #region debug-point H2:history-search-modal-local-branch
      reportModalHistorySearchDebug({
        hypothesisId: "H2",
        location: "content.js:handleModalHistorySearch",
        msg: "ui-local-branch",
        data: { entryPoint: "modal", mode, queryLength: query.length, candidateCount: modalHistoryEntries.length, version: BSA_VERSION }
      });
      // #endregion
      const filtered = filterHistoryEntries(modalHistoryEntries, mode, query);
      renderModalHistoryEntries(panel, filtered);
      if (status) status.textContent = filtered.length ? `已找到 ${filtered.length} 条记录` : "没有符合条件的历史记录";
      return;
    }

    setModalHistorySearchBusy(panel, true);
    if (status) status.textContent = "正在使用 AI 查询...";
    try {
      // #region debug-point H3-H4:history-search-modal-ai-branch
      reportModalHistorySearchDebug({
        hypothesisId: modalHistoryEntries.length ? "H3" : "H4",
        location: "content.js:handleModalHistorySearch",
        msg: "ui-ai-branch",
        data: { entryPoint: "modal", mode, queryLength: query.length, candidateCount: modalHistoryEntries.length, version: BSA_VERSION }
      });
      // #endregion
      const response = await chrome.runtime.sendMessage(
        buildHistoryAiSearchRequest(query, modalHistoryEntries)
      );
      if (!response?.ok) throw new Error(response?.error || "AI 查询失败");
      const result = response.data;
      if (token !== modalHistorySearchToken) return;
      const ids = new Set(Array.isArray(result?.ids) ? result.ids.map(String) : []);
      const filtered = modalHistoryEntries.filter((entry) => ids.has(String(entry.key)));
      reportModalHistorySearchDebug({
        hypothesisId: "H3",
        location: "content.js:handleModalHistorySearch",
        msg: "ui-result",
        data: { entryPoint: "modal", mode, queryLength: query.length, candidateCount: modalHistoryEntries.length, matchedCount: filtered.length, version: BSA_VERSION }
      });
      renderModalHistoryEntries(panel, filtered);
      if (status) status.textContent = filtered.length
        ? `AI 查询找到 ${filtered.length} 条记录`
        : "AI 查询没有找到符合条件的记录";
    } finally {
      if (token === modalHistorySearchToken) setModalHistorySearchBusy(panel, false);
    }
  }

  function reportModalHistorySearchDebug(payload) {
    chrome.runtime.sendMessage({ type: "DEBUG_HISTORY_SEARCH_EVENT", payload }).catch(() => {});
  }

  function clearModalHistorySearch(panel) {
    modalHistorySearchToken += 1;
    const mode = panel.modalContent.querySelector(".bsa-modal-history-search-mode");
    const input = panel.modalContent.querySelector(".bsa-modal-history-search-input input");
    const status = panel.modalContent.querySelector(".bsa-modal-history-search-status");
    if (mode) mode.value = "title";
    if (input) input.value = "";
    if (status) status.textContent = "";
    setModalHistorySearchBusy(panel, false);
    updateModalHistorySearchMode(panel);
    renderModalHistoryEntries(panel, modalHistoryEntries);
  }

  function createModalHistoryItem(entry) {
    const item = document.createElement("article");
    item.className = "bsa-modal-history-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "bsa-modal-history-checkbox";
    checkbox.value = entry.key;
    const content = document.createElement("div");
    content.className = "bsa-modal-history-copy";
    const title = document.createElement("strong");
    title.textContent = entry.videoTitle || entry.bvid || "未命名视频";
    const overview = document.createElement("p");
    overview.textContent = entry.summaryData?.overview || "这条旧缓存没有简要总结。";
    const info = document.createElement("small");
    info.textContent = `${entry.createdAt ? new Date(entry.createdAt).toLocaleString("zh-CN") : "时间未知"} · ${entry.model || "未知模型"}`;
    content.append(title, overview, info);
    const actions = document.createElement("div");
    actions.className = "bsa-modal-history-actions";
    const open = document.createElement("a");
    open.href = getCachedVideoUrl(entry);
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "打开视频";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.action = "delete-modal-history";
    remove.dataset.cacheKey = entry.key;
    remove.textContent = "删除";
    actions.append(open, remove);
    item.append(checkbox, content, actions);
    return item;
  }

  function updateModalHistorySelection(panel) {
    const checkboxes = [...panel.modalContent.querySelectorAll(".bsa-modal-history-checkbox")];
    const selected = modalSelectedHistoryKeys.size;
    const meta = panel.modalContent.querySelector(".bsa-modal-selected-meta");
    const remove = panel.modalContent.querySelector('[data-action="delete-selected-modal-history"]');
    const selectAll = panel.modalContent.querySelector("#bsa-modal-select-all");
    if (meta) meta.textContent = selected ? `已选择 ${selected} 条` : `共 ${checkboxes.length} 条`;
    if (remove) remove.disabled = selected === 0;
    if (selectAll) {
      selectAll.checked = checkboxes.length > 0 && selected === checkboxes.length;
      selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
    }
  }

  function showModal(panel) {
    panel.modalLayer.hidden = false;
    panel.root.dataset.modalOpen = "true";
    document.documentElement.classList.add("bsa-modal-open");
    requestAnimationFrame(() => panel.modalLayer.querySelector(".bsa-modal input, .bsa-modal select, .bsa-modal button")?.focus());
  }

  function closeModal(panel) {
    clearTimeout(modalSettingsSaveTimer);
    modalSettingsSaveTimer = 0;
    panel.modalLayer.hidden = true;
    panel.modalContent.innerHTML = "";
    delete panel.root.dataset.modalOpen;
    modalSelectedHistoryKeys.clear();
    modalHistoryEntries = [];
    modalHistorySearchToken += 1;
    document.documentElement.classList.remove("bsa-modal-open");
  }

  function getCachedVideoUrl(entry) {
    if (/^https:\/\/www\.bilibili\.com\//.test(entry.videoUrl || "")) return entry.videoUrl;
    return entry.bvid ? `https://www.bilibili.com/video/${entry.bvid}` : "https://www.bilibili.com/";
  }

  function normalizeApiKey(value) {
    return String(value || "")
      .replace(/^Bearer\s+/i, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
  }

  function normalizeBaseUrl(value) {
    return String(value || "https://api.deepseek.com").trim().replace(/\/+$/, "") || "https://api.deepseek.com";
  }

  async function requestProviderOrigins(settings) {
    const permissionStatus = await send("CHECK_PROVIDER_ORIGINS", { settings });
    const missingOrigins = Array.isArray(permissionStatus?.missingOrigins)
      ? permissionStatus.missingOrigins
      : [];
    if (!missingOrigins.length) return;
    const hosts = missingOrigins.map((origin) => new URL(origin.replace("/*", "")).host).join("、");
    throw new Error(`首次使用 ${hosts} 需要浏览器授权，请点击“Cookie 与配置文件工具”并在完整设置页保存一次`);
  }

  async function refreshVideoContext(panel, contextId = state.contextId) {
    delete panel.root.dataset.noSubtitles;
    delete panel.summaryAction.dataset.tooltip;
    panel.summarizeButton.disabled = true;
    setStatus(panel, "正在读取视频信息...");
    const bvid = getBvid();
    if (!bvid) {
      throw new Error("当前页面没有识别到 BV 号");
    }

    const view = await send("FETCH_JSON", {
      url: `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`
    });
    if (contextId !== state.contextId) return;
    if (view.code !== 0) {
      throw new Error(view.message || "读取视频信息失败");
    }

    const pageIndex = getPageIndex();
    const pages = Array.isArray(view.data?.pages) ? view.data.pages : [];
    const page = pages[Math.min(Math.max(pageIndex - 1, 0), Math.max(pages.length - 1, 0))] || {};
    const cid = page.cid || view.data?.cid;

    if (!cid) {
      throw new Error("没有拿到 cid，无法读取字幕");
    }

    state.videoInfo = {
      bvid,
      cid,
      aid: view.data?.aid,
      duration: Number(page.duration || view.data?.duration || 0),
      title: view.data?.title || document.title.replace(/_哔哩哔哩_bilibili$/, ""),
      url: location.href
    };

    const playerRequest = send("FETCH_JSON", {
      url: `https://api.bilibili.com/x/player/wbi/v2?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`
    });
    const cached = await send("CACHE_FIND_VIDEO", {
      identity: { bvid, cid }
    }).catch(() => null);
    if (contextId !== state.contextId) return;

    if (cached?.entry?.summaryData) {
      applyCachedSummary(panel, cached.key, cached.entry);
    }

    const player = await playerRequest;
    if (contextId !== state.contextId) return;
    if (player.code !== 0) {
      throw new Error(player.message || "读取播放器信息失败");
    }

    state.subtitles = Array.isArray(player.data?.subtitle?.subtitles)
      ? player.data.subtitle.subtitles
      : [];

    if (cached?.entry?.summaryData) {
      const cachedSource = cached.entry.textSource || "subtitle";
      const currentSource = state.subtitles.length ? "subtitle" : "transcription";
      if (cachedSource !== currentSource) {
        state.hasCachedSummary = false;
        state.cacheKey = "";
        state.summaryData = null;
        state.summary = "";
        panel.result.innerHTML = "";
        panel.root.dataset.hasResult = "false";
      }
    }

    if (!cached?.entry?.summaryData) {
      panel.result.innerHTML = "";
      panel.root.dataset.hasResult = "false";
    }
    renderSubtitles(panel, Boolean(cached?.entry?.summaryData));
  }

  function renderSubtitles(panel, restoredFromCache = false) {
    if (!state.subtitles.length) {
      state.selectedSubtitleIndex = -1;
      if (!restoredFromCache) panel.root.dataset.noSubtitles = "true";
      panel.summaryAction.dataset.tooltip = "无字幕，将使用音频转写";
      setStatus(panel, "未发现字幕，可使用音频转写总结。", "ok");
      updateSummaryButton(panel);
      state.contextLoading = false;
      updateSummaryButton(panel);
      delete panel.root.dataset.switching;
      maybeAutoSummarize(panel);
      return;
    }

    state.selectedSubtitleIndex = choosePreferredSubtitleIndex(state.subtitles);
    delete panel.root.dataset.noSubtitles;
    delete panel.summaryAction.dataset.tooltip;
    panel.summarizeButton.disabled = false;
    if (!restoredFromCache) {
      setStatus(panel, "");
    }
    updateSummaryButton(panel);
    state.contextLoading = false;
    updateSummaryButton(panel);
    maybeAutoSummarize(panel);
    delete panel.root.dataset.switching;
    if (restoredFromCache && state.qaHistory.length && !state.qaAnchors.length) {
      hydrateCachedQaAnchors(panel);
    }
  }

  function applyCachedSummary(panel, cacheKey, cached) {
    state.hasCachedSummary = true;
    state.cacheKey = String(cacheKey || "");
    state.summaryData = normalizeCachedSummaryData(cached.summaryData);
    state.summary = cached.summary || JSON.stringify(state.summaryData, null, 2);
    state.qaHistory = sanitizeQaHistory(cached.qaHistory);
    state.qaAnchors = normalizeCachedAnchors(cached.anchors);
    renderSummary(panel, state.summaryData, state.summary);
    panel.root.dataset.hasResult = "true";
    delete panel.root.dataset.switching;
    setStatus(panel, "");
  }

  async function hydrateCachedQaAnchors(panel) {
    try {
      const prepared = await prepareCurrentSubtitle(panel);
      if (!state.hasCachedSummary) return;
      state.preparedSubtitle = prepared;
      state.qaAnchors = normalizeCachedAnchors(prepared.anchored?.anchors);
      renderQaMessages(panel);
      if (state.cacheKey && state.qaAnchors.length) {
        await send("CACHE_PATCH", { key: state.cacheKey, patch: { anchors: state.qaAnchors } });
      }
    } catch (_error) {
      // Old summaries remain readable even when their subtitle can no longer be fetched.
    }
  }

  function normalizeCachedAnchors(anchors) {
    if (!Array.isArray(anchors)) return [];
    return anchors
      .map((anchor) => ({
        id: String(anchor?.id || "").toUpperCase(),
        seconds: Number(anchor?.seconds)
      }))
      .filter((anchor) => /^T\d{3,}$/.test(anchor.id) && Number.isFinite(anchor.seconds));
  }

  function choosePreferredSubtitleIndex(subtitles) {
    const ranked = subtitles.map((subtitle, index) => {
      const language = `${subtitle?.lan || ""} ${subtitle?.lan_doc || ""}`.toLocaleLowerCase();
      const isChinese = /中文|汉语|漢語|华语|華語|简体|簡體|繁体|繁體|(^|[\s_-])zh([\s_-]|$)|zho|chi/.test(language);
      const isEnglish = /英文|英语|英語|(^|[\s_-])en([\s_-]|$)|eng/.test(language);
      return { index, priority: isChinese ? 0 : isEnglish ? 1 : 2 };
    });
    ranked.sort((a, b) => a.priority - b.priority || a.index - b.index);
    return ranked[0]?.index ?? 0;
  }

  async function prepareCurrentSubtitle(panel) {
    const selectedIndex = state.selectedSubtitleIndex >= 0 ? state.selectedSubtitleIndex : 0;
    const subtitle = state.subtitles[selectedIndex] || state.subtitles[0] || {};
    const subtitleUrl = normalizeSubtitleUrl(subtitle.subtitle_url || "");
    if (!subtitleUrl) throw new Error("没有可用字幕 URL");
    const settings = await send("GET_SUMMARY_SETTINGS");
    const model = settings.model || "deepseek-v4-flash";
    const maxTranscriptChars = settings.maxTranscriptChars || 120000;
    if (
      state.preparedSubtitle?.subtitleUrl === subtitleUrl
      && state.preparedSubtitle.model === model
      && state.preparedSubtitle.maxTranscriptChars === maxTranscriptChars
    ) {
      return state.preparedSubtitle;
    }

    const subtitleJson = await send("FETCH_JSON", { url: subtitleUrl });
    const transcript = subtitleToText(subtitleJson);
    const subtitleEnd = getSubtitleEndSeconds(subtitleJson);
    const anchored = buildAnchoredTranscript(subtitleJson, subtitleEnd || state.videoInfo?.duration);
    if (!transcript) throw new Error("字幕解析为空");
    if (!anchored.text || !anchored.anchors.length) throw new Error("无法为字幕建立时间锚点");

    const subtitleKey = String(
      subtitle.id_str || subtitle.id || subtitle.lan || subtitle.lan_doc || selectedIndex
    );
    const transcriptHash = await sha256(transcript);
    const cacheIdentity = [
      state.videoInfo?.bvid || "",
      state.videoInfo?.cid || "",
      subtitleKey
    ].join("|");

    return {
      subtitleUrl,
      transcript,
      subtitleEnd,
      anchored,
      model,
      maxTranscriptChars,
      subtitleKey,
      transcriptHash,
      cacheKey: await sha256(cacheIdentity)
    };
  }

  async function prepareCurrentText(panel, onTranscriptionStage = () => {}) {
    if (state.subtitles.length) {
      state.textSource = "subtitle";
      return prepareCurrentSubtitle(panel);
    }
    const settings = await send("GET_SUMMARY_SETTINGS");
    setStatus(panel, "正在读取登录状态...");
    const cookieStatus = await send("GET_COOKIE_STATUS");
    if (!cookieStatus.hasSessdata) throw new Error("没有发现 B 站登录 Cookie，请先登录并刷新页面");
    const transcription = await streamTranscription({
      bvid: state.videoInfo.bvid,
      cid: state.videoInfo.cid,
      duration: Number(state.videoInfo.duration || 0)
    }, (status) => {
      onTranscriptionStage(status);
      setStatus(panel, status);
    });
    onTranscriptionStage("转写完成，正在整理文本...");
    setStatus(panel, "转写完成，正在整理文本...");
    const text = String(transcription.text || "").trim();
    if (!text) throw new Error("音频转写结果为空");
    const sentences = Array.isArray(transcription.sentences)
      ? transcription.sentences
        .map((item) => ({
          start: normalizeTranscriptionTime(item.start ?? item.begin_time ?? item.beginTime ?? 0),
          end: normalizeTranscriptionTime(item.end ?? item.end_time ?? item.endTime ?? 0),
          text: String(item.text || item.content || "").trim()
        }))
        .filter((item) => item.text)
      : [];
    const anchored = sentences.length
      ? buildAnchoredTranscription(sentences, state.videoInfo.duration)
      : {
        text: `[T001 0:00] ${text}`,
        anchors: [{ id: "T001", seconds: 0 }]
      };
    const transcriptHash = await sha256(text);
    const identity = [
      state.videoInfo.bvid,
      state.videoInfo.cid,
      "transcription",
      settings.model || "",
      settings.transcriptionProvider || "",
      settings.transcriptionModel || ""
    ].join("|");
    state.textSource = "transcription";
    return {
      transcript: text,
      subtitleEnd: state.videoInfo.duration || 0,
      anchored,
      model: settings.model || "deepseek-v4-flash",
      maxTranscriptChars: settings.maxTranscriptChars || 120000,
      subtitleKey: "transcription",
      transcriptHash,
      textSource: "transcription",
      cacheKey: await sha256(identity)
    };
  }

  function buildAnchoredTranscription(sentences, duration) {
    const anchors = [];
    const lines = [];
    sentences.forEach((sentence, index) => {
      const seconds = Math.max(0, Math.floor(Number(sentence.start) || 0));
      const id = `T${String(index + 1).padStart(3, "0")}`;
      anchors.push({ id, seconds });
      lines.push(`[${id} ${formatTime(seconds)}] ${sentence.text}`);
    });
    return { text: lines.join("\n"), anchors, subtitleEnd: Number(duration || 0) };
  }

  function normalizeTranscriptionTime(value) {
    const seconds = Number(value || 0);
    return seconds > 1000 ? seconds / 1000 : seconds;
  }

  function getTranscriptionFailureStage(status) {
    const value = String(status || "");
    if (/下载 B 站音频/.test(value)) return "下载 B 站音频";
    if (/转换为 MCP 兼容|切片音频/.test(value)) return "转换和切片音频";
    if (value.includes("正在解析第") && value.includes("段转写结果")) return "解析转写结果";
    if (/上传并转写/.test(value)) return "上传并转写音频";
    if (/获取 B 站音频地址|读取登录状态|准备音频转写/.test(value)) return "准备音频转写";
    if (/转写完成|整理文本/.test(value)) return "整理转写文本";
    return "下载并转写音频";
  }

  function renderSummaryProgress(panel, message) {
    panel.root.dataset.hasResult = "true";
    let progress = panel.result.querySelector(".bsa-loading[data-summary-progress]");
    if (!progress) {
      panel.result.innerHTML = "";
      progress = document.createElement("div");
      progress.className = "bsa-loading";
      progress.dataset.summaryProgress = "true";
      progress.setAttribute("role", "status");
      progress.setAttribute("aria-live", "polite");
      panel.result.append(progress);
    }
    progress.textContent = String(message || "处理中...");
  }

  async function runSummary(panel) {
    let streamedText = "";
    let renderTimer = 0;
    let lastRendered = "";
    let stage = "初始化";
    const loadedCacheKey = state.cacheKey;
    panel.summarizeButton.disabled = true;
    state.questionPort?.disconnect();
    state.questionPort = null;
    state.isAnswering = false;

    try {
      if (!state.videoInfo) {
        stage = "读取视频信息";
        await refreshVideoContext(panel);
      }

      const requiresTranscription = !state.subtitles.length;
      stage = requiresTranscription ? "下载并转写音频" : "准备字幕";
      const preparationStatus = requiresTranscription ? "正在准备音频转写..." : "正在准备字幕...";
      setStatus(panel, preparationStatus);
      if (requiresTranscription) renderSummaryProgress(panel, preparationStatus);
      const prepared = await prepareCurrentText(panel, (status) => {
        stage = getTranscriptionFailureStage(status);
        if (requiresTranscription) renderSummaryProgress(panel, status);
      });
      state.preparedSubtitle = prepared;
      state.qaAnchors = normalizeCachedAnchors(prepared.anchored?.anchors);
      state.transcript = prepared.transcript;
      state.cacheKey = prepared.cacheKey;
      const { subtitleEnd, anchored } = prepared;

      if (state.hasCachedSummary) {
        if (loadedCacheKey) await send("CACHE_DELETE", { key: loadedCacheKey });
        if (state.cacheKey !== loadedCacheKey) {
          await send("CACHE_DELETE", { key: state.cacheKey });
        }
        state.hasCachedSummary = false;
        state.summary = "";
        state.summaryData = null;
        state.qaHistory = [];
        state.qaDraft = "";
      }

      stage = "调用总结模型";
      setStatus(panel, `正在生成总结，已建立 ${anchored.anchors.length} 个定位锚点...`);
      renderSummaryProgress(panel, "LLM 正在生成...");
      panel.summarizeButton.disabled = true;

      const renderProgress = () => {
        renderTimer = 0;
        const partial = parsePartialSummary(streamedText);
        const resolved = resolveAnchoredSummary(partial, anchored.anchors, subtitleEnd, false);
        const signature = JSON.stringify(resolved || {});
        if (!resolved || signature === lastRendered) return;
        lastRendered = signature;
        renderSummary(panel, resolved, streamedText);
      };

      const result = await streamSummary({
        ...state.videoInfo,
        subtitleEnd,
        anchoredTranscript: anchored.text,
        firstAnchor: anchored.anchors[0].id
      }, (delta) => {
        streamedText += delta;
        if (!renderTimer) {
          renderTimer = window.setTimeout(renderProgress, 100);
        }
      });

      window.clearTimeout(renderTimer);
      streamedText = result.summary || streamedText;
      const parsed = parseSummary(streamedText);
      state.summaryData = resolveAnchoredSummary(parsed, anchored.anchors, subtitleEnd, true);
      state.summary = state.summaryData ? JSON.stringify(state.summaryData, null, 2) : streamedText;
      renderSummary(panel, state.summaryData, streamedText);
      if (state.summaryData) {
        stage = "写入总结缓存";
        await send("CACHE_SET", {
          key: state.cacheKey,
          entry: {
            summary: state.summary,
            summaryData: state.summaryData,
            qaHistory: [],
            anchors: state.qaAnchors,
            videoTitle: state.videoInfo.title,
            videoUrl: state.videoInfo.url,
            duration: state.videoInfo.duration,
            bvid: state.videoInfo.bvid,
            cid: state.videoInfo.cid,
            subtitleKey: prepared.subtitleKey,
            model: prepared.model,
            transcriptHash: prepared.transcriptHash,
            textSource: prepared.textSource || "subtitle",
            protocolVersion: SUMMARY_PROTOCOL_VERSION
          }
        });
        state.hasCachedSummary = true;
      }
      if (state.hasCachedSummary) {
        setStatus(panel, "");
      } else {
        setStatus(panel, "总结完成，但返回格式无法写入缓存。", "error");
      }
    } catch (error) {
      window.clearTimeout(renderTimer);
      const detailedError = new Error(`阶段：${stage}；${error?.message || String(error)}`);
      setStatus(panel, detailedError.message, "error");
      showSummaryFailure(panel, detailedError);
      if (!streamedText) panel.result.innerHTML = "";
    } finally {
      updateSummaryButton(panel);
    }
  }

  function updateSummaryButton(panel) {
    panel.summarizeButton.textContent = state.hasCachedSummary ? "重新总结" : "总结";
    panel.summarizeButton.disabled = state.contextLoading || !state.videoInfo;
  }

  function maybeAutoSummarize(panel) {
    if (!state.autoSummarize || state.contextLoading || !state.videoInfo || state.hasCachedSummary) return;
    if (state.autoSummaryStartedContextId === state.contextId) return;
    state.autoSummaryStartedContextId = state.contextId;
    window.setTimeout(() => {
      if (state.contextId !== state.autoSummaryStartedContextId || state.hasCachedSummary) return;
      runSummary(panel).catch((error) => showSummaryFailure(panel, error));
    }, 0);
  }

  function showSummaryFailure(panel, error) {
    const message = String(error?.message || error || "未知错误");
    setStatus(panel, message, "error");
    panel.modalTitle.textContent = "总结失败";
    panel.modalContent.innerHTML = `<div class="bsa-modal-error"><strong>本次总结没有完成</strong><p></p><button class="bsa-modal-secondary" type="button" data-action="close-modal">关闭</button></div>`;
    panel.modalContent.querySelector("p").textContent = message;
    showModal(panel);
  }

  function normalizeCachedSummaryData(data) {
    if (!data || typeof data !== "object") return null;
    return {
      ...data,
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      highlights: (Array.isArray(data.highlights) ? data.highlights : [])
        .map((highlight) => {
          if (typeof highlight === "string") {
            return { quote: highlight, start: null };
          }
          if (!highlight || typeof highlight !== "object") return null;
          return {
            ...highlight,
            quote: String(highlight.quote || ""),
            start: Number.isFinite(Number(highlight.start)) ? Number(highlight.start) : null
          };
        })
        .filter((highlight) => highlight?.quote)
    };
  }

  function renderSummary(panel, data, raw) {
    const activeTab = state.activeSummaryTab;
    panel.root.dataset.hasResult = "true";
    panel.result.innerHTML = "";

    if (!data) {
      const fallback = document.createElement("pre");
      fallback.className = "bsa-raw";
      fallback.textContent = raw || "没有生成内容";
      panel.result.appendChild(fallback);
      return;
    }

    const shell = document.createElement("div");
    shell.className = "bsa-summary-shell";

    if (data.overview) {
      const overview = document.createElement("div");
      overview.className = "bsa-overview";
      const label = document.createElement("div");
      label.className = "bsa-overview-title";
      label.textContent = "简要总结";
      const body = document.createElement("div");
      body.className = "bsa-overview-body";
      body.textContent = data.overview;
      overview.append(label, body);
      shell.appendChild(overview);
    }

    const tabs = document.createElement("div");
    tabs.className = "bsa-tabs";
    const content = document.createElement("div");
    content.className = "bsa-tab-content";
    bindSummaryScrollTracking(content);

    addTab(tabs, "chapters", "时间线");
    const chapters = document.createElement("section");
    chapters.className = "bsa-chapters";
    chapters.dataset.panel = "chapters";
    if (Array.isArray(data.chapters) && data.chapters.length) {
      state.activeChapterIndex = Math.min(state.activeChapterIndex, data.chapters.length - 1);
      if (state.compactTimeline) {
        chapters.classList.add("bsa-chapters-compact");
        const chapterTabs = document.createElement("div");
        chapterTabs.className = "bsa-chapter-tabs";
        chapterTabs.setAttribute("role", "tablist");
        const chapterPanels = document.createElement("div");
        chapterPanels.className = "bsa-compact-chapter-panels";
        data.chapters.forEach((chapter, index) => {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.className = "bsa-chapter-tab";
          tab.dataset.action = "switch-chapter";
          tab.dataset.chapterIndex = String(index);
          tab.dataset.active = index === state.activeChapterIndex ? "true" : "false";
          tab.setAttribute("role", "tab");
          tab.setAttribute("aria-selected", String(index === state.activeChapterIndex));
          tab.textContent = `第 ${index + 1} 段`;
          chapterTabs.appendChild(tab);

          const item = createChapterItem(chapter);
          item.dataset.chapterPanel = String(index);
          item.hidden = index !== state.activeChapterIndex;
          chapterPanels.appendChild(item);
        });
        chapters.append(chapterTabs, chapterPanels);
      } else {
        for (const chapter of data.chapters) chapters.appendChild(createChapterItem(chapter));
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "bsa-panel-empty";
      empty.textContent = "时间线正在生成...";
      chapters.appendChild(empty);
    }
    content.appendChild(chapters);

    addTab(tabs, "highlights", "亮点");
    const highlights = document.createElement("section");
    highlights.className = "bsa-highlights";
    highlights.dataset.panel = "highlights";
    if (Array.isArray(data.highlights) && data.highlights.length) {
      for (const highlight of data.highlights.slice(0, 6)) {
        const hasTime = Number.isFinite(highlight.start);
        const item = document.createElement("article");
        item.className = "bsa-highlight";
        if (hasTime) {
          const time = document.createElement("button");
          time.type = "button";
          time.className = "bsa-highlight-time";
          time.dataset.action = "jump";
          time.dataset.seconds = String(normalizeSeconds(highlight.start));
          time.textContent = formatTime(normalizeSeconds(highlight.start));
          item.appendChild(time);
        } else {
          item.classList.add("bsa-highlight-legacy");
        }
        const quote = document.createElement("span");
        quote.className = "bsa-highlight-quote";
        quote.textContent = String(highlight.quote || "");
        item.appendChild(quote);
        highlights.appendChild(item);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "bsa-panel-empty";
      empty.textContent = "这次总结没有生成亮点语句。";
      highlights.appendChild(empty);
    }
    content.appendChild(highlights);

    addTab(tabs, "questions", "提问");
    const questions = document.createElement("section");
    questions.className = "bsa-qa";
    questions.dataset.panel = "questions";

    const messages = document.createElement("div");
    messages.className = "bsa-qa-messages";
    bindQaScrollTracking(messages);
    questions.appendChild(messages);

    const composer = document.createElement("div");
    composer.className = "bsa-question-composer";
    const quotePreview = document.createElement("div");
    quotePreview.className = "bsa-question-quote";
    quotePreview.hidden = true;
    const quoteText = document.createElement("span");
    quoteText.className = "bsa-question-quote-text";
    const clearQuote = document.createElement("button");
    clearQuote.type = "button";
    clearQuote.className = "bsa-question-quote-clear";
    clearQuote.dataset.action = "clear-question-quote";
    clearQuote.setAttribute("aria-label", "移除引用");
    clearQuote.textContent = "×";
    quotePreview.append(quoteText, clearQuote);
    const input = document.createElement("textarea");
    input.className = "bsa-question-input";
    input.rows = 1;
    input.maxLength = 1000;
    input.placeholder = "继续询问视频内容...";
    input.setAttribute("aria-label", "询问视频内容");
    const ask = document.createElement("button");
    ask.type = "button";
    ask.className = "bsa-question-send";
    ask.dataset.action = "ask-question";
    ask.textContent = state.isAnswering ? "回答中" : "发送";
    ask.disabled = state.isAnswering;
    composer.append(quotePreview, input, ask);
    questions.appendChild(composer);
    content.appendChild(questions);

    shell.append(tabs, content);
    panel.result.appendChild(shell);
    renderQaMessages(panel);
    renderQuestionQuote(panel);
    switchTab(panel, ["chapters", "highlights", "questions"].includes(activeTab) ? activeTab : "chapters");
    nudgeBilibiliLayout();
  }

  function bindSummaryScrollTracking(container) {
    container.addEventListener("scroll", () => {
      if (!container.isConnected || state.activeSummaryTab === "questions") return;
      state.summaryScrollPositions[state.activeSummaryTab] = container.scrollTop;
    }, { passive: true });
  }

  function renderQaMessages(panel) {
    const container = panel.root.querySelector(".bsa-qa-messages");
    if (!container) return;
    const shouldFollowOutput = state.qaAutoScroll;
    const preservedScrollTop = state.qaScrollTop;
    state.qaScrollSync = true;
    container.innerHTML = "";

    if (!state.qaHistory.length && !state.qaDraft) {
      const empty = document.createElement("div");
      empty.className = "bsa-qa-empty";
      empty.textContent = "可以根据视频总结和字幕继续提问，回答中的时间点可直接跳转。";
      container.appendChild(empty);
      finishQaScrollRender(container, false, 0);
      return;
    }

    for (const message of state.qaHistory) {
      appendQaMessage(container, message.role, message.content, message.quote);
    }
    if (state.qaDraft || state.isAnswering) {
      appendQaMessage(container, "assistant", state.qaDraft || "正在思考...");
    }
    finishQaScrollRender(container, shouldFollowOutput, preservedScrollTop);
  }

  function bindQaScrollTracking(container) {
    container.addEventListener("wheel", (event) => {
      if (event.deltaY < 0) state.qaAutoScroll = false;
    }, { passive: true });
    container.addEventListener("scroll", () => {
      if (state.qaScrollSync && state.qaAutoScroll) return;
      state.qaScrollTop = container.scrollTop;
      state.qaAutoScroll = isQaNearBottom(container);
    }, { passive: true });
  }

  function finishQaScrollRender(container, shouldFollowOutput, preservedScrollTop) {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = shouldFollowOutput
      ? maxScrollTop
      : Math.min(Math.max(0, preservedScrollTop), maxScrollTop);
    state.qaScrollTop = container.scrollTop;
    cancelAnimationFrame(state.qaScrollReleaseFrame);
    state.qaScrollReleaseFrame = requestAnimationFrame(() => {
      state.qaScrollSync = false;
      state.qaScrollTop = container.scrollTop;
      if (shouldFollowOutput) state.qaAutoScroll = isQaNearBottom(container);
    });
  }

  function isQaNearBottom(container) {
    return container.scrollHeight - container.clientHeight - container.scrollTop <= 32;
  }

  function appendQaMessage(container, role, text, quote = "") {
    const message = document.createElement("div");
    message.className = `bsa-qa-message bsa-qa-message-${role === "user" ? "user" : "assistant"}`;
    if (role === "user" && quote) {
      const quoted = document.createElement("div");
      quoted.className = "bsa-qa-message-quote";
      quoted.textContent = quote;
      message.appendChild(quoted);
    }
    const label = document.createElement("div");
    label.className = "bsa-qa-role";
    label.textContent = role === "user" ? "你" : "回答";
    const body = document.createElement("div");
    body.className = "bsa-qa-answer";
    appendAnswerWithAnchors(body, text);
    message.append(label, body);
    container.appendChild(message);
  }

  function appendAnswerWithAnchors(container, text) {
    const source = String(text || "");
    const availableAnchors = state.preparedSubtitle?.anchored?.anchors?.length
      ? state.preparedSubtitle.anchored.anchors
      : state.qaAnchors;
    const anchorTimes = new Map((availableAnchors || []).map((anchor) => [anchor.id, anchor.seconds]));
    const pattern = /\[(T\d{3,})\]/gi;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(source))) {
      if (match.index > cursor) container.appendChild(document.createTextNode(source.slice(cursor, match.index)));
      const id = match[1].toUpperCase();
      if (anchorTimes.has(id)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bsa-answer-time";
        button.dataset.action = "jump";
        button.dataset.seconds = String(anchorTimes.get(id));
        button.textContent = formatTime(anchorTimes.get(id));
        container.appendChild(button);
      } else {
        container.appendChild(document.createTextNode(match[0]));
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < source.length) container.appendChild(document.createTextNode(source.slice(cursor)));
  }

  function addTab(container, id, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bsa-tab";
    button.dataset.action = "switch-tab";
    button.dataset.tab = id;
    button.textContent = label;
    container.appendChild(button);
  }

  function createChapterItem(chapter) {
    const start = normalizeSeconds(chapter.start);
    const end = normalizeSeconds(chapter.end);
    const item = document.createElement("article");
    item.className = "bsa-chapter";

    const time = document.createElement("button");
    time.type = "button";
    time.className = "bsa-chapter-time";
    time.dataset.action = "jump";
    time.dataset.seconds = String(start);
    time.textContent = end > start ? `${formatTime(start)}-${formatTime(end)}` : formatTime(start);

    const chapterContent = document.createElement("span");
    chapterContent.className = "bsa-chapter-content";
    const title = document.createElement("span");
    title.className = "bsa-chapter-title";
    title.textContent = chapter.title || "片段";
    const summary = document.createElement("span");
    summary.className = "bsa-chapter-summary";
    summary.textContent = chapter.summary || "";
    chapterContent.append(title, summary);
    item.append(time, chapterContent);
    return item;
  }

  function switchCompactChapter(panel, index) {
    const chapterPanels = [...panel.root.querySelectorAll("[data-chapter-panel]")];
    if (!chapterPanels.length) return;
    state.activeChapterIndex = Math.min(Math.max(index, 0), chapterPanels.length - 1);
    for (const tab of panel.root.querySelectorAll(".bsa-chapter-tab")) {
      const active = Number(tab.dataset.chapterIndex) === state.activeChapterIndex;
      tab.dataset.active = active ? "true" : "false";
      tab.setAttribute("aria-selected", String(active));
    }
    for (const chapterPanel of chapterPanels) {
      chapterPanel.hidden = Number(chapterPanel.dataset.chapterPanel) !== state.activeChapterIndex;
    }
  }

  function switchTab(panel, id) {
    const content = panel.root.querySelector(".bsa-tab-content");
    const previousTab = panel.root.querySelector('.bsa-tab[data-active="true"]')?.dataset.tab;
    if (content && previousTab && previousTab !== "questions") {
      state.summaryScrollPositions[previousTab] = content.scrollTop;
    }
    for (const tab of panel.root.querySelectorAll(".bsa-tab")) {
      tab.dataset.active = tab.dataset.tab === id ? "true" : "false";
    }
    for (const section of panel.root.querySelectorAll("[data-panel]")) {
      section.hidden = section.dataset.panel !== id;
    }
    state.activeSummaryTab = id;
    if (id === "questions") {
      if (content) content.scrollTop = 0;
      requestAnimationFrame(() => renderQaMessages(panel));
      return;
    }
    if (content) {
      const target = Number(state.summaryScrollPositions[id] || 0);
      const maximum = Math.max(0, content.scrollHeight - content.clientHeight);
      content.scrollTop = Math.min(Math.max(0, target), maximum);
    }
  }

  function parseSummary(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      const match = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
      if (!match) return null;
      try {
        return JSON.parse(match[1]);
      } catch (_nestedError) {
        return null;
      }
    }
  }

  function parsePartialSummary(text) {
    if (!text) return null;
    const overview = extractCompleteJsonValue(text, "overview");
    const chapters = extractCompleteArrayObjects(text, "chapters");
    const highlights = extractCompleteJsonValue(text, "highlights");
    if (overview === undefined && !chapters.length && highlights === undefined) {
      return null;
    }
    return {
      overview: typeof overview === "string" ? overview : "",
      chapters,
      highlights: Array.isArray(highlights) ? highlights : []
    };
  }

  function extractCompleteJsonValue(text, key) {
    const keyIndex = text.indexOf(`"${key}"`);
    if (keyIndex < 0) return undefined;
    const colonIndex = text.indexOf(":", keyIndex + key.length + 2);
    if (colonIndex < 0) return undefined;

    let start = colonIndex + 1;
    while (/\s/.test(text[start] || "")) start += 1;
    const first = text[start];
    if (!first) return undefined;

    let inString = false;
    let escaped = false;
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
          if (first === '"') {
            try {
              return JSON.parse(text.slice(start, index + 1));
            } catch (_error) {
              return undefined;
            }
          }
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "[" || char === "{") {
        depth += 1;
      } else if (char === "]" || char === "}") {
        depth -= 1;
        if (depth === 0 && (first === "[" || first === "{")) {
          try {
            return JSON.parse(text.slice(start, index + 1));
          } catch (_error) {
            return undefined;
          }
        }
      }
    }
    return undefined;
  }

  function extractCompleteArrayObjects(text, key) {
    const keyIndex = text.indexOf(`"${key}"`);
    if (keyIndex < 0) return [];
    const arrayStart = text.indexOf("[", keyIndex + key.length + 2);
    if (arrayStart < 0) return [];

    const objects = [];
    let objectStart = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = arrayStart + 1; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        if (depth === 0) objectStart = index;
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0 && objectStart >= 0) {
          try {
            objects.push(JSON.parse(text.slice(objectStart, index + 1)));
          } catch (_error) {
            // Ignore an incomplete object and continue streaming.
          }
          objectStart = -1;
        }
      } else if (char === "]" && depth === 0) {
        break;
      }
    }
    return objects;
  }

  function jumpTo(seconds) {
    const video = document.querySelector("video");
    if (!video) {
      setStatus(panel, "没有找到播放器。", "error");
      return;
    }
    video.currentTime = Math.max(0, seconds);
    video.play().catch(() => {});
    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  }

  function getVideoRouteKey() {
    const url = new URL(location.href);
    const pathBvid = url.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] || "";
    const queryBvid = url.searchParams.get("bvid") || "";
    const page = url.searchParams.get("p") || "1";
    const oid = url.searchParams.get("oid") || "";
    return [url.pathname, pathBvid || queryBvid, page, oid].join("|");
  }

  function getBvid() {
    const match = location.href.match(/\/video\/(BV[a-zA-Z0-9]+)/);
    if (match) return match[1];
    const queryBvid = new URL(location.href).searchParams.get("bvid");
    if (queryBvid && /^BV[a-zA-Z0-9]+$/.test(queryBvid)) return queryBvid;
    const stateBvid = window.__INITIAL_STATE__?.bvid || window.__INITIAL_STATE__?.videoData?.bvid;
    return stateBvid || "";
  }

  function getPageIndex() {
    const p = Number(new URL(location.href).searchParams.get("p") || "1");
    return Number.isFinite(p) && p > 0 ? p : 1;
  }

  function normalizeSubtitleUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return `https:${url}`;
    return url;
  }

  function subtitleToText(json) {
    const body = Array.isArray(json?.body) ? json.body : [];
    return body
      .map((line) => {
        const time = formatTime(Number(line.from || 0));
        const content = String(line.content || "").trim();
        return content ? `[${time}] ${content}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function buildAnchoredTranscript(json, targetEnd) {
    const lines = (Array.isArray(json?.body) ? json.body : [])
      .map((line) => ({
        from: Math.max(0, Number(line.from || 0)),
        to: Math.max(0, Number(line.to || line.from || 0)),
        content: String(line.content || "").trim()
      }))
      .filter((line) => line.content)
      .sort((a, b) => a.from - b.from);

    if (!lines.length) return { text: "", anchors: [] };

    const duration = Number(targetEnd || lines[lines.length - 1].to || 0);
    const maxGap = duration <= 15 * 60 ? 15 : duration <= 45 * 60 ? 25 : 40;
    const minGap = Math.max(8, Math.floor(maxGap * 0.4));
    const transitionPattern = /^(首先|第一|第二|第三|然后|接下来|另外|但是|不过|所以|因此|总之|总结|最后|举个例子|比如|回到|换句话说|也就是说|重点是|再来看|下面)/;
    const anchors = [];
    const output = [];
    let lastAnchorAt = -Infinity;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const previous = lines[index - 1];
      const elapsed = line.from - lastAnchorAt;
      const hasNaturalBoundary = transitionPattern.test(line.content)
        || (previous && line.from - previous.to >= 1.8);
      const shouldAnchor = index === 0
        || elapsed >= maxGap
        || (elapsed >= minGap && hasNaturalBoundary);

      if (shouldAnchor) {
        const id = `T${String(anchors.length + 1).padStart(3, "0")}`;
        const seconds = index === 0 ? 0 : line.from;
        anchors.push({ id, seconds, lineIndex: index });
        output.push(`[${id} ${formatTime(seconds)}]`);
        lastAnchorAt = line.from;
      }

      output.push(line.content);
    }

    return { text: output.join("\n"), anchors };
  }

  function getSubtitleEndSeconds(json) {
    const body = Array.isArray(json?.body) ? json.body : [];
    return body.reduce((max, line) => Math.max(max, Number(line.to || line.from || 0)), 0);
  }

  function resolveAnchoredSummary(data, anchors, targetEnd, isFinal) {
    if (!data) return null;

    const anchorTimes = new Map(anchors.map((anchor) => [anchor.id, Math.floor(anchor.seconds)]));
    const seenStarts = new Set();
    let chapters = (Array.isArray(data.chapters) ? data.chapters : [])
      .map((chapter) => {
        const anchorId = String(chapter.start_anchor || "").trim().toUpperCase();
        if (!anchorTimes.has(anchorId)) return null;
        return {
          start_anchor: anchorId,
          start: anchorTimes.get(anchorId),
          title: String(chapter.title || "片段"),
          summary: String(chapter.summary || "")
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start)
      .filter((chapter) => {
        if (seenStarts.has(chapter.start)) return false;
        seenStarts.add(chapter.start);
        return true;
      });

    for (let index = 0; index < chapters.length; index += 1) {
      const nextStart = chapters[index + 1]?.start;
      chapters[index].end = Number.isFinite(nextStart)
        ? nextStart
        : isFinal ? Math.max(chapters[index].start, Math.floor(Number(targetEnd || 0))) : chapters[index].start;
    }

    if (isFinal) chapters = mergeShortChapters(chapters, targetEnd);

    return {
      overview: data.overview || "",
      highlights: resolveHighlights(data.highlights, anchorTimes),
      chapters,
    };
  }

  function mergeShortChapters(chapters, targetEnd) {
    const duration = Math.max(0, Math.floor(Number(targetEnd || 0)));
    if (chapters.length < 2 || !duration) return chapters;

    const limits = getChapterLimits(duration);
    const merged = chapters.map((chapter) => ({ ...chapter }));

    while (merged.length > 1) {
      for (let index = 0; index < merged.length; index += 1) {
        merged[index].end = merged[index + 1]?.start ?? duration;
      }

      const durations = merged.map((chapter) => Math.max(0, chapter.end - chapter.start));
      const shortestDuration = Math.min(...durations);
      if (merged.length <= limits.maxChapters && shortestDuration >= limits.minSeconds) break;

      const shortIndex = durations.indexOf(shortestDuration);
      if (shortIndex === 0) {
        const opening = merged[0];
        const next = merged[1];
        merged.splice(0, 2, {
          ...next,
          start_anchor: opening.start_anchor,
          start: opening.start,
          summary: joinChapterSummaries(opening.summary, next.summary)
        });
      } else {
        const previous = merged[shortIndex - 1];
        const current = merged[shortIndex];
        previous.summary = joinChapterSummaries(previous.summary, current.summary);
        merged.splice(shortIndex, 1);
      }
    }

    for (let index = 0; index < merged.length; index += 1) {
      merged[index].end = merged[index + 1]?.start ?? duration;
    }
    return merged;
  }

  function getChapterLimits(duration) {
    if (duration <= 10 * 60) {
      return { minSeconds: Math.max(60, Math.floor(duration / 7)), maxChapters: 5 };
    }
    if (duration <= 30 * 60) {
      return { minSeconds: Math.max(120, Math.floor(duration / 10)), maxChapters: 8 };
    }
    if (duration <= 60 * 60) {
      return { minSeconds: Math.max(150, Math.floor(duration / 12)), maxChapters: 10 };
    }
    return { minSeconds: Math.max(180, Math.floor(duration / 14)), maxChapters: 12 };
  }

  function joinChapterSummaries(first, second) {
    return [first, second]
      .map((summary) => String(summary || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  async function runQuestion(panel) {
    if (state.isAnswering) return;
    if (!state.summaryData) throw new Error("请先生成视频总结");
    const input = panel.root.querySelector(".bsa-question-input");
    const question = String(input?.value || "").trim();
    if (!question) {
      input?.focus();
      return;
    }

    const prepared = state.preparedSubtitle || await prepareCurrentText(panel);
    state.preparedSubtitle = prepared;
    const previousHistory = state.qaHistory.slice(-6).map((message) => ({
      role: message.role,
      content: formatQaMessageForModel(message)
    }));
    const quote = String(state.questionQuote || "").trim();
    state.qaHistory.push({ role: "user", content: question, quote, createdAt: Date.now() });
    state.qaDraft = "";
    state.questionQuote = "";
    state.qaAutoScroll = true;
    state.isAnswering = true;
    input.value = "";
    renderQuestionQuote(panel);
    const sendButton = panel.root.querySelector(".bsa-question-send");
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = "回答中";
    }
    renderQaMessages(panel);
    setStatus(panel, "正在根据总结和相关字幕回答...");

    try {
      const result = await streamQuestion({
        title: state.videoInfo?.title || "",
        summary: state.summaryData,
        relevantTranscript: selectRelevantTranscript(prepared.anchored.text, question),
        history: previousHistory,
        question,
        quote
      }, (delta) => {
        state.qaDraft += delta;
        renderQaMessages(panel);
      });

      const answer = String(result.answer || state.qaDraft || "").trim();
      if (!answer) throw new Error("LLM API 返回了空回答");
      state.qaHistory.push({ role: "assistant", content: answer, createdAt: Date.now() });
      state.qaHistory = sanitizeQaHistory(state.qaHistory).slice(-20);
      state.qaDraft = "";
      try {
        await send("CACHE_PATCH", { key: state.cacheKey, patch: { qaHistory: state.qaHistory } });
        setStatus(panel, "");
      } catch (cacheError) {
        setStatus(panel, `回答完成，但缓存失败：${cacheError.message}`, "error");
      }
    } catch (error) {
      state.qaDraft = state.qaDraft || `回答失败：${error.message}`;
      setStatus(panel, error.message, "error");
    } finally {
      state.isAnswering = false;
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = "发送";
      }
      renderQaMessages(panel);
    }
  }

  function sanitizeQaHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter((item) => ["user", "assistant"].includes(item?.role) && String(item?.content || "").trim())
      .map((item) => ({
        role: item.role,
        content: String(item.content).slice(0, item.role === "user" ? 1000 : 6000),
        quote: item.role === "user" ? String(item.quote || "").slice(0, 2000) : "",
        createdAt: Number(item.createdAt || Date.now())
      }))
      .slice(-20);
  }

  function formatQaMessageForModel(message) {
    const content = String(message?.content || "");
    const quote = message?.role === "user" ? String(message.quote || "").trim() : "";
    return quote ? `引用的视频内容：\n“${quote}”\n\n问题：${content}` : content;
  }

  function selectRelevantTranscript(anchoredTranscript, question, maxChars = 16000) {
    const segments = splitAnchoredTranscript(anchoredTranscript);
    if (!segments.length) return String(anchoredTranscript || "").slice(0, maxChars);
    const terms = buildSearchTerms(question);
    const ranked = segments
      .map((segment, index) => ({ index, score: scoreTranscriptSegment(segment.text, terms) }))
      .sort((a, b) => b.score - a.score);
    const selected = new Set();
    const positive = ranked.filter((item) => item.score > 0).slice(0, 8);

    if (positive.length) {
      for (const item of positive) {
        selected.add(item.index);
        if (item.index > 0) selected.add(item.index - 1);
        if (item.index + 1 < segments.length) selected.add(item.index + 1);
      }
    } else {
      const sampleCount = Math.min(8, segments.length);
      for (let index = 0; index < sampleCount; index += 1) {
        selected.add(Math.floor(index * (segments.length - 1) / Math.max(1, sampleCount - 1)));
      }
    }

    let output = "";
    for (const index of [...selected].sort((a, b) => a - b)) {
      const next = `${segments[index].text.trim()}\n`;
      if (output.length + next.length > maxChars) break;
      output += next;
    }
    return output.trim();
  }

  function splitAnchoredTranscript(text) {
    const segments = [];
    let current = null;
    for (const line of String(text || "").split("\n")) {
      if (/^\[T\d+\s+[^\]]+\]$/.test(line.trim())) {
        if (current) segments.push(current);
        current = { text: line };
      } else if (current) {
        current.text += `\n${line}`;
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  function buildSearchTerms(question) {
    const source = String(question || "").toLocaleLowerCase();
    const stopWords = new Set(["什么", "为什么", "怎么", "如何", "是否", "哪些", "哪个", "这个", "视频", "里面", "讲了", "认为", "提到"]);
    const terms = new Set(source.match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu) || []);
    for (const phrase of [...terms]) {
      if (/[\p{Script=Han}]/u.test(phrase) && phrase.length > 2) {
        for (let index = 0; index < phrase.length - 1; index += 1) terms.add(phrase.slice(index, index + 2));
      }
    }
    return [...terms].filter((term) => !stopWords.has(term));
  }

  function scoreTranscriptSegment(text, terms) {
    const source = String(text || "").toLocaleLowerCase();
    return terms.reduce((score, term) => {
      const matches = source.split(term).length - 1;
      return score + matches * Math.max(1, Math.min(6, term.length));
    }, 0);
  }

  function resolveHighlights(highlights, anchorTimes) {
    if (!Array.isArray(highlights)) return [];
    const seen = new Set();
    return highlights
      .map((highlight) => {
        if (!highlight || typeof highlight !== "object") return null;
        const anchorId = String(highlight.start_anchor || "").trim().toUpperCase();
        const quote = String(highlight.quote || "").replace(/\s+/g, " ").trim();
        if (!anchorTimes.has(anchorId) || !quote) return null;
        const normalized = normalizeQuoteText(quote);
        if (!normalized || seen.has(normalized)) return null;
        seen.add(normalized);
        return {
          start_anchor: anchorId,
          start: anchorTimes.get(anchorId),
          quote
        };
      })
      .filter(Boolean)
      .slice(0, 6);
  }

  function normalizeQuoteText(text) {
    return Array.from(String(text || ""))
      .filter((char) => /[\p{L}\p{N}]/u.test(char))
      .join("")
      .toLocaleLowerCase();
  }

  function normalizeSeconds(value) {
    if (typeof value === "number") return Math.max(0, Math.floor(value));
    const text = String(value || "0").trim();
    if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.floor(Number(text)));
    const parts = text.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function send(type, payload = {}) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type, ...payload });
    } catch (error) {
      if (recoverInvalidExtensionContext(error)) return new Promise(() => {});
      throw error;
    }
    if (!response?.ok) {
      throw new Error(response?.error || "插件通信失败");
    }
    return response.data;
  }

  function installExtensionContextRecovery() {
    window.addEventListener("unhandledrejection", (event) => {
      if (!recoverInvalidExtensionContext(event.reason)) return;
      event.preventDefault();
    });
    window.addEventListener("error", (event) => {
      if (!recoverInvalidExtensionContext(event.error || event.message)) return;
      event.preventDefault();
    });
  }

  function recoverInvalidExtensionContext(error) {
    const message = String(error?.message || error || "");
    if (!/extension context invalidated|message port closed|receiving end does not exist/i.test(message)) {
      return false;
    }
    if (window.__bsaContextRecoveryStarted) return true;
    window.__bsaContextRecoveryStarted = true;
    const currentRoot = document.getElementById("bsa-root");
    if (currentRoot) currentRoot.style.pointerEvents = "none";
    setTimeout(() => window.location.reload(), 0);
    return true;
  }

  function streamSummary(payload, onDelta) {
    return streamOperation("BSA_SUMMARY_STREAM", "summaryPort", payload, onDelta, "总结");
  }

  function streamQuestion(payload, onDelta) {
    return streamOperation("BSA_QA_STREAM", "questionPort", payload, onDelta, "问答");
  }

  function streamTranscription(payload, onStatus) {
    return streamOperation("BSA_TRANSCRIBE_STREAM", "transcribePort", payload, onStatus, "转写");
  }

  function streamOperation(portName, stateKey, payload, onDelta, label) {
    state[stateKey]?.disconnect();
    let port;
    try {
      port = chrome.runtime.connect({ name: portName });
    } catch (error) {
      if (recoverInvalidExtensionContext(error)) return new Promise(() => {});
      return Promise.reject(error);
    }
    state[stateKey] = port;

    return new Promise((resolve, reject) => {
      let settled = false;
      const heartbeat = window.setInterval(() => {
        if (settled) return;
        try {
          port.postMessage({ type: "PING" });
        } catch (error) {
          if (recoverInvalidExtensionContext(error)) settled = true;
        }
      }, 15000);

      const finish = () => {
        window.clearInterval(heartbeat);
        if (state[stateKey] === port) state[stateKey] = null;
      };

      port.onMessage.addListener((message) => {
        if (message?.type === "DELTA") {
          onDelta(String(message.delta || ""));
          return;
        }
        if (message?.type === "DONE") {
          settled = true;
          finish();
          resolve(message.data || {});
          port.disconnect();
          return;
        }
        if (message?.type === "ERROR") {
          settled = true;
          finish();
          reject(new Error(message.error || `${label}流式请求失败`));
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        finish();
        if (settled) return;
        settled = true;
        const error = chrome.runtime.lastError;
        if (recoverInvalidExtensionContext(error)) return;
        reject(new Error(error?.message || `${label}连接意外中断，请重试`));
      });

      try {
        port.postMessage({ type: "START", payload });
      } catch (error) {
        settled = true;
        finish();
        if (recoverInvalidExtensionContext(error)) return;
        reject(error);
      }
    });
  }

  function setStatus(panel, text, tone = "") {
    panel.status.textContent = text;
    panel.status.dataset.tone = tone;
    if (text && tone === "error") panel.root.dataset.hasError = "true";
    else delete panel.root.dataset.hasError;
  }

  function nudgeBilibiliLayout() {
    const run = () => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
      document.dispatchEvent(new Event("scroll", { bubbles: true }));
    };

    requestAnimationFrame(run);
    setTimeout(run, 250);
  }
})();
