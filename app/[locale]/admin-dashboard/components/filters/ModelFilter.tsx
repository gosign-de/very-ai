"use client";

import { FC, useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconChevronDown } from "@tabler/icons-react";
import { useModelFilter } from "../../context/ModelFilterContext";
import { useTranslation } from "react-i18next";

interface ModelFilterProps {
  options: { modelId: string; modelName: string }[];
}

const ModelFilter: FC<ModelFilterProps> = ({ options }) => {
  const { selectedModel, selectedModelId, setSelectedModel } = useModelFilter();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  // Find the selected option based on the modelId or modelName from context
  const selectedOption =
    options.find(
      opt => opt.modelId === selectedModelId || opt.modelName === selectedModel,
    ) || options[0];

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  function handleChange(selectedModelId: string) {
    // Find the selected option and update the context
    const selectedOption = options.find(
      option => option.modelId === selectedModelId,
    );
    if (selectedOption) {
      setSelectedModel(selectedOption.modelName, selectedOption.modelId);
      setIsOpen(false);
    }
  }

  const filteredOptions = options.filter(option =>
    option.modelName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DropdownMenu open={isOpen} onOpenChange={isOpen => setIsOpen(isOpen)}>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center justify-between gap-2 border-2"
          variant="ghost"
        >
          <span>{selectedOption?.modelName || t("All Models")}</span>
          <IconChevronDown size={16} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="max-h-64 space-y-2 p-2">
        <Input
          ref={inputRef}
          className="mb-2 w-full"
          placeholder={t("Search models...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="max-h-48 overflow-y-auto">
          {filteredOptions.map(option => (
            <div
              key={option.modelId}
              onClick={() => handleChange(option.modelId)}
              className="hover:bg-accent cursor-pointer rounded p-2 hover:opacity-50"
            >
              {option.modelName}
            </div>
          ))}

          {filteredOptions.length === 0 && (
            <div className="py-2 text-center text-sm text-gray-500">
              {t("No models found")}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModelFilter;
