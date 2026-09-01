// Version: 0.24.0
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const chrome = {
  runtime: { onMessage: { addListener() {} } }
};
const sourcePath = path.join(__dirname, "..", "src", "offscreen.js");
const source = [
  fs.readFileSync(path.join(__dirname, "..", "src", "vendor", "lame.min.js"), "utf8"),
  fs.readFileSync(path.join(__dirname, "..", "src", "audio-utils.js"), "utf8"),
  fs.readFileSync(sourcePath, "utf8"),
  "globalThis.__test = { readAudioBuffer, encodeMp3, convertAudioMessage };"
].join("\n");
const samples = new Float32Array(32000);
for (let index = 0; index < samples.length; index += 1) {
  samples[index] = Math.sin(index / 20) * 0.2;
}
class TestAudioContext {
  async decodeAudioData() {
    return {
      duration: 2,
      sampleRate: 16000,
      numberOfChannels: 1,
      length: samples.length,
      getChannelData() { return samples; }
    };
  }
  async close() {}
}
const context = { chrome, atob, btoa, AudioContext: TestAudioContext };
vm.runInNewContext(source, context, { filename: sourcePath });

(async () => {
  const encoded = Buffer.from([0, 1, 2, 253, 254, 255]).toString("base64");
  const buffer = await context.__test.readAudioBuffer({ audioBase64: encoded });
  assert.deepEqual([...new Uint8Array(buffer)], [0, 1, 2, 253, 254, 255]);
  await assert.rejects(
    () => context.__test.readAudioBuffer({}),
    /没有可切片的音频数据/
  );
  assert.throws(
    () => context.__test.encodeMp3(new Float32Array([0]), 0, 64),
    /MP3 编码参数无效/
  );
  const converted = await context.__test.convertAudioMessage({
    audioBase64: encoded,
    chunkSeconds: 540
  });
  assert.equal(converted.chunks.length, 1);
  assert.equal(converted.chunks[0].startSeconds, 0);
  assert.equal(converted.chunks[0].durationSeconds, 2);
  assert.equal(converted.chunks[0].mimeType, "audio/mpeg");
  assert.match(converted.chunks[0].name, /\.mp3$/);
  assert.equal(Buffer.from(converted.chunks[0].audioBase64, "base64").length > 0, true);
  assert.equal(context.__test.encodeMp3(new Float32Array([0, 0.25, -0.25]), 16000, 64).length > 0, true);
  console.log("offscreen tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
