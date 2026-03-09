"use client";

import Image from "next/image";
import { ChangeEvent, FC, useState } from "react";
import { toast } from "sonner";
import { Input } from "./input";
import { useTranslation } from "react-i18next";

interface ImagePickerProps {
  src: string;
  image: File | null;
  onSrcChange: (src: string) => void;
  onImageChange: (image: File) => void;
  width?: number;
  height?: number;
}

const ImagePicker: FC<ImagePickerProps> = ({
  src,
  image,
  onSrcChange,
  onImageChange,
  width = 200,
  height: _height = 200,
}) => {
  const { t } = useTranslation();

  const [previewSrc, setPreviewSrc] = useState<string>(src);
  const [previewImage, setPreviewImage] = useState<File | null>(image);

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];

      if (file.size > 6000000) {
        toast.error("Image must be less than 6MB!");
        return;
      }

      const url = URL.createObjectURL(file);

      const img = new window.Image();
      img.src = url;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          toast.error("Unable to create canvas context.");
          return;
        }

        const size = Math.min(img.width, img.height);
        canvas.width = size;
        canvas.height = size;

        ctx.drawImage(
          img,
          (img.width - size) / 2,
          (img.height - size) / 2,
          size,
          size,
          0,
          0,
          size,
          size,
        );

        const squareUrl = canvas.toDataURL();

        setPreviewSrc(squareUrl);
        setPreviewImage(file);
        onSrcChange(squareUrl);
        onImageChange(file);
      };
    }
  };

  return (
    <div>
      {previewSrc && (
        <Image
          style={{ width: `${width}px`, height: `${width}px` }}
          className="rounded"
          height={width}
          width={width}
          src={previewSrc}
          alt={"Image"}
        />
      )}

      <Input
        className="hidden"
        type="file"
        accept="image/png, image/jpeg, image/jpg"
        onChange={handleImageSelect}
        id="img-input"
      />
      <label
        htmlFor="img-input"
        className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:none mt-1 flex h-10 w-full cursor-pointer rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium hover:opacity-50 focus-visible:outline-none focus-visible:ring-offset-2"
      >
        <span id="file-input-button" className="pr-2">
          {t("Choose file")}
        </span>
        <span>
          {previewImage?.name ? previewImage.name : t("No file chosen")}
        </span>
      </label>
    </div>
  );
};

export default ImagePicker;
