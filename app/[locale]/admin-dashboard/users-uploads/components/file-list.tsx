"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  IconSearch,
  IconFile,
  IconPhoto,
  IconFileText,
  IconFileSpreadsheet,
  IconFileZip,
  IconCalendar,
  IconUser,
  IconDatabase,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface FileData {
  id: string;
  name: string;
  type: string;
  original_type?: string;
  size: number;
  created_at: string;
  user_id: string;
  profiles: {
    display_name: string;
    username: string;
  };
}

interface FileListProps {
  files: FileData[];
  loading?: boolean;
}

const ITEMS_PER_PAGE = 20;

export default function FileList({ files, loading = false }: FileListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { t, i18n } = useTranslation();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t("Bytes")}`;
    const k = 1024;
    const sizes = [t("Bytes"), t("KB"), t("MB"), t("GB")];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const currentLanguage = i18n.language || "en";

    // Map language codes to locale strings
    const localeMap: { [key: string]: string } = {
      en: "en-US",
      de: "de-DE",
      fr: "fr-FR",
      es: "es-ES",
      it: "it-IT",
      pt: "pt-PT",
      nl: "nl-NL",
      pl: "pl-PL",
      ru: "ru-RU",
      ja: "ja-JP",
      zh: "zh-CN",
      ko: "ko-KR",
    };

    const locale = localeMap[currentLanguage] || currentLanguage;

    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (!mimeType) return <IconFile className="size-5 text-gray-500" />;

    if (mimeType.startsWith("image/")) {
      return <IconPhoto className="size-5 text-blue-500" />;
    } else if (mimeType === "application/pdf") {
      return <IconFileText className="size-5 text-red-500" />;
    } else if (
      mimeType.includes("excel") ||
      mimeType.includes("spreadsheet") ||
      mimeType === "text/csv"
    ) {
      return <IconFileSpreadsheet className="size-5 text-green-500" />;
    } else if (
      mimeType.includes("zip") ||
      mimeType.includes("compressed") ||
      mimeType.includes("rar") ||
      mimeType.includes("7z")
    ) {
      return <IconFileZip className="size-5 text-purple-500" />;
    } else {
      return <IconFile className="size-5 text-gray-500" />;
    }
  };

  const getFileCategory = (mimeType: string): string => {
    if (!mimeType) return t("Other");

    if (mimeType.startsWith("image/")) return t("Image");
    if (mimeType === "application/pdf") return t("PDF");
    if (
      mimeType.includes("excel") ||
      mimeType.includes("spreadsheet") ||
      mimeType === "text/csv"
    )
      return t("Excel");
    if (
      mimeType.includes("word") ||
      mimeType.includes("document") ||
      mimeType === "application/rtf"
    )
      return t("Word");
    if (mimeType.includes("powerpoint") || mimeType.includes("presentation"))
      return t("PowerPoint");
    if (
      mimeType.includes("zip") ||
      mimeType.includes("compressed") ||
      mimeType.includes("rar") ||
      mimeType.includes("7z")
    )
      return t("ZIP");
    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/xml" ||
      mimeType === "text/html" ||
      mimeType === "text/css" ||
      mimeType === "text/javascript" ||
      mimeType === "application/typescript"
    )
      return t("Text");
    return t("Other");
  };

  // Filter files based on search term
  const filteredFiles = files.filter(file => {
    const userName =
      file.profiles?.display_name || file.profiles?.username || "";
    return (
      file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      userName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredFiles.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("File Uploads")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="border-primary size-8 animate-spin rounded-full border-b-2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {t("File Uploads")} ({filteredFiles.length} {t("files")})
          </CardTitle>
          <div className="flex items-center space-x-2">
            <div className="relative">
              <IconSearch className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                placeholder={t("Search files or users...")}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-64 pl-10"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paginatedFiles.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            {searchTerm
              ? t("No files found matching your search.")
              : t("No files uploaded yet.")}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedFiles.map(file => (
                <div
                  key={file.id}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    {getFileIcon(file.original_type || file.type)}
                    <div>
                      <div className="font-medium">{file.name}</div>
                      <div className="text-muted-foreground text-sm">
                        {getFileCategory(file.original_type || file.type)} •{" "}
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  </div>

                  <div className="text-muted-foreground flex items-center space-x-6 text-sm">
                    <div className="flex items-center space-x-1">
                      <IconUser className="size-4" />
                      <span>
                        {file.profiles?.display_name ||
                          file.profiles?.username ||
                          t("Unknown")}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <IconCalendar className="size-4" />
                      <span>{formatDate(file.created_at)}</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <IconDatabase className="size-4" />
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-muted-foreground text-sm">
                  {t("Showing")} {startIndex + 1} {t("to")}{" "}
                  {Math.min(endIndex, filteredFiles.length)} {t("of")}{" "}
                  {filteredFiles.length} {t("files")}
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <IconChevronLeft className="size-4" />
                    {t("Previous")}
                  </Button>

                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <Button
                          key={pageNum}
                          variant={
                            currentPage === pageNum ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className="size-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    {t("Next")}
                    <IconChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
