import { cn } from "@/lib/utils";
import Image from "next/image";
import { FC } from "react";
import { Dialog, DialogContent } from "./dialog"; // Import DialogClose from your dialog components

interface ImagePreviewProps {
  url: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const ImagePreview: FC<ImagePreviewProps> = ({
  url,
  isOpen,
  onOpenChange,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex items-center justify-center outline-none",
          "border-transparent bg-transparent",
        )}
      >
        <Image
          className="rounded"
          src={url}
          alt="image"
          sizes="(max-width: 90vw) 90vw, (max-height: 90vh) 90vh"
          width={2000}
          height={2000}
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            width: "auto",
            height: "auto",
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
