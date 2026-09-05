const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
    const css = fs.readFileSync(path.join(__dirname, '../src/content.css'), 'utf8');
    for (const height of [420, 720, 1200]) {
      for (const populated of [false, true]) {
        for (const error of [false, true]) {
          await page.setContent(`<style>${css}</style>
            <section id="bsa-root" data-theme="light" data-has-result="true" style="width:400px;--bsa-panel-max-height:${height}px">
              <div class="bsa-card">
                <div class="bsa-header"><div class="bsa-title">Video summary</div><button class="bsa-icon">V</button></div>
                <div class="bsa-body">
                  <div class="bsa-status" data-tone="${error ? 'error' : ''}">${error ? 'Cache unavailable' : ''}</div>
                  <div class="bsa-result"><div class="bsa-summary-shell">
                    <div class="bsa-overview">${'Video overview. '.repeat(12)}</div>
                    <div class="bsa-tabs"><button class="bsa-tab">Timeline</button><button class="bsa-tab">Highlights</button><button class="bsa-tab">Questions</button></div>
                    <div class="bsa-tab-content"><section class="bsa-qa">
                      <div class="bsa-qa-messages">${populated ? Array.from({length:20}, () => '<div class="bsa-qa-message">An answer with enough content to make the message list scroll.</div>').join('') : '<div class="bsa-qa-empty">Ask a question about the video.</div>'}</div>
                      <div class="bsa-question-composer"><textarea class="bsa-question-input"></textarea><button class="bsa-question-send">Send</button></div>
                    </section></div>
                  </div></div>
                </div>
              </div>
            </section>`);
          const metrics = await page.evaluate(() => {
            const rect = (s) => document.querySelector(s).getBoundingClientRect();
            const card = rect('.bsa-card');
            const input = rect('.bsa-question-input');
            const send = rect('.bsa-question-send');
            const result = rect('.bsa-result');
            return { gap: card.bottom - send.bottom, inputHeight: input.height,
              sendHeight: send.height, clipped: send.bottom > result.bottom + 1 };
          });
          assert.ok(metrics.gap >= 0 && metrics.gap <= 8,
            `Composer must be at bottom: ${JSON.stringify({height, populated, error, ...metrics})}`);
          assert.equal(metrics.clipped, false);
          assert.equal(metrics.inputHeight, 40);
          assert.equal(metrics.sendHeight, 40);
        }
      }
    }
    console.log('Browser layout tests passed (12 empty/populated/error/height combinations)');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
