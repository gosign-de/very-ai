"use client";

import { createClientLogger } from "@/lib/logger/client";
import {
  useAnimation,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useSwipeable } from "react-swipeable";
import { Trash2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const logger = createClientLogger({ component: "SwipeableItem" });

export const SwipeableItem = ({ children, file, onDelete, onClick }) => {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const supabase = createClient();
  const [fileState, setFileState] = useState(file);
  const opacity = useTransform(x, [-150, -75, 0], [1, 0.5, 0]);
  const deleteIconOpacity = useTransform(x, [-150, -100], [1, 0]);

  const fetchFileRow = async (fileId: string) => {
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (error) {
      logger.error("Error loading file row", { error: String(error) });
      return null;
    }

    return data;
  };

  useEffect(() => {
    const load = async () => {
      const row = await fetchFileRow(file.id);
      if (row) {
        setFileState(row);
      }
    };
    load();
  }, [file.id]);

  useEffect(() => {
    if (!fileState?.processing_status) return;
    if (fileState.processing_status !== "processing") return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("files")
        .select("processing_status, processing_progress")
        .eq("id", fileState.id)
        .single();

      if (!data) return;

      setFileState(prev => ({ ...prev, ...data }));

      if (data.processing_status !== "processing") {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [fileState?.id, fileState?.processing_status]);

  const swipeHandlers = useSwipeable({
    onSwiped: eventData => {
      const swipeDistance = eventData.deltaX;

      if (swipeDistance <= -150) {
        controls
          .start({
            x: -300,
            transition: { duration: 0.3 },
          })
          .then(() => {
            onDelete?.();
          });
      } else {
        controls.start({
          x: 0,
          transition: {
            type: "spring",
            stiffness: 500,
            damping: 30,
          },
        });
      }
    },
    trackMouse: true,
  });

  const isProcessing =
    fileState?.processing_status === "processing" ||
    fileState?.status === "processing";

  const progress = fileState?.processing_progress || 0;

  return (
    <div className="relative w-full" onClick={onClick}>
      <div className="overflow-hidden">
        {/* Full-width background */}
        <motion.div
          style={{ opacity }}
          className="absolute inset-0 rounded bg-[#FF0000]"
        />

        {/* Delete icon */}
        <motion.div
          style={{ opacity: deleteIconOpacity }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white"
        >
          <Trash2 size={20} />
        </motion.div>

        {/* Swipeable content */}
        <motion.div
          {...swipeHandlers}
          drag="x"
          dragConstraints={{ left: -150, right: 0 }}
          style={{ x }}
          animate={controls}
          initial={{ x: 0 }}
          className="z-9 relative flex cursor-pointer flex-col rounded focus:outline-none"
        >
          <div className="flex items-center gap-3">
            {children}
            {isProcessing && (
              <div className="ml-auto flex items-center gap-1.5 pr-3">
                <Loader2 className="size-4 animate-spin text-blue-500" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {progress}%
                </span>
              </div>
            )}
          </div>
          {isProcessing && (
            <div className="mt-2 px-3 pb-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default SwipeableItem;
