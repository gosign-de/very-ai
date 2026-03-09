"use client";

function Stat({ icon, title, value }) {
  return (
    <div className="bg-muted -xl:col-span-2 col-span-1 grid grid-cols-[4rem_1fr] grid-rows-[auto_auto] gap-x-4 gap-y-1 rounded-md border p-4">
      <div
        className={`bg-background row-span-2 flex aspect-square items-center justify-center rounded-full`}
      >
        {icon}
      </div>
      <h5 className="self-end text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h5>
      <p className="text-2xl font-medium leading-none">
        {value?.toLocaleString() || 0}
      </p>
    </div>
  );
}

export default Stat;
