// MAIN world is required to read Lit's public comment data, not extension secrets.
(() => {
  const attribute = "data-bsa-comment-info";
  const badges = new Map();
  let timer = 0;

  function fields(data) {
    const sex = data?.member?.sex;
    const raw = data?.reply_control?.location;
    return {
      sex: sex === "男" || sex === "女" ? sex : "",
      location: typeof raw === "string" ? raw.replace(/^IP\s*属地\s*[:：]?\s*/i, "").trim().slice(0, 80) : ""
    };
  }

  function render(host, inheritedData) {
    const root = host.shadowRoot;
    const anchor = root?.querySelector("#user-name");
    const data = host.__data?.member ? host.__data : inheritedData;
    const info = fields(data);
    let badge = badges.get(host);
    if (!anchor || (!info.sex && !info.location)) {
      badge?.remove();
      badges.delete(host);
      return;
    }
    const signature = JSON.stringify(info);
    if (badge?.isConnected && badge.previousSibling === anchor && badge.dataset.info === signature) return;
    badge?.remove();
    badge = document.createElement("span");
    badge.className = "bsa-comment-info";
    badge.dataset.info = signature;
    badge.style.cssText = "display:inline-flex;align-items:center;gap:5px;margin-inline:5px;font-size:12px;line-height:1.5;vertical-align:middle;white-space:nowrap;font-weight:normal;";
    if (info.sex) {
      const gender = document.createElement("span");
      gender.textContent = info.sex === "男" ? "♂" : "♀";
      gender.title = `公开性别：${info.sex}`;
      gender.setAttribute("aria-label", gender.title);
      gender.style.cssText = `font-size:14px;color:${info.sex === "男" ? "#00a1d6" : "#fb7299"};`;
      badge.append(gender);
    }
    if (info.location) {
      const region = document.createElement("span");
      region.textContent = info.location;
      region.title = `IP 属地：${info.location}（B站提供）`;
      region.style.cssText = "padding:0 4px;border-radius:3px;color:var(--bili-comment-text3-color, #888);background:var(--bili-comment-bg2, rgba(128,128,128,.12));";
      badge.append(region);
    }
    anchor.after(badge);
    badges.set(host, badge);
  }

  function visit(root, inheritedData) {
    // Read only inside comment components. Never hook fetch, attachShadow or Vue.
    for (const host of root.querySelectorAll("*")) {
      if (!host.shadowRoot || !host.localName.startsWith("bili-")) continue;
      const isComment = /^(bili-comment-thread-renderer|bili-comment-renderer|bili-comment-reply-renderer)$/.test(host.localName);
      const data = host.__data?.member ? host.__data : isComment ? null : inheritedData;
      if (host.localName === "bili-comment-user-info") render(host, data);
      else visit(host.shadowRoot, data);
    }
  }

  function scan() {
    if (document.hidden) return;
    for (const [host, badge] of badges) {
      if (!host.isConnected) {
        badge.remove();
        badges.delete(host);
      }
    }
    for (const comments of document.querySelectorAll("bili-comments")) {
      if (comments.shadowRoot) visit(comments.shadowRoot, null);
    }
  }

  function update() {
    const enabled = document.documentElement?.getAttribute(attribute) === "true";
    clearInterval(timer);
    timer = 0;
    if (enabled) {
      scan();
      // Bounded polling handles late shadow roots and reused comment nodes without
      // a document-wide subtree observer or a self-triggering mutation loop.
      timer = setInterval(scan, 1200);
    } else {
      for (const badge of badges.values()) badge.remove();
      badges.clear();
    }
  }

  function start() {
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: [attribute] });
    update();
  }
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
  window.addEventListener("pagehide", () => clearInterval(timer));
  window.addEventListener("pageshow", update);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.documentElement?.getAttribute(attribute) === "true") scan();
  });
})();
