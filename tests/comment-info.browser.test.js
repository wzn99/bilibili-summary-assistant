const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<main><bili-comments></bili-comments></main>');
    await page.evaluate(() => {
      window.originalFetch = window.fetch;
      window.originalShadow = Element.prototype.attachShadow;
      window.makeComment = (parent, sex, location, reply = false) => {
        const renderer = document.createElement(reply ? "bili-comment-reply-renderer" : "bili-comment-renderer");
        renderer.__data = { member: { sex }, reply_control: { location } };
        parent.append(renderer);
        const root = renderer.attachShadow({ mode: "open" });
        root.innerHTML = '<div id="header"><bili-comment-user-info></bili-comment-user-info></div><p>Comment text</p>';
        const info = root.querySelector("bili-comment-user-info");
        const userRoot = info.attachShadow({ mode: "open" });
        userRoot.innerHTML = '<style>:host{display:inline-flex;align-items:center;font:14px sans-serif}a{color:#fb7299}#level{color:#ff5151}</style><span id="user-name"><a href="#profile">Username</a></span><span id="level">LV6</span>';
        return renderer;
      };
      const comments = document.querySelector("bili-comments").attachShadow({ mode: "open" });
      const thread = document.createElement("bili-comment-thread-renderer");
      comments.append(thread);
      window.threadRoot = thread.attachShadow({ mode: "open" });
      window.first = makeComment(threadRoot, "男", "IP属地：北京");
      const replies = document.createElement("bili-comment-replies-renderer");
      threadRoot.append(replies);
      window.replyRoot = replies.attachShadow({ mode: "open" });
      window.second = makeComment(replyRoot, "女", "IP属地：上海", true);
      window.third = makeComment(replyRoot, "保密", "", true);
      window.badge = renderer => renderer.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelector(".bsa-comment-info");
    });
    await page.addScriptTag({ path: path.join(__dirname, "../src/comment-info.js") });
    assert.equal(await page.evaluate(() => badge(first)), null, "default is off");

    // The isolated bridge must read only the flag and not expose credentials.
    const cdp = await page.context().newCDPSession(page);
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "bsa-test" });
    await cdp.send("Runtime.evaluate", { contextId: executionContextId, expression: `
      globalThis.chrome = {
        runtime: { sendMessage: async () => ({ ok:true, data:{commentInfoEnabled:true, apiKey:'SECRET-NOT-FOR-PAGE'} }) },
        storage: { onChanged: { addListener(fn) { globalThis.storageChanged = fn; } } }
      };
      ${fs.readFileSync(path.join(__dirname, "../src/comment-info-settings.js"), "utf8")}
    `, awaitPromise: true });
    await page.waitForFunction(() => badge(first)?.textContent === "♂北京" && badge(second)?.textContent === "♀上海");
    assert.equal(await page.evaluate(() => badge(third)), null, "private gender is omitted");
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML.includes("SECRET-NOT-FOR-PAGE")), false);
    assert.equal(await page.evaluate(() => window.fetch === originalFetch && Element.prototype.attachShadow === originalShadow), true);

    // Late replies, node reuse, and unknown gender must not inherit stale labels.
    await page.evaluate(() => {
      first.__data = { member: { sex: "保密" }, reply_control: { location: "IP属地：广东" } };
      window.late = makeComment(replyRoot, "男", "", true);
    });
    await page.waitForFunction(() => badge(first)?.textContent === "广东" && badge(late)?.textContent === "♂");
    await page.evaluate(() => { first.__data = {}; });
    await page.waitForFunction(() => !badge(first));
    await page.evaluate(() => {
      // A reply awaiting data must never borrow the parent author's identity.
      replyRoot.host.__data = { member: { sex:"男" }, reply_control:{location:"北京"} };
      third.__data = undefined;
    });
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(() => badge(third)), null);
    await page.evaluate(() => {
      second.__data.reply_control.location = '<img src=x onerror="alert(1)">';
    });
    await page.waitForFunction(() => badge(second)?.textContent.includes("<img"));
    assert.equal(await page.evaluate(() => badge(second).querySelector("img")), null, "untrusted fields use textContent");
    await page.evaluate(() => { second.__data.reply_control.location = "IP属地：上海"; });
    await page.waitForFunction(() => badge(second)?.textContent === "♀上海");

    // Repeated scans do not duplicate badges or change the page DOM.
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(() => second.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelectorAll(".bsa-comment-info").length), 1);
    for (const dark of [false, true]) {
      await page.evaluate(dark => {
        document.body.style.cssText = dark ? "background:#18191c;color:#eee;--bili-comment-text3-color:#aaa;--bili-comment-bg2:#333" : "background:white;color:#18191c;--bili-comment-text3-color:#61666d;--bili-comment-bg2:#f1f2f3";
      }, dark);
      const bounds = await page.evaluate(() => {
        const user = second.shadowRoot.querySelector("bili-comment-user-info").shadowRoot;
        const name = user.querySelector("#user-name").getBoundingClientRect();
        const info = badge(second).getBoundingClientRect();
        const level = user.querySelector("#level").getBoundingClientRect();
        return { readable: info.width > 20 && info.height > 10, ordered: name.right <= info.left && info.right <= level.left };
      });
      assert.deepEqual(bounds, { readable: true, ordered: true });
      const output = path.join(__dirname, "../.codex-debug");
      fs.mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, `comment-info-${dark ? "dark" : "light"}.png`) });
    }
    await cdp.send("Runtime.evaluate", { contextId: executionContextId, expression: 'storageChanged({commentInfoEnabled:{newValue:false}}, "sync")' });
    await page.waitForFunction(() => !badge(second) && !badge(late));
    await cdp.send("Runtime.evaluate", { contextId: executionContextId, expression: 'storageChanged({commentInfoEnabled:{newValue:true}}, "sync")' });
    await page.waitForFunction(() => badge(second));
    await page.evaluate(() => {
      document.querySelector("bili-comments").remove();
      const next = document.createElement("bili-comments");
      document.body.append(next);
      window.nextComment = makeComment(next.attachShadow({ mode:"open" }), "女", "IP属地：浙江");
    });
    await page.waitForFunction(() => badge(nextComment)?.textContent === "♀浙江");
    assert.deepEqual(errors, []);
    console.log("comment-info browser tests passed (isolated bridge, shadow DOM, replies, toggles, navigation, themes)");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
