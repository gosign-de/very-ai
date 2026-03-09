"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { v4 as uuidv4 } from "uuid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function GroupForm({
  initialData,
  onSubmit,
  onClose,
  groups,
}: any) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    id: uuidv4(),
    name: "",
    group_id: "",
    type: "",
    email: "",
    group_status: true,
  });

  const [errors, setErrors] = useState({
    name: "",
    group_id: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
    setErrors({
      ...errors,
      [name]: "",
    });
  };

  const validateUUID = (uuid: string) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { name: string; group_id: string } = {
      name: "",
      group_id: "",
    };

    if (!formData.name) {
      newErrors.name = t("Name is required.");
    }

    if (!formData.group_id) {
      newErrors.group_id = t("Group ID is required.");
    } else if (!validateUUID(formData.group_id)) {
      newErrors.group_id = t("Group ID must be a valid UUID.");
    } else {
      const isDuplicate = groups.some(
        (group: any) =>
          group.group_id === formData.group_id &&
          (!initialData || group.id !== initialData.id),
      );
      if (isDuplicate) {
        newErrors.group_id = t("Group ID must be unique.");
      }
    }

    if (newErrors.name || newErrors.group_id) {
      setErrors(newErrors);
      return;
    }

    await onSubmit(formData);
    toast.success(
      initialData
        ? t("Group updated successfully!")
        : t("Group added successfully!"),
    );
    setFormData({ ...formData, name: "", group_id: uuidv4() });
  };

  return (
    <div className="bg-background/50 fixed inset-0 z-50 flex items-center justify-center bg-opacity-50 backdrop-blur-sm">
      <div className="animate-fade-in bg-background w-full max-w-md rounded-lg border border-gray-200 p-6 shadow-lg">
        <h2 className="mb-4 text-center text-xl font-semibold">
          {initialData ? t("Edit Group") : t("Add Group")}
        </h2>
        <div>
          <div className="mb-4">
            <Label className="block text-sm font-medium">{t("Name")}</Label>
            <Input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder={t("Group Name")}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>
          <div className="mb-4">
            <Label className="block text-sm font-medium">{t("Group ID")}</Label>
            <Input
              type="text"
              name="group_id"
              value={formData.group_id}
              onChange={handleChange}
              placeholder="e.g., 8ecddb77-3213-4fe8-a5dd-57a82f2655ee"
            />
            {errors.group_id && (
              <p className="text-xs text-red-500">{errors.group_id}</p>
            )}
          </div>
          <div className="mb-4">
            <Label className="block text-sm font-medium">{t("Type")}</Label>
            <Input
              type="text"
              name="type"
              value={formData.type}
              onChange={handleChange}
            />
          </div>
          <div className="mb-4">
            <Label className="block text-sm font-medium">{t("Email")}</Label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
          <div className="mb-6 flex items-center">
            <input
              type="checkbox"
              name="group_status"
              checked={formData.group_status}
              onChange={handleChange}
            />
            <Label className="ml-2 text-sm">{t("Active Status")}</Label>
          </div>
          <div className="flex justify-end space-x-2">
            <Button onClick={handleSubmit}>
              {initialData ? t("Save") : t("Add")}
            </Button>
            <Button onClick={onClose} variant="ghost">
              {t("Cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
