"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const logger = createClientLogger({ component: "SettingsTab" });
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

type ConnectionStatus = "idle" | "testing" | "connected" | "error";

export default function SettingsTab() {
  const { t } = useTranslation();
  const [n8nUrl, setN8nUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/n8n/settings");
      const data = await response.json();

      if (data.success && data.data) {
        setN8nUrl(data.data.n8n_url || "");
        setApiKey(data.data.n8n_api_key || "");

        // Auto-test connection if settings exist
        if (data.data.n8n_url && data.data.n8n_api_key) {
          testConnection(data.data.n8n_url, data.data.n8n_api_key, true);
        }
      }
    } catch (error) {
      logger.error("Error fetching settings", { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async (url?: string, key?: string, silent = false) => {
    const testUrl = url || n8nUrl;
    const testKey = key || apiKey;

    if (!testUrl || !testKey) {
      toast.error(t("Please enter both n8n URL and API key"));
      return;
    }

    setConnectionStatus("testing");
    setErrorMessage("");

    try {
      const response = await fetch("/api/n8n/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          n8n_url: testUrl,
          n8n_api_key: testKey,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus("connected");
        if (!silent) {
          toast.success(t("Connection successful!"));
        }
      } else {
        setConnectionStatus("error");
        setErrorMessage(data.error || t("Connection failed"));
        if (!silent) {
          toast.error(data.error || t("Connection failed"));
        }
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      setConnectionStatus("error");
      setErrorMessage(err.message || t("Connection test failed"));
      if (!silent) {
        toast.error(t("Connection test failed"));
      }
    }
  };

  const handleSave = async () => {
    if (!n8nUrl || !apiKey) {
      toast.error(t("Please enter both n8n URL and API key"));
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/n8n/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          n8n_url: n8nUrl,
          n8n_api_key: apiKey,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t("Settings saved successfully"));
        // Test connection after saving
        await testConnection();
      } else {
        toast.error(data.error || t("Failed to save settings"));
      }
    } catch (error) {
      logger.error("Error saving settings", { error: String(error) });
      toast.error(t("Error saving settings"));
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "testing":
        return <Loader2 className="size-5 animate-spin text-blue-500" />;
      case "connected":
        return <CheckCircle2 className="size-5 text-green-500" />;
      case "error":
        return <XCircle className="size-5 text-red-500" />;
      default:
        return <AlertCircle className="size-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "testing":
        return t("Testing connection...");
      case "connected":
        return t("Connected successfully");
      case "error":
        return t("Connection failed");
      default:
        return t("Not tested");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("n8n Connection Settings")}</CardTitle>
          <CardDescription>
            {t(
              "Configure your n8n instance connection to enable webhook integration",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="n8nUrl">
              {t("n8n Instance URL")}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="n8nUrl"
              type="url"
              value={n8nUrl}
              onChange={e => setN8nUrl(e.target.value)}
              placeholder="https://your-n8n-instance.com"
              disabled={isSaving || connectionStatus === "testing"}
            />
            <p className="text-muted-foreground text-xs">
              {t("Enter your n8n instance URL (e.g., https://n8n.example.com)")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {t("API Key")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="n8n_api_..."
              disabled={isSaving || connectionStatus === "testing"}
            />
            <p className="text-muted-foreground text-xs">
              {t(
                "Your n8n API key (found in Settings → API in your n8n instance)",
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={
                isSaving || connectionStatus === "testing" || !n8nUrl || !apiKey
              }
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("Saving...")}
                </>
              ) : (
                t("Save Settings")
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => testConnection()}
              disabled={connectionStatus === "testing" || !n8nUrl || !apiKey}
            >
              {connectionStatus === "testing" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("Testing...")}
                </>
              ) : (
                t("Test Connection")
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Connection Status")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <p className="font-medium">{getStatusText()}</p>
              {errorMessage && (
                <p className="text-destructive text-sm">{errorMessage}</p>
              )}
            </div>
          </div>

          {connectionStatus === "connected" && (
            <Alert className="mt-4 border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="size-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                {t(
                  "Your n8n instance is connected and ready to use. You can now create webhooks and assign them to AI models.",
                )}
              </AlertDescription>
            </Alert>
          )}

          {connectionStatus === "error" && (
            <Alert className="mt-4 border-red-500 bg-red-50 dark:bg-red-950">
              <XCircle className="size-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                {t(
                  "Failed to connect to n8n. Please check your URL and API key.",
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>{t("How to Get Your n8n API Key")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="text-muted-foreground list-inside list-decimal space-y-2 text-sm">
            <li>{t("Log in to your n8n instance")}</li>
            <li>{t("Go to Settings → API")}</li>
            <li>{t("Create a new API key or copy an existing one")}</li>
            <li>{t("Paste the API key in the field above")}</li>
            <li>{t('Click "Test Connection" to verify')}</li>
          </ol>

          <Alert className="mt-4">
            <AlertCircle className="size-4" />
            <AlertDescription>
              {t(
                "Make sure your n8n instance is accessible from this application and that CORS is properly configured.",
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
