"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FC } from "react";
import { Button } from "../ui/button";
import { useTranslation } from "react-i18next";

interface APIStepProps {
  openaiAPIKey: string;
  openaiOrgID: string;
  azureOpenaiAPIKey: string;
  o1PreviewAPIKey: string;
  azureOpenaiEndpoint: string;
  azureOpenai35TurboID: string;
  azureOpenai45TurboID: string;
  azureOpenai45VisionID: string;
  azureOpenaiEmbeddingsID: string;
  anthropicAPIKey: string;
  dalleAPIKey: string;
  flux1APIKey: string;
  googleGeminiAPIKey: string;
  mistralAPIKey: string;
  groqAPIKey: string;
  perplexityAPIKey: string;
  useAzureOpenai: boolean;
  openrouterAPIKey: string;
  deepseekAPIKey: string;
  onOpenrouterAPIKeyChange: (value: string) => void;
  onDeepseekAPIKeyChange: (value: string) => void;
  onOpenaiAPIKeyChange: (value: string) => void;
  onOpenaiOrgIDChange: (value: string) => void;
  onAzureOpenaiAPIKeyChange: (value: string) => void;
  onO1PreviewAPIKeyChange: (value: string) => void;
  onAzureOpenaiEndpointChange: (value: string) => void;
  onAzureOpenai35TurboIDChange: (value: string) => void;
  onAzureOpenai45TurboIDChange: (value: string) => void;
  onAzureOpenai45VisionIDChange: (value: string) => void;
  onAzureOpenaiEmbeddingsIDChange: (value: string) => void;
  onAnthropicAPIKeyChange: (value: string) => void;
  onDalleAPIKeyChange: (value: string) => void;
  onFlux1APIKeyChange: (value: string) => void;
  onGoogleGeminiAPIKeyChange: (value: string) => void;
  onMistralAPIKeyChange: (value: string) => void;
  onGroqAPIKeyChange: (value: string) => void;
  onPerplexityAPIKeyChange: (value: string) => void;
  onUseAzureOpenaiChange: (value: boolean) => void;
}

