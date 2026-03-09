/**
 * Simple OneDrive File Picker
 *
 * Alternative implementation that doesn't rely on Microsoft's hosted picker.
 * Uses Microsoft Graph API directly with MSAL authentication.
 * More reliable and avoids re-authentication issues.
 */

import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";

import { toast } from "sonner";

interface OneDriveItem {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  "@microsoft.graph.downloadUrl"?: string;
  file?: {
    mimeType: string;
  };
  folder?: {
    childCount: number;
  };
}

interface OneDriveItemsResponse {
  value: OneDriveItem[];
  "@odata.nextLink"?: string;
}

export class SimpleOneDrivePicker {
  private clientId: string;
  private authority: string;
  private msalInstance: PublicClientApplication | null = null;
  private accessToken: string = "";

  constructor(clientId: string, authority: string) {
    this.clientId = clientId;
    this.authority = authority;
  }

  /**
   * Initialize MSAL
   */
  private async initializeMSAL(): Promise<void> {
    if (this.msalInstance) return;

    const msalConfig = {
      auth: {
        clientId: this.clientId,
        authority: this.authority,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: "sessionStorage" as const,
        storeAuthStateInCookie: false,
      },
    };

    this.msalInstance = new PublicClientApplication(msalConfig);
    await this.msalInstance.initialize();
  }

  /**
   * Get access token
   */
  private async getAccessToken(): Promise<string> {
    await this.initializeMSAL();

    const accounts = this.msalInstance!.getAllAccounts();
    const tokenRequest = {
      scopes: [
        "Files.Read.All",
        "Files.ReadWrite.All",
        "Sites.Read.All",
        "User.Read",
      ],
      account: accounts.length > 0 ? (accounts[0] as AccountInfo) : undefined,
    };

    try {
      // Try silent token acquisition
      const response =
        await this.msalInstance!.acquireTokenSilent(tokenRequest);
      return response.accessToken;
    } catch (_error) {
      // Fall back to popup
      try {
        const response =
          await this.msalInstance!.acquireTokenPopup(tokenRequest);
        return response.accessToken;
      } catch (popupError) {
        throw popupError;
      }
    }
  }

