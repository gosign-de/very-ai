const ImagePlaceholder = () => {
  return (
    <div className="relative flex size-[400px] items-center justify-center overflow-hidden rounded-lg bg-gray-200">
      <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200"></div>
    </div>
  );
};

export default ImagePlaceholder;
