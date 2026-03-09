"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useEffect, useState } from "react";

const logger = createClientLogger({ component: "GroupAssistantsPage" });
import GroupList from "../components/group-assistants/GroupList";
import Loading from "@/app/[locale]/loading";
import { useRouter } from "next/navigation";

export default function GroupAssistants() {
  const router = useRouter();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGroups() {
      try {
        const response = await fetch("/api/groupAssistant/fetchAllAssistants", {
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
          throw new Error(
            `API request failed: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.data)) {
          setGroups(data.data);
        } else {
          logger.error("Unexpected API response", { data });
          setGroups([]);
        }
      } catch (error) {
        logger.error("Error fetching groups", { error: String(error) });
      } finally {
        setLoading(false);
      }
    }

    fetchGroups();
  }, [router]);

  if (loading) return <Loading />;

  return <GroupList groups={groups} />;
}
