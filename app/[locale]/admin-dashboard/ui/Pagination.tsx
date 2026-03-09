"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

function Pagination({ count }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;

  const pageCount = Math.ceil(count / 10);

  function nextPage() {
    const next = currentPage === pageCount ? currentPage : currentPage + 1;
    // Update the page parameter while preserving existing search params
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("page", String(next));
    router.push(`?${newParams.toString()}`);
  }

  function prevPage() {
    const prev = currentPage === 1 ? currentPage : currentPage - 1;
    // Update the page parameter while preserving existing search params
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("page", String(prev));
    router.push(`?${newParams.toString()}`);
  }

  if (pageCount <= 1) return null;

  return (
    <div className="flex w-full items-center justify-between px-6 py-3">
      <p className="text-sm">
        Showing{" "}
        <span className="font-semibold">{(currentPage - 1) * 10 + 1}</span> to{" "}
        <span className="font-semibold">
          {currentPage === pageCount ? count : currentPage * 10}
        </span>{" "}
        of <span className="font-semibold">{count}</span> results
      </p>

      <div className="flex gap-2">
        <button
          onClick={prevPage}
          disabled={currentPage === 1}
          className={`${
            currentPage === 1 ? "cursor-not-allowed" : "hover:bg-accent"
          } flex items-center justify-center gap-1 rounded-sm py-1.5 pl-1 pr-3 transition-all duration-300`}
        >
          <IconChevronLeft size={18} />
          <span className="text-sm">Previous</span>
        </button>

        <button
          onClick={nextPage}
          disabled={currentPage === pageCount}
          className={`${
            currentPage === pageCount ? "cursor-not-allowed" : "hover:bg-accent"
          } flex items-center justify-center gap-1 rounded-sm py-1.5 pl-3 pr-1 transition-all duration-300`}
        >
          <span className="text-sm">Next</span>
          <IconChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
