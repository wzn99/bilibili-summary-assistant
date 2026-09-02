const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
const functions = ["mountPanel", "applyPortalReservation", "clearPortalReservation", "positionPortalPanel"]
  .map((name) => {
    const start = source.indexOf(`  function ${name}(`);
    assert.notEqual(start, -1, `Missing ${name}`);
    return source.slice(start, source.indexOf("\n  function ", start + 1));
  }).join("\n");

function style() {
  return {
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { delete this[name]; }
  };
}

function fixture() {
  const geometry = { originX: 0, originY: 0, scrollX: 0, scrollY: 0, width: 400, height: 480.4 };
  const body = {};
  const root = {
    parentElement: body,
    style: style(),
    dataset: {},
    getBoundingClientRect() {
      return {
        left: geometry.originX + (parseFloat(this.style.left) || 0) - geometry.scrollX,
        top: geometry.originY + (parseFloat(this.style.top) || 0) - geometry.scrollY,
        // Simulate line wrapping while the initial width is still 360px.
        height: parseFloat(this.style.width) === geometry.width ? geometry.height : geometry.height + 100
      };
    }
  };
  const author = {
    parentElement: {}, style: style(), dataset: {},
    getBoundingClientRect() {
      const reservation = this.dataset.bsaPortalReserve === "summary-first"
        ? parseFloat(this.style["--bsa-portal-space"]) || 0 : 0;
      const top = 20 + reservation - geometry.scrollY;
      return { top, bottom: top + 80, left: 900 - geometry.scrollX, width: geometry.width };
    }
  };
  const state = {
    displaySettingsLoaded: true, sidebarOrder: "summary-first", panelMaxHeight: 640,
    portalLayoutObserver: { disconnect() {}, observe() {} }
  };
  const context = {
    state, panel: { root }, document: { body },
    findAuthorSection: () => author,
    isRightAlignedContainer: () => true,
    getComputedStyle: () => ({ marginTop: "0px", marginBottom: "0px" })
  };
  vm.runInNewContext(functions, context);
  return { geometry, root, state, mount: () => context.mountPanel(context.panel) };
}

const f = fixture();
function assertAligned(expectedTop = 20) {
  const rect = f.root.getBoundingClientRect();
  assert.equal(rect.top, expectedTop - f.geometry.scrollY);
  assert.equal(rect.left, 900 - f.geometry.scrollX);
}

// First placement must measure at the final width, including fractional heights.
f.mount();
assertAligned();
for (let i = 0; i < 5; i++) f.mount();
assertAligned();

// A late host layout change must not add the body's offset a second time.
f.geometry.originY = 64;
f.geometry.originX = 8;
f.mount();
assertAligned();

// Scrolling, streaming result growth, resizing and collapsing keep the top stable.
f.geometry.scrollY = 300;
f.geometry.scrollX = 12;
f.geometry.height = 600;
f.geometry.width = 420;
f.mount();
assertAligned();
f.geometry.height = 48;
f.mount();
assertAligned();

// Both order settings and returning to an unpositioned body are supported.
f.state.sidebarOrder = "author-first";
f.mount();
assertAligned(112);
f.geometry.originY = 0;
f.state.sidebarOrder = "summary-first";
f.mount();
assertAligned();

console.log("panel placement tests passed");
