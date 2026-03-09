"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";

const logger = createClientLogger({ component: "UserList" });
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Button } from "./button";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useModelFilter } from "../../context/ModelFilterContext";
import { filterModelCountsForAnalytics } from "../../../../../lib/model-names";

type User = {
  id: string | number;
  email: string;
  username: string;
  aiModelRequests: Record<string, number>;
  aiAssistantUses: number;
  lastSignIn: Date;
};

type SortKey = "username" | "requests" | "assistantUses" | "lastSignIn";

function convertDatabaseData(dbData) {
  return dbData.map(user => ({
    ...user,
    lastSignIn: new Date(user.lastSignIn),
    // Filter aiModelRequests to only include allowed models
    aiModelRequests: filterModelCountsForAnalytics(user.aiModelRequests || {}),
  }));
}

export default function UserList() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "de" ? de : enUS;
  const router = useRouter();
  const { selectedModel, dateRange } = useModelFilter();

  const [users, setUsers] = useState<User[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("username");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/chat-stats/get-user-analytics", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start_date: dateRange.start,
            end_date: dateRange.end,
          }),
        });

        if (response.redirected) {
          router.push(response.url);
          return;
        }

        const data = await response.json();

        setUsers(convertDatabaseData(data.data));
      } catch (err) {
        logger.error("Error fetching data", { error: String(err) });
      }
    };

    fetchData();
  }, [dateRange, router]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const filteredUsers = users
    .filter(user => {
      if (selectedModel !== "All Models") {
        return (
          user.aiModelRequests[
            selectedModel as keyof typeof user.aiModelRequests
          ] > 0
        );
      }
      return true;
    })
    .filter(user => {
      if (dateRange.start && dateRange.end) {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        return user.lastSignIn >= start && user.lastSignIn <= end;
      }

      return true;
    });

  const sortedUsers = filteredUsers.sort((a, b) => {
    if (sortKey === "username") {
      return sortOrder === "asc"
        ? a.username.localeCompare(b.username)
        : b.username.localeCompare(a.username);
    } else if (sortKey === "requests") {
      const aRequests =
        selectedModel === "All Models"
          ? Object.values(a.aiModelRequests).reduce((sum, val) => sum + val, 0)
          : a.aiModelRequests[selectedModel as keyof typeof a.aiModelRequests];
      const bRequests =
        selectedModel === "All Models"
          ? Object.values(b.aiModelRequests).reduce((sum, val) => sum + val, 0)
          : b.aiModelRequests[selectedModel as keyof typeof b.aiModelRequests];
      return sortOrder === "asc"
        ? aRequests - bRequests
        : bRequests - aRequests;
    } else if (sortKey === "assistantUses") {
      return sortOrder === "asc"
        ? a.aiAssistantUses - b.aiAssistantUses
        : b.aiAssistantUses - a.aiAssistantUses;
    } else {
      return sortOrder === "asc"
        ? a.lastSignIn.getTime() - b.lastSignIn.getTime()
        : b.lastSignIn.getTime() - a.lastSignIn.getTime();
    }
  });

  const pageCount = Math.ceil(sortedUsers.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedUsers.slice(indexOfFirstItem, indexOfLastItem);

  const maskUsername = (username: string) => {
    if (!username) return "";

    const length = username.length;
    if (length <= 5) return "x".repeat(length);

    return `${username.slice(0, length - 5)}${"x".repeat(5)}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-card flex flex-col gap-4 rounded-lg p-4 shadow">
        <h2 className="text-xl font-semibold">{t("User List")}</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">
              <Button variant="ghost" onClick={() => handleSort("username")}>
                {t("Username")}
                {sortKey === "username" &&
                  (sortOrder === "asc" ? (
                    <ChevronUp className="ml-2 size-4" />
                  ) : (
                    <ChevronDown className="ml-2 size-4" />
                  ))}
                {sortKey !== "username" && (
                  <ChevronsUpDown className="ml-2 size-4" />
                )}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => handleSort("requests")}>
                {t("AI Model Requests")}
                {sortKey === "requests" &&
                  (sortOrder === "asc" ? (
                    <ChevronUp className="ml-2 size-4" />
                  ) : (
                    <ChevronDown className="ml-2 size-4" />
                  ))}
                {sortKey !== "requests" && (
                  <ChevronsUpDown className="ml-2 size-4" />
                )}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("assistantUses")}
              >
                {t("AI Assistant Uses")}
                {sortKey === "assistantUses" &&
                  (sortOrder === "asc" ? (
                    <ChevronUp className="ml-2 size-4" />
                  ) : (
                    <ChevronDown className="ml-2 size-4" />
                  ))}
                {sortKey !== "assistantUses" && (
                  <ChevronsUpDown className="ml-2 size-4" />
                )}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => handleSort("lastSignIn")}>
                {t("Last Sign In")}
                {sortKey === "lastSignIn" &&
                  (sortOrder === "asc" ? (
                    <ChevronUp className="ml-2 size-4" />
                  ) : (
                    <ChevronDown className="ml-2 size-4" />
                  ))}
                {sortKey !== "lastSignIn" && (
                  <ChevronsUpDown className="ml-2 size-4" />
                )}
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentItems.map(user => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                {maskUsername(user.username)}
              </TableCell>
              <TableCell>
                {selectedModel === "All Models"
                  ? Object.values(user.aiModelRequests).reduce(
                      (sum, val) => sum + val,
                      0,
                    )
                  : user.aiModelRequests[
                      selectedModel as keyof typeof user.aiModelRequests
                    ]}
              </TableCell>
              <TableCell>{user.aiAssistantUses}</TableCell>
              <TableCell>
                {format(user.lastSignIn, "PPP", { locale })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex items-center justify-between">
        <div>
          {t("Showing")} {indexOfFirstItem + 1} {t("to")}{" "}
          {Math.min(indexOfLastItem, sortedUsers.length)} {t("of")}{" "}
          {sortedUsers.length} {t("entries")}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            {t("Previous")}
          </Button>
          <Button
            onClick={() =>
              setCurrentPage(prev => Math.min(prev + 1, pageCount))
            }
            disabled={currentPage === pageCount}
          >
            {t("Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
