// Version: 0.24.0
const AUDIO_HOST_ALLOWLIST = [
  /(^|\.)bilivideo\.com$/i,
  /(^|\.)bilivideo\.cn$/i,
  /(^|\.)hdslb\.com$/i,
  /(^|\.)akamaized\.net$/i,
  /(^|\.)bilibili\.com$/i
];

function isAllowedAudioHost(hostname) {
  const host = String(hostname || "").replace(/\.$/, "").toLowerCase();
  return AUDIO_HOST_ALLOWLIST.some((pattern) => pattern.test(host));
}

function collectAudioCandidateUrls(payload) {
  const urls = [];
  const audios = Array.isArray(payload?.data?.dash?.audio) ? payload.data.dash.audio.slice() : [];
  audios.sort((a, b) => Number(b?.bandwidth || 0) - Number(a?.bandwidth || 0));
  for (const audio of audios) {
    urls.push(audio?.baseUrl || audio?.base_url);
    const backups = audio?.backupUrl || audio?.backup_url || [];
    if (Array.isArray(backups)) urls.push(...backups);
  }
  const durl = Array.isArray(payload?.data?.durl) ? payload.data.durl : [];
  for (const item of durl) urls.push(item?.url);
  return [...new Set(urls.filter(Boolean).map((item) => String(item)))];
}

function rankAudioUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const defaultPort = !parsed.port || parsed.port === "443" || parsed.port === "80";
    if (/(^|\.)bilivideo\.com$/i.test(host) && defaultPort) return 0;
    if (isAllowedAudioHost(host) && defaultPort) return 1;
    if (isAllowedAudioHost(host)) return 2;
    return 3;
  } catch (_error) {
    return 9;
  }
}

function preferAudioUrls(urls) {
  return [...new Set((urls || []).filter(Boolean).map((item) => String(item)))]
    .sort((left, right) => rankAudioUrl(left) - rankAudioUrl(right));
}

function planAudioChunks(duration, chunkSeconds) {
  const total = Math.max(0, Number(duration) || 0);
  const size = Math.max(1, Number(chunkSeconds) || 300);
  if (total <= size) return [{ start: 0, duration: total || size }];
  const parts = [];
  for (let start = 0; start < total; start += size) {
    parts.push({ start, duration: Math.min(size, total - start) });
  }
  return parts;
}

function needsAudioSplit(durationSeconds, byteLength, chunkSeconds, maxBytes = 20 * 1024 * 1024) {
  const duration = Number(durationSeconds) || 0;
  const size = Number(byteLength) || 0;
  const chunk = Number(chunkSeconds) || 300;
  return (duration > 0 && duration > chunk) || size > maxBytes;
}

function mixToMono(channelData, startSample, endSample) {
  const length = Math.max(0, endSample - startSample);
  const output = new Float32Array(length);
  const channelCount = Math.max(1, channelData.length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      sum += channelData[channel][startSample + index] || 0;
    }
    output[index] = sum / channelCount;
  }
  return output;
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let index = 0; index < outLength; index += 1) {
    const source = index * ratio;
    const left = Math.floor(source);
    const right = Math.min(input.length - 1, left + 1);
    const weight = source - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

function encodePcm16Wav(float32, sampleRate) {
  const samples = float32.length;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch (_error) {
    return "";
  }
}

function wrapNetworkError(error, url, label = "网络请求") {
  const host = hostFromUrl(url);
  const hostText = host ? `（${host}）` : "";
  if (error?.name === "AbortError") {
    return new Error(`${label}超时${hostText}，请到设置页加大“单次请求超时”`);
  }
  const message = String(error?.message || error || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return new Error(`${label}失败：无法连接${host || "服务器"}。常见原因是扩展没有该网站权限，或当前音频线路不可访问。`);
  }
  return error instanceof Error ? error : new Error(message);
}
