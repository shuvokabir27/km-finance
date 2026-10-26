import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createAiGatewayProvider(apiKey: string) {
  const baseURL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  return createOpenAICompatible({
    name: "ai-provider",
    baseURL,
    apiKey,
  });
}

// Backward compatibility alias
export const createLovableAiGatewayProvider = createAiGatewayProvider;

