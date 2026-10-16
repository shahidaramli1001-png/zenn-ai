import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Loader2,
} from "lucide-react";

type MessageStatus =
  | "complete"
  | "incomplete"
  | "error"
  | "streaming";

type Props = {
  requestText: string;
  content: string;
  status: MessageStatus;
};

function isCodingRequest(text: string) {
  return /\b(code|coding|program|programming|build|create|develop|website|application|project|html|css|javascript|typescript|python|react|api|backend|database|script|kod|bina|buat|bangunkan|aplikasi|projek|skrip)\b/i.test(
    text,
  ) || /laman web|baiki kod|bina aplikasi/i.test(text);
}

function hasGeneratedCode(text: string) {
  const fence = String.fromCharCode(96).repeat(3);

  return (
    text.includes(fence) ||
    /(?:^|\n)\s*(?:import\s+|export\s+(?:default|const|function|class|type|interface)\b|const\s+\w+\s*=|function\s+\w+\s*\(|<!doctype\s+html|<html[\s>]|<script[\s>]|<style[\s>]|def\s+\w+\s*\()/i.test(
      text,
    )
  );
}

export function AutoCodeStatus({
  requestText,
  content,
  status,
}: Props) {
  if (!isCodingRequest(requestText)) return null;
  if (!hasGeneratedCode(content)) return null;

  const generating = status === "streaming";
  const completed = status === "complete";
  const failed = status === "error" || status === "incomplete";

  const label = generating
    ? "Membangunkan kod"
    : completed
      ? "Kod selesai dijana"
      : "Penjanaan kod terhenti";

  const description = generating
    ? "Menerima kod daripada AI secara langsung."
    : completed
      ? "Kod telah diterima sepenuhnya. Kod belum semestinya dijalankan atau diuji."
      : "Respons kod tidak selesai sepenuhnya.";

  return (
    <div
      role="status"
      className={`mb-3 flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-sm ${
        generating
          ? "border-blue-500/40 bg-blue-500/5"
          : completed
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-orange-500/40 bg-orange-500/5"
      }`}
    >
      {generating ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-500" />
      ) : completed ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
      )}

      <div className="min-w-0 flex-1">
        <div
          className={`text-xs font-semibold ${
            generating
              ? "text-blue-600 dark:text-blue-400"
              : completed
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-orange-600 dark:text-orange-400"
          }`}
        >
          {label}
        </div>

        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>

      <span className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 font-mono text-[10px]">
        <Code2 className="h-3 w-3" />
        {generating
          ? "CODING"
          : completed
            ? "COMPLETED"
            : failed
              ? "INCOMPLETE"
              : "STATUS"}
      </span>
    </div>
  );
}
