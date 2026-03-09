"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const logger = createClientLogger({ component: "AdminSettingsPage" });
import {
  getAdminSettings,
  updateAdminSettings,
  AdminSettings,
} from "@/lib/config/admin-settings";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TextareaAutosize } from "@/components/ui/textarea-autosize";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelSelect } from "@/components/models/model-select";
import {
  getMaxContextLength,
  getDefaultContextLength,
} from "@/lib/chat-setting-limits";
import {
  IconSettings,
  IconDeviceFloppy,
  IconRefresh,
} from "@tabler/icons-react";

// Using AdminSettings from the config file

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>({
    default_model: "gemini-2.5-pro",
    default_image_model: "imagen-3.0-generate-002",
    default_context_length: 1048576,
    default_temperature: 0.5,
    default_prompt: "You are a helpful AI assistant.",
    default_embeddings_provider: "openai",
    include_profile_context: true,
    include_workspace_instructions: true,
    default_fallback_model: "gemini-2.5-pro",
    onedrive_enabled: true,
    sharepoint_enabled: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      // Load settings from API (including OneDrive setting)
      const adminSettings = await getAdminSettings();
      setSettings(adminSettings);
    } catch (error) {
      logger.error("Error loading settings", { error: String(error) });
      toast.error(t("Failed to load settings"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      // Update settings via API
      await updateAdminSettings(settings);
      toast.success(
        t(
          "Settings saved successfully! New workspaces will use these defaults.",
        ),
      );
      await loadSettings();
    } catch (error) {
      logger.error("Error saving settings", { error: String(error) });
      toast.error(t("Failed to save settings"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({
      default_model: "gemini-2.5-pro",
      default_image_model: "imagen-3.0-generate-002",
      default_context_length: 1048576,
      default_temperature: 0.5,
      default_prompt: t("You are a helpful AI assistant."),
      default_embeddings_provider: "openai",
      include_profile_context: true,
      include_workspace_instructions: true,
      default_fallback_model: "gemini-2.5-pro",
      onedrive_enabled: true,
      sharepoint_enabled: false,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <IconSettings className="text-muted-foreground mx-auto size-8 animate-spin" />
          <p className="text-muted-foreground mt-2 text-sm">
            {t("Loading settings...")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("Admin Settings")}
          </h1>
          <p className="text-muted-foreground">
            {t("Configure system-wide settings and defaults for all users.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <IconRefresh className="mr-2 size-4" />
            {t("Reset")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <IconDeviceFloppy className="mr-2 size-4" />
            {isSaving ? t("Saving...") : t("Save Settings")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">{t("General Settings")}</TabsTrigger>
          <TabsTrigger value="models">{t("Model Configuration")}</TabsTrigger>
          <TabsTrigger value="features">{t("Features")}</TabsTrigger>
          <TabsTrigger value="advanced">{t("Advanced Settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("Default Model Configuration")}</CardTitle>
              <CardDescription>
                {t(
                  "Set the default models that will be used for new workspaces and chats.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("Default Chat Model")}</Label>
                <ModelSelect
                  selectedModelId={settings.default_model}
                  onSelectModel={model => {
                    setSettings(prev => ({
                      ...prev,
                      default_model: model,
                      // Update context length to match the new model's default
                      default_context_length: getDefaultContextLength(model),
                    }));
                  }}
                  imageModels={false}
                />
                <p className="text-muted-foreground text-sm">
                  {t(
                    "This model will be used as the default for new chats and workspaces.",
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t("Default Image Model")}</Label>
                <ModelSelect
                  selectedModelId={settings.default_image_model}
                  onSelectModel={imageModel => {
                    setSettings(prev => ({
                      ...prev,
                      default_image_model: imageModel,
                    }));
                  }}
                  imageModels={true}
                />
                <p className="text-muted-foreground text-sm">
                  {t(
                    "This model will be used for image generation by default.",
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t("Default Context Length")}</Label>
                <div className="flex items-center space-x-2">
                  <Slider
                    value={[settings.default_context_length]}
                    onValueChange={([value]) => {
                      setSettings(prev => ({
                        ...prev,
                        default_context_length: value,
                      }));
                    }}
                    min={4096}
                    max={getMaxContextLength(settings.default_model)}
                    step={1024}
                    className="flex-1"
                  />
                  <span className="w-20 font-mono text-sm">
                    {settings.default_context_length.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Maximum context length for new chats. Current model supports up to",
                    )}{" "}
                    {getMaxContextLength(
                      settings.default_model,
                    ).toLocaleString()}{" "}
                    {t("tokens")}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSettings(prev => ({
                        ...prev,
                        default_context_length: getDefaultContextLength(
                          settings.default_model,
                        ),
                      }));
                    }}
                  >
                    {t("Set to Default")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("Default Fallback Model")}</Label>
                <ModelSelect
                  selectedModelId={settings.default_fallback_model}
                  onSelectModel={fallbackModel => {
                    setSettings(prev => ({
                      ...prev,
                      default_fallback_model: fallbackModel,
                    }));
                  }}
                  imageModels={false}
                />
                <p className="text-muted-foreground text-sm">
                  {t(
                    "This model will be used as fallback when the default model is deprecated or unavailable.",
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t("Default Temperature")}</Label>
                <div className="flex items-center space-x-2">
                  <Slider
                    value={[settings.default_temperature]}
                    onValueChange={([value]) => {
                      setSettings(prev => ({
                        ...prev,
                        default_temperature: value,
                      }));
                    }}
                    min={0}
                    max={2}
                    step={0.1}
                    className="flex-1"
                  />
                  <span className="w-12 font-mono text-sm">
                    {settings.default_temperature}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t(
                    "Controls randomness in AI responses. Lower values are more focused, higher values are more creative.",
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("Model Settings")}</CardTitle>
              <CardDescription>
                {t("Configure model-specific settings and fallback behavior.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("Default System Prompt")}</Label>
                <TextareaAutosize
                  value={settings.default_prompt}
                  onValueChange={prompt => {
                    setSettings(prev => ({
                      ...prev,
                      default_prompt: prompt,
                    }));
                  }}
                  placeholder={t("You are a helpful AI assistant.")}
                  minRows={3}
                  maxRows={6}
                  className="w-full"
                />
                <p className="text-muted-foreground text-sm">
                  {t("Default system prompt for new chats and workspaces.")}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t("Default Embeddings Provider")}</Label>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="openai"
                      name="embeddings"
                      value="openai"
                      checked={
                        settings.default_embeddings_provider === "openai"
                      }
                      onChange={() =>
                        setSettings(prev => ({
                          ...prev,
                          default_embeddings_provider: "openai",
                        }))
                      }
                    />
                    <Label htmlFor="openai">OpenAI</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="local"
                      name="embeddings"
                      value="local"
                      checked={settings.default_embeddings_provider === "local"}
                      onChange={() =>
                        setSettings(prev => ({
                          ...prev,
                          default_embeddings_provider: "local",
                        }))
                      }
                    />
                    <Label htmlFor="local">{t("Local")}</Label>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t("Default embeddings provider for retrieval and search.")}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("Features")}</CardTitle>
              <CardDescription>
                {t(
                  "Enable or disable specific features across the application.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("OneDrive Integration")}</Label>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Allow users to upload files from OneDrive. When disabled, only local file uploads will be available.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={settings.onedrive_enabled}
                  onCheckedChange={checked =>
                    setSettings(prev => ({
                      ...prev,
                      onedrive_enabled: checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("SharePoint Integration")}</Label>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Allow users to browse and upload files from SharePoint sites and document libraries.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={settings.sharepoint_enabled}
                  onCheckedChange={checked =>
                    setSettings(prev => ({
                      ...prev,
                      sharepoint_enabled: checked,
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("Advanced Settings")}</CardTitle>
              <CardDescription>
                {t("Configure advanced behavior and context settings.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("Include Profile Context")}</Label>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Include user profile information in chat context by default.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={settings.include_profile_context}
                  onCheckedChange={checked =>
                    setSettings(prev => ({
                      ...prev,
                      include_profile_context: checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("Include Workspace Instructions")}</Label>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Include workspace-specific instructions in chat context by default.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={settings.include_workspace_instructions}
                  onCheckedChange={checked =>
                    setSettings(prev => ({
                      ...prev,
                      include_workspace_instructions: checked,
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("System Information")}</CardTitle>
              <CardDescription>
                {t("Current system status and configuration details.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">{t("Default Model")}:</span>
                  <span className="text-muted-foreground ml-2">
                    {settings.default_model}
                  </span>
                </div>
                <div>
                  <span className="font-medium">{t("Image Model")}:</span>
                  <span className="text-muted-foreground ml-2">
                    {settings.default_image_model}
                  </span>
                </div>
                <div>
                  <span className="font-medium">{t("Fallback Model")}:</span>
                  <span className="text-muted-foreground ml-2">
                    {settings.default_fallback_model}
                  </span>
                </div>
                <div>
                  <span className="font-medium">{t("Context Length")}:</span>
                  <span className="text-muted-foreground ml-2">
                    {settings.default_context_length.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="font-medium">{t("Temperature")}:</span>
                  <span className="text-muted-foreground ml-2">
                    {settings.default_temperature}
                  </span>
                </div>
                <div>
                  <span className="font-medium">{t("Max Context")}:</span>
                  <span className="text-muted-foreground ml-2">
                    {getMaxContextLength(
                      settings.default_model,
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
