const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/transcription-presets.js"), "utf8"), context);
const patch = (...args) => JSON.parse(JSON.stringify(context.getTranscriptionPresetPatch(...args)));
const openai = patch("openai_compatible", "", "");
const dashscope = patch("dashscope_filetrans", "", "");
assert.equal(openai.transcriptionBaseUrl, "https://openrouter.ai/api/v1/audio/transcriptions");
assert.equal(openai.transcriptionModel, "openai/whisper-large-v3-turbo");
assert.deepEqual(patch("openai_compatible", dashscope.transcriptionBaseUrl, dashscope.transcriptionModel), openai);
assert.deepEqual(patch("dashscope_filetrans", openai.transcriptionBaseUrl, openai.transcriptionModel), dashscope);
assert.deepEqual(patch("openai_compatible", ` ${dashscope.transcriptionBaseUrl}/ `, ` ${dashscope.transcriptionModel} `), openai);
assert.deepEqual(patch("openai_compatible", openai.transcriptionBaseUrl, openai.transcriptionModel), {});
assert.deepEqual(patch("dashscope_filetrans", dashscope.transcriptionBaseUrl, dashscope.transcriptionModel), {});
assert.deepEqual(patch("unknown", "", ""), {});
assert.deepEqual(patch("__proto__", "", ""), {});
assert.deepEqual(patch("openai_compatible", "https://custom.example/v1/audio/transcriptions", "custom-model"), {});
assert.deepEqual(patch("openai_compatible", dashscope.transcriptionBaseUrl, "custom-model"), {});
assert.deepEqual(patch("openai_compatible", "", "custom-model"), {});

// Verify all three entry points load the shared preset helper.
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
const scripts = manifest.content_scripts[0].js;
assert.ok(scripts.indexOf("src/transcription-presets.js") >= 0);
assert.ok(scripts.indexOf("src/transcription-presets.js") < scripts.indexOf("src/content.js"));
for (const file of ["options.html", "background.js"]) {
  assert.ok(fs.readFileSync(path.join(__dirname, "../src", file), "utf8").includes("transcription-presets.js"));
}
console.log("transcription presets tests passed");
