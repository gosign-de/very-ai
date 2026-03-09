"use client";

import { ChatbotUIContext } from "@/context/context";
import { getProfileByUserId, updateProfile } from "@/db/profile";
import {
  getHomeWorkspaceByUserId,
  getWorkspacesByUserId,
} from "@/db/workspaces";

import { supabase } from "@/lib/supabase/browser-client";
import { TablesUpdate } from "@/supabase/types";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState, useRef, useTransition } from "react";
import { APIStep } from "../../../components/setup/api-step";
import { FinishStep } from "../../../components/setup/finish-step";
import { ProfileStep } from "../../../components/setup/profile-step";
import Loading from "@/app/[locale]/loading";
import {
  SETUP_STEP_COUNT,
  StepContainer,
} from "../../../components/setup/step-container";

export default function SetupPage() {
  const {
    profile,
    setProfile,
    setWorkspaces,
    setSelectedWorkspace,
    setEnvKeyMap: _setEnvKeyMap,
    setAvailableHostedModels: _setAvailableHostedModels,
    setAvailableOpenRouterModels: _setAvailableOpenRouterModels,
  } = useContext(ChatbotUIContext);

  const router = useRouter();
  const [_isPending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);

  // Profile Step
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState(profile?.username || "");
  const [usernameAvailable, setUsernameAvailable] = useState(true);

  // API Step
  const [useAzureOpenai, setUseAzureOpenai] = useState(true);
  const [openaiAPIKey, setOpenaiAPIKey] = useState("");
  const [openaiOrgID, setOpenaiOrgID] = useState("");
  const [azureOpenaiAPIKey, setAzureOpenaiAPIKey] = useState("");
  const [azureOpenaiEndpoint, setAzureOpenaiEndpoint] = useState("");
  const [o1PreviewAPIKey, setO1PreviewAPIKey] = useState("");
  const [azureOpenai35TurboID, setAzureOpenai35TurboID] =
    useState("gpt-4o-prod");
  const [azureOpenai45TurboID, setAzureOpenai45TurboID] =
    useState("gpt-4o-prod");
  const [azureOpenai45VisionID, setAzureOpenai45VisionID] =
    useState("gpt-4o-prod");
  const [azureOpenaiEmbeddingsID, setAzureOpenaiEmbeddingsID] =
    useState("gpt-4o-prod");
  const [anthropicAPIKey, setAnthropicAPIKey] = useState("");
  const [googleGeminiAPIKey, setGoogleGeminiAPIKey] = useState("");
  const [dalleAPIKey, setDalleAPIKey] = useState("");
  const [flux1APIKey, setFlux1APIKey] = useState("");
  const [mistralAPIKey, setMistralAPIKey] = useState("");
  const [groqAPIKey, setGroqAPIKey] = useState("");
  const [perplexityAPIKey, setPerplexityAPIKey] = useState("");
  const [openrouterAPIKey, setOpenrouterAPIKey] = useState("");
  const [deepseekAPIKey, setDeepseekAPIKey] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const hasInitialized = useRef(false);
  const isSaving = useRef(false);

  // Helper to navigate with fallback
  const navigateTo = (url: string) => {
    setIsRedirecting(true);
    startTransition(() => {
      router.replace(url);
    });
    // Fallback: if still on same page after 1.5s, force navigation
    setTimeout(() => {
      if (window.location.pathname.includes("/setup")) {
        window.location.href = url;
      }
    }, 2000);
  };

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          router.replace("/login");
          return;
        }

        const user = session.user;

        try {
          const profile = await getProfileByUserId(user.id);
          setProfile(profile);
          setUsername(profile.username);

          if (profile.has_onboarded) {
            // User already onboarded - redirect to chat
            try {
              const homeWorkspaceId = await getHomeWorkspaceByUserId(user.id);
              navigateTo(`/${homeWorkspaceId}/chat`);
              return;
            } catch (_wsError) {
              // If no home workspace, let them go through setup again
              setLoading(false);
            }
          } else {
            // User not onboarded - show setup (which auto-saves)
            setLoading(false);
          }
        } catch (_profileError) {
          setSetupError("Failed to load profile. Please try logging in again.");
          setLoading(false);
        }
      } catch (_error) {
        setSetupError("An error occurred during setup. Please try again.");
        setLoading(false);
      }
    })();
  }, []);

  const handleShouldProceed = (proceed: boolean) => {
    if (proceed) {
      if (currentStep === SETUP_STEP_COUNT) {
        handleSaveSetupSetting();
      } else {
        setCurrentStep(currentStep + 1);
      }
    } else {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSaveSetupSetting = async () => {
    if (isSaving.current) return;
    if (!profile) {
      setSetupError("Profile not loaded. Please refresh the page.");
      return;
    }
    isSaving.current = true;
    setIsRedirecting(true);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      const updateProfilePayload: TablesUpdate<"profiles"> = {
        ...profile,
        has_onboarded: true,
        display_name: displayName || profile.display_name,
        username: username || profile.username,
        openai_api_key: openaiAPIKey,
        openai_organization_id: openaiOrgID,
        anthropic_api_key: anthropicAPIKey,
        google_gemini_api_key: googleGeminiAPIKey,
        dalle_api_key: dalleAPIKey,
        flux1_api_key: flux1APIKey,
        mistral_api_key: mistralAPIKey,
        groq_api_key: groqAPIKey,
        perplexity_api_key: perplexityAPIKey,
        openrouter_api_key: openrouterAPIKey,
        deepseek_api_service_account: deepseekAPIKey,
        use_azure_openai: useAzureOpenai,
        azure_openai_api_key: azureOpenaiAPIKey,
        azure_openai_endpoint: azureOpenaiEndpoint,
        o1_preview_api_key: o1PreviewAPIKey,
        azure_openai_35_turbo_id: azureOpenai35TurboID,
        azure_openai_45_turbo_id: azureOpenai45TurboID,
        azure_openai_45_vision_id: azureOpenai45VisionID,
        azure_openai_embeddings_id: azureOpenaiEmbeddingsID,
      };

      const updatedProfile = await updateProfile(
        profile.id,
        updateProfilePayload,
      );
      setProfile(updatedProfile);

      const workspaces = await getWorkspacesByUserId(profile.user_id);
      const homeWorkspace = workspaces.find(w => w.is_home);

      if (!homeWorkspace) {
        setSetupError("No home workspace found. Please contact support.");
        isSaving.current = false;
        setIsRedirecting(false);
        return;
      }

      setSelectedWorkspace(homeWorkspace);
      setWorkspaces(workspaces);

      navigateTo(`/${homeWorkspace.id}/chat`);
    } catch (_error) {
      setSetupError("Failed to save settings. Please try again.");
      isSaving.current = false;
      setIsRedirecting(false);
    }
  };

  const _renderStep = (stepNum: number) => {
    switch (stepNum) {
      // Profile Step
      case 1:
        return (
          <StepContainer
            stepDescription="Let's create your profile."
            stepNum={currentStep}
            stepTitle="Welcome to Gosign AI Chatbot"
            onShouldProceed={handleShouldProceed}
            showNextButton={!!(username && usernameAvailable)}
            showBackButton={false}
          >
            <ProfileStep
              username={username}
              usernameAvailable={usernameAvailable}
              displayName={displayName}
              onUsernameAvailableChange={setUsernameAvailable}
              onUsernameChange={setUsername}
              onDisplayNameChange={setDisplayName}
            />
          </StepContainer>
        );

      // API Step
      case 2:
        return (
          <StepContainer
            stepDescription="Enter API keys for each service you'd like to use."
            stepNum={currentStep}
            stepTitle="Set API Keys (optional)"
            onShouldProceed={handleShouldProceed}
            showNextButton={true}
            showBackButton={true}
          >
            <APIStep
              openaiAPIKey={openaiAPIKey}
              openaiOrgID={openaiOrgID}
              azureOpenaiAPIKey={azureOpenaiAPIKey}
              o1PreviewAPIKey={o1PreviewAPIKey}
              azureOpenaiEndpoint={azureOpenaiEndpoint}
              azureOpenai35TurboID={azureOpenai35TurboID}
              azureOpenai45TurboID={azureOpenai45TurboID}
              azureOpenai45VisionID={azureOpenai45VisionID}
              azureOpenaiEmbeddingsID={azureOpenaiEmbeddingsID}
              anthropicAPIKey={anthropicAPIKey}
              dalleAPIKey={dalleAPIKey}
              flux1APIKey={flux1APIKey}
              googleGeminiAPIKey={googleGeminiAPIKey}
              mistralAPIKey={mistralAPIKey}
              groqAPIKey={groqAPIKey}
              perplexityAPIKey={perplexityAPIKey}
              useAzureOpenai={useAzureOpenai}
              onOpenaiAPIKeyChange={setOpenaiAPIKey}
              onOpenaiOrgIDChange={setOpenaiOrgID}
              onAzureOpenaiAPIKeyChange={setAzureOpenaiAPIKey}
              onO1PreviewAPIKeyChange={setO1PreviewAPIKey}
              onAzureOpenaiEndpointChange={setAzureOpenaiEndpoint}
              onAzureOpenai35TurboIDChange={setAzureOpenai35TurboID}
              onAzureOpenai45TurboIDChange={setAzureOpenai45TurboID}
              onAzureOpenai45VisionIDChange={setAzureOpenai45VisionID}
              onAzureOpenaiEmbeddingsIDChange={setAzureOpenaiEmbeddingsID}
              onAnthropicAPIKeyChange={setAnthropicAPIKey}
              onGoogleGeminiAPIKeyChange={setGoogleGeminiAPIKey}
              onDalleAPIKeyChange={setDalleAPIKey}
              onFlux1APIKeyChange={setFlux1APIKey}
              onMistralAPIKeyChange={setMistralAPIKey}
              onGroqAPIKeyChange={setGroqAPIKey}
              onPerplexityAPIKeyChange={setPerplexityAPIKey}
              onUseAzureOpenaiChange={setUseAzureOpenai}
              openrouterAPIKey={openrouterAPIKey}
              onOpenrouterAPIKeyChange={setOpenrouterAPIKey}
              deepseekAPIKey={deepseekAPIKey}
              onDeepseekAPIKeyChange={setDeepseekAPIKey}
            />
          </StepContainer>
        );

      // Finish Step
      case 3:
        return (
          <StepContainer
            stepDescription="You are all set up!"
            stepNum={currentStep}
            stepTitle="Setup Complete"
            onShouldProceed={handleShouldProceed}
            showNextButton={true}
            showBackButton={true}
          >
            <FinishStep displayName={displayName} />
          </StepContainer>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    if (!loading && !setupError && !isSaving.current && profile) {
      handleSaveSetupSetting();
    }
  }, [loading, setupError, profile]);

  if (loading || isRedirecting) {
    return <Loading />;
  }

  if (setupError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-red-500">{setupError}</p>
        <button
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          onClick={() => router.push("/")}
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <Loading />
    </div>
  );
}
