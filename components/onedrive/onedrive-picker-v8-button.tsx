"use client";

import { useState } from "react";
import { openSimpleOneDrivePicker } from "@/lib/onedrive/simple-onedrive-picker";
import { Cloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface OneDrivePickerV8ButtonProps {
  onFilesSelected: (files: File[]) => void;
  multiSelect?: boolean;
  disabled?: boolean;
  className?: string;
}

export function OneDrivePickerV8Button({
  onFilesSelected,
  multiSelect = true,
  disabled = false,
  className,
}: OneDrivePickerV8ButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();
  const handlePickFiles = async () => {
    setIsLoading(true);

    try {
      // Fetch OneDrive configuration from API route
      const configResponse = await fetch("/api/config/onedrive");
      if (!configResponse.ok) {
        throw new Error("Failed to fetch OneDrive configuration");
      }
      const config = await configResponse.json();

      // Try organization configuration first, fallback to personal
      let clientId: string;
      let authority: string;
      let _accountType: string;

      if (config.organization?.clientId && config.organization?.authority) {
        // Use organization account
        clientId = config.organization.clientId;
        authority = config.organization.authority;
        _accountType = "Organization";
      } else if (config.personal?.clientId) {
        // Fallback to personal Microsoft account
        clientId = config.personal.clientId;
        authority = config.personal.authority;
        _accountType = "Personal Microsoft Account";
      } else {
        throw new Error("OneDrive not configured. Please set ENV variables");
      }

      // Open simple OneDrive picker
      const files = await openSimpleOneDrivePicker(
        clientId,
        authority,
        multiSelect,
        theme,
      );

      if (files.length === 0) {
        setIsLoading(false);
        return;
      }

      // Call the callback with downloaded files
      onFilesSelected(files);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes("closed") ||
          error.message.includes("cancelled")
        ) {
          // User cancelled - don't show error
          return;
        }

        if (error.message.includes("popup")) {
          toast.error("Popup blocked", {
            description:
              "Allow popups for this site to sign in with OneDrive, then try again.",
          });
          return;
        }
      }

      // Show error to user
      toast.error("OneDrive import failed", {
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
          <Cloud className="size-3.5" />
          <span>OneDrive</span>
        </>
      )}
    </button>
  );
}
