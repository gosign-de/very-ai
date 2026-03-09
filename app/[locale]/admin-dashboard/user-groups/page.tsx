"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const logger = createClientLogger({ component: "UserGroupsPage" });
import { IconDots } from "@tabler/icons-react";
import GroupForm from "../components/groups/GroupForm";
import { toast } from "sonner";
import { IconLoader2 } from "@tabler/icons-react";
import Loading from "@/app/[locale]/loading";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function Page() {
  const router = useRouter();
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [_azureGroups, setAzureGroups] = useState<any[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/azureGroup/fetchAllAzureGroup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.redirected) {
          router.push(response.url);
          return;
        }

        if (!response.ok) {
          throw new Error(`Error fetching groups: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
          setGroups(result.data);
        } else {
          toast.error(t("Failed to fetch groups."));
        }
      } catch (error) {
        logger.error("Error fetching groups", { error: String(error) });
        toast.error(t("An error occurred."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const handleClickOutside = event => {
      if (!event.target.closest(".relative")) {
        setDropdownOpen(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCheckboxChange = async (groupId, isChecked) => {
    const updatedGroups = groups.map(group => {
      if (group.group_id === groupId) {
        return { ...group, group_status: isChecked };
      }
      return group;
    });
    setGroups(updatedGroups);
    // await updateGroupStatus(groupId, isChecked);
    try {
      const response = await fetch("/api/azureGroup/updateGroup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, isChecked }),
      });

      if (response.redirected) {
        router.push(response.url);
        return;
      }

      if (!response.ok) {
        throw new Error(`Error fetching groups: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to update group status");
      }
      toast.success(t("Group status updated successfully!"));
    } catch (error) {
      logger.error("Error updating group status", { error: String(error) });
      toast.error(t("An error occurred. Reverting changes."));
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      const response = await fetch("/api/azureGroup/deleteGroup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (response.redirected) {
        router.push(response.url);
        return;
      }

      if (!response.ok) {
        throw new Error(`Error fetching groups: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast.success(t("Group deleted successfully!"));
        setGroups(groups.filter(group => group.id !== id));
      } else {
        toast.error(result.error || t("Failed to delete group."));
      }
    } catch (error) {
      logger.error("Error deleting group", { error: String(error) });
      toast.error(t("Failed to delete group. Please try again."));
    }
  };

  const handleEditGroup = group => {
    setSelectedGroup(group);
    setShowForm(true);
  };

  const handleAddGroup = () => {
    setSelectedGroup(null);
    setShowForm(true);
  };

  const handleFormSubmit = async formData => {
    try {
      if (selectedGroup) {
        const response = await fetch("/api/azureGroup/editGroup", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedGroup.id, groupData: formData }),
        });

        if (response.redirected) {
          router.push(response.url);
          return;
        }

        if (!response.ok) {
          throw new Error(`Error fetching groups: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to update group.");
        }

        setGroups(prevGroups =>
          prevGroups.map(group =>
            group.id === selectedGroup.id ? { ...group, ...formData } : group,
          ),
        );
      } else {
        const response = await fetch("/api/azureGroup/createGroup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (response.redirected) {
          router.push(response.url);
          return;
        }

        if (!response.ok) {
          throw new Error(`Error fetching groups: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to create group.");
        }
        const newGroup = result.data;

        if (newGroup?.length > 0) {
          setGroups(prevGroups => [...prevGroups, newGroup[0]]);
        } else {
          throw new Error("No group data returned from the API.");
        }
      }
      setShowForm(false);
      setSelectedGroup(null);
    } catch (error) {
      logger.error("Error saving group", { error: String(error) });
    }
  };

  const handleButtonClick = async () => {
    try {
      setFetchLoading(true);
      const token = await getToken();
      if (token) {
        const groupsList = await fetchGroups(token);
        setAzureGroups(groupsList);
        await updateFetchedGroup(groupsList);
        setGroups(prevGroups => {
          const updatedGroupsMap = new Map(
            groupsList.map(group => [group.group_id, group]),
          );

          return prevGroups.map(group => {
            const updatedGroup = updatedGroupsMap.get(group.group_id);

            if (updatedGroup) {
              return { ...group, ...(updatedGroup as object) };
            }

            return group;
          });
        });
        setGroups(prevGroups => {
          const existingGroupIds = new Set(
            prevGroups.map(group => group.group_id),
          );
          const newGroups = groupsList.filter(
            group => !existingGroupIds.has(group.group_id),
          );
          return [...prevGroups, ...newGroups];
        });
        toast.success(t("Groups fetched successfully!"));
      }
    } catch (error) {
      logger.error("Error during button click", {
        error: String((error as Error).message),
      });
      toast.error(t("Failed to fetch groups. Please try again."));
    } finally {
      setFetchLoading(false);
    }
  };

  async function getToken() {
    try {
      const response = await fetch("/api/azureGroup/getToken", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Error fetching token: ${response.status}`);
      }

      const data: {
        token_type: string;
        expires_in: number;
        access_token: string;
      } = await response.json();

      return data.access_token;
    } catch (error) {
      logger.error("Error fetching token", {
        error: String((error as Error).message),
      });
      return null;
    }
  }

  async function fetchGroups(accessToken: string) {
    try {
      const response = await fetch("/api/azureGroup/listGroups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (!response.ok) {
        throw new Error(`Error fetching groups: ${response.status}`);
      }

      const groups = await response.json();
      const formattedGroups = groups.value.map((group: any) => ({
        group_id: group.id,
        name: group.displayName,
        email: group.mail || "",
      }));
      return formattedGroups;
    } catch (error) {
      logger.error("Error fetching groups", {
        error: String((error as Error).message),
      });
      return [];
    }
  }

  async function updateFetchedGroup(groups: any[]) {
    try {
      const groupUpdates = groups.map(async group => {
        const groupData = {
          name: group.name,
          email: group.email,
        };

        try {
          const _updatedGroup = await handleUpdateAllGroup(
            group.group_id,
            groupData,
          );
        } catch (error) {
          logger.error("Error updating group", {
            error: String((error as Error).message),
          });
        }
      });

      await Promise.all(groupUpdates);
    } catch (error) {
      logger.error("Error in updating groups", {
        error: String((error as Error).message),
      });
    }
  }

  const handleUpdateAllGroup = async (id, groupData) => {
    try {
      const response = await fetch("/api/azureGroup/updateAllGroups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, groupData }),
      });

      if (response.redirected) {
        router.push(response.url);
        return;
      }

      if (!response.ok) {
        throw new Error(`Error fetching groups: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to update group.");
      }
      toast.success(result.message);
    } catch (error) {
      logger.error("Error updating group", { error: String(error) });
      toast.error(error.message || t("Something went wrong!"));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between">
        <h1 className="-xl:basis-full -xl:mb-6 text-3xl font-bold">
          {t("Dashboard")}
        </h1>
        <div className="flex gap-3">
          <Button onClick={handleAddGroup}>{t("Add New Group")}</Button>
          <Button onClick={handleButtonClick}>
            {fetchLoading ? (
              <IconLoader2 className="animate-spin" />
            ) : (
              t("Fetch Groups")
            )}
          </Button>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <table className="min-w-full border-collapse border border-gray-200">
          <thead>
            <tr>
              <th className="border px-6 py-4 text-left text-sm font-bold uppercase tracking-wide">
                {t("Name")}
              </th>
              <th className="border px-6 py-4 text-left text-sm font-bold uppercase tracking-wide">
                {t("Group ID")}
              </th>
              <th className="border px-6 py-4 text-center text-sm font-bold uppercase tracking-wide">
                {t("Status")}
              </th>
              <th className="border px-6 py-4 text-center text-sm font-bold uppercase tracking-wide">
                {t("Actions")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-background">
            {groups.map(group => (
              <tr key={group?.id}>
                <td className="border px-6 py-3 text-sm">{group?.name}</td>
                <td className="border px-6 py-3 text-sm">{group?.group_id}</td>
                <td className="border px-6 py-3 text-center text-sm">
                  <input
                    type="checkbox"
                    checked={group?.group_status}
                    onChange={e =>
                      handleCheckboxChange(group?.group_id, e.target.checked)
                    }
                    className="bg-inputBg checked:bg-primary before:bg-primary checked:before:bg-background border-primary checked:border-DEFAULT 
                    relative h-6 w-11 cursor-pointer appearance-none 
                    rounded-full border transition-all duration-300 before:absolute 
                    before:left-1 before:top-1/2 before:size-4 
                    before:-translate-y-1/2 before:rounded-full before:transition-all checked:before:translate-x-5"
                  />
                </td>

                <td className="relative border px-6 py-3 text-center text-sm">
                  <div className="relative inline-block text-left">
                    <button
                      className="bg-inputBg rounded-full border border-gray-500 p-1 "
                      onClick={() =>
                        setDropdownOpen(prev =>
                          prev === group.id ? null : group.id,
                        )
                      }
                    >
                      <span className="sr-only">{t("Open menu")}</span>
                      <IconDots />
                    </button>

                    {dropdownOpen === group.id && (
                      <div className="absolute right-0 z-10 mt-2 w-28 border-collapse rounded border border-gray-200 shadow-md">
                        <button
                          onClick={() => handleEditGroup(group)}
                          className="hover:bg-background bg-inputBg block w-full px-4 py-2 text-left text-sm"
                        >
                          {t("Edit")}
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group?.id)}
                          className="hover:bg-background bg-inputBg block w-full px-4 py-2 text-left text-sm"
                        >
                          {t("Delete")}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showForm && (
        <GroupForm
          initialData={selectedGroup}
          onSubmit={handleFormSubmit}
          onClose={() => setShowForm(false)}
          groups={groups}
        />
      )}
    </>
  );
}
