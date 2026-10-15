import { cn } from "@/lib/utils";

/** ZennAI mark: an open ensō-like arc with a centered node. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-6 w-6", className)} fill="none">
      <path
        d="M26 11.5A11 11 0 1 0 27 16"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3.2" className="fill-brand" />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      {showText && (
        <span className="text-[1.05rem]">
          Zenn<span className="text-brand">AI</span>
        </span>
      )}
    </span>
  );
}
