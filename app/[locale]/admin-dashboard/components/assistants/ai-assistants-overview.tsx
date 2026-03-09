"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { Button } from "@/app/[locale]/admin-dashboard/components/assistants/ui/button";
import { Input } from "@/app/[locale]/admin-dashboard/components/assistants/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/[locale]/admin-dashboard/components/assistants/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/[locale]/admin-dashboard/components/assistants/ui/select";
import { Badge } from "@/app/[locale]/admin-dashboard/components/assistants/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/[locale]/admin-dashboard/components/assistants/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/[locale]/admin-dashboard/components/assistants/ui/dialog";
import { useAssistantStats } from "../../hooks/useAssistantStats";
import Loading from "@/app/[locale]/loading";
import { useTranslation } from "react-i18next";

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

type Assistant = {
  id: string;
  name: string;
  description: string;
  departmentGroup: string;
  type: string;
  createdAt: string;
  usageCount: number;
  author: string;
  // tags: string[];
};

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export default function AIAssistantsOverview() {
  const { data: assistants = [], isLoading } = useAssistantStats();
  const { t, i18n } = useTranslation();

  const [filteredAssistants, setFilteredAssistants] = useState<Assistant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "private" | "group">(
    "all",
  );
  const [selectedDepartmentGroup, setSelectedDepartmentGroup] = useState("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "usageCount">("createdAt");
  const [currentPage, setCurrentPage] = useState(1);
  const assistantsPerPage = 9;

  // Apply filters whenever filter criteria change
  useEffect(() => {
    if (assistants.length > 0) {
      const filtered = assistants.filter(assistant => {
        const matchesQuery = assistant.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const matchesType =
          selectedType === "all" || assistant.type === selectedType;
        const matchesDepartmentGroup =
          selectedDepartmentGroup === "all" ||
          assistant.departmentGroup === selectedDepartmentGroup;
        return matchesQuery && matchesType && matchesDepartmentGroup;
      });

      // Sort the filtered results
      const sorted = [...filtered].sort((a, b) => {
        if (sortBy === "createdAt") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        } else {
          return b.usageCount - a.usageCount;
        }
      });

      setFilteredAssistants(sorted);
    }
  }, [assistants, searchQuery, selectedType, selectedDepartmentGroup, sortBy]);

  const departmentGroups = useMemo(() => {
    return Array.from(new Set(assistants.map(a => a.departmentGroup)));
  }, [assistants]);

  const departmentData = useMemo(() => {
    return departmentGroups.map(group => ({
      name: group,
      value: assistants.filter(a => a.departmentGroup === group).length,
    }));
  }, [departmentGroups, assistants]);

  const usageTrendData = useMemo(() => {
    const data: { [key: string]: number } = {};
    assistants.forEach(assistant => {
      const date = new Date(assistant.createdAt).toISOString().split("T")[0];
      data[date] = (data[date] || 0) + assistant.usageCount;
    });
    return Object.entries(data)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [assistants]);

  const assistantTypeData = useMemo(() => {
    const privateCount = assistants.filter(a => a.type === "private").length;
    const groupCount = assistants.filter(a => a.type === "group").length;
    return [
      { name: t("Private"), count: privateCount },
      { name: t("Group"), count: groupCount },
    ];
  }, [assistants, t]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const currentLanguage = i18n.language || "en";

    const localeMap: { [key: string]: string } = {
      en: "en-US",
      de: "de-DE",
      fr: "fr-FR",
      es: "es-ES",
      it: "it-IT",
      pt: "pt-PT",
      nl: "nl-NL",
      pl: "pl-PL",
      ru: "ru-RU",
      ja: "ja-JP",
      zh: "zh-CN",
      ko: "ko-KR",
    };

    const locale = localeMap[currentLanguage] || currentLanguage;

    return date.toLocaleDateString(locale);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleTypeChange = (type: "all" | "private" | "group") => {
    setSelectedType(type);
    setCurrentPage(1);
  };

  const handleDepartmentGroupChange = (departmentGroup: string) => {
    setSelectedDepartmentGroup(departmentGroup);
    setCurrentPage(1);
  };

  const indexOfLastAssistant = currentPage * assistantsPerPage;
  const indexOfFirstAssistant = indexOfLastAssistant - assistantsPerPage;
  const currentAssistants = filteredAssistants.slice(
    indexOfFirstAssistant,
    indexOfLastAssistant,
  );
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">{t("AI Assistants Overview")}</h1>

      {/* Widgets */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Dialog>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("Total Assistants")}
              </CardTitle>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Maximize2 className="size-4" />
                </Button>
              </DialogTrigger>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{assistants.length}</div>
            </CardContent>
          </Card>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t("Total Assistants")}</DialogTitle>
            </DialogHeader>
            <div className="py-8 text-center text-4xl font-bold">
              {assistants.length}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("Assistants by Department")}
              </CardTitle>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Maximize2 className="size-4" />
                </Button>
              </DialogTrigger>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie
                    data={departmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={40}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {departmentData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t("Assistants by Department")}</DialogTitle>
            </DialogHeader>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={departmentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {departmentData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </DialogContent>
        </Dialog>

        <Dialog>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("Usage Trend")}
              </CardTitle>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Maximize2 className="size-4" />
                </Button>
              </DialogTrigger>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={usageTrendData}>
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#8884d8"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t("Usage Trend")}</DialogTitle>
            </DialogHeader>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={usageTrendData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </DialogContent>
        </Dialog>

        <Dialog>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("Assistant Types")}
              </CardTitle>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Maximize2 className="size-4" />
                </Button>
              </DialogTrigger>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={assistantTypeData}>
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t("Assistant Types")}</DialogTitle>
            </DialogHeader>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={assistantTypeData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <Input
            type="text"
            placeholder={t("Search assistants...")}
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="w-full"
          />
        </div>
        <Select onValueChange={handleTypeChange} value={selectedType}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder={t("Filter by type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Assistants")}</SelectItem>
            <SelectItem value="private">{t("Private Assistants")}</SelectItem>
            <SelectItem value="group">{t("Group Assistants")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={handleDepartmentGroupChange}
          value={selectedDepartmentGroup}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder={t("Filter by department")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Departments")}</SelectItem>
            {departmentGroups.map(group => (
              <SelectItem key={String(group)} value={String(group)}>
                {String(group)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full md:w-auto">
              {t("Sort by")} <ChevronDown className="ml-2 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setSortBy("createdAt")}>
              {t("Latest Created")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy("usageCount")}>
              {t("Most Used")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Assistant Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {currentAssistants.map(assistant => (
          <div key={assistant.id} className="bg-muted rounded-lg p-4 shadow">
            <div className="mb-2 flex items-start justify-between">
              <h2 className="text-lg font-semibold">{assistant.name}</h2>
              <Badge
                variant={
                  assistant.type === "private" ? "background" : "default"
                }
              >
                {assistant.type}
              </Badge>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              {assistant.description}
            </p>
            <Badge
              variant="outline"
              className="mb-2 font-semibold text-white"
              style={{
                backgroundColor: getTagColor(assistant.departmentGroup),
              }}
            >
              {assistant.departmentGroup}
            </Badge>
            <div className="mt-2 text-sm text-gray-500">
              <span>
                {t("Created")}: {formatDate(assistant.createdAt)}
              </span>
              <span className="ml-4">
                {t("Uses")}: {assistant.usageCount}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium">
              {t("Author")}: {assistant.author}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex justify-center">
        <Button
          variant="outline"
          onClick={() => paginate(currentPage - 1)}
          disabled={currentPage === 1}
          className="mr-2"
        >
          <ChevronLeft className="size-4" />
          {t("Previous")}
        </Button>
        <Button
          variant="outline"
          onClick={() => paginate(currentPage + 1)}
          disabled={indexOfLastAssistant >= filteredAssistants.length}
        >
          {t("Next")}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
