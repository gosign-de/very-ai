"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../users/components/dropdown-menu";
import { Button } from "../users/components/button";
import { Input } from "../users/components/input";
import { Label } from "../users/components/label";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useModelFilter } from "../context/ModelFilterContext";

const ModelAndDateFilter = () => {
  const { t } = useTranslation();
  const { selectedModel, setSelectedModel, dateRange, setDateRange } =
    useModelFilter();

  const setDateRangePreset = (preset: string) => {
    const endOriginal = new Date();
    let end: Date;
    let start: Date;

    switch (preset) {
      case "today":
        start = new Date();
        end = new Date();
        end.setDate(end.getDate() + 1);
        break;
      case "yesterday":
        start = new Date();
        start.setDate(start.getDate() - 1);
        end = new Date();
        end.setDate(end.getDate() - 1);
        end.setDate(end.getDate() + 1);
        break;
      case "last7days":
        start = new Date();
        start.setDate(start.getDate() - 7);
        end = endOriginal;
        end.setDate(endOriginal.getDate() + 1);
        break;
      case "last30days":
        start = new Date();
        start.setDate(start.getDate() - 30);
        end = endOriginal;
        end.setDate(endOriginal.getDate() + 1);
        break;
      case "thisYear":
        start = new Date(endOriginal.getFullYear(), 0, 1);
        end = endOriginal;
        end.setDate(endOriginal.getDate() + 1);
        break;
      case "lastYear":
        start = new Date(endOriginal.getFullYear() - 1, 0, 1);
        end = new Date(endOriginal.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    });
  };

  return (
    <div className="bg-card flex flex-col gap-4 rounded-lg p-4 shadow">
      <h2 className="text-xl font-semibold">{t("Filters")}</h2>
      <div className="flex flex-wrap items-end gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {selectedModel === "All Models" ? t("All Models") : selectedModel}{" "}
              <ChevronDown className="ml-2 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "All Models"}
              onCheckedChange={checked =>
                checked && setSelectedModel("All Models", "all_models")
              }
            >
              {t("All Models")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "gpt-4o"}
              onCheckedChange={checked =>
                checked && setSelectedModel("gpt-4o", "gpt-4o")
              }
            >
              GPT-4o
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "o3-mini"}
              onCheckedChange={checked =>
                checked && setSelectedModel("o3-mini", "o3-mini")
              }
            >
              O3-Mini
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "gemini-2.5-flash"}
              onCheckedChange={checked =>
                checked &&
                setSelectedModel("gemini-2.5-flash", "gemini-2.5-flash")
              }
            >
              Gemini 2.5 Flash
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "gemini-2.5-pro"}
              onCheckedChange={checked =>
                checked && setSelectedModel("gemini-2.5-pro", "gemini-2.5-pro")
              }
            >
              Gemini 2.5 Pro
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "dalle-3"}
              onCheckedChange={checked =>
                checked && setSelectedModel("dalle-3", "dalle-3")
              }
            >
              DALL-E 3
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedModel === "imagen-3.0-generate-002"}
              onCheckedChange={checked =>
                checked &&
                setSelectedModel(
                  "imagen-3.0-generate-002",
                  "imagen-3.0-generate-002",
                )
              }
            >
              Imagen 3.0
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-col space-y-1">
          <Label htmlFor="dateFrom">{t("From")}</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateRange.start}
            onChange={e =>
              setDateRange({ ...dateRange, start: e.target.value })
            }
          />
        </div>

        <div className="flex flex-col space-y-1">
          <Label htmlFor="dateTo">{t("To")}</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateRange.end}
            onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDateRangePreset("last7days")}
          >
            {t("Last 7 days")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDateRangePreset("last30days")}
          >
            {t("Last 30 days")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDateRangePreset("thisYear")}
          >
            {t("This Year")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ModelAndDateFilter;
