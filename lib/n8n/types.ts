export type AIProvider = "azure" | "google" | "deepseek";

export interface AIFormattingConfig {
  provider: AIProvider;
  azure?: {
    endpoint: string;
    apiKey: string;
    deploymentId: string;
  };
  google?: {
    projectId: string;
    location: string;
    model: string;
    credentials: any;
  };
  deepseek?: {
    apiKey: string;
    baseURL?: string;
  };
}
