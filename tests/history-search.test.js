// Version: 0.24.8
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "src", "history-search.js");
const source = fs.readFileSync(sourcePath, "utf8") +
  "globalThis.__test = { normalizeHistorySearchTerms, getHistorySummaryText, getHistoryAiRecordFields, buildHistoryAiRecords, buildHistoryAiMessages, buildHistoryAiSearchRequest, historyEntryMatches, filterHistoryEntries, parseHistoryAiIds, parseHistoryAiMatches };";
const context = {};
vm.runInNewContext(source, context, { filename: sourcePath });

const entries = [
  {
    key: "cache-a",
    videoTitle: "React 性能优化实战",
    summaryData: {
      overview: "介绍缓存和渲染优化",
      chapters: [{ title: "渲染流程", summary: "减少重复计算" }],
      highlights: [{ quote: "先测量，再优化" }]
    }
  },
  {
    key: "cache-b",
    videoTitle: "数据库入门",
    summaryData: {
      overview: "介绍表结构和索引",
      chapters: [],
      highlights: []
    }
  }
];

assert.equal(JSON.stringify(context.__test.normalizeHistorySearchTerms(" React，性能; React ")), JSON.stringify(["react", "性能"]));
assert.equal(context.__test.historyEntryMatches(entries[0], "title", "react 性能"), true);
assert.equal(context.__test.historyEntryMatches(entries[0], "title", "react vue"), false);
assert.equal(context.__test.historyEntryMatches(entries[0], "summary", "缓存 渲染"), true);
assert.equal(context.__test.historyEntryMatches(entries[0], "summary", "重复计算"), true);
assert.equal(context.__test.historyEntryMatches(entries[0], "summary", "不存在"), false);
assert.equal(context.__test.getHistorySummaryText(entries[0]).includes("先测量，再优化"), true);
assert.equal(
  JSON.stringify(context.__test.filterHistoryEntries(entries, "summary", "索引")),
  JSON.stringify([entries[1]])
);
assert.equal(context.__test.filterHistoryEntries(entries, "title", "").length, 2);
assert.equal(
  JSON.stringify(context.__test.buildHistoryAiRecords([
    { id: "cache-a", videoTitle: "React 性能优化实战", summaryData: { overview: "介绍缓存和渲染优化" } }
  ])),
  JSON.stringify([{ id: "r1", title: "React 性能优化实战", overview: "介绍缓存和渲染优化" }])
);
assert.equal(
  JSON.stringify(context.__test.buildHistoryAiSearchRequest("找讲解性能优化的视频", entries)),
  JSON.stringify({
    type: "SEARCH_HISTORY_AI",
    payload: {
      query: "找讲解性能优化的视频",
      entries: [
        { id: "cache-a", title: "React 性能优化实战", overview: "介绍缓存和渲染优化" },
        { id: "cache-b", title: "数据库入门", overview: "介绍表结构和索引" }
      ]
    }
  })
);
assert.equal(
  JSON.stringify(context.__test.getHistoryAiRecordFields({
    videoTitle: "旧缓存",
    summaryData: { chapters: [{ title: "索引设计", summary: "介绍数据库索引" }] }
  })),
  JSON.stringify({ title: "旧缓存", overview: "索引设计\n介绍数据库索引" })
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiIds('{"matched_ids":["cache-a","unknown","cache-a"]}', ["cache-a", "cache-b"])),
  JSON.stringify(["cache-a"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiIds("```json\n{\"record_ids\":[\"cache-b\"]}\n```", ["cache-a", "cache-b"])),
  JSON.stringify(["cache-b"])
);
assert.equal(JSON.stringify(context.__test.parseHistoryAiIds('{"matched_ids":"cache-a"}', ["cache-a"])), JSON.stringify([]));
assert.equal(JSON.stringify(context.__test.parseHistoryAiIds("not json", ["cache-a"])), JSON.stringify([]));
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiIds('模型判断如下：{"matched_ids":["r1"]}', ["r1", "r2"])),
  JSON.stringify(["r1"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiIds('符合条件的记录：r1、r2', ["r1", "r2"])),
  JSON.stringify(["r1", "r2"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiIds('[1, 2]', ["r1", "r2"])),
  JSON.stringify(["r1", "r2"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiMatches("我推荐第 1 条记录", [
    { id: "r1", title: "React 性能优化" },
    { id: "r2", title: "数据库入门" }
  ])),
  JSON.stringify(["r1"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiMatches("符合：数据库入门", [
    { id: "r1", title: "React 性能优化" },
    { id: "r2", title: "数据库入门" }
  ])),
  JSON.stringify(["r2"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiMatches('{"matches":[{"record_id":"r1","reason":"主题相关"}]}', [
    { id: "r1", title: "React 性能优化" },
    { id: "r2", title: "数据库入门" }
  ])),
  JSON.stringify(["r1"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiMatches("我建议第一条和第 2 条", [
    { id: "r1", title: "React 性能优化" },
    { id: "r2", title: "数据库入门" }
  ])),
  JSON.stringify(["r1", "r2"])
);
assert.equal(
  JSON.stringify(context.__test.parseHistoryAiMatches('{"results":[{"title":"数据库入门"}]}', [
    { id: "r1", title: "React 性能优化" },
    { id: "r2", title: "数据库入门" }
  ])),
  JSON.stringify(["r2"])
);

console.log("history search tests passed");
