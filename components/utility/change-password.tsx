"use client";

import { supabase } from "@/lib/supabase/browser-client";
import { useRouter } from "next/navigation";
import { FC, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface ChangePasswordProps {}

export const ChangePassword: FC<ChangePasswordProps> = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleResetPassword = async () => {
    if (!newPassword) return toast.info(t("Please enter your new password."));

    await supabase.auth.updateUser({ password: newPassword });

    toast.success(t("Password changed successfully."));

    return router.push("/login");
  };

  return (
    <Dialog open={true}>
      <DialogContent className="h-[240px] w-[400px] p-4">
        <DialogHeader>
          <DialogTitle>{t("Change Password")}</DialogTitle>
        </DialogHeader>

        <Input
          id="password"
          placeholder={t("New Password")}
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />

        <Input
          id="confirmPassword"
          placeholder={t("Confirm New Password")}
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />

        <DialogFooter>
          <Button onClick={handleResetPassword}>{t("Confirm Change")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
