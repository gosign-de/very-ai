"use client";
import { createClientLogger } from "@/lib/logger/client";
import { toast } from "sonner";

const logger = createClientLogger({ component: "GroupList" });
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function GroupList({ groups }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [groupData, setGroupData] = useState(groups);

  const handleToggleConfidential = async (id, currentStatus) => {
    setGroupData(prevGroups =>
      prevGroups.map(group =>
        group.id === id ? { ...group, is_confidential: !currentStatus } : group,
      ),
    );

    try {
      const response = await fetch("/api/groupAssistant/updateConfidential", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ id, is_confidential: !currentStatus }),
      });

      if (response.redirected) {
        router.push(response.url);
        return;
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }
      toast.success(t("Successfully updated confidentiality status!"));
    } catch (error) {
      logger.error("Error updating confidentiality", { error: String(error) });
      toast.error(
        t("Error updating confidentiality status. Please try again."),
      );

      setGroupData(prevGroups =>
        prevGroups.map(group =>
          group.id === id
            ? { ...group, is_confidential: currentStatus }
            : group,
        ),
      );
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold">{t("Group Assistants")}</h1>
      <table className="mt-6 min-w-full border-collapse border border-gray-200">
        <thead>
          <tr>
            <th className="border px-6 py-4 text-left text-sm font-bold uppercase tracking-wide">
              {t("Name")}
            </th>
            <th className="border px-6 py-4 text-left text-sm font-bold uppercase tracking-wide">
              {t("Description")}
            </th>
            <th className="border px-6 py-4 text-center text-sm font-bold uppercase tracking-wide">
              {t("Role")}
            </th>
            <th className="border px-6 py-4 text-center text-sm font-bold uppercase tracking-wide">
              {t("Confidential")}
            </th>
          </tr>
        </thead>
        <tbody className="bg-background">
          {groupData.map(group => (
            <tr key={group.id}>
              <td className="border px-6 py-3 text-sm">{group.name}</td>
              <td className="border px-6 py-3 text-sm">
                {group.description || t("N/A")}
              </td>
              <td className="border px-6 py-3 text-center text-sm">
                {group.role}
              </td>
              <td className="border px-6 py-3 text-center text-sm">
                <input
                  type="checkbox"
                  checked={group.is_confidential}
                  onChange={() =>
                    handleToggleConfidential(group.id, group.is_confidential)
                  }
                  className="bg-inputBg checked:bg-primary before:bg-primary checked:before:bg-background
                    border-primary relative h-6 w-11 cursor-pointer appearance-none rounded-full border transition-all
                    duration-300 before:absolute before:left-1 before:top-1/2 before:size-4
                    before:-translate-y-1/2 before:rounded-full before:transition-all checked:before:translate-x-5"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
