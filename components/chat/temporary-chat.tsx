import { createClientLogger } from "@/lib/logger/client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconHistory } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const logger = createClientLogger({ component: "TemporaryChat" });

export default function TemporaryChatModal({ isOpen, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.user) {
      logger.error("Error fetching user session", {
        error: String(sessionError),
      });
      setLoading(false);
      return;
    }

    const userId = data.session.user.id;
    const { error } = await supabase
      .from("profiles")
      .update({ is_tempchat_popup: true })
      .eq("user_id", userId);

    if (error) {
      logger.error("Error updating profile", { error: String(error) });
    } else {
      onConfirm();
    }

    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader className="flex flex-col items-center space-y-2">
          <DialogTitle className="text-xl font-semibold">
            {t("Temporary Chat")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-base">
          <div>
            <div className="flex items-center gap-2">
              <IconHistory stroke={2} className="size-6" />
              <strong>{t("Not in history")}</strong>
            </div>
            <p className="mt-1 pl-8">
              {t(
                "Temporary chat will disappear as soon as you reload the page or close the chat window. You won’t be able to view this conversation again later.",
              )}
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-end space-x-2 pt-6">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? t("Save") : t("Continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
