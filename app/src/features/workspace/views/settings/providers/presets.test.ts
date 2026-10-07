import { describe, expect, it } from "vitest";

import { freeName, PRESETS, presetOf } from "./presets";

describe("provider presets", () => {
  it("offers the common services, local servers on their usual ports", () => {
    expect(PRESETS.map((p) => `${p.label} ${p.kind} ${p.baseUrl}`)).toEqual([
      "Anthropic anthropic https://api.anthropic.com",
      "OpenAI openai https://api.openai.com/v1",
      "OpenRouter openai https://openrouter.ai/api/v1",
      "Ollama openai http://localhost:11434/v1",
      "LM Studio openai http://localhost:1234/v1",
      "vLLM openai http://localhost:8000/v1",
      "Custom openai ",
    ]);
    expect(PRESETS.filter((p) => p.local).map((p) => p.id)).toEqual(["ollama", "lmstudio", "vllm"]);
  });

  it("knows a provider's service by kind and address, else Custom", () => {
    expect(presetOf("openai", " HTTP://localhost:11434/v1/ ").id).toBe("ollama");
    expect(presetOf("anthropic", "https://api.anthropic.com/").id).toBe("anthropic");
    // The same address under the other kind is someone's own set-up.
    expect(presetOf("anthropic", "https://api.openai.com/v1").id).toBe("custom");
    expect(presetOf("openai", "http://local-server:8000/v1").id).toBe("custom");
    expect(presetOf("openai", "").id).toBe("custom");
  });

  it("names a provider after its service, numbered when taken", () => {
    expect(freeName("Ollama", [])).toBe("Ollama");
    expect(freeName("Ollama", ["ollama", "Ollama 2"])).toBe("Ollama 3");
  });
});