export const APIStep: FC<APIStepProps> = ({
  openaiAPIKey,
  openaiOrgID,
  azureOpenaiAPIKey,
  o1PreviewAPIKey: _o1PreviewAPIKey,
  azureOpenaiEndpoint,
  azureOpenai35TurboID,
  azureOpenai45TurboID,
  azureOpenai45VisionID,
  azureOpenaiEmbeddingsID,
  anthropicAPIKey,
  dalleAPIKey,
  flux1APIKey,
  googleGeminiAPIKey,
  mistralAPIKey,
  groqAPIKey,
  perplexityAPIKey,
  openrouterAPIKey,
  deepseekAPIKey,
  useAzureOpenai,
  onOpenaiAPIKeyChange,
  onOpenaiOrgIDChange,
  onAzureOpenaiAPIKeyChange,
  onO1PreviewAPIKeyChange: _onO1PreviewAPIKeyChange,
  onAzureOpenaiEndpointChange,
  onAzureOpenai35TurboIDChange,
  onAzureOpenai45TurboIDChange,
  onAzureOpenai45VisionIDChange,
  onAzureOpenaiEmbeddingsIDChange,
  onAnthropicAPIKeyChange,
  onDalleAPIKeyChange,
  onFlux1APIKeyChange,
  onGoogleGeminiAPIKeyChange,
  onMistralAPIKeyChange,
  onGroqAPIKeyChange,
  onPerplexityAPIKeyChange,
  onUseAzureOpenaiChange,
  onOpenrouterAPIKeyChange,
  onDeepseekAPIKeyChange,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="mt-5 space-y-2">
        <Label className="flex items-center">
          <div>
            {useAzureOpenai ? t("Azure OpenAI API Key") : t("OpenAI API Key")}
          </div>

          <Button
            className="ml-3 h-[18px] w-[150px] text-[11px]"
            onClick={() => onUseAzureOpenaiChange(!useAzureOpenai)}
          >
            {useAzureOpenai
              ? t("Switch To Standard OpenAI")
              : t("Switch To Azure OpenAI")}
          </Button>
        </Label>

        <Input
          placeholder={
            useAzureOpenai ? t("Azure OpenAI API Key") : t("OpenAI API Key")
          }
          type="password"
          value={useAzureOpenai ? azureOpenaiAPIKey : openaiAPIKey}
          onChange={e =>
            useAzureOpenai
              ? onAzureOpenaiAPIKeyChange(e.target.value)
              : onOpenaiAPIKeyChange(e.target.value)
          }
        />
      </div>

      <div className="ml-8 space-y-3">
        {useAzureOpenai ? (
          <>
            <div className="space-y-1">
              <Label>{t("Azure OpenAI Endpoint")}</Label>

              <Input
                placeholder={t("https://your-endpoint.openai.azure.com")}
                type="password"
                value={azureOpenaiEndpoint}
                onChange={e => onAzureOpenaiEndpointChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("Azure OpenAI GPT-3.5 Turbo ID")}</Label>

              <Input
                placeholder={t("Azure OpenAI GPT-3.5 Turbo ID")}
                type="password"
                value={azureOpenai35TurboID}
                onChange={e => onAzureOpenai35TurboIDChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("Azure OpenAI GPT-4.5 Turbo ID")}</Label>

              <Input
                placeholder={t("Azure OpenAI GPT-4.5 Turbo ID")}
                type="password"
                value={azureOpenai45TurboID}
                onChange={e => onAzureOpenai45TurboIDChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("Azure OpenAI GPT-4.5 Vision ID")}</Label>

              <Input
                placeholder={t("Azure OpenAI GPT-4.5 Vision ID")}
                type="password"
                value={azureOpenai45VisionID}
                onChange={e => onAzureOpenai45VisionIDChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("Azure OpenAI Embeddings ID")}</Label>

              <Input
                placeholder={t("Azure OpenAI Embeddings ID")}
                type="password"
                value={azureOpenaiEmbeddingsID}
                onChange={e => onAzureOpenaiEmbeddingsIDChange(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <Label>{t("OpenAI Organization ID")}</Label>

              <Input
                placeholder={t("OpenAI Organization ID (optional)")}
                type="password"
                value={openaiOrgID}
                onChange={e => onOpenaiOrgIDChange(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-1">
        <Label>{t("Anthropic API Key")}</Label>

        <Input
          placeholder={t("Anthropic API Key")}
          type="password"
          value={anthropicAPIKey}
          onChange={e => onAnthropicAPIKeyChange(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>{t("DALL-E API Key")}</Label>

        <Input
          placeholder={t("DALL-E API Key")}
          type="password"
          value={dalleAPIKey}
          onChange={e => onDalleAPIKeyChange(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>{t("Flux.1 API Key")}</Label>

        <Input
          placeholder={t("Flux.1 API Key")}
          type="password"
          value={flux1APIKey}
          onChange={e => onFlux1APIKeyChange(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>{t("Google Gemini API Key")}</Label>

        <Input
          placeholder={t("Google Gemini API Key")}
          type="password"
          value={googleGeminiAPIKey}
          onChange={e => onGoogleGeminiAPIKeyChange(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>{t("Mistral API Key")}</Label>

        <Input
          placeholder={t("Mistral API Key")}
          type="password"
          value={mistralAPIKey}
          onChange={e => onMistralAPIKeyChange(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>{t("Groq API Key")}</Label>

        <Input
          placeholder={t("Groq API Key")}
          type="password"
          value={groqAPIKey}
          onChange={e => onGroqAPIKeyChange(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>{t("Perplexity API Key")}</Label>

        <Input
          placeholder={t("Perplexity API Key")}
          type="password"
          value={perplexityAPIKey}
          onChange={e => onPerplexityAPIKeyChange(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>{t("OpenRouter API Key")}</Label>

        <Input
          placeholder={t("OpenRouter API Key")}
          type="password"
          value={openrouterAPIKey}
          onChange={e => onOpenrouterAPIKeyChange(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>{t("Deepseek API Key")}</Label>

        <Input
          placeholder={t("Deepseek API Key")}
          type="password"
          value={deepseekAPIKey}
          onChange={e => onDeepseekAPIKeyChange(e.target.value)}
        />
      </div>
    </>
  );
};
