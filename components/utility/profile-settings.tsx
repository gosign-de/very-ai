"use client";

import { createClientLogger } from "@/lib/logger/client";
import { ChatbotUIContext } from "@/context/context";
import {
  PROFILE_CONTEXT_MAX,
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_USERNAME_MAX,
  PROFILE_USERNAME_MIN,
} from "@/db/limits";
import { updateProfile } from "@/db/profile";
import { uploadProfileImage } from "@/db/storage/profile-images";
import { fetchOpenRouterModels } from "@/lib/models/fetch-models";
import { LLM_LIST_MAP } from "@/lib/models/llm/llm-list";
import { supabase } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";
import { OpenRouterLLM } from "@/types";
import {
  IconDeviceAnalytics,
  IconLoader2,
  IconLogout,
  IconUser,
} from "@tabler/icons-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FC,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { SIDEBAR_ICON_SIZE } from "../sidebar/sidebar-switcher";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { LimitDisplay } from "../ui/limit-display";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TextareaAutosize } from "../ui/textarea-autosize";
import { ThemeSwitcher } from "./theme-switcher";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import LanguageChanger from "../LanguageChanger";
import { useTranslation } from "react-i18next";
import { getIsAdminGroups } from "@/db/azure_groups";
import { getFileWorkspacesByWorkspaceId } from "@/db/files";
import { useParams } from "next/navigation";
import { AzureGroupsSelector } from "./azure-groups-selector";

const logger = createClientLogger({ component: "ProfileSettings" });

interface ProfileSettingsProps {}

