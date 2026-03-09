"use client";
import Loading from "../../loading";
import ModelChart from "../components/charts/ModelChart";
import RequestChart from "../components/charts/RequestChart";
import Stats from "../components/Stats";
import TopUsers from "../components/TopUsers";
import { useChatStats } from "../hooks/useChatStats";
import { useModelStats } from "../hooks/useModelStats";
import { useTopUsers } from "../hooks/useTopUsers";

function DashboardLayout() {
  const { data: totalRequests, isLoading: isLoading1 } = useChatStats();
  const { data: usersActivity, isLoading: isLoading2 } = useTopUsers();
  const { data: modelStatsData, isLoading: isLoading3 } = useModelStats();

  // Extract modelStats and modelCountStats with proper fallbacks
  const modelStats = modelStatsData?.modelStats || [];
  const modelCountStats = modelStatsData?.modelCountStats || {};

  // Show loading state
  if (isLoading1 || isLoading2 || isLoading3) {
    return <Loading />;
  }

  return (
    <div className="grid grid-cols-4 gap-6">
      <Stats totalRequests={totalRequests} />
      <TopUsers usersActivity={usersActivity} />
      <ModelChart modelCountStats={modelCountStats} />
      <RequestChart modelStats={modelStats} />
    </div>
  );
}

export default DashboardLayout;
