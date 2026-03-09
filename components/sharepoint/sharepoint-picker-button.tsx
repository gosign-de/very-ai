"use client";

import { useState } from "react";
import { openSimpleSharePointPicker } from "@/lib/sharepoint/simple-sharepoint-picker";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface SharePointPickerButtonProps {
  onFilesSelected: (files: File[]) => void;
  multiSelect?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SharePointPickerButton({
  onFilesSelected,
  multiSelect = true,
  disabled = false,
  className,
}: SharePointPickerButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const handlePickFiles = async () => {
    setIsLoading(true);

    try {
      // Fetch SharePoint configuration from API route
      const configResponse = await fetch("/api/config/sharepoint");
      if (!configResponse.ok) {
        throw new Error("Failed to fetch SharePoint configuration");
      }
      const config = await configResponse.json();

      // Use organization configuration
      let clientId: string;
      let authority: string;

      if (config.organization?.clientId && config.organization?.authority) {
        // Use organization account
        clientId = config.organization.clientId;
        authority = config.organization.authority;
      } else if (config.personal?.clientId) {
        // Fallback to personal Microsoft account
        clientId = config.personal.clientId;
        authority = config.personal.authority;
      } else {
        throw new Error("SharePoint not configured. Please set ENV variables");
      }

      // Open simple SharePoint picker
      const files = await openSimpleSharePointPicker(
        clientId,
        authority,
        multiSelect,
        theme || "light",
      );

      if (files.length === 0) {
        setIsLoading(false);
        return;
      }

      // Call the callback with downloaded files
      onFilesSelected(files);
    } catch (error) {
      // Show error to user
      toast.error("SharePoint import failed", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handlePickFiles}
      disabled={disabled || isLoading}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          <Building2 className="size-3.5" />
          <span>SharePoint</span>
        </>
      )}
    </button>
  );
}
