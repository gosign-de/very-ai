import {
  isModelDeprecated,
  validateAndGetAvailableModel,
} from "@/lib/models/model-availability";
import { LLMID } from "@/types";
import { IconAlertTriangle } from "@tabler/icons-react";
import { FC } from "react";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";

interface DeprecatedModelWarningProps {
  modelId: LLMID;
  onModelUpdate?: (newModelId: LLMID) => void;
  showUpdateButton?: boolean;
}

export const DeprecatedModelWarning: FC<DeprecatedModelWarningProps> = ({
  modelId,
  onModelUpdate,
  showUpdateButton = true,
}) => {
  if (!isModelDeprecated(modelId)) {
    return null;
  }

  const fallbackModel = validateAndGetAvailableModel(modelId);

  const handleUpdateModel = () => {
    if (onModelUpdate) {
      onModelUpdate(fallbackModel);
    }
  };

  return (
    <Alert className="mb-4 border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
      <IconAlertTriangle className="size-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          This chat is using a deprecated model ({modelId}).
          {showUpdateButton && (
            <span className="ml-2">
              You can continue with the current model, but new messages will use{" "}
              {fallbackModel}.
            </span>
          )}
        </span>
        {showUpdateButton && onModelUpdate && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUpdateModel}
            className="ml-4 border-yellow-300 text-yellow-800 hover:bg-yellow-100 dark:border-yellow-700 dark:text-yellow-200 dark:hover:bg-yellow-800/20"
          >
            Update to {fallbackModel}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
