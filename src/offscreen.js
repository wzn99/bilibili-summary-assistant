// Version: 0.24.0
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message?.type !== "CONVERT_AUDIO") return;
  convertAudioMessage(message.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

async function convertAudioMessage(payload) {
  const chunkSeconds = Math.min(540, Math.max(60, Number(payload?.chunkSeconds || 300)));
  const audio = await readAudioBuffer(payload);
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(audio);
    const channelData = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      channelData.push(buffer.getChannelData(channel));
    }
    const parts = planAudioChunks(buffer.duration, chunkSeconds);
    const chunks = [];
    for (const part of parts) {
      const startSample = Math.floor(part.start * buffer.sampleRate);
      const endSample = Math.min(buffer.length, Math.floor((part.start + part.duration) * buffer.sampleRate));
      const mono = mixToMono(channelData, startSample, endSample);
      const resampled = resampleLinear(mono, buffer.sampleRate, 16000);
      const mp3 = encodeMp3(resampled, 16000, 64);
      chunks.push({
        startSeconds: part.start,
        durationSeconds: part.duration,
        audioBase64: arrayBufferToBase64(mp3.buffer),
        name: "bilibili-audio-part-" + String(chunks.length + 1).padStart(2, "0") + ".mp3",
        mimeType: "audio/mpeg"
      });
    }
    return { duration: buffer.duration, chunks };
  } catch (error) {
    throw new Error("音频转换或切片失败：" + (error?.message || String(error)));
  } finally {
    await context.close().catch(() => {});
  }
}

async function readAudioBuffer(payload) {
  if (payload?.audioBuffer instanceof ArrayBuffer) return payload.audioBuffer.slice(0);
  if (payload?.audioBase64) return base64ToArrayBuffer(payload.audioBase64);
  if (payload?.audioUrl) {
    const response = await fetch(payload.audioUrl);
    if (!response.ok) throw new Error(`读取待切片音频失败：HTTP ${response.status}`);
    return response.arrayBuffer();
  }
  throw new Error("没有可切片的音频数据");
}

function base64ToArrayBuffer(value) {
  const binary = atob(String(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function encodeMp3(float32, sampleRate, bitrate) {
  if (typeof lamejs?.Mp3Encoder !== "function") {
    throw new Error("MP3 编码器未加载");
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(bitrate) || bitrate <= 0) {
    throw new Error("MP3 编码参数无效");
  }
  const pcm = new Int16Array(float32.length);
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(float32[index]) || 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
  const chunks = [];
  const frameSize = 1152;
  for (let offset = 0; offset < pcm.length; offset += frameSize) {
    const encoded = encoder.encodeBuffer(pcm.subarray(offset, offset + frameSize));
    if (encoded.length) chunks.push(new Int8Array(encoded));
  }
  const flushed = encoder.flush();
  if (flushed.length) chunks.push(new Int8Array(flushed));
  if (!chunks.length) throw new Error("MP3 编码后没有生成音频数据");

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset);
    offset += chunk.byteLength;
  }
  return output;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
  }
  return btoa(binary);
}