export const ProfileSettings: FC<ProfileSettingsProps> = ({}) => {
  const {
    profile,
    setProfile,
    envKeyMap,
    setAvailableHostedModels,
    setAvailableOpenRouterModels,
    availableOpenRouterModels,
    setFiles,
  } = useContext(ChatbotUIContext);

  const { t } = useTranslation();

  const router = useRouter();

  const buttonRef = useRef<HTMLButtonElement>(null);

  const [isOpen, setIsOpen] = useState(false);

  const { data: userSession, status: _status } = useSession();

  const [_displayName, _setDisplayName] = useState(profile?.display_name || "");
  const [username, _setUsername] = useState(profile?.username || "");
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [loadingUsername, setLoadingUsername] = useState(false);

  const [profileImageSrc, setProfileImageSrc] = useState(profile?.image_url);

  const userName = userSession?.user?.name || "";

  const [profileImageFile, _setProfileImageFile] = useState<File | null>(null);
  const [profileInstructions, setProfileInstructions] = useState(
    profile?.profile_context || "",
  );

  const groups = userSession?.user?.groups || ([] as { id: string }[]);
  const groupIds = groups.map(group => group.id);
  const [hasAccess, setHasAccess] = useState(false);
  const params = useParams();
  const workspaceId = params.workspaceid as string;
  const [developerMode, setDeveloperMode] = useState(
    profile?.developer_mode || false,
  );

  useEffect(() => {
    (async () => {
      const isAdmin = await getIsAdminGroups(groupIds);

      if (isAdmin) {
        setHasAccess(true);
      }
    })();
  }, [groupIds]);

  useEffect(() => {
    if (profile?.developer_mode !== undefined) {
      setDeveloperMode(profile.developer_mode);
    }
    if (profile?.profile_context !== undefined) {
      setProfileInstructions(profile.profile_context);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.image_url) {
      setProfileImageSrc(profile.image_url);
    }
  }, [profile?.image_url]);

  const [useAzureOpenai, setUseAzureOpenai] = useState(
    profile?.use_azure_openai,
  );
  const [openaiAPIKey, setOpenaiAPIKey] = useState(
    profile?.openai_api_key || "",
  );
  const [openaiOrgID, setOpenaiOrgID] = useState(
    profile?.openai_organization_id || "",
  );
  const [azureOpenaiAPIKey, setAzureOpenaiAPIKey] = useState(
    profile?.azure_openai_api_key || "",
  );
  const [azureOpenaiEndpoint, setAzureOpenaiEndpoint] = useState(
    profile?.azure_openai_endpoint || "",
  );
  const [azureOpenai35TurboID, setAzureOpenai35TurboID] = useState(
    profile?.azure_openai_35_turbo_id || "",
  );
  const [azureOpenai45TurboID, setAzureOpenai45TurboID] = useState(
    profile?.azure_openai_45_turbo_id || "",
  );
  const [azureOpenai45VisionID, setAzureOpenai45VisionID] = useState(
    profile?.azure_openai_45_vision_id || "",
  );
  const [azureOpenaiGpt5ID, setAzureOpenaiGpt5ID] = useState(
    profile?.azure_openai_gpt5_id || "",
  );
  const [azureOpenaiO3MiniID, setAzureOpenaiO3MiniID] = useState(
    (profile as any)?.azure_openai_o3_mini_id || "",
  );
  const [azureEmbeddingsID, setAzureEmbeddingsID] = useState(
    profile?.azure_openai_embeddings_id || "",
  );
  const [anthropicAPIKey, setAnthropicAPIKey] = useState(
    profile?.anthropic_api_key || "",
  );
  const [googleGeminiAPIKey, setGoogleGeminiAPIKey] = useState(
    profile?.google_gemini_api_key || "",
  );
  const [mistralAPIKey, setMistralAPIKey] = useState(
    profile?.mistral_api_key || "",
  );
  const [groqAPIKey, setGroqAPIKey] = useState(profile?.groq_api_key || "");
  const [perplexityAPIKey, setPerplexityAPIKey] = useState(
    profile?.perplexity_api_key || "",
  );

  const [openrouterAPIKey, setOpenrouterAPIKey] = useState(
    profile?.openrouter_api_key || "",
  );

  const [dalleAPIKey, setDalleAPIKey] = useState(profile?.dalle_api_key || "");

  const [flux1APIKey, setFlux1APIKey] = useState(profile?.flux1_api_key || "");
  const [deepseekAPIServiceAccount, setDeepseekAPIServiceAccount] = useState(
    profile?.deepseek_api_service_account || "",
  );

  const [isLoading, setIsLoading] = useState(false);
  const handleSignOut = async () => {
    setIsLoading(true);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && data.session?.user) {
        const userId = data.session.user.id;
        await supabase
          .from("profiles")
          .update({ is_tempchat_popup: false })
          .eq("user_id", userId);
      }
    } catch (error) {
      logger.error("Error updating profile before logout", {
        error: String(error),
      });
    }

    await Promise.all([supabase.auth.signOut(), signOut({ redirect: false })]);

    router.push("/login");
    router.refresh();
  };

  const handleSave = async () => {
    if (!profile) return;
    let profileImageUrl = profile.image_url;
    let profileImagePath = "";
    if (username && username !== profile.username) {
      if (username.length < PROFILE_USERNAME_MIN) {
        toast.error(
          t(`Username must be at least ${PROFILE_USERNAME_MIN} characters`),
        );
        return;
      }
      if (username.length > PROFILE_USERNAME_MAX) {
        toast.error(
          t(`Username must be at most ${PROFILE_USERNAME_MAX} characters`),
        );
        return;
      }
      if (!usernameAvailable) {
        toast.error(t("Username is not available"));
        return;
      }
    }
    if (profileImageFile) {
      const { path, url } = await uploadProfileImage(profile, profileImageFile);
      profileImageUrl = url ?? profileImageUrl;
      profileImagePath = path;
    }

    const updatedProfile = await updateProfile(profile.id, {
      ...profile,
      profile_context: profileInstructions,
      image_url: profileImageUrl,
      image_path: profileImagePath,
      developer_mode: developerMode,
    } as any);

    setProfile(updatedProfile);
    const fileData = await getFileWorkspacesByWorkspaceId(workspaceId);
    setFiles(fileData.files || []);
    toast.success(t("Profile updated!"));

    const providers = [
      "openai",
      "google",
      "azure",
      "anthropic",
      "mistral",
      "groq",
      "perplexity",
      "openrouter",
      "deepseek",
    ];

    providers.forEach(async provider => {
      let providerKey: keyof typeof profile;

      if (provider === "google") {
        providerKey = "google_gemini_api_key";
      } else if (provider === "azure") {
        providerKey = "azure_openai_api_key";
      } else {
        providerKey = `${provider}_api_key` as keyof typeof profile;
      }

      const models = LLM_LIST_MAP[provider];
      const envKeyActive = envKeyMap[provider];

      if (!envKeyActive) {
        const hasApiKey = !!updatedProfile[providerKey];

        if (provider === "openrouter") {
          if (hasApiKey && availableOpenRouterModels.length === 0) {
            const openrouterModels: OpenRouterLLM[] =
              await fetchOpenRouterModels();
            setAvailableOpenRouterModels(prev => {
              const newModels = openrouterModels.filter(
                model =>
                  !prev.some(prevModel => prevModel.modelId === model.modelId),
              );
              return [...prev, ...newModels];
            });
          } else {
            setAvailableOpenRouterModels([]);
          }
        } else {
          if (hasApiKey && Array.isArray(models)) {
            setAvailableHostedModels(prev => {
              const newModels = models.filter(
                model =>
                  !prev.some(prevModel => prevModel.modelId === model.modelId),
              );
              return [...prev, ...newModels];
            });
          } else if (!hasApiKey && Array.isArray(models)) {
            setAvailableHostedModels(prev =>
              prev.filter(model => !models.includes(model)),
            );
          }
        }
      }
    });

    setIsOpen(false);
  };

  const debounce = (func: (...args: any[]) => void, wait: number) => {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: any[]) => {
      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(() => {
        timeout = null;
        func(...args);
      }, wait);
    };
  };

  const _checkUsernameAvailability = useCallback(
    debounce(async (username: string) => {
      if (!username) return;

      if (username.length < PROFILE_USERNAME_MIN) {
        setUsernameAvailable(false);
        return;
      }

      if (username.length > PROFILE_USERNAME_MAX) {
        setUsernameAvailable(false);
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        setUsernameAvailable(false);
        toast.error(
          t(
            "Username must be letters, numbers, or underscores only - no other characters or spacing allowed.",
          ),
        );
        return;
      }

      setLoadingUsername(true);

      const response = await fetch(`/api/username/available`, {
        method: "POST",
        body: JSON.stringify({ username }),
      });

      const data = await response.json();
      const isAvailable = data.isAvailable;

      setUsernameAvailable(isAvailable);

      if (username === profile?.username) {
        setUsernameAvailable(true);
      }

      setLoadingUsername(false);
    }, 500),
    [profile?.username, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      buttonRef.current?.click();
    }
  };

  if (!profile) return null;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {profileImageSrc ? (
          <Image
            className="mt-2 size-[34px] cursor-pointer rounded hover:opacity-50"
            src={profileImageSrc}
            height={34}
            width={34}
            alt={t("Image")}
          />
        ) : (
          <Button size="icon" variant="ghost">
            <IconUser size={SIDEBAR_ICON_SIZE} />
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        className="flex flex-col justify-between p-4"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto pr-2 pt-2 pb-2">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between space-x-2">
              <div>{t("User Settings")}</div>

              <Button
                tabIndex={-1}
                className="min-w-[90px] text-xs"
                size="sm"
                onClick={handleSignOut}
              >
                {isLoading ? (
                  <IconLoader2 className="mx-auto size-7 animate-spin" />
                ) : (
                  <>
                    <IconLogout className="mr-1" size={20} />
                    {t("Logout")}
                  </>
                )}
              </Button>
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="profile">
            <TabsList className="mt-4 grid w-full grid-cols-1">
              <TabsTrigger value="profile">{t("Profile")}</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-4" value="profile">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Label>{t("Username")}</Label>

                  {/* <div className=" text-xs opacity-70 disabled:cursor-not-allowed">
                    {username !== profile.username ? (
                      usernameAvailable ? (
                        <div className="text-green-500">{t("AVAILABLE")}</div>
                      ) : (
                        <div className="text-red-500">{t("UNAVAILABLE")}</div>
                      )
                    ) : null}
                  </div> */}
                </div>

                <div className="relative">
                  <Input
                    className="pointer-events-none pr-10 opacity-70 disabled:cursor-not-allowed"
                    placeholder={t("Username")}
                    value={userName}
                    readOnly
                    disabled
                    minLength={PROFILE_USERNAME_MIN}
                    maxLength={PROFILE_USERNAME_MAX}
                  />

                  {username !== profile.username ? (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      {loadingUsername && (
                        <IconLoader2 className="animate-spin" />
                      )}
                    </div>
                  ) : null}
                </div>

                {/* <LimitDisplay
                  used={username.length}
                  limit={PROFILE_USERNAME_MAX}
                /> */}
              </div>

              <div className="space-y-1">
                <Label>{t("Profile Image")}</Label>
                {/* <img src={userSession?.user?.image} alt="test" /> */}
                {profileImageSrc ? (
                  <Image
                    src={profileImageSrc}
                    height={50}
                    width={50}
                    alt={t("Profile Image")}
                    className="rounded"
                  />
                ) : (
                  <IconUser
                    height={50}
                    width={50}
                    className="border-input rounded border border-solid"
                  />
                )}
                {/* <Image
                  src={profileImageSrc}
                  image={profileImageFile}
                  height={50}
                  width={50}
                  onSrcChange={setProfileImageSrc}
                  onImageChange={setProfileImageFile}

                /> */}
              </div>

              <div className="space-y-1">
                <Label>{t("Chat Display Name")}</Label>

                <Input
                  className="pointer-events-none opacity-70 disabled:cursor-not-allowed"
                  placeholder={t("Chat Display Name")}
                  value={userName}
                  readOnly
                  disabled
                  maxLength={PROFILE_DISPLAY_NAME_MAX}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">
                  {t(
                    "What would you like the AI to know about you to provide better responses?",
                  )}
                </Label>

                <TextareaAutosize
                  value={profileInstructions}
                  onValueChange={setProfileInstructions}
                  placeholder={t("Profile context... (optional)")}
                  minRows={6}
                  maxRows={10}
                />

                <LimitDisplay
                  used={profileInstructions.length}
                  limit={PROFILE_CONTEXT_MAX}
                />
              </div>
              <div className="mr-2 flex items-center justify-between">
                <Label>{t("Developer Mode")}</Label>
                <Switch
                  checked={developerMode}
                  onCheckedChange={setDeveloperMode}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">{t("Language")}</Label>
                <br />
                <LanguageChanger />
              </div>

              <div className="space-y-3">
                <AzureGroupsSelector />

                {hasAccess && (
                  <Button
                    onClick={() => router.push("/admin-dashboard")}
                    className="w-full text-center"
                  >
                    <IconDeviceAnalytics className="mr-2" />
                    Go to Dashboard
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent className="mt-4 space-y-4" value="keys">
              <div className="mt-5 space-y-2">
                <Label className="flex items-center">
                  {useAzureOpenai
                    ? envKeyMap["azure"]
                      ? ""
                      : "Azure OpenAI API Key"
                    : envKeyMap["openai"]
                      ? ""
                      : "OpenAI API Key"}

                  <Button
                    className={cn(
                      "h-[18px] w-[150px] text-[11px]",
                      (useAzureOpenai && !envKeyMap["azure"]) ||
                        (!useAzureOpenai && !envKeyMap["openai"])
                        ? "ml-3"
                        : "mb-3",
                    )}
                    onClick={() => setUseAzureOpenai(!useAzureOpenai)}
                  >
                    {useAzureOpenai
                      ? "Switch To Standard OpenAI"
                      : "Switch To Azure OpenAI"}
                  </Button>
                </Label>

                {useAzureOpenai ? (
                  <>
                    {envKeyMap["azure"] ? (
                      <Label>Azure OpenAI API key set by admin.</Label>
                    ) : (
                      <Input
                        placeholder="Azure OpenAI API Key"
                        type="password"
                        value={azureOpenaiAPIKey}
                        onChange={e => setAzureOpenaiAPIKey(e.target.value)}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {envKeyMap["openai"] ? (
                      <Label>OpenAI API key set by admin.</Label>
                    ) : (
                      <Input
                        placeholder="OpenAI API Key"
                        type="password"
                        value={openaiAPIKey}
                        onChange={e => setOpenaiAPIKey(e.target.value)}
                      />
                    )}
                  </>
                )}
              </div>

              <div className="ml-8 space-y-3">
                {useAzureOpenai ? (
                  <>
                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_openai_endpoint"] ? (
                          <Label className="text-xs">
                            Azure endpoint set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure Endpoint</Label>

                            <Input
                              placeholder="https://your-endpoint.openai.azure.com"
                              value={azureOpenaiEndpoint}
                              onChange={e =>
                                setAzureOpenaiEndpoint(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_35_turbo_name"] ? (
                          <Label className="text-xs">
                            Azure GPT-3.5 Turbo deployment name set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure GPT-3.5 Turbo Deployment Name</Label>

                            <Input
                              placeholder="Azure GPT-3.5 Turbo Deployment Name"
                              value={azureOpenai35TurboID}
                              onChange={e =>
                                setAzureOpenai35TurboID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_45_turbo_name"] ? (
                          <Label className="text-xs">
                            Azure GPT-4.5 Turbo deployment name set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure GPT-4.5 Turbo Deployment Name</Label>

                            <Input
                              placeholder="Azure GPT-4.5 Turbo Deployment Name"
                              value={azureOpenai45TurboID}
                              onChange={e =>
                                setAzureOpenai45TurboID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_45_vision_name"] ? (
                          <Label className="text-xs">
                            Azure GPT-4.5 Vision deployment name set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure GPT-4.5 Vision Deployment Name</Label>

                            <Input
                              placeholder="Azure GPT-4.5 Vision Deployment Name"
                              value={azureOpenai45VisionID}
                              onChange={e =>
                                setAzureOpenai45VisionID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_5_name"] ? (
                          <Label className="text-xs">
                            Azure GPT-5 deployment name set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure GPT-5 Deployment Name</Label>

                            <Input
                              placeholder="Azure GPT-5 Deployment Name"
                              value={azureOpenaiGpt5ID}
                              onChange={e =>
                                setAzureOpenaiGpt5ID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_o3_mini_name"] ? (
                          <Label className="text-xs">
                            Azure O3-Mini deployment name set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure O3-Mini Deployment Name</Label>

                            <Input
                              placeholder="Azure O3-Mini Deployment Name"
                              value={azureOpenaiO3MiniID}
                              onChange={e =>
                                setAzureOpenaiO3MiniID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_embeddings_name"] ? (
                          <Label className="text-xs">
                            Azure Embeddings deployment name set by admin.
                          </Label>
                        ) : (
                          <>
                            <Label>Azure Embeddings Deployment Name</Label>

                            <Input
                              placeholder="Azure Embeddings Deployment Name"
                              value={azureEmbeddingsID}
                              onChange={e =>
                                setAzureEmbeddingsID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      {envKeyMap["openai_organization_id"] ? (
                        <Label className="text-xs">
                          OpenAI Organization ID set by admin.
                        </Label>
                      ) : (
                        <>
                          <Label>OpenAI Organization ID</Label>

                          <Input
                            placeholder="OpenAI Organization ID (optional)"
                            disabled={
                              !!process.env.NEXT_PUBLIC_OPENAI_ORGANIZATION_ID
                            }
                            type="password"
                            value={openaiOrgID}
                            onChange={e => setOpenaiOrgID(e.target.value)}
                          />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["anthropic"] ? (
                  <Label>Anthropic API key set by admin.</Label>
                ) : (
                  <>
                    <Label>Anthropic API Key</Label>
                    <Input
                      placeholder="Anthropic API Key"
                      type="password"
                      value={anthropicAPIKey}
                      onChange={e => setAnthropicAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["google"] ? (
                  <Label>Google Gemini API key set by admin.</Label>
                ) : (
                  <>
                    <Label>Google Gemini API Key</Label>
                    <Input
                      placeholder="Google Gemini API Key"
                      type="password"
                      value={googleGeminiAPIKey}
                      onChange={e => setGoogleGeminiAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["mistral"] ? (
                  <Label>Mistral API key set by admin.</Label>
                ) : (
                  <>
                    <Label>Mistral API Key</Label>
                    <Input
                      placeholder="Mistral API Key"
                      type="password"
                      value={mistralAPIKey}
                      onChange={e => setMistralAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["groq"] ? (
                  <Label>Groq API key set by admin.</Label>
                ) : (
                  <>
                    <Label>Groq API Key</Label>
                    <Input
                      placeholder="Groq API Key"
                      type="password"
                      value={groqAPIKey}
                      onChange={e => setGroqAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["perplexity"] ? (
                  <Label>Perplexity API key set by admin.</Label>
                ) : (
                  <>
                    <Label>Perplexity API Key</Label>
                    <Input
                      placeholder="Perplexity API Key"
                      type="password"
                      value={perplexityAPIKey}
                      onChange={e => setPerplexityAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["openrouter"] ? (
                  <Label>OpenRouter API key set by admin.</Label>
                ) : (
                  <>
                    <Label>OpenRouter API Key</Label>
                    <Input
                      placeholder="OpenRouter API Key"
                      type="password"
                      value={openrouterAPIKey}
                      onChange={e => setOpenrouterAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["dalle"] ? (
                  <Label>DALL-E API key set by admin.</Label>
                ) : (
                  <>
                    <Label>DALL-E API Key</Label>
                    <Input
                      placeholder="DALL-E API Key"
                      type="password"
                      value={dalleAPIKey}
                      onChange={e => setDalleAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["flux1"] ? (
                  <Label>FLUX.1 API key set by admin.</Label>
                ) : (
                  <>
                    <Label>FLUX.1 API Key</Label>
                    <Input
                      placeholder="FLUX.1 API Key"
                      type="password"
                      value={flux1APIKey}
                      onChange={e => setFlux1APIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["deepseek"] ? (
                  <Label>Deepseek API key set by admin.</Label>
                ) : (
                  <>
                    <Label>Deepseek API Service Account</Label>
                    <Input
                      placeholder="Deepseek API Service Account"
                      type="password"
                      value={deepseekAPIServiceAccount}
                      onChange={e =>
                        setDeepseekAPIServiceAccount(e.target.value)
                      }
                    />
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-6 flex items-center">
          <div className="flex items-center space-x-1">
            <ThemeSwitcher />

            {/* <WithTooltip
              display={
                <div>

                 { t("Download Gosign AI 1.0 data as JSON. Import coming soon!")}

                </div>
              }
              trigger={
                <IconFileDownload
                  className="cursor-pointer hover:opacity-50"
                  size={32}
                  onClick={exportLocalStorageAsJSON}
                />
              }
            /> */}
          </div>

          <div className="ml-auto space-x-2">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              {t("Cancel")}
            </Button>

            <Button ref={buttonRef} onClick={handleSave}>
              {t("Save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
