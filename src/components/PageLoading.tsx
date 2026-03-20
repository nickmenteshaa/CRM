"use client";

/** Skeleton loading state shown while AppContext data loads */
export default function PageLoading() {
  return (
    <div className="animate-pulse space-y-6 p-8">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-40 bg-gray-700 rounded-lg" />
        <div className="h-4 w-64 bg-gray-800 rounded-lg mt-2" />
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-[#111827] rounded-xl border border-[#1F2937] p-5">
            <div className="h-3 w-20 bg-gray-800 rounded" />
            <div className="h-6 w-16 bg-gray-700 rounded mt-2" />
            <div className="h-3 w-24 bg-gray-800 rounded mt-2" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-[#111827] rounded-xl border border-[#1F2937] overflow-hidden">
        <div className="bg-[#0B0F14] px-5 py-3 border-b border-[#1F2937]">
          <div className="h-4 w-32 bg-gray-700 rounded" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-5 py-4 flex gap-6 border-b border-[#1F2937]">
            <div className="h-4 w-8 bg-gray-800 rounded-full flex-shrink-0" />
            <div className="h-4 flex-1 bg-gray-800 rounded" />
            <div className="h-4 w-24 bg-gray-800 rounded" />
            <div className="h-4 w-16 bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
