"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect, useMemo, useCallback } from "react";

const logger = createClientLogger({ component: "DataLossPreventionPage" });
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconDeviceFloppy,
  IconPlus,
  IconEdit,
  IconTrash,
  IconShieldLock,
} from "@tabler/icons-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  getPIIProtectionSettings,
  updatePIIProtectionSettings,
  CustomPattern,
  PIIProtectionSettings,
} from "@/lib/config/pii-protection-settings";
import {
  getPiiCategoriesForEngine,
  getGroupedPiiCategories,
  PiiCategoryGroup,
} from "@/lib/config/pii-categories";
import { LLM_LIST } from "@/lib/models/llm/llm-list";
import { cn } from "@/lib/utils";
// import { AuditLogTable } from "@/components/pii/AuditLogTable";

type DetectionEngine = "azure" | "presidio";

const CATEGORY_GROUP_ORDER: PiiCategoryGroup[] = [
  "personal",
  "location",
  "organization",
  "identification",
  "financial",
  "medical",
  "security",
];

const PRESIDIO_ENTITY_TO_CATEGORY: Record<string, string> = {
  PERSON: "Person",
  PERSON_FIRST_NAME: "Person",
  PERSON_LAST_NAME: "Person",
  ORGANIZATION: "Organization",
  LOCATION: "Address",
  EMAIL_ADDRESS: "Email",
  PHONE_NUMBER: "PhoneNumber",
  IP_ADDRESS: "IPAddress",
  URL: "URL",
  CREDIT_CARD: "CreditCardNumber",
  CRYPTO: "CryptoAddress",
  IBAN_CODE: "InternationalBankingAccountNumber",
  US_BANK_NUMBER: "BankAccountNumber",
  US_BANK_ROUTING: "ABARoutingNumber",
  PASSPORT: "PassportNumber",
  US_PASSPORT: "PassportNumber",
  US_DRIVER_LICENSE: "DriversLicenseNumber",
  US_LICENSE_PLATE: "LicensePlate",
  US_SSN: "USSocialSecurityNumber",
  US_ITIN: "USIndividualTaxpayerIdentification",
  DATE_TIME: "Date",
};

function sanitizeCategoriesForEngine(
  categories: string[] | undefined | null,
  engine: DetectionEngine,
): string[] {
  if (!categories || categories.length === 0) {
    return [];
  }

  const orderMap = new Map<string, number>();
  getPiiCategoriesForEngine(engine).forEach((category, index) => {
    orderMap.set(category.value, index);
  });

  const canonicalCategories = categories
    .map(value => {
      if (!value) {
        return null;
      }

      if (engine === "presidio") {
        const mapped = PRESIDIO_ENTITY_TO_CATEGORY[value.toUpperCase()];
        return mapped ?? value;
      }

      return value;
    })
    .filter((value): value is string => Boolean(value));

  const known: string[] = [];
  const unknown: string[] = [];

  canonicalCategories.forEach(value => {
    if (!value) {
      return;
    }

    if (orderMap.has(value)) {
      known.push(value);
    } else if (engine !== "presidio") {
      unknown.push(value);
    }
  });

  const dedupedKnown = Array.from(new Set(known)).sort(
    (a, b) => orderMap.get(a)! - orderMap.get(b)!,
  );

  const dedupedUnknown = Array.from(new Set(unknown));

  return [...dedupedKnown, ...dedupedUnknown];
}

