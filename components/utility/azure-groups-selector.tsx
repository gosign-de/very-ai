import { createClientLogger } from "@/lib/logger/client";
import { FC, useState, useEffect, useContext } from "react";
import { IconUsers, IconChevronRight, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getUserManagedGroups,
  updateManagedGroupSelection,
} from "@/db/azure_groups";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { emitGroupsUpdated } from "@/lib/events/group-events";
import { useSession } from "next-auth/react";
import { ChatbotUIContext } from "@/context/context";

const logger = createClientLogger({ component: "AzureGroupsSelector" });

export const AzureGroupsSelector: FC = () => {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { refreshModels } = useContext(ChatbotUIContext);
  const [showGroups, setShowGroups] = useState(false);
  const [managedGroups, setManagedGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (showGroups) {
      fetchGroups();
    }
  }, [showGroups]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const sessionGroups = session?.user?.groups || [];
      const groups = await getUserManagedGroups(sessionGroups);
      setManagedGroups(groups);
    } catch (error) {
      logger.error("Error fetching managed groups", { error: String(error) });
      toast.error(t("Failed to fetch groups"));
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = async (groupId: string, currentValue: boolean) => {
    try {
      setUpdating(groupId);

      // Find session group data for this group ID
      const sessionGroups = session?.user?.groups || [];
      const sessionGroupData = sessionGroups.find(g => g.id === groupId);

      const success = await updateManagedGroupSelection(
        groupId,
        !currentValue,
        sessionGroupData,
      );

      if (success) {
        setManagedGroups(prev =>
          prev.map(group =>
            group.group_id === groupId
              ? { ...group, is_selected: !currentValue }
              : group,
          ),
        );
        toast.success(t("Group selection updated"));
        // Emit event to refresh group dropdowns
        emitGroupsUpdated();
        // Refresh models in real-time based on new group selection
        refreshModels();
      } else {
        toast.error(t("Failed to update group selection"));
      }
    } catch (error) {
      logger.error("Error toggling group", { error: String(error) });
      toast.error(t("Failed to update group selection"));
    } finally {
      setUpdating(null);
    }
  };

  const selectedCount = managedGroups.filter(g => g.is_selected).length;
  const totalCount = managedGroups.length;

  return (
    <>
      <div className="space-y-2">
        <Label className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <IconUsers size={16} />
            {t("Azure Groups")}
          </span>
          {!loading && (
            <span className="text-muted-foreground text-xs">
              {selectedCount} / {totalCount} {t("selected")}
            </span>
          )}
        </Label>

        <Button
          variant="outline"
          onClick={() => setShowGroups(true)}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <IconUsers size={16} />
            {t("Manage Group Access")}
          </span>
          <IconChevronRight size={16} />
        </Button>
      </div>

      <Sheet open={showGroups} onOpenChange={setShowGroups}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("Manage Azure Groups")}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground text-sm">
              {t(
                "Select which groups should appear in your Group Assistant dropdown. Groups from your session that aren't configured in the system are shown with dashed borders.",
              )}
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <IconLoader2 className="animate-spin" size={32} />
              </div>
            ) : managedGroups.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                <IconUsers size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-sm">{t("No Azure groups found")}</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-3 pr-4">
                  {managedGroups.map(group => {
                    // Check if this is a session-only group (not in azure_groups table)
                    const isSessionOnly = group.is_session_only;

                    return (
                      <div
                        key={group.group_id}
                        className={`hover:bg-muted/50 flex items-center space-x-3 rounded-lg border px-3 py-2 transition-colors ${
                          isSessionOnly ? "border-dashed opacity-75" : ""
                        }`}
                      >
                        <Checkbox
                          id={group.group_id}
                          checked={group.is_selected}
                          disabled={updating === group.group_id}
                          onCheckedChange={() =>
                            toggleGroup(group.group_id, group.is_selected)
                          }
                        />
                        <Label
                          htmlFor={group.group_id}
                          className="flex-1 cursor-pointer text-sm"
                        >
                          <div className="font-medium">
                            {group.azure_groups?.name || group.group_id}
                          </div>
                          {group.azure_groups?.email && (
                            <div className="text-muted-foreground text-xs">
                              {group.azure_groups.email}
                            </div>
                          )}
                          {isSessionOnly && (
                            <div className="text-muted-foreground text-xs italic">
                              {t("From session")}
                            </div>
                          )}
                        </Label>
                        {updating === group.group_id && (
                          <IconLoader2 className="animate-spin" size={16} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <div className="text-muted-foreground text-xs">
              {t(
                "Unchecked groups will not appear in the Group Assistant dropdown",
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
