"use client";
import { createClientLogger } from "@/lib/logger/client";

import React, { useEffect, useMemo, useState } from "react";

const logger = createClientLogger({ component: "AuditLogTable" });
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import Loading from "@/app/[locale]/loading";
import { useTranslation } from "react-i18next";

type AuditLog = {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  model_id?: string | null;
  pii_type?: string | null;
  pii_action?: string | null;
  detection_engine?: string | null;
  created_at?: string | null;
};

export function AuditLogTable() {
  const { t } = useTranslation();

  // table state
  const [data, setData] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [pageIndex, setPageIndex] = useState(0); // 0-based
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const page = pageIndex + 1;
      const sort = sorting[0]?.id ?? "created_at";
      const dir = (sorting[0]?.desc ?? true) ? "desc" : "asc";
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      params.set("sortBy", sort);
      params.set("sortDir", dir);
      if (globalFilter) params.set("search", globalFilter);

      const res = await fetch(`/api/pii/audit-logs?${params.toString()}`);
      const json = await res.json();

      setData(json.data ?? []);
      setTotalRows(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.pages ?? 1);
    } catch (err) {
      logger.error("Failed to load audit logs", { error: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    logger.info("Fetching audit logs with params", {
      data: { pageIndex, pageSize, sorting, globalFilter },
    });
    fetchData();
  }, [pageIndex, pageSize, sorting, globalFilter]);

  const columns = useMemo<ColumnDef<AuditLog, any>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: t("Timestamp"),
        cell: info => {
          const v = info.getValue() as string | undefined;
          return v ? new Date(v).toLocaleString() : "—";
        },
      },
      {
        accessorKey: "user_email",
        header: t("User"),
        cell: info => info.getValue() ?? "—",
      },
      {
        accessorKey: "model_id",
        header: t("Model"),
      },
      {
        accessorKey: "pii_type",
        header: t("PII Type"),
        cell: info => info.getValue() ?? "—",
      },
      {
        accessorKey: "pii_action",
        header: t("Action"),
      },
      {
        accessorKey: "detection_engine",
        header: t("Method"),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    pageCount: totalPages,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("Search emails, types or model...")}
            value={globalFilter}
            onChange={e => {
              setGlobalFilter(e.target.value);
              // reset to first page
              setPageIndex(0);
            }}
            className="w-72"
          />
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader className="bg-secondary">
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  className="cursor-pointer select-none"
                  onClick={() => {
                    // toggle sorting on header that supports sorting
                    const col = header.column;
                    // use table API to toggle sorting
                    if (col.getCanSort()) {
                      col.toggleSorting();
                    }
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {/* Show sort indicator */}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {header.column.getIsSorted()
                      ? header.column.getIsSorted() === "desc"
                        ? "↓"
                        : "↑"
                      : ""}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="h-48 text-center">
                <Loading />
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center">
                {t("No audit log entries found.")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell
                    key={cell.id}
                    className="max-w-[180px] truncate whitespace-nowrap"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPageIndex(Math.max(pageIndex - 1, 0))}
            disabled={pageIndex <= 0}
          >
            {t("Previous")}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setPageIndex(Math.min(pageIndex + 1, totalPages - 1))
            }
            disabled={pageIndex >= totalPages - 1}
          >
            {t("Next")}
          </Button>
          <div className="text-muted-foreground text-sm">
            {t("Page")} {pageIndex + 1} {t("of")} {totalPages} | {totalRows}{" "}
            {t("entries")}
          </div>
        </div>

        <Select
          value={String(pageSize)}
          onValueChange={value => {
            setPageSize(Number(value));
            setPageIndex(0);
          }}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder={t("Rows per page")} />
          </SelectTrigger>

          <SelectContent>
            {[10, 25, 50, 100].map(n => (
              <SelectItem key={n} value={String(n)}>
                {n} / {t("page")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
