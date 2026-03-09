jest.mock("@google-cloud/vertexai", () => ({
  HarmCategory: {
    HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
  },
  HarmBlockThreshold: {
    BLOCK_NONE: "BLOCK_NONE",
  },
}));

import {
  createGemini25ProRequest,
  GEMINI_SAFETY_SETTINGS,
  extractThinkingContent,
} from "./gemini-thinking-config";

describe("gemini-thinking-config", () => {
  describe("createGemini25ProRequest", () => {
    const mockContents = [{ role: "user", parts: [{ text: "Hello" }] }];
    const mockGenerationConfig = { temperature: 0.7, maxOutputTokens: 2048 };

    it("returns an object with all required properties", () => {
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
      );

      expect(result).toHaveProperty("contents");
      expect(result).toHaveProperty("generationConfig");
      expect(result).toHaveProperty("safetySettings");
      expect(result).toHaveProperty("tools");
      expect(result).toHaveProperty("thinkingConfig");
    });

    it("passes through contents and generationConfig unchanged", () => {
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
      );

      expect(result.contents).toBe(mockContents);
      expect(result.generationConfig).toBe(mockGenerationConfig);
    });

    it("sets thinkingConfig.thinkingBudget to -1 (unlimited)", () => {
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
      );

      expect(result.thinkingConfig).toBeDefined();
      expect(result.thinkingConfig!.thinkingBudget).toBe(-1);
    });

    it("sets thinkingConfig.includeThoughts to true", () => {
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
      );

      expect(result.thinkingConfig!.includeThoughts).toBe(true);
    });

    it("sets safetySettings to undefined when not provided", () => {
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
      );

      expect(result.safetySettings).toBeUndefined();
    });

    it("sets tools to undefined when not provided", () => {
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
      );

      expect(result.tools).toBeUndefined();
    });

    it("passes through safetySettings when provided", () => {
      const customSafety = [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      ];
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
        customSafety,
      );

      expect(result.safetySettings).toBe(customSafety);
    });

    it("passes through tools when provided", () => {
      const customTools = [{ functionDeclarations: [{ name: "search" }] }];
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
        undefined,
        customTools,
      );

      expect(result.tools).toBe(customTools);
    });

    it("passes through both safetySettings and tools when provided", () => {
      const customSafety = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      ];
      const customTools = [{ functionDeclarations: [{ name: "lookup" }] }];
      const result = createGemini25ProRequest(
        mockContents,
        mockGenerationConfig,
        customSafety,
        customTools,
      );

      expect(result.safetySettings).toBe(customSafety);
      expect(result.tools).toBe(customTools);
    });
  });

  describe("GEMINI_SAFETY_SETTINGS", () => {
    it("contains exactly 4 safety setting entries", () => {
      expect(GEMINI_SAFETY_SETTINGS).toHaveLength(4);
    });

    it("has a category and threshold on every entry", () => {
      for (const setting of GEMINI_SAFETY_SETTINGS) {
        expect(setting).toHaveProperty("category");
        expect(setting).toHaveProperty("threshold");
        expect(typeof setting.category).toBe("string");
        expect(typeof setting.threshold).toBe("string");
      }
    });

    it("sets all thresholds to BLOCK_NONE", () => {
      for (const setting of GEMINI_SAFETY_SETTINGS) {
        expect(setting.threshold).toBe("BLOCK_NONE");
      }
    });

    it("covers the expected harm categories", () => {
      const categories = GEMINI_SAFETY_SETTINGS.map(s => s.category);

      expect(categories).toContain("HARM_CATEGORY_HATE_SPEECH");
      expect(categories).toContain("HARM_CATEGORY_DANGEROUS_CONTENT");
      expect(categories).toContain("HARM_CATEGORY_SEXUALLY_EXPLICIT");
      expect(categories).toContain("HARM_CATEGORY_HARASSMENT");
    });
  });

  describe("extractThinkingContent", () => {
    it("returns null for undefined chunk", () => {
      expect(extractThinkingContent(undefined)).toBeNull();
    });

    it("returns null for null chunk", () => {
      expect(extractThinkingContent(null)).toBeNull();
    });

    it("returns null for an empty object chunk", () => {
      expect(extractThinkingContent({})).toBeNull();
    });

    it("returns null for a chunk with no thinking content anywhere", () => {
      const chunk = {
        candidates: [
          {
            content: {
              parts: [{ text: "Regular response" }],
            },
          },
        ],
      };

      expect(extractThinkingContent(chunk)).toBeNull();
    });

    it("finds thinking content at chunk.thinking", () => {
      const chunk = { thinking: "I am reasoning about this" };

      expect(extractThinkingContent(chunk)).toBe("I am reasoning about this");
    });

    it("finds thinking content at chunk.thinkingContent", () => {
      const chunk = { thinkingContent: "Step-by-step analysis" };

      expect(extractThinkingContent(chunk)).toBe("Step-by-step analysis");
    });

    it("finds thinking content at chunk.candidates[0].thinking", () => {
      const chunk = {
        candidates: [{ thinking: "Candidate-level thinking" }],
      };

      expect(extractThinkingContent(chunk)).toBe("Candidate-level thinking");
    });

    it("finds thinking content at chunk.candidates[0].thinkingContent", () => {
      const chunk = {
        candidates: [{ thinkingContent: "Candidate thinking content" }],
      };

      expect(extractThinkingContent(chunk)).toBe("Candidate thinking content");
    });

    it("finds thinking content at chunk.candidates[0].content.thinking", () => {
      const chunk = {
        candidates: [
          {
            content: { thinking: "Content-level thinking" },
          },
        ],
      };

      expect(extractThinkingContent(chunk)).toBe("Content-level thinking");
    });

    it("finds thinking content at chunk.candidates[0].content.thinkingContent", () => {
      const chunk = {
        candidates: [
          {
            content: { thinkingContent: "Content thinking content" },
          },
        ],
      };

      expect(extractThinkingContent(chunk)).toBe("Content thinking content");
    });

    it("finds thinking content at chunk.usage.thinkingContent", () => {
      const chunk = {
        usage: { thinkingContent: "Usage thinking content" },
      };

      expect(extractThinkingContent(chunk)).toBe("Usage thinking content");
    });

    it("finds thinking content at chunk.usageMetadata.thinkingContent", () => {
      const chunk = {
        usageMetadata: { thinkingContent: "Usage metadata thinking" },
      };

      expect(extractThinkingContent(chunk)).toBe("Usage metadata thinking");
    });

    it("finds thinking content at chunk.response.thinking", () => {
      const chunk = {
        response: { thinking: "Response-level thinking" },
      };

      expect(extractThinkingContent(chunk)).toBe("Response-level thinking");
    });

    it("finds thinking content at chunk.response.thinkingContent", () => {
      const chunk = {
        response: { thinkingContent: "Response thinking content" },
      };

      expect(extractThinkingContent(chunk)).toBe("Response thinking content");
    });

    it("finds thinking in candidates[0].content.parts with .thinking property", () => {
      const chunk = {
        candidates: [
          {
            content: {
              parts: [
                { text: "Regular text" },
                { thinking: "Part-level thinking" },
              ],
            },
          },
        ],
      };

      expect(extractThinkingContent(chunk)).toBe("Part-level thinking");
    });

    it("finds thinkingContent in candidates[0].content.parts with .thinkingContent property", () => {
      const chunk = {
        candidates: [
          {
            content: {
              parts: [
                { text: "Regular text" },
                { thinkingContent: "Part-level thinking content" },
              ],
            },
          },
        ],
      };

      expect(extractThinkingContent(chunk)).toBe("Part-level thinking content");
    });

    it("returns null when thinking value is a number (non-string)", () => {
      const chunk = { thinking: 42 };

      expect(extractThinkingContent(chunk)).toBeNull();
    });

    it("returns null when thinking value is an object (non-string)", () => {
      const chunk = { thinking: { nested: "data" } };

      expect(extractThinkingContent(chunk)).toBeNull();
    });

    it("returns null when thinking value is a boolean (non-string)", () => {
      const chunk = { thinking: true };

      expect(extractThinkingContent(chunk)).toBeNull();
    });

    it("returns null when thinking value is an empty string", () => {
      const chunk = { thinking: "" };

      expect(extractThinkingContent(chunk)).toBeNull();
    });

    it("returns the first matching path when multiple paths have thinking content", () => {
      const chunk = {
        thinking: "Top-level thinking",
        thinkingContent: "Should not be returned",
        candidates: [
          {
            thinking: "Also should not be returned",
          },
        ],
      };

      // The function iterates paths in order; chunk.thinking is first
      expect(extractThinkingContent(chunk)).toBe("Top-level thinking");
    });

    it("falls through to a later path if earlier paths are absent", () => {
      const chunk = {
        candidates: [
          {
            content: {
              thinking: "Found via fallback",
            },
          },
        ],
      };

      expect(extractThinkingContent(chunk)).toBe("Found via fallback");
    });
  });
});
