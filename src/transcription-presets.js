// Only replace a complete, known preset belonging to the other provider.
// Custom endpoints/models and credentials must never be overwritten.
function getTranscriptionPresetPatch(provider, baseUrl, model) {
  const presets = {
    openai_compatible: {
      transcriptionBaseUrl: "https://openrouter.ai/api/v1/audio/transcriptions",
      transcriptionModel: "openai/whisper-large-v3-turbo"
    },
    dashscope_filetrans: {
      transcriptionBaseUrl: "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
      transcriptionModel: "qwen-audio-3.0-asr-flash-filetrans"
    }
  };
  if (!Object.prototype.hasOwnProperty.call(presets, provider)) return {};
  const url = String(baseUrl || "").trim().replace(/\/+$/, "");
  const name = String(model || "").trim();
  const other = provider === "openai_compatible" ? presets.dashscope_filetrans : presets.openai_compatible;
  if ((!url && !name) || (url === other.transcriptionBaseUrl && name === other.transcriptionModel)) {
    return { ...presets[provider] };
  }
  return {};
}
