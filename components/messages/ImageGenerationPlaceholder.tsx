"use client";

import ImageLoadingAnimation from "./ImageLoadingAnimation";

const ImageGenerationPlaceholder = () => {
  return (
    <div className="relative flex size-[400px] items-center justify-center overflow-hidden rounded-lg bg-[#F9F9F9]">
      <ImageLoadingAnimation />
    </div>
  );
};

export default ImageGenerationPlaceholder;
