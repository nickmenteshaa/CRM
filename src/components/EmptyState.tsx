"use client";

type Props = {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
};

/** Reusable empty state with icon, text, and optional CTA */
export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-[#1F2937] flex items-center justify-center mb-4">
        <span className="text-2xl">{icon}</span>
      </div>
      <h3 className="text-sm font-semibold text-[#F9FAFB] mb-1">{title}</h3>
      <p className="text-xs text-[#9CA3AF] max-w-xs">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