export default function DataLossPreventionPage() {
  const { t } = useTranslation();
  const getCategoryGroupTitle = (group: PiiCategoryGroup): string => {
    const titles: Record<PiiCategoryGroup, string> = {
      personal: t("Personal Information"),
      location: t("Location Information"),
      organization: t("Organization Information"),
      identification: t("Identification Documents"),
      financial: t("Financial Information"),
      medical: t("Medical Information"),
      security: t("Security & Credentials"),
    };
    return titles[group];
  };
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Global Enable/Disable State
  const [piiEnabled, setPiiEnabled] = useState(false);
  const [processDoc, setProcessDoc] = useState(false);
  const [processImage, setProcessImage] = useState(false);
  const [logEnabled, setLogEnabled] = useState(false);
  const [logRetentionDays, setLogRetentionDays] = useState(0);

  // General Settings State
  const [selectedModel, setSelectedModel] = useState("global-default");
  const [piiDetectionEngine, setPiiDetectionEngine] =
    useState<DetectionEngine>("azure");

  // Custom Patterns State
  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>([]);

  // PII Categories State
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const currentEngineCategories = useMemo(
    () => getPiiCategoriesForEngine(piiDetectionEngine),
    [piiDetectionEngine],
  );

  const groupedCategories = useMemo(
    () => getGroupedPiiCategories(piiDetectionEngine),
    [piiDetectionEngine],
  );

  const allCategoryValues = useMemo(
    () => currentEngineCategories.map(category => category.value),
    [currentEngineCategories],
  );

  const sanitizeForCurrentEngine = useCallback(
    (categories: string[]) =>
      sanitizeCategoriesForEngine(categories, piiDetectionEngine),
    [piiDetectionEngine],
  );

  useEffect(() => {
    setSelectedCategories(prev => {
      const sanitized = sanitizeForCurrentEngine(prev);
      if (
        sanitized.length === prev.length &&
        sanitized.every((value, index) => value === prev[index])
      ) {
        return prev;
      }
      return sanitized;
    });
  }, [sanitizeForCurrentEngine]);

  // Sensitivity Labels State
  const [maxSensitivityLevel, setMaxSensitivityLevel] = useState<
    "public" | "internal" | "confidential" | "restricted"
  >("internal");

  // Add Pattern Dialog State
  const [isAddingPattern, setIsAddingPattern] = useState(false);
  const [newPattern, setNewPattern] = useState({
    name: "",
    description: "",
    regexPattern: "",
    confidence: 95,
  });

  const ACTIVE_MODELS = LLM_LIST.filter(
    model =>
      !model.modelId.includes("dalle") && !model.modelId.includes("imagen"),
  );

  const loadSettings = useCallback(
    async (model_id: string = "global-default") => {
      try {
        setIsLoading(true);
        const settings = await getPIIProtectionSettings(model_id);
        setSelectedModel(model_id);
        setPiiEnabled(settings.enabled);
        setPiiDetectionEngine(settings.detection_engine);
        setCustomPatterns(settings.custom_patterns || []);
        setSelectedCategories(settings.categories || []);
        setProcessDoc(settings.doc_processing);
        setProcessImage(settings.image_processing);
        setLogEnabled(settings.audit_log_enabled);
        setLogRetentionDays(settings.audit_log_retention_days);
        setMaxSensitivityLevel(settings.max_sensitivity_level);
      } catch (error) {
        logger.error("Error loading PII protection settings", {
          error: String(error),
        });
      } finally {
        if (model_id != "global-default") {
          toast.success(
            t("Configuration for {{modelId}} has been loaded successfully.", {
              modelId: model_id,
            }),
          );
        }
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    },
    [t],
  );

  // Load settings from API on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadSettings(selectedModel);
  }, [selectedModel, loadSettings]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const uniqueCategories = Array.from(new Set(selectedCategories));
      const settingsData: Partial<PIIProtectionSettings> = {
        model_id: selectedModel,
        enabled: piiEnabled,
        detection_engine: piiDetectionEngine,
        custom_patterns: customPatterns || [],
        categories: uniqueCategories,
        image_processing: processImage,
        doc_processing: processDoc,
        audit_log_enabled: logEnabled,
        audit_log_retention_days: logRetentionDays,
        max_sensitivity_level: maxSensitivityLevel,
      };
      logger.debug("[PII] Saving settings", { data: settingsData });
      await updatePIIProtectionSettings(settingsData);
      toast.success(t("Configuration saved successfully!"));
    } catch (error) {
      logger.error("Error saving configuration", { error: String(error) });
      toast.error(t("Failed to save configuration"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPattern = () => {
    if (!newPattern.name || !newPattern.regexPattern) {
      toast.error(t("Please fill in all required fields"));
      return;
    }

    const pattern: CustomPattern = {
      id: Date.now().toString(),
      name: newPattern.name,
      description: newPattern.description,
      regexPattern: newPattern.regexPattern,
      confidence: newPattern.confidence,
      status: "active",
    };

    setCustomPatterns([...customPatterns, pattern]);
    setNewPattern({
      name: "",
      description: "",
      regexPattern: "",
      confidence: 95,
    });
    setIsAddingPattern(false);
    toast.success(t("Pattern added successfully"));
  };

  const handleDeletePattern = (id: string) => {
    setCustomPatterns(customPatterns.filter(p => p.id !== id));
    toast.success(t("Pattern deleted successfully"));
  };

  const togglePatternStatus = (id: string) => {
    setCustomPatterns(
      customPatterns.map(p =>
        p.id === id
          ? { ...p, status: p.status === "active" ? "inactive" : "active" }
          : p,
      ),
    );
  };

  const handleToggleCategory = useCallback(
    (categoryValue: string) => {
      setSelectedCategories(prev => {
        const next = prev.includes(categoryValue)
          ? prev.filter(value => value !== categoryValue)
          : [...prev, categoryValue];

        return sanitizeForCurrentEngine(next);
      });
    },
    [sanitizeForCurrentEngine],
  );

  const handleToggleAllInGroup = useCallback(
    (group: PiiCategoryGroup) => {
      const categories = groupedCategories[group] ?? [];
      if (categories.length === 0) {
        return;
      }

      const groupValues = categories.map(category => category.value);

      setSelectedCategories(prev => {
        const hasAll = groupValues.every(value => prev.includes(value));
        const next = hasAll
          ? prev.filter(value => !groupValues.includes(value))
          : [...prev, ...groupValues];

        return sanitizeForCurrentEngine(next);
      });
    },
    [groupedCategories, sanitizeForCurrentEngine],
  );

  const handleSelectAll = useCallback(() => {
    setSelectedCategories([...allCategoryValues]);
  }, [allCategoryValues]);

  const handleDeselectAll = useCallback(() => {
    setSelectedCategories([]);
  }, []);

  if (isLoading && isInitialLoad) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <IconShieldLock className="text-muted-foreground mx-auto size-8 animate-spin" />
          <p className="text-muted-foreground mt-2 text-sm">
            {t("Loading PII protection settings...")}
          </p>
        </div>
      </div>
    );
  }

  const isBackgroundLoading = isLoading && !isInitialLoad;

  return (
    <div className="space-y-4">
      {isBackgroundLoading && (
        <div className="text-muted-foreground text-sm">
          {t("Loading model configuration...")}
        </div>
      )}
      <div
        className={cn(
          "space-y-6",
          isBackgroundLoading && "pointer-events-none opacity-60",
        )}
        aria-busy={isBackgroundLoading}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("Data Loss Prevention & PII Protection")}
            </h1>
            <p className="text-muted-foreground">
              {t(
                "Configure protection of personally identifiable information for all AI models and assistants.",
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              <IconDeviceFloppy className="mr-2 size-4" />
              {isSaving ? t("Saving...") : t("Save Configuration")}
            </Button>
          </div>
        </div>

        {/* Show configuration tabs only when PII protection is enabled */}
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">{t("General Settings")}</TabsTrigger>
            <TabsTrigger value="pii-categories">
              {t("PII Categories")}
            </TabsTrigger>
            <TabsTrigger value="custom-patterns">
              {t("Custom Patterns")}
            </TabsTrigger>
            <TabsTrigger value="sensitivity-labels">
              {t("Sensitivity Labels")}
            </TabsTrigger>
            <TabsTrigger value="audit-log">{t("Audit Log")}</TabsTrigger>
          </TabsList>

          {/* General Settings Tab */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("Model and Engine Selection")}</CardTitle>
                <CardDescription>
                  {t("Select the AI model and PII detection engine.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>{t("AI Model / Assistant")}</Label>
                  <Select
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Select model")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global-default">
                        🌍 {t("Global Default Configuration")}
                      </SelectItem>
                      {ACTIVE_MODELS.map(model => (
                        <SelectItem key={model.modelId} value={model.modelId}>
                          {model.modelId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "The configuration applies specifically to the selected model/assistant.",
                    )}
                  </p>
                </div>

                <div className="space-y-4">
                  <Label>{t("PII Detection Engine")}</Label>

                  {/* Azure AI Language Service */}
                  <div
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      piiDetectionEngine === "azure"
                        ? "border-white/40"
                        : "border-border hover:border-white/30"
                    }`}
                    onClick={() => setPiiDetectionEngine("azure")}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="detection-engine"
                        value="azure"
                        checked={piiDetectionEngine === "azure"}
                        onChange={() => setPiiDetectionEngine("azure")}
                        className="mt-1.5 accent-[#F47A1F]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">☁️</span>
                          <h3 className="font-semibold">
                            {t("Azure AI Language Service")}
                          </h3>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {t(
                            "Cloud-based PII detection with Microsoft Azure. Supports 50+ languages and advanced entity recognition. Requires Azure subscription.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Presidio SDK */}
                  <div
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      piiDetectionEngine === "presidio"
                        ? "border-white/40"
                        : "border-border hover:border-white/30"
                    }`}
                    onClick={() => setPiiDetectionEngine("presidio")}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="detection-engine"
                        value="presidio"
                        checked={piiDetectionEngine === "presidio"}
                        onChange={() => setPiiDetectionEngine("presidio")}
                        className="mt-1.5 accent-[#F47A1F]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🖥️</span>
                          <h3 className="font-semibold">
                            {t("Presidio SDK (Self-Hosted)")}
                          </h3>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {t(
                            "Open-source PII detection on your own infrastructure. Complete data control, GDPR compliant. Local deployment required.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Azure Configuration Info
                {piiDetectionEngine === "azure" && (
                  <div className="bg-muted rounded-lg border-l-4 border-blue-500 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">ℹ️</span>
                      <div>
                        <h4 className="font-semibold">Azure AI Language Service</h4>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Configure your Azure credentials under "Model Configuration" →
                          "Azure Settings". PII detection occurs in real-time via the Azure
                          API.
                        </p>
                      </div>
                    </div>
                  </div>
                )} */}
                </div>
              </CardContent>
            </Card>

            {/* Detection Mode */}
            <Card>
              <CardHeader>
                <CardTitle>{t("Detection Mode")}</CardTitle>
                <CardDescription>
                  {t(
                    "Define how detected personally identifiable information should be handled.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label>{t("Protection Mode")}</Label>

                  {/* Option 1: Automatic Anonymization */}
                  <div
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      piiEnabled
                        ? "border-white/40"
                        : "border-border hover:border-white/30"
                    }`}
                    onClick={() => setPiiEnabled(true)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="pii-protection-mode"
                        value="automatic"
                        checked={piiEnabled}
                        onChange={() => setPiiEnabled(true)}
                        className="mt-1.5 accent-[#F47A1F]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🔒</span>
                          <h3 className="font-semibold">
                            {t("Automatic Anonymization")}
                          </h3>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {t(
                            "All detected PII is replaced with placeholders before the request reaches the model.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Manual / No Protection */}
                  <div
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      !piiEnabled
                        ? "border-white/40"
                        : "border-border hover:border-white/30"
                    }`}
                    onClick={() => setPiiEnabled(false)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="pii-protection-mode"
                        value="manual"
                        checked={!piiEnabled}
                        onChange={() => setPiiEnabled(false)}
                        className="mt-1.5 accent-[#F47A1F]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🚫</span>
                          <h3 className="font-semibold">
                            {t("No Anonymization")}
                          </h3>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {t(
                            "PII protection stays disabled. Data is sent to the model without masking or filtering.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Document Processing */}
            <Card>
              <CardHeader>
                <CardTitle>{t("Document Processing")}</CardTitle>
                <CardDescription>
                  {t("Options for processing uploaded documents.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("Process Documents")}</Label>
                      <p className="text-muted-foreground text-sm">
                        {t(
                          "Automatically processes and analyzes text from Office (Word, Excel, PowerPoint) and PDF documents to detect personally identifiable information.",
                        )}
                      </p>
                    </div>

                    <Switch
                      checked={processDoc}
                      onCheckedChange={setProcessDoc}
                      className="ml-4"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logging & Compliance */}
            <Card>
              <CardHeader>
                <CardTitle>{t("Logging & Compliance")}</CardTitle>
                <CardDescription>
                  {t(
                    "Audit-proof recording of all detection and protection operations.",
                  )}
                  operations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t("Enable Audit Logging")}</Label>
                      <p className="text-muted-foreground text-sm">
                        {t(
                          "Logs all PII detections, anonymizations and user decisions.",
                        )}
                      </p>
                    </div>

                    <Switch
                      checked={logEnabled}
                      onCheckedChange={setLogEnabled}
                      className="ml-4"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("Retention Period (Days)")}</Label>

                  <Input
                    type="number"
                    value={logRetentionDays}
                    onChange={e =>
                      setLogRetentionDays(parseInt(e.target.value, 10) || 0)
                    }
                    placeholder="e.g. 25"
                    min="0"
                    max="365"
                    className="w-full"
                  />
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Logs will be automatically deleted after this period expires (GDPR compliant).",
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PII Categories Tab */}
          <TabsContent value="pii-categories" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t("PII Category Selection")}</CardTitle>
                    <CardDescription>
                      {t(
                        "Select specific PII categories to detect and mask. Only selected categories will be detected in user messages.",
                      )}
                      <span
                        className={cn(
                          "block",
                          "text-xs",
                          "text-muted-foreground",
                        )}
                      >
                        {t("Showing")}{" "}
                        {piiDetectionEngine === "presidio"
                          ? t("Presidio")
                          : t("Azure AI Language")}{" "}
                        {t("supported categories.")}
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {t("Select All")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeselectAll}
                    >
                      {t("Deselect All")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {CATEGORY_GROUP_ORDER.map(groupKey => {
                  const categories = groupedCategories[groupKey] ?? [];
                  if (categories.length === 0) {
                    return null;
                  }

                  const allSelected = categories.every(category =>
                    selectedCategories.includes(category.value),
                  );

                  return (
                    <div key={groupKey} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">
                          {getCategoryGroupTitle(groupKey)}
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAllInGroup(groupKey)}
                        >
                          {allSelected ? t("Deselect All") : t("Select All")}
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {categories.map(category => {
                          const isSelected = selectedCategories.includes(
                            category.value,
                          );

                          return (
                            <div
                              key={category.value}
                              className={cn(
                                "p-3",
                                "rounded-lg",
                                "border",
                                "border-border",
                                "hover:border-white/30",
                                "cursor-pointer",
                                "transition-all",
                                isSelected && "border-white/40",
                              )}
                              onClick={() =>
                                handleToggleCategory(category.value)
                              }
                            >
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => {
                                    e.stopPropagation();
                                    handleToggleCategory(category.value);
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  className="mt-1 cursor-pointer accent-[#F47A1F]"
                                />
                                <div className="flex-1">
                                  <div className="font-medium">
                                    {t(category.label)}
                                  </div>
                                  <p className="text-muted-foreground text-xs">
                                    {t(category.description)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Custom Patterns Tab */}
          <TabsContent value="custom-patterns" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t("Custom Regex Patterns")}</CardTitle>
                    <CardDescription>
                      {t(
                        "Define custom detection patterns for company-specific data.",
                      )}
                    </CardDescription>
                  </div>
                  <Button onClick={() => setIsAddingPattern(true)}>
                    <IconPlus className="mr-2 size-4" />
                    {t("Add New Pattern")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isAddingPattern && (
                  <div className="bg-accent mb-6 space-y-4 rounded-lg border p-4">
                    <h3 className="font-semibold">{t("Add New Pattern")}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("Name")}</Label>
                        <Input
                          value={newPattern.name}
                          onChange={e =>
                            setNewPattern({
                              ...newPattern,
                              name: e.target.value,
                            })
                          }
                          placeholder={t("e.g., Employee Number")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Description")}</Label>
                        <Input
                          value={newPattern.description}
                          onChange={e =>
                            setNewPattern({
                              ...newPattern,
                              description: e.target.value,
                            })
                          }
                          placeholder={t(
                            "e.g., Internal employee identification",
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Regex Pattern")}</Label>
                        <Input
                          value={newPattern.regexPattern}
                          onChange={e =>
                            setNewPattern({
                              ...newPattern,
                              regexPattern: e.target.value,
                            })
                          }
                          placeholder="e.g., MA\\d{6}"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Confidence (%)")}</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={newPattern.confidence}
                          onChange={e =>
                            setNewPattern({
                              ...newPattern,
                              confidence: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAddPattern}>
                        {t("Add Pattern")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsAddingPattern(false)}
                      >
                        {t("Cancel")}
                      </Button>
                    </div>
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Name")}</TableHead>
                      <TableHead>{t("Description")}</TableHead>
                      <TableHead>{t("Regex Pattern")}</TableHead>
                      <TableHead>{t("Confidence")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead>{t("Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customPatterns.map(pattern => (
                      <TableRow key={pattern.id}>
                        <TableCell className="font-medium">
                          {pattern.name}
                        </TableCell>
                        <TableCell>{pattern.description}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {pattern.regexPattern}
                        </TableCell>
                        <TableCell>{pattern.confidence}%</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              pattern.status === "active"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              pattern.status === "active"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                                : ""
                            }
                          >
                            {pattern.status === "active"
                              ? t("Active")
                              : t("Inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePatternStatus(pattern.id)}
                            >
                              <IconEdit className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePattern(pattern.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sensitivity Labels Tab */}
          <TabsContent value="sensitivity-labels" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("Sensitivity Label Configuration")}</CardTitle>
                <CardDescription>
                  {t(
                    "Control which classified documents may be submitted to this model.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("Maximum Allowed Sensitivity Level")}</Label>
                  <Select
                    value={maxSensitivityLevel}
                    onValueChange={value =>
                      setMaxSensitivityLevel(
                        value as
                          | "public"
                          | "internal"
                          | "confidential"
                          | "restricted",
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">
                        📖 {t("Public - Public information")}
                      </SelectItem>
                      <SelectItem value="internal">
                        🏢 {t("Internal - Internal information")}
                      </SelectItem>
                      <SelectItem value="confidential">
                        🔒 {t("Confidential - Confidential information")}
                      </SelectItem>
                      <SelectItem value="restricted">
                        🚫 {t("Restricted - Highly restricted information")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      "Documents with sensitivity labels above this level will be blocked from submission to the AI model.",
                    )}
                  </p>
                </div>

                <div className="bg-muted rounded-lg border p-4">
                  <h4 className="mb-2 font-semibold">
                    {t("Current Configuration")}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("Selected Level:")}
                      </span>
                      <Badge variant="outline">{maxSensitivityLevel}</Badge>
                    </div>
                    <div className="text-muted-foreground mt-4">
                      {t("Documents that can be submitted:")}
                    </div>
                    <ul className="text-muted-foreground list-inside list-disc space-y-1">
                      {maxSensitivityLevel === "public" && (
                        <li>{t("Public documents only")}</li>
                      )}
                      {(maxSensitivityLevel === "internal" ||
                        maxSensitivityLevel === "confidential" ||
                        maxSensitivityLevel === "restricted") && (
                        <>
                          <li>{t("Public documents")}</li>
                          <li>{t("Internal documents")}</li>
                        </>
                      )}
                      {(maxSensitivityLevel === "confidential" ||
                        maxSensitivityLevel === "restricted") && (
                        <li>{t("Confidential documents")}</li>
                      )}
                      {maxSensitivityLevel === "restricted" && (
                        <li>{t("Restricted documents")}</li>
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit-log">
            <Card>
              <CardHeader>
                <CardTitle>{t("PII Detection Audit Log")}</CardTitle>
                <CardDescription>
                  {t(
                    "View the history of PII detection events and blocked content.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>{/* <AuditLogTable /> */}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
