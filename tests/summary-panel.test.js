const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
const functions = ["bindSummaryScrollTracking", "switchTab"]
  .map((name) => {
    const start = source.indexOf(`  function ${name}(`);
    assert.notEqual(start, -1, `Missing ${name}`);
    return source.slice(start, source.indexOf("\n  function ", start + 1));
  }).join("\n");

const state = {
  activeSummaryTab: "chapters",
  summaryScrollPositions: { chapters: 180, highlights: 45 }
};
const context = { state, requestAnimationFrame() {}, renderQaMessages() {} };
vm.runInNewContext(functions, context);

function fixture() {
  const listeners = {};
  const content = {
    isConnected: true,
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 300,
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  const tabs = ["chapters", "highlights", "questions"].map((id) => ({
    dataset: { tab: id, active: "false" }
  }));
  const panels = ["chapters", "highlights", "questions"].map((id) => ({
    dataset: { panel: id },
    hidden: true
  }));
  const root = {
    querySelector(selector) {
      if (selector === ".bsa-tab-content") return content;
      if (selector === '.bsa-tab[data-active="true"]') {
        return tabs.find((tab) => tab.dataset.active === "true") || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".bsa-tab") return tabs;
      if (selector === "[data-panel]") return panels;
      return [];
    }
  };
  return { panel: { root }, content, tabs, panels, listeners };
}

const first = fixture();
context.bindSummaryScrollTracking(first.content);
context.switchTab(first.panel, "chapters");
assert.equal(first.content.scrollTop, 180);

first.content.scrollTop = 260;
first.listeners.scroll();
context.switchTab(first.panel, "highlights");
assert.equal(state.summaryScrollPositions.chapters, 260);
assert.equal(first.content.scrollTop, 45);

first.content.scrollTop = 95;
first.listeners.scroll();
const replacement = fixture();
context.bindSummaryScrollTracking(replacement.content);
context.switchTab(replacement.panel, "highlights");
assert.equal(replacement.content.scrollTop, 95);
assert.equal(replacement.panels.find((panel) => panel.dataset.panel === "highlights").hidden, false);

const css = fs.readFileSync(path.join(__dirname, "../src/content.css"), "utf8");
assert.match(css, /\.bsa-qa\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto;/);
assert.doesNotMatch(css, /\.bsa-qa\s*\{[\s\S]*?grid-template-rows:\s*minmax\(120px, 1fr\) auto;/);
assert.match(css, /#bsa-root\[data-has-result="true"\]:not\(\[data-collapsed="true"\]\) \.bsa-card\s*\{[\s\S]*?height:\s*var\(--bsa-panel-max-height\)/);
assert.match(css, /\.bsa-summary-shell\s*\{[\s\S]*?height:\s*100%/);
assert.match(css, /\.bsa-tab-content:has\(\.bsa-qa:not\(\[hidden\]\)\)\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
assert.match(css, /\.bsa-qa:not\(\[hidden\]\)\s*\{[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*1 1 auto;/);

console.log("summary panel tests passed");
