// Only the opt-in flag crosses into the page world; no settings or credentials do.
(() => {
  const attribute = "data-bsa-comment-info";
  let revision = 0;
  function apply(enabled) {
    document.documentElement?.setAttribute(attribute, enabled === true ? "true" : "false");
  }
  async function load() {
    const current = ++revision;
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      if (current === revision) apply(response?.ok && response.data?.commentInfoEnabled === true);
    } catch {
      if (current === revision) apply(false);
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.commentInfoEnabled) return;
    revision++;
    apply(changes.commentInfoEnabled.newValue === true);
  });
  document.addEventListener("DOMContentLoaded", load, { once: true });
  window.addEventListener("pageshow", load);
  void load();
})();
