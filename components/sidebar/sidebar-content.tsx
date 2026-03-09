import { Tables } from "@/supabase/types";
import { ContentType, DataListType } from "@/types";
import { FC, useState } from "react";
import { SidebarCreateButtons } from "./sidebar-create-buttons";
import { SidebarDataList } from "./sidebar-data-list";
import { SidebarSearch } from "./sidebar-search";

interface SidebarContentProps {
  contentType: ContentType;
  data: DataListType;
  folders: Tables<"folders">[];
}

export const SidebarContent: FC<SidebarContentProps> = ({
  contentType,
  data = [],
  folders,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [_groupId, setGroupId] = useState<string | null>(null);
  const [_selectedCollectionGroupId, setSelectedCollectionGroupId] = useState<
    string | null
  >(null);
  const [selectedAssistantGroupId, setSelectedAssistantGroupId] = useState<
    string | null
  >(null);
  const filteredData: any = data.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCollectionGroupSelect = (collectionGroupId: string) => {
    setSelectedCollectionGroupId(collectionGroupId);
  };

  const handleAssistantGroupSelect = (assistantGroupId: string) => {
    setSelectedAssistantGroupId(assistantGroupId);
  };

  return (
    <div className="flex max-h-[calc(100%-50px)] grow flex-col">
      <div className="mt-2 flex items-center">
        <SidebarCreateButtons
          contentType={contentType}
          hasData={data.length > 0}
          onGroupSelect={groupId => {
            setGroupId(groupId);
          }}
          onCollectionGroupSelect={handleCollectionGroupSelect}
          onAssistantGroupSelect={handleAssistantGroupSelect}
        />
      </div>

      <div className="mt-2">
        <SidebarSearch
          contentType={contentType}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      </div>

      <SidebarDataList
        contentType={contentType}
        data={filteredData}
        folders={folders}
        searchTerm={searchTerm}
        selectedAssistantGroupId={selectedAssistantGroupId}
      />
    </div>
  );
};
