/**
 * Simple SharePoint Document Picker
 *
 * Provides access to SharePoint sites and document libraries.
 * Uses Microsoft Graph API with MSAL authentication.
 * Similar pattern to OneDrive picker for consistency.
 */

import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";

interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
  description?: string;
}

interface SharePointDrive {
  id: string;
  name: string;
  description?: string;
  webUrl: string;
  driveType: string;
}

interface SharePointItem {
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
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

interface SharePointItemsResponse {
  value: SharePointItem[];
  "@odata.nextLink"?: string;
}

interface SharePointSitesResponse {
  value: SharePointSite[];
  "@odata.nextLink"?: string;
}

interface SharePointDrivesResponse {
  value: SharePointDrive[];
  "@odata.nextLink"?: string;
}

export class SimpleSharePointPicker {
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
        "Sites.Read.All",
        "Sites.ReadWrite.All",
        "Files.Read.All",
        "Files.ReadWrite.All",
        "User.Read",
      ],
      account: accounts.length > 0 ? (accounts[0] as AccountInfo) : undefined,
    };

    try {
      // Try silent token acquisition
      const response =
        await this.msalInstance!.acquireTokenSilent(tokenRequest);
      return response.accessToken;
    } catch {
      // Fall back to popup
      try {
        const response =
          await this.msalInstance!.acquireTokenPopup(tokenRequest);
        return response.accessToken;
      } catch {
        throw new Error("Failed to authenticate with Microsoft");
      }
    }
  }

  /**
   * List SharePoint sites the user has access to
   */
  private async listSites(): Promise<SharePointSite[]> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/sites?search=*`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const _errorText = await response.text();
      throw new Error(
        `Failed to list SharePoint sites (${response.status}): ${response.statusText}`,
      );
    }

    const data: SharePointSitesResponse = await response.json();
    return data.value;
  }

  /**
   * List document libraries (drives) in a SharePoint site
   */
  private async listDrives(siteId: string): Promise<SharePointDrive[]> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const _errorText = await response.text();
      throw new Error(
        `Failed to list document libraries (${response.status}): ${response.statusText}`,
      );
    }

    const data: SharePointDrivesResponse = await response.json();
    return data.value;
  }

  /**
   * List files in a SharePoint folder
   */
  private async listFiles(
    driveId: string,
    folderId: string = "root",
  ): Promise<SharePointItem[]> {
    const token = await this.getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const _errorText = await response.text();
      throw new Error(
        `Failed to list files (${response.status}): ${response.statusText}`,
      );
    }

    const data: SharePointItemsResponse = await response.json();
    return data.value;
  }

  /**
   * Download file from SharePoint
   */
  private async downloadFile(
    driveId: string,
    item: SharePointItem,
  ): Promise<File> {
    const token = await this.getAccessToken();

    // Get download URL
    let downloadUrl = item["@microsoft.graph.downloadUrl"];

    if (!downloadUrl) {
      // Fetch item metadata to get download URL
      const metadataUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}`;
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

        // Start with site selection
        const selectedItems = await this.showPickerUI(multiSelect, theme);

        if (selectedItems.length === 0) {
          resolve([]);
          return;
        }

        // Download selected files
        const files = await Promise.all(
          selectedItems.map(({ driveId, item }) =>
            this.downloadFile(driveId, item),
          ),
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
    theme: string,
  ): Promise<Array<{ driveId: string; item: SharePointItem }>> {
    return new Promise(async (resolve, _reject) => {
      const isDarkMode = theme === "dark";
      const selectedItems: Array<{ driveId: string; item: SharePointItem }> =
        [];
      let currentView: "sites" | "drives" | "files" = "sites";
      let currentSite: SharePointSite | null = null;
      let currentDrive: SharePointDrive | null = null;
      let _currentFolderId: string = "root";
      let breadcrumb: Array<{ id: string; name: string }> = [];

      // Add CSS animations
      if (!document.getElementById("sharepoint-animations")) {
        const style = document.createElement("style");
        style.id = "sharepoint-animations";
        style.textContent = `
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
        `;
        document.head.appendChild(style);
      }

      // Create overlay and modal
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: ${isDarkMode ? "rgba(0, 0, 0, 0.85)" : "rgba(0, 0, 0, 0.5)"};
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
        box-shadow: ${isDarkMode ? "0 25px 50px -12px rgba(0, 0, 0, 0.95)" : "0 25px 50px -12px rgba(0, 0, 0, 0.25)"};
        animation: slideUp 0.3s ease-out;
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
      fileList.className = "sharepoint-file-list";
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

      const selectedCount = document.createElement("div");
      selectedCount.style.cssText = `
        font-size: 13px;
        color: ${isDarkMode ? "#a3a3a3" : "#737373"};
        font-weight: 500;
      `;
      footer.appendChild(selectedCount);

      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = "display: flex; gap: 10px;";
      footer.appendChild(buttonContainer);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      const cancelBorder = isDarkMode ? "#262626" : "#e5e5e5";
      const cancelBg = isDarkMode ? "#0a0a0a" : "#ffffff";
      const cancelText = isDarkMode ? "#f8f9fa" : "#171717";

      cancelBtn.style.cssText = `
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
      cancelBtn.addEventListener("mouseenter", () => {
        cancelBtn.style.opacity = "0.5";
      });
      cancelBtn.addEventListener("mouseleave", () => {
        cancelBtn.style.opacity = "1";
      });
      buttonContainer.appendChild(cancelBtn);

      const selectBtn = document.createElement("button");
      selectBtn.innerHTML = `
        <span style="display: flex; align-items: center; gap: 8px;">
          Select ${multiSelect ? "files" : "file"}
        </span>
      `;
      const primaryBg = isDarkMode ? "#f8f9fa" : "#0a0a0a";
      const primaryText = isDarkMode ? "#0a0a0a" : "#f8f9fa";

      selectBtn.style.cssText = `
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
      selectBtn.addEventListener("mouseenter", () => {
        if (selectBtn.disabled) return;
        selectBtn.style.opacity = "0.5";
      });
      selectBtn.addEventListener("mouseleave", () => {
        selectBtn.style.opacity = "1";
      });
      buttonContainer.appendChild(selectBtn);

      // Close picker
      const closePicker = (
        items: Array<{ driveId: string; item: SharePointItem }>,
      ) => {
        document.body.removeChild(overlay);
        resolve(items);
      };

      cancelBtn.addEventListener("click", () => closePicker([]));
      selectBtn.addEventListener("click", () => closePicker(selectedItems));

      // Render functions
      const updateHeader = (title: string, showBack: boolean = false) => {
        let breadcrumbHTML = "";
        if (breadcrumb.length > 0) {
          breadcrumb.forEach((crumb, index) => {
            if (index > 0)
              breadcrumbHTML += ' <span style="color: #a3a3a3;">/</span> ';
            if (index === breadcrumb.length - 1) {
              breadcrumbHTML += `<span style="color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};">${escapeHtml(crumb.name)}</span>`;
            } else {
              breadcrumbHTML += `<span id="breadcrumb-${index}" style="cursor: pointer; text-decoration: underline; color: #0078d4;">${escapeHtml(crumb.name)}</span>`;
            }
          });
        }

        header.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${
                showBack
                  ? `
                <button id="back-btn" style="
                  background: none;
                  border: none;
                  cursor: pointer;
                  padding: 8px;
                  border-radius: 6px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  transition: background 0.2s;
                ">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${isDarkMode ? "#f8f9fa" : "#0a0a0a"}" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                </button>
              `
                  : ""
              }
              <img src="/assets/images/sharepoint-logo.svg" alt="SharePoint" style="height: 28px; width: auto;" />
              <div>
                <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"};">
                  ${escapeHtml(title)}
                </h2>
              </div>
            </div>
            <button id="sharepoint-close-btn" style="
              background: none;
              border: none;
              cursor: pointer;
              padding: 8px;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: opacity 0.2s;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${isDarkMode ? "#f8f9fa" : "#0a0a0a"}" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          ${
            breadcrumbHTML
              ? `
            <div style="
              font-size: 13px;
              color: ${isDarkMode ? "#a3a3a3" : "#737373"};
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              ${breadcrumbHTML}
            </div>
          `
              : ""
          }
        `;

        const closeBtn = header.querySelector<HTMLButtonElement>(
          "#sharepoint-close-btn",
        );
        closeBtn?.addEventListener("click", () => closePicker([]));

        const backBtn = header.querySelector<HTMLButtonElement>("#back-btn");
        if (backBtn) {
          backBtn.addEventListener("click", handleBack);
          backBtn.addEventListener("mouseenter", () => {
            backBtn.style.background = isDarkMode
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.05)";
          });
          backBtn.addEventListener("mouseleave", () => {
            backBtn.style.background = "transparent";
          });
        }

        // Add breadcrumb click handlers
        breadcrumb.forEach((crumb, index) => {
          const crumbEl = header.querySelector<HTMLElement>(
            `#breadcrumb-${index}`,
          );
          if (crumbEl && index < breadcrumb.length - 1) {
            crumbEl.addEventListener("click", () => {
              breadcrumb = breadcrumb.slice(0, index + 1);
              if (currentView === "files") {
                renderFiles(
                  currentDrive!.id,
                  breadcrumb[breadcrumb.length - 1].id,
                );
              }
            });
          }
        });
      };

      const handleBack = () => {
        if (currentView === "files") {
          if (breadcrumb.length > 1) {
            breadcrumb.pop();
            renderFiles(currentDrive!.id, breadcrumb[breadcrumb.length - 1].id);
          } else {
            // Going back to drives view
            breadcrumb = [];
            renderDrives(currentSite!);
          }
        } else if (currentView === "drives") {
          breadcrumb = [];
          renderSites();
        }
      };

      const updateSelectedCount = () => {
        const count = selectedItems.length;
        const accentColor = isDarkMode ? "#f8f9fa" : "#0a0a0a";

        if (count === 0) {
          selectedCount.textContent = "No files selected";
        } else {
          selectedCount.innerHTML = `
            <span style="
              color: ${accentColor};
              font-weight: 600;
            ">
              ${count} ${count !== 1 ? "files" : "file"} selected
            </span>
          `;
        }

        selectBtn.disabled = count === 0;
        selectBtn.style.opacity = selectBtn.disabled ? "0.6" : "1";
        selectBtn.style.cursor = selectBtn.disabled ? "not-allowed" : "pointer";
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

      const renderSites = async () => {
        currentView = "sites";
        currentSite = null;
        currentDrive = null;
        breadcrumb = [];
        updateHeader("SharePoint Sites");

        fileList.innerHTML = `
          <div style="
            padding: 40px 24px;
            text-align: center;
            font-size: 14px;
            color: ${isDarkMode ? "#a3a3a3" : "#737373"};
          ">
            Loading SharePoint sites...
          </div>
        `;

        try {
          const sites = await this.listSites();

          if (sites.length === 0) {
            fileList.innerHTML = `
              <div style="
                padding: 40px 24px;
                text-align: center;
                font-size: 14px;
                color: ${isDarkMode ? "#a3a3a3" : "#737373"};
              ">
                No SharePoint sites found
              </div>
            `;
            return;
          }

          fileList.innerHTML = "";

          sites.forEach(site => {
            const siteElement = document.createElement("div");
            siteElement.style.cssText = `
              padding: 12px 16px;
              border-radius: 8px;
              margin: 0 12px 8px 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 12px;
              background: ${isDarkMode ? "#0a0a0a" : "#ffffff"};
              border-left: 3px solid transparent;
              transition: all 0.2s;
            `;

            siteElement.innerHTML = `
              <div style="
                width: 36px;
                height: 36px;
                background: ${isDarkMode ? "rgba(248, 249, 250, 0.08)" : "rgba(10, 10, 10, 0.05)"};
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                font-size: 18px;
              ">
                📁
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"}; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(site.displayName || site.name)}
                </div>
                ${
                  site.description
                    ? `
                  <div style="font-size: 12px; color: ${isDarkMode ? "#a3a3a3" : "#737373"}; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(site.description)}
                  </div>
                `
                    : ""
                }
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isDarkMode ? "#737373" : "#a3a3a3"}" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            `;

            siteElement.addEventListener("mouseenter", () => {
              siteElement.style.background = isDarkMode ? "#171717" : "#f8f9fa";
            });
            siteElement.addEventListener("mouseleave", () => {
              siteElement.style.background = isDarkMode ? "#0a0a0a" : "#ffffff";
            });
            siteElement.addEventListener("click", () => renderDrives(site));

            fileList.appendChild(siteElement);
          });
        } catch (_error) {
          fileList.innerHTML = `
            <div style="
              padding: 40px 24px;
              text-align: center;
              font-size: 14px;
              color: #ef4444;
            ">
              Failed to load SharePoint sites. Please try again.
            </div>
          `;
        }
      };

      const renderDrives = async (site: SharePointSite) => {
        currentView = "drives";
        currentSite = site;
        currentDrive = null; // Reset current drive when going back
        breadcrumb = [];
        updateHeader("Document Libraries", true);

        fileList.innerHTML = `
          <div style="
            padding: 40px 24px;
            text-align: center;
            font-size: 14px;
            color: ${isDarkMode ? "#a3a3a3" : "#737373"};
          ">
            Loading document libraries...
          </div>
        `;

        try {
          const drives = await this.listDrives(site.id);

          if (drives.length === 0) {
            fileList.innerHTML = `
              <div style="
                padding: 40px 24px;
                text-align: center;
                font-size: 14px;
                color: ${isDarkMode ? "#a3a3a3" : "#737373"};
              ">
                No document libraries found
              </div>
            `;
            return;
          }

          fileList.innerHTML = "";

          drives.forEach(drive => {
            const driveElement = document.createElement("div");
            driveElement.style.cssText = `
              padding: 12px 16px;
              border-radius: 8px;
              margin: 0 12px 8px 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 12px;
              background: ${isDarkMode ? "#0a0a0a" : "#ffffff"};
              border-left: 3px solid transparent;
              transition: all 0.2s;
            `;

            const driveIcon =
              drive.driveType === "documentLibrary"
                ? "📚"
                : drive.driveType === "personal"
                  ? "📁"
                  : "💼";

            driveElement.innerHTML = `
              <div style="
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${isDarkMode ? "rgba(248, 249, 250, 0.08)" : "rgba(10, 10, 10, 0.05)"};
                border-radius: 8px;
                font-size: 18px;
                flex-shrink: 0;
              ">
                ${driveIcon}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; color: ${isDarkMode ? "#f8f9fa" : "#0a0a0a"}; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(drive.name)}
                </div>
                ${
                  drive.description
                    ? `
                  <div style="font-size: 12px; color: ${isDarkMode ? "#a3a3a3" : "#737373"}; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(drive.description)}
                  </div>
                `
                    : ""
                }
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isDarkMode ? "#737373" : "#a3a3a3"}" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            `;

            driveElement.addEventListener("mouseenter", () => {
              driveElement.style.background = isDarkMode
                ? "#171717"
                : "#f8f9fa";
            });
            driveElement.addEventListener("mouseleave", () => {
              driveElement.style.background = isDarkMode
                ? "#0a0a0a"
                : "#ffffff";
            });
            driveElement.addEventListener("click", () => {
              currentDrive = drive;
              breadcrumb.push({ id: "root", name: drive.name });
              renderFiles(drive.id, "root");
            });

            fileList.appendChild(driveElement);
          });
        } catch (_error) {
          fileList.innerHTML = `
            <div style="
              padding: 40px 24px;
              text-align: center;
              font-size: 14px;
              color: #ef4444;
            ">
              Failed to load document libraries. Please try again.
            </div>
          `;
        }
      };

      const renderFiles = async (driveId: string, folderId: string) => {
        currentView = "files";
        _currentFolderId = folderId;
        updateHeader(
          breadcrumb[breadcrumb.length - 1]?.name || "Documents",
          true,
        );

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

        try {
          const items = await this.listFiles(driveId, folderId);

          if (items.length === 0) {
            fileList.innerHTML = `
              <div style="
                padding: 40px 24px;
                text-align: center;
                font-size: 14px;
                color: ${isDarkMode ? "#a3a3a3" : "#737373"};
              ">
                This folder is empty
              </div>
            `;
            return;
          }

          fileList.innerHTML = "";

          // Sort: folders first, then files
          const sortedItems = [...items].sort((a, b) => {
            if (a.folder && !b.folder) return -1;
            if (!a.folder && b.folder) return 1;
            return a.name.localeCompare(b.name);
          });

          sortedItems.forEach((item, index) => {
            const isFolder = !!item.folder;
            const isSelected = selectedItems.some(
              selected => selected.item.id === item.id,
            );

            const itemElement = document.createElement("div");
            itemElement.dataset.selected = isSelected ? "true" : "false";
            itemElement.dataset.itemId = item.id;
            itemElement.style.cssText = `
              padding: 10px 24px;
              cursor: pointer;
              transition: all 0.15s ease;
              display: flex;
              align-items: center;
              gap: 12px;
              background: ${isSelected ? (isDarkMode ? "rgba(248, 249, 250, 0.08)" : "rgba(10, 10, 10, 0.05)") : isDarkMode ? "#0a0a0a" : "#ffffff"};
              border-left: 3px solid ${isSelected ? (isDarkMode ? "#f8f9fa" : "#0a0a0a") : "transparent"};
              animation: slideIn 0.2s ease-out ${index * 0.03}s backwards;
              position: relative;
            `;

            // Create selection indicator (like OneDrive)
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
                background: ${isSelected ? (isDarkMode ? "#f8f9fa" : "#0a0a0a") : isDarkMode ? "#0a0a0a" : "#ffffff"};
              `;
              if (isSelected) {
                selectionIndicator.innerHTML = `
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${isDarkMode ? "#0a0a0a" : "#ffffff"}" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2 6 5 9 10 3"></polyline>
                  </svg>
                `;
              }
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

            itemElement.appendChild(selectionIndicator);
            itemElement.appendChild(fileIcon);
            itemElement.appendChild(fileInfo);

            if (isFolder) {
              const chevron = document.createElement("div");
              chevron.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isDarkMode ? "#737373" : "#a3a3a3"}" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              `;
              itemElement.appendChild(chevron);
            }

            itemElement.addEventListener("mouseenter", () => {
              if (isFolder || itemElement.dataset.selected !== "true") {
                itemElement.style.background = isDarkMode
                  ? "#171717"
                  : "#f8fafc";
              }
            });
            itemElement.addEventListener("mouseleave", () => {
              if (itemElement.dataset.selected === "true") {
                return;
              }
              itemElement.style.background = isDarkMode ? "#0a0a0a" : "#ffffff";
            });

            itemElement.addEventListener("click", () => {
              if (isFolder) {
                breadcrumb.push({ id: item.id, name: item.name });
                renderFiles(driveId, item.id);
                return;
              }

              // File selection
              const existingIndex = selectedItems.findIndex(
                selected => selected.item.id === item.id,
              );
              const alreadySelected = existingIndex > -1;

              if (!multiSelect) {
                if (alreadySelected) {
                  // Deselect the item
                  selectedItems.splice(existingIndex, 1);
                  applyDeselectedStyles(itemElement, selectionIndicator);
                  updateSelectedCount();
                  return;
                }

                // Clear all selections
                fileList
                  .querySelectorAll<HTMLElement>('[data-selected="true"]')
                  .forEach(node => {
                    const indicator = node.querySelector<HTMLElement>(
                      '[data-indicator="true"]',
                    );
                    applyDeselectedStyles(node, indicator);
                  });
                selectedItems.length = 0;
              }

              if (alreadySelected) {
                // Deselect
                selectedItems.splice(existingIndex, 1);
                applyDeselectedStyles(itemElement, selectionIndicator);
              } else {
                // Select
                selectedItems.push({ driveId, item });
                applySelectedStyles(itemElement, selectionIndicator);
              }

              updateSelectedCount();
            });

            itemElement.dataset.fileItem = "true";
            fileList.appendChild(itemElement);
          });
        } catch (_error) {
          fileList.innerHTML = `
            <div style="
              padding: 40px 24px;
              text-align: center;
              font-size: 14px;
              color: #ef4444;
            ">
              Failed to load files. Please try again.
            </div>
          `;
        }
      };

      // Start by showing sites
      renderSites();
      updateSelectedCount();
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
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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
 * Simple function to open SharePoint picker
 */
export async function openSimpleSharePointPicker(
  clientId: string,
  authority: string,
  multiSelect: boolean = true,
  theme: string,
): Promise<File[]> {
  const picker = new SimpleSharePointPicker(clientId, authority);
  return await picker.openPicker(multiSelect, theme);
}
