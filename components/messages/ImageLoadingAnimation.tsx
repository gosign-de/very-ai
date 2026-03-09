"use client";

import dynamic from "next/dynamic";

// Dynamically import Lottie with SSR disabled
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

import imageLoadingData from "./image-loading.json";

const ImageLoadingAnimation = () => {
  const style = {
    height: 70,
    width: 70,
  };

  return (
    <div>
      <Lottie animationData={imageLoadingData} style={style} />
    </div>
  );
};

export default ImageLoadingAnimation;