  /**
   * List files in OneDrive folder
   */
  private async listFiles(folderId: string = "root"): Promise<OneDriveItem[]> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to list files (${response.status}): ${response.statusText}. Details: ${errorText.substring(0, 200)}`,
      );
    }

    const data: OneDriveItemsResponse = await response.json();
    return data.value;
  }

  /**
   * List shared files from OneDrive
   */
  private async listSharedFiles(): Promise<OneDriveItem[]> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/me/drive/sharedWithMe`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const _errorText = await response.text();
      throw new Error(
        `Failed to list shared files (${response.status}): ${response.statusText}`,
      );
    }

    const data: OneDriveItemsResponse = await response.json();
    return data.value;
  }

  /**
   * Download file from OneDrive
   */
  private async downloadFile(item: OneDriveItem): Promise<File> {
    const token = await this.getAccessToken();

    // Get download URL
    let downloadUrl = item["@microsoft.graph.downloadUrl"];

    if (!downloadUrl) {
      // Fetch item metadata to get download URL
      const metadataUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}`;
      const metadataResponse = await fetch(metadataUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!metadataResponse.ok) {
        throw new Error(
          `Failed to get file metadata: ${metadataResponse.statusText}`,
        );
      }

      const metadata = await metadataResponse.json();
      downloadUrl = metadata["@microsoft.graph.downloadUrl"];
    }

    if (!downloadUrl) {
      throw new Error("Download URL not available for this file");
    }

    // Download file content
    const fileResponse = await fetch(downloadUrl);

    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.statusText}`);
    }

    const blob = await fileResponse.blob();
    const mimeType =
      item.file?.mimeType || blob.type || "application/octet-stream";

    return new File([blob], item.name, { type: mimeType });
  }

  /**
   * Open custom file picker UI
   */
  async openPicker(
    multiSelect: boolean = true,
    theme: string,
  ): Promise<File[]> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get access token first (will trigger login if needed)
        await this.getAccessToken();

        // Start with root folder
        const selectedItems = await this.showPickerUI(
          multiSelect,
          "root",
          [],
          theme,
        );

        if (selectedItems.length === 0) {
          resolve([]);
          return;
        }

        // Download selected files
        const files = await Promise.all(
          selectedItems.map(item => this.downloadFile(item)),
        );

        resolve(files);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Show custom file picker UI
   */
  private showPickerUI(
    multiSelect: boolean,
    currentFolderId: string = "root",
    breadcrumb: Array<{ id: string; name: string }> = [],
    theme: string,
  ): Promise<OneDriveItem[]> {
    return new Promise(resolve => {
      const isDarkMode = theme === "dark";

      const createdStyles: HTMLStyleElement[] = [];

      const attachStyle = (css: string) => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        createdStyles.push(style);
      };

      attachStyle(`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `);

      attachStyle(`
        .onedrive-file-list::-webkit-scrollbar {
          width: 6px;
        }
        .onedrive-file-list::-webkit-scrollbar-track {
          background: ${isDarkMode ? "#0a0a0a" : "#f8fafc"};
        }
        .onedrive-file-list::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? "#262626" : "#e5e5e5"};
          border-radius: 3px;
        }
        .onedrive-file-list::-webkit-scrollbar-thumb:hover {
          background: ${isDarkMode ? "#404040" : "#d4d4d4"};
        }
      `);

      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${isDarkMode ? "rgba(0, 0, 0, 0.85)" : "rgba(0, 0, 0, 0.75)"};
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
        animation: fadeIn 0.2s ease-out;
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        background: ${isDarkMode ? "#0a0a0a" : "#ffffff"};
        border-radius: 16px;
        padding: 0;
        max-width: 580px;
        width: 92%;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, ${isDarkMode ? "0.8" : "0.5"}),
                    0 0 0 1px ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
        animation: slideUp 0.3s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        flex-direction: column;
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const header = document.createElement("div");
      header.style.cssText = `
        padding: 20px 24px;
        border-bottom: 1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"};
        background: ${isDarkMode ? "#0a0a0a" : "#f8fafc"};
        flex-shrink: 0;
      `;
      modal.appendChild(header);

      const fileList = document.createElement("div");
      fileList.className = "onedrive-file-list";
      fileList.style.cssText = `
        padding: 12px 0;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        background: ${isDarkMode ? "#0a0a0a" : "#ffffff"};
      `;
      modal.appendChild(fileList);

      const footer = document.createElement("div");
      footer.style.cssText = `
        padding: 16px 24px;
        background: ${isDarkMode ? "#0a0a0a" : "#f8fafc"};
        border-top: 1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"};
        display: flex;
        gap: 12px;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      `;
      modal.appendChild(footer);

      const selectionCounter = document.createElement("div");
      selectionCounter.style.cssText = `
        font-size: 13px;
        color: ${isDarkMode ? "#a3a3a3" : "#737373"};
        font-weight: 500;
      `;
      selectionCounter.textContent = "No files selected";

      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = `
        display: flex;
        gap: 10px;
      `;

      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancel";
      // Use app's muted/secondary colors with border and opacity hover
      const cancelBorder = isDarkMode ? "#262626" : "#e5e5e5";
      const cancelBg = isDarkMode ? "#0a0a0a" : "#ffffff";
      const cancelText = isDarkMode ? "#f8f9fa" : "#171717";

      cancelButton.style.cssText = `
        padding: 10px 24px;
        border: 1px solid ${cancelBorder};
        border-radius: 8px;
        background: ${cancelBg};
        color: ${cancelText};
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      `;
      cancelButton.addEventListener("mouseenter", () => {
        cancelButton.style.opacity = "0.5";
      });
      cancelButton.addEventListener("mouseleave", () => {
        cancelButton.style.opacity = "1";
      });

      const selectButton = document.createElement("button");
      selectButton.innerHTML = `
        <span style="display: flex; align-items: center; gap: 8px;">
          Select ${multiSelect ? "files" : "file"}
        </span>
      `;
      // Use app's primary button colors with opacity hover like other buttons
      const primaryBg = isDarkMode ? "#f8f9fa" : "#0a0a0a";
      const primaryText = isDarkMode ? "#0a0a0a" : "#f8f9fa";

      selectButton.style.cssText = `
        padding: 10px 24px;
        border: none;
        border-radius: 8px;
        background: ${primaryBg};
        color: ${primaryText};
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      `;
      selectButton.addEventListener("mouseenter", () => {
        if (selectButton.disabled) return;
        selectButton.style.opacity = "0.5";
      });
      selectButton.addEventListener("mouseleave", () => {
        selectButton.style.opacity = "1";
      });

      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(selectButton);
      footer.appendChild(selectionCounter);
      footer.appendChild(buttonContainer);

      const selectedItems = new Map<string, OneDriveItem>();
      let isClosed = false;
      let renderToken = 0;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          closePicker([]);
        }
      };

      const cleanup = () => {
        overlay.remove();
        createdStyles.forEach(style => style.remove());
        window.removeEventListener("keydown", handleKeyDown);
      };

      const closePicker = (items: OneDriveItem[]) => {
        if (isClosed) return;
        isClosed = true;
        cleanup();
        resolve(items);
      };

      selectButton.disabled = true;
      selectButton.style.opacity = "0.6";
      selectButton.style.cursor = "not-allowed";

      window.addEventListener("keydown", handleKeyDown);
      cancelButton.addEventListener("click", () => closePicker([]));
      selectButton.addEventListener("click", () => {
        if (selectButton.disabled) return;
        closePicker(Array.from(selectedItems.values()));
      });
      overlay.addEventListener("click", event => {
        if (event.target === overlay) {
          closePicker([]);
        }
      });

      const updateSelectionUI = () => {
        const count = selectedItems.size;
        const accentColor = isDarkMode ? "#f8f9fa" : "#0a0a0a";

        if (count === 0) {
          selectionCounter.textContent = "No files selected";
        } else {
          selectionCounter.innerHTML = `
            <span style="
              color: ${accentColor};
              font-weight: 600;
            ">
              ${count} ${count !== 1 ? "files" : "file"} selected
            </span>
          `;
        }

        selectButton.disabled = count === 0;
        selectButton.style.opacity = selectButton.disabled ? "0.6" : "1";
        selectButton.style.cursor = selectButton.disabled
          ? "not-allowed"
          : "pointer";
      };

      const applySelectedStyles = (
        element: HTMLElement,
        indicator?: HTMLElement | null,
      ) => {
        // Use app's accent color for selected items
        const selectedBg = isDarkMode
          ? "rgba(248, 249, 250, 0.08)"
          : "rgba(10, 10, 10, 0.05)";
        const selectedBorder = isDarkMode ? "#f8f9fa" : "#0a0a0a";

        element.dataset.selected = "true";
        element.style.background = selectedBg;
        element.style.borderLeftColor = selectedBorder;
        if (indicator) {
          indicator.style.borderColor = selectedBorder;
          indicator.style.background = selectedBorder;
          indicator.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${isDarkMode ? "#0a0a0a" : "#ffffff"}" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 6 5 9 10 3"></polyline>
            </svg>
          `;
        }
      };

      const applyDeselectedStyles = (
        element: HTMLElement,
        indicator?: HTMLElement | null,
      ) => {
        const deselectedBg = isDarkMode ? "#0a0a0a" : "#ffffff";
        const indicatorBorder = isDarkMode ? "#262626" : "#e5e5e5";

        element.dataset.selected = "false";
        element.style.background = deselectedBg;
        element.style.borderLeftColor = "transparent";
        if (indicator) {
          indicator.innerHTML = "";
          indicator.style.borderColor = indicatorBorder;
          indicator.style.background = deselectedBg;
        }
      };

      updateSelectionUI();

      const renderFolder = async (
        folderId: string,
        breadcrumbTrail: Array<{ id: string; name: string }>,
      ) => {
        if (isClosed) return;
        const token = ++renderToken;

        selectedItems.clear();
        updateSelectionUI();

        fileList.innerHTML = `
          <div style="
            padding: 40px 24px;
            text-align: center;
            font-size: 14px;
            color: ${isDarkMode ? "#a3a3a3" : "#737373"};
          ">
            Loading files...
          </div>
        `;

        let items: OneDriveItem[] = [];
        let currentLocationName = "My Files";
        const isSharedFolder = folderId === "shared";
        const showTabs = folderId === "root" || isSharedFolder;

        try {
          if (isSharedFolder) {
            items = await this.listSharedFiles();
            currentLocationName = "Shared with me";
          } else {
            items = await this.listFiles(folderId);
            if (breadcrumbTrail.length > 0) {
              currentLocationName =
                breadcrumbTrail[breadcrumbTrail.length - 1].name;
            }
          }
        } catch (error) {
          toast.error("Unable to load OneDrive files", {
            description:
              error instanceof Error
                ? error.message
                : "Please try again later.",
          });
          closePicker([]);
          return;
        }

        if (token !== renderToken || isClosed) {
          return;
        }

        if (items.length === 0 && folderId !== "root") {
        }

        let breadcrumbHTML = "";
        if (breadcrumbTrail.length > 0) {
          breadcrumbHTML =
            '<span id="breadcrumb-root" style="cursor: pointer; text-decoration: underline;">My Files</span>';
          breadcrumbTrail.forEach((crumb, index) => {
            breadcrumbHTML += ' <span style="opacity: 0.5;">›</span> ';
            if (index === breadcrumbTrail.length - 1) {
              breadcrumbHTML += `<span style="font-weight: 500;">${escapeHtml(crumb.name)}</span>`;
            } else {
              breadcrumbHTML += `<span id="breadcrumb-${index}" style="cursor: pointer; text-decoration: underline;">${escapeHtml(crumb.name)}</span>`;
            }
          });
        }

        header.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="/assets/images/onedrive-logo.svg" alt="OneDrive" style="height: 28px; width: auto;" />
              <div>
                <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};">
                  ${escapeHtml(currentLocationName)}
                </h2>
              </div>
            </div>
            <button id="onedrive-close-btn" style="
              background: none;
              border: none;
              cursor: pointer;
              padding: 8px;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: opacity 0.2s;
              color: ${isDarkMode ? "#a3a3a3" : "#737373"};
            " onmouseover="this.style.opacity='0.5'" onmouseout="this.style.opacity='1'">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          ${
            breadcrumbTrail.length > 0
              ? `
          <div style="
            font-size: 13px;
            color: ${isDarkMode ? "#a3a3a3" : "#737373"};
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            ${breadcrumbHTML}
          </div>
        `
              : ""
          }
          ${
            showTabs
              ? `
          <div style="display: flex; gap: 4px; margin-bottom: 8px;">
            <button id="tab-myfiles" style="
              padding: 6px 12px;
              border: none;
              border-radius: 6px;
              background: ${folderId === "root" ? (isDarkMode ? "#262626" : "#e5e5e5") : "transparent"};
              color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s;
            ">My Files</button>
            <button id="tab-shared" style="
              padding: 6px 12px;
              border: none;
              border-radius: 6px;
              background: ${folderId === "shared" ? (isDarkMode ? "#262626" : "#e5e5e5") : "transparent"};
              color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s;
            ">Shared with me</button>
          </div>
        `
              : ""
          }
          <div style="
            font-size: 13px;
            color: ${isDarkMode ? "#a3a3a3" : "#737373"};
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6l1 2h5.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9C2.67 14 2 13.33 2 12.5v-8z"/>
            </svg>
            <span>${items.length} ${items.length !== 1 ? "items" : "item"}</span>
          </div>
        `;

        const closeBtn = header.querySelector<HTMLButtonElement>(
          "#onedrive-close-btn",
        );
        closeBtn?.addEventListener("click", () => closePicker([]));

        const tabMyFiles =
          header.querySelector<HTMLButtonElement>("#tab-myfiles");
        if (tabMyFiles) {
          tabMyFiles.addEventListener("click", () => {
            if (folderId !== "root") {
              renderFolder("root", []);
            }
          });
          // Add hover effect for consistency
          tabMyFiles.addEventListener("mouseenter", () => {
            if (folderId !== "root") {
              tabMyFiles.style.opacity = "0.5";
            }
          });
          tabMyFiles.addEventListener("mouseleave", () => {
            tabMyFiles.style.opacity = "1";
          });
        }

        const tabShared =
          header.querySelector<HTMLButtonElement>("#tab-shared");
        if (tabShared) {
          tabShared.addEventListener("click", () => {
            if (folderId !== "shared") {
              renderFolder("shared", []);
            }
          });
          // Add hover effect for consistency
          tabShared.addEventListener("mouseenter", () => {
            if (folderId !== "shared") {
              tabShared.style.opacity = "0.5";
            }
          });
          tabShared.addEventListener("mouseleave", () => {
            tabShared.style.opacity = "1";
          });
        }

        const breadcrumbRoot =
          header.querySelector<HTMLSpanElement>("#breadcrumb-root");
        breadcrumbRoot?.addEventListener("click", () =>
          renderFolder("root", []),
        );

        breadcrumbTrail.forEach((crumb, index) => {
          const breadcrumbItem = header.querySelector<HTMLSpanElement>(
            `#breadcrumb-${index}`,
          );
          if (breadcrumbItem) {
            breadcrumbItem.addEventListener("click", () => {
              const nextTrail = breadcrumbTrail.slice(0, index + 1);
              renderFolder(crumb.id, nextTrail);
            });
          }
        });

        if (items.length === 0) {
          fileList.innerHTML = `
            <div style="
              padding: 40px 24px;
              text-align: center;
              font-size: 14px;
              color: ${isDarkMode ? "#a3a3a3" : "#737373"};
            ">
              This location is empty.
            </div>
          `;
          return;
        }

        const listFragment = document.createDocumentFragment();

        items.forEach((item, index) => {
          const isFolder = !!item.folder;
          const fileItem = document.createElement("div");
          fileItem.dataset.selected = "false";
          fileItem.dataset.itemId = item.id;
          fileItem.style.cssText = `
            padding: 10px 24px;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 12px;
            background: ${isDarkMode ? "#0a0a0a" : "#ffffff"};
            border-left: 3px solid transparent;
            animation: slideIn 0.2s ease-out ${index * 0.03}s backwards;
            position: relative;
          `;

          const selectionIndicator = document.createElement("div");
          if (!isFolder) {
            selectionIndicator.dataset.indicator = "true";
            selectionIndicator.style.cssText = `
              width: 20px;
              height: 20px;
              border-radius: 50%;
              border: 2px solid ${isDarkMode ? "#262626" : "#e5e5e5"};
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              background: ${isDarkMode ? "#0a0a0a" : "#ffffff"};
            `;
          } else {
            selectionIndicator.style.cssText = `
              width: 20px;
              height: 20px;
              flex-shrink: 0;
            `;
          }

          const fileIcon = document.createElement("div");
          fileIcon.style.cssText = `
            width: 36px;
            height: 36px;
            display: flex;
              align-items: center;
            justify-content: center;
            background: ${
              isFolder
                ? isDarkMode
                  ? "rgba(248, 249, 250, 0.08)"
                  : "rgba(10, 10, 10, 0.05)"
                : isDarkMode
                  ? "rgba(248, 249, 250, 0.08)"
                  : "rgba(10, 10, 10, 0.05)"
            };
            border-radius: 8px;
            font-size: 18px;
            flex-shrink: 0;
          `;
          fileIcon.textContent = isFolder ? "📁" : getFileIcon(item.name);

          const fileInfo = document.createElement("div");
          fileInfo.style.cssText = `
            flex: 1;
            min-width: 0;
          `;

          if (isFolder) {
            const count = item.folder?.childCount ?? 0;
            fileInfo.innerHTML = `
              <div style="
                font-weight: 500;
                color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};
                margin-bottom: 3px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 14px;
              ">
                ${escapeHtml(item.name)}
              </div>
              <div style="
                font-size: 12px;
                color: ${isDarkMode ? "#a3a3a3" : "#737373"};
              ">
                <span>${count} ${count !== 1 ? "items" : "item"}</span>
              </div>
            `;
          } else {
            fileInfo.innerHTML = `
              <div style="
                font-weight: 500;
                color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};
                margin-bottom: 3px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 14px;
              ">
                ${escapeHtml(item.name)}
              </div>
              <div style="
                font-size: 12px;
                color: ${isDarkMode ? "#a3a3a3" : "#737373"};
                display: flex;
                align-items: center;
                gap: 6px;
              ">
                <span>${formatFileSize(item.size)}</span>
                <span style="opacity: 0.5;">•</span>
                <span>${getFileTypeDisplay(item.file?.mimeType)}</span>
              </div>
            `;
          }

          fileItem.appendChild(selectionIndicator);
          fileItem.appendChild(fileIcon);
          fileItem.appendChild(fileInfo);

          fileItem.addEventListener("mouseenter", () => {
            if (isFolder || fileItem.dataset.selected !== "true") {
              fileItem.style.background = isDarkMode ? "#171717" : "#f8fafc";
            }
          });

          fileItem.addEventListener("mouseleave", () => {
            if (fileItem.dataset.selected === "true") {
              return;
            }
            fileItem.style.background = isDarkMode ? "#0a0a0a" : "#ffffff";
          });

          fileItem.addEventListener("click", () => {
            if (isFolder) {
              const nextTrail = [
                ...breadcrumbTrail,
                { id: item.id, name: item.name },
              ];
              renderFolder(item.id, nextTrail);
              return;
            }

            const alreadySelected = selectedItems.has(item.id);

            if (!multiSelect) {
              if (alreadySelected) {
                selectedItems.delete(item.id);
                applyDeselectedStyles(fileItem, selectionIndicator);
                updateSelectionUI();
                return;
              }

              fileList
                .querySelectorAll<HTMLElement>('[data-selected="true"]')
                .forEach(node => {
                  const indicator = node.querySelector<HTMLElement>(
                    '[data-indicator="true"]',
                  );
                  applyDeselectedStyles(node, indicator);
                  if (node.dataset.itemId) {
                    selectedItems.delete(node.dataset.itemId);
                  }
                });
            }

            if (alreadySelected) {
              selectedItems.delete(item.id);
              applyDeselectedStyles(fileItem, selectionIndicator);
            } else {
              selectedItems.set(item.id, item);
              applySelectedStyles(fileItem, selectionIndicator);
            }

            updateSelectionUI();
          });

          listFragment.appendChild(fileItem);
        });

        fileList.innerHTML = "";
        fileList.appendChild(listFragment);
      };

      renderFolder(currentFolderId, breadcrumb);
    });
  }
}

