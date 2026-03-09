"use client";
import { createClientLogger } from "@/lib/logger/client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const logger = createClientLogger({ component: "AssignmentsTab" });
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import CreateAssignmentDialog from "./create-assignment-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

type Assignment = {
  id: string;
  webhook_id: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  n8n_webhooks: {
    id: string;
    name: string;
    status: string;
  };
  entity_details?: {
    name: string;
    sharing: string;
    author: string;
    group_id?: string | null;
  };
};

export default function AssignmentsTab() {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteAssignment, setDeleteAssignment] = useState<Assignment | null>(
    null,
  );

  const fetchAssignments = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/n8n/assignments");
      const data = await response.json();

      if (data.success) {
        setAssignments(data.data);
      } else {
        toast.error(t("Failed to fetch assignments"));
      }
    } catch (error) {
      logger.error("Error fetching assignments", { error: String(error) });
      toast.error(t("Error fetching assignments"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const handleDelete = async (assignment: Assignment) => {
    try {
      const response = await fetch(`/api/n8n/assignments/${assignment.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t("Assignment deleted successfully"));
        fetchAssignments();
      } else {
        toast.error(data.error || t("Failed to delete assignment"));
      }
    } catch (error) {
      logger.error("Error deleting assignment", { error: String(error) });
      toast.error(t("Error deleting assignment"));
    } finally {
      setDeleteAssignment(null);
    }
  };

  // Group assignments by entity
  const groupedAssignments = assignments.reduce(
    (acc, assignment) => {
      const key = `${assignment.entity_type}:${assignment.entity_id}`;
      if (!acc[key]) {
        acc[key] = {
          entity_type: assignment.entity_type,
          entity_id: assignment.entity_id,
          entity_details: assignment.entity_details,
          webhooks: [],
        };
      }
      acc[key].webhooks.push(assignment);
      return acc;
    },
    {} as Record<
      string,
      {
        entity_type: string;
        entity_id: string;
        entity_details?: {
          name: string;
          sharing: string;
          author: string;
          group_id?: string | null;
        };
        webhooks: Assignment[];
      }
    >,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            {t("Loading assignments...")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("Webhook Assignments")}</CardTitle>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              {t("Create Assignment")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              {t(
                "No assignments created yet. Assign webhooks to models or assistants to enable automatic tool calling.",
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.values(groupedAssignments).map(group => (
                <div
                  key={`${group.entity_type}:${group.entity_id}`}
                  className="rounded-lg border p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {group.entity_type === "model" ? "Model" : "Assistant"}
                    </Badge>
                    {group.entity_type === "assistant" &&
                    group.entity_details ? (
                      <>
                        <span className="font-medium">
                          {group.entity_details.name}
                        </span>
                        <Badge
                          variant={
                            group.entity_details.group_id
                              ? "default"
                              : group.entity_details.sharing === "private"
                                ? "secondary"
                                : "default"
                          }
                          className="text-xs"
                        >
                          {group.entity_details.group_id
                            ? "Group"
                            : group.entity_details.sharing === "private"
                              ? "Private"
                              : "Public"}
                        </Badge>
                        <span className="text-muted-foreground text-sm">
                          by {group.entity_details.author}
                        </span>
                      </>
                    ) : (
                      <span className="font-medium">{group.entity_id}</span>
                    )}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Webhook Name")}</TableHead>
                        <TableHead>{t("Status")}</TableHead>
                        <TableHead>{t("Assigned On")}</TableHead>
                        <TableHead className="text-right">
                          {t("Actions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.webhooks.map(assignment => (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">
                            {assignment.n8n_webhooks.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                assignment.n8n_webhooks.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {assignment.n8n_webhooks.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(
                              assignment.created_at,
                            ).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteAssignment(assignment)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAssignmentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={fetchAssignments}
      />

      <AlertDialog
        open={!!deleteAssignment}
        onOpenChange={open => !open && setDeleteAssignment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Assignment")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Are you sure you want to remove this webhook assignment? The webhook will no longer be available as a tool for this entity.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAssignment && handleDelete(deleteAssignment)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
