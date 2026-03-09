import { z } from "zod";

export const chatSettingsSchema = z.object({
  model: z.string().min(1),
  prompt: z.string(),
  temperature: z.number().min(0).max(2),
  contextLength: z.number().positive(),
  includeProfileContext: z.boolean(),
  includeWorkspaceInstructions: z.boolean(),
  embeddingsProvider: z.string(),
});

export const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(z.any())]),
});

export const chatRequestSchema = z.object({
  chatSettings: chatSettingsSchema,
  messages: z.array(messageSchema).min(1),
});