// Helper functions
function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    pdf: "📕",
    doc: "📘",
    docx: "📘",
    xls: "📗",
    xlsx: "📗",
    ppt: "📙",
    pptx: "📙",
    txt: "📄",
    md: "📝",
    json: "📋",
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    zip: "🗜️",
    mp3: "🎵",
    mp4: "🎬",
  };
  return iconMap[ext || ""] || "📄";
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + " " + sizes[i];
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getFileTypeDisplay(mimeType?: string): string {
  if (!mimeType) return "Unknown";

  const typeMap: Record<string, string> = {
    "application/pdf": "PDF Document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word Document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "Excel Spreadsheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "PowerPoint",
    "text/plain": "Text File",
    "text/markdown": "Markdown",
    "application/json": "JSON Data",
    "image/jpeg": "JPEG Image",
    "image/png": "PNG Image",
    "image/gif": "GIF Image",
    "application/zip": "ZIP Archive",
    "audio/mpeg": "MP3 Audio",
    "video/mp4": "MP4 Video",
  };

  return (
    typeMap[mimeType] || mimeType.split("/")[1]?.toUpperCase() || "Unknown"
  );
}

/**
 * Simple function to open picker
 */
export async function openSimpleOneDrivePicker(
  clientId: string,
  authority: string,
  multiSelect: boolean = true,
  theme: string,
): Promise<File[]> {
  const picker = new SimpleOneDrivePicker(clientId, authority);
  return await picker.openPicker(multiSelect, theme);
}
