export function isOcrOrNonChatModel(model: string): boolean {
  const lower = model.trim().toLowerCase();
  return (
    lower.includes("glm-ocr") ||
    lower.includes("embed") ||
    lower.includes("embedding") ||
    lower.includes("rerank") ||
    lower.includes("whisper")
  );
}

export function pickPreferredOllamaModel(models: string[]): string {
  const preferredPrefixes = [
    "qwen2.5",
    "qwen3",
    "llama3.2",
    "llama3.1",
    "gemma3",
    "gemma2",
    "mistral",
    "deepseek",
    "phi4",
    "phi3",
  ];
  for (const prefix of preferredPrefixes) {
    const match = models.find((m) => m.toLowerCase().startsWith(prefix) && !isOcrOrNonChatModel(m));
    if (match) return match;
  }
  return models.find((m) => !isOcrOrNonChatModel(m)) ?? "";
}
