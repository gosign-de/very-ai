"use client";

import { createClientLogger } from "@/lib/logger/client";
import { useState, useEffect, useContext } from "react";

const logger = createClientLogger({ component: "ImageLoader" });
import dynamic from "next/dynamic";
import { ImagePreview } from "../ui/image-preview";
import { IconDownload } from "@tabler/icons-react";
import { ChatbotUIContext } from "@/context/context";

const ImageLoadingAnimation = dynamic(() => import("./ImageLoadingAnimation"), {
  ssr: false,
});

const ImageLoader = ({ imageUrl }) => {
  const [progress, setProgress] = useState(0);
  const [loadedImage, setLoadedImage] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  const { setToolInUse } = useContext(ChatbotUIContext);

  useEffect(() => {
    const fetchImageWithProgress = async () => {
      try {
        const response = await fetch(imageUrl);
        const reader = response.body.getReader();
        const contentLengthHeader = response.headers.get("Content-Length");
        const totalLength = contentLengthHeader ? +contentLengthHeader : null;

        let receivedLength = 0;
        const chunks = [];

        if (totalLength === null) {
          // If totalLength is null, we can't calculate progress
          setProgress(null);
        }

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          if (totalLength !== null) {
            const percentage = Math.round((receivedLength / totalLength) * 100);
            setProgress(percentage);
          }
        }

        const blob = new Blob(chunks);
        const imageObjectURL = URL.createObjectURL(blob);
        setLoadedImage(imageObjectURL);
        setToolInUse("none");
      } catch (error) {
        logger.error("Error fetching image", { error: String(error) });
        // Handle error accordingly
      }
    };

    fetchImageWithProgress();
  }, [imageUrl, setToolInUse]);

  const handleDownload = () => {
    if (loadedImage) {
      const link = document.createElement("a");
      link.href = loadedImage;
      link.setAttribute("download", "image.png"); // Set the file name here
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link); // Clean up the DOM
    }
  };

  return (
    <div className="w-75 h-75 relative">
      {loadedImage ? (
        <div className="group relative mt-2 inline-block">
          <img
            src={loadedImage}
            alt="image"
            style={{ width: "400px" }}
            className="m-0 cursor-pointer rounded-[16px]"
            onClick={() => setShowImagePreview(true)}
          />
          {/* Icon container with opacity control */}
          <div
            className="icon-container absolute right-2 top-2 cursor-pointer rounded bg-black/50 p-2 opacity-0 transition-opacity duration-200 hover:opacity-70 group-hover:opacity-100"
            onClick={handleDownload}
          >
            <IconDownload size={18} color="white" />
          </div>
          {showImagePreview && (
            <ImagePreview
              url={loadedImage}
              isOpen={showImagePreview}
              onOpenChange={isOpen => setShowImagePreview(isOpen)}
            />
          )}
        </div>
      ) : (
        <div className="relative flex size-[400px] items-center justify-center overflow-hidden rounded-lg bg-[#F9F9F9]">
          {/* Circular Progress SVG */}
          <div className="relative flex size-[60px] items-center justify-center overflow-hidden rounded-full bg-[#F9F9F9]">
            <svg
              className={`absolute left-0 top-0 size-full${
                progress === null ? "indeterminate-spinner" : ""
              }`}
              viewBox="0 0 100 100"
            >
              <circle
                className="text-[#ECECEC]"
                strokeWidth="4"
                stroke="currentColor"
                fill="transparent"
                r="45"
                cx="50"
                cy="50"
              />
              {progress !== null ? (
                <circle
                  className="text-[#0D0D0D]"
                  strokeWidth="4"
                  strokeDasharray="282.6"
                  strokeDashoffset={282.6 - (282.6 * progress) / 100}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="45"
                  cx="50"
                  cy="50"
                />
              ) : (
                // Indeterminate progress indicator
                <circle
                  className="text-[#0D0D0D]"
                  strokeWidth="4"
                  strokeDasharray="282.6"
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="45"
                  cx="50"
                  cy="50"
                />
              )}
            </svg>

            {/* Centered Image Loading Animation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageLoadingAnimation />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageLoader;
