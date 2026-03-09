"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

function TimeFilter({ filterField, options }) {
  const router = useRouter();
  const currentPath = usePathname();
  const searchParams = useSearchParams();

  function handleClick(value) {
    // Create a new URLSearchParams object from the current query parameters
    const queryParams = new URLSearchParams(window.location.search);

    // Set the new filter value
    queryParams.set(filterField, value);

    // Reset the page parameter to 1
    queryParams.set("page", "1");

    // Update the URL with the new query parameters
    router.push(`${currentPath}?${queryParams.toString()}`, undefined);
  }

  // Determine the active filter, default to "this_month" if filterField is not set
  const activeFilter = searchParams.get(filterField) || "this_month";

  return (
    <div className="bg-muted flex items-center justify-center gap-1 rounded-md border p-1">
      {options.map(option => {
        const isActive = activeFilter === option.value;

        return (
          <button
            className={`hover:bg-background cursor-pointer justify-center rounded px-2 py-1 text-sm font-medium transition-all duration-300 focus:outline-none ${isActive ? "bg-background" : ""}`}
            key={option.value}
            onClick={() => handleClick(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default TimeFilter;
