"use client";

import { SidebarCreateItem } from "@/components/sidebar/items/all/sidebar-create-item";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatbotUIContext } from "@/context/context";
import { COLLECTION_DESCRIPTION_MAX, COLLECTION_NAME_MAX } from "@/db/limits";
import { TablesInsert } from "@/supabase/types";
import { CollectionFile } from "@/types";
import { FC, useContext, useState, useEffect } from "react";
import { CollectionFileSelect } from "./collection-file-select";
import { useTranslation } from "react-i18next";

interface CreateCollectionProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const CreateCollection: FC<CreateCollectionProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { t } = useTranslation();
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext);

  const [name, setName] = useState("");
  const [isTyping, _setIsTyping] = useState(false);
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const [selectedCollectionFiles, setSelectedCollectionFiles] = useState<
    CollectionFile[]
  >([]);

  useEffect(() => {
    if (name.trim()) {
      setNameError("");
    }
  }, [name]);

  const handleFileSelect = (file: CollectionFile) => {
    setSelectedCollectionFiles(prevState => {
      const isFileAlreadySelected = prevState.find(
        selectedFile => selectedFile.id === file.id,
      );

      if (isFileAlreadySelected) {
        return prevState.filter(selectedFile => selectedFile.id !== file.id);
      } else {
        return [...prevState, file];
      }
    });
  };

  const validateForm = () => {
    if (!name.trim()) {
      setNameError("Name must be filled");
      return false;
    }
    return true;
  };

  if (!profile) return null;
  if (!selectedWorkspace) return null;

  return (
    <SidebarCreateItem
      contentType="collections"
      createState={
        {
          collectionFiles: selectedCollectionFiles.map(file => ({
            user_id: profile.user_id,
            collection_id: "",
            file_id: file.id,
          })),
          user_id: profile.user_id,
          name,
          description,
        } as TablesInsert<"collections">
      }
      isOpen={isOpen}
      isTyping={isTyping}
      onOpenChange={onOpenChange}
      onValidate={validateForm}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>{t("Files")}</Label>

            <CollectionFileSelect
              selectedCollectionFiles={selectedCollectionFiles}
              onCollectionFileSelect={handleFileSelect}
            />
          </div>

          <div className="space-y-1">
            <Label>
              {t("Name")} <span className="text-red-500">*</span>
            </Label>

            <Input
              placeholder={t("Collection name...")}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={COLLECTION_NAME_MAX}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-500">{nameError}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>{t("Description")}</Label>

            <Input
              placeholder={t("Collection description...")}
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={COLLECTION_DESCRIPTION_MAX}
            />
          </div>
        </>
      )}
    />
  );
};
