
import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Check,
  Copy,
  LoaderCircle,
  CircleX,
  Clock3,
  Brain,
  ListChecks,
  Search,
  BookOpen,
  FileText,
  Code2,
  ShieldCheck,
  FlaskConical,
  CheckCheck,
  Database,
  Globe,
  Wrench,
  Sparkles,
} from "lucide-react";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }

  if (node && typeof node === "object" && "props" in node) {
    return textOf(
      (node as { props: { children?: ReactNode } }).props.children
    );
  }

  return "";
}

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      setDone(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyText}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-accent"
      aria-label={label}
    >
      {done ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {done ? "Copied!" : label}
    </button>
  );
}

export function CodeFrame({
  lang,
  code,
  children,
}: {
  lang?: string;
  code: string;
  children: ReactNode;
}) {
  return (
    <div className="my-4 overflow-hidden rounded-2xl border bg-code">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-xs text-muted-foreground">
          {lang || "text"}
        </span>
        <CopyButton text={code} label="Copy code" />
      </div>

      <pre className="m-0 overflow-x-auto p-4 font-mono text-sm leading-relaxed text-code-foreground">
        {children}
      </pre>
    </div>
  );
}

const STATUS = {
  ANALYZING: {
    label: "Menganalisis permintaan",
    Icon: Brain,
    color: "text-sky-600 dark:text-sky-400",
    surface: "border-sky-500/40 bg-sky-500/10",
  },
  PLANNING: {
    label: "Merancang langkah",
    Icon: ListChecks,
    color: "text-violet-600 dark:text-violet-400",
    surface: "border-violet-500/40 bg-violet-500/10",
  },
  SEARCHING: {
    label: "Mencari maklumat",
    Icon: Search,
    color: "text-cyan-600 dark:text-cyan-400",
    surface: "border-cyan-500/40 bg-cyan-500/10",
  },
  READING: {
    label: "Membaca dan memahami",
    Icon: BookOpen,
    color: "text-indigo-600 dark:text-indigo-400",
    surface: "border-indigo-500/40 bg-indigo-500/10",
  },
  WRITING: {
    label: "Menulis kandungan",
    Icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    surface: "border-blue-500/40 bg-blue-500/10",
  },
  CODING: {
    label: "Membangunkan kod",
    Icon: Code2,
    color: "text-blue-600 dark:text-blue-400",
    surface: "border-blue-500/40 bg-blue-500/10",
  },
  DATABASE: {
    label: "Mengurus pangkalan data",
    Icon: Database,
    color: "text-cyan-600 dark:text-cyan-400",
    surface: "border-cyan-500/40 bg-cyan-500/10",
  },
  CONNECTING: {
    label: "Menyambungkan perkhidmatan",
    Icon: Globe,
    color: "text-sky-600 dark:text-sky-400",
    surface: "border-sky-500/40 bg-sky-500/10",
  },
  FIXING: {
    label: "Membaiki masalah",
    Icon: Wrench,
    color: "text-orange-600 dark:text-orange-400",
    surface: "border-orange-500/40 bg-orange-500/10",
  },
  GENERATING: {
    label: "Menjana hasil",
    Icon: Sparkles,
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    surface: "border-fuchsia-500/40 bg-fuchsia-500/10",
  },
  REVIEWING: {
    label: "Menyemak hasil",
    Icon: ShieldCheck,
    color: "text-amber-600 dark:text-amber-300",
    surface: "border-amber-500/40 bg-amber-500/10",
  },
  TESTING: {
    label: "Menjalankan ujian",
    Icon: FlaskConical,
    color: "text-orange-600 dark:text-orange-400",
    surface: "border-orange-500/40 bg-orange-500/10",
  },
  IN_PROGRESS: {
    label: "Sedang berjalan",
    Icon: LoaderCircle,
    color: "text-amber-600 dark:text-amber-300",
    surface: "border-amber-500/40 bg-amber-500/10",
  },
  PENDING: {
    label: "Menunggu",
    Icon: Clock3,
    color: "text-muted-foreground",
    surface: "border-border/70 bg-muted/40",
  },
  DONE: {
    label: "Selesai",
    Icon: Check,
    color: "text-emerald-600 dark:text-emerald-400",
    surface: "border-emerald-500/40 bg-emerald-500/10",
  },
  COMPLETED: {
    label: "Semua langkah selesai",
    Icon: CheckCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    surface: "border-emerald-500/40 bg-emerald-500/10",
  },
  ERROR: {
    label: "Ralat",
    Icon: CircleX,
    color: "text-red-600 dark:text-red-400",
    surface: "border-red-500/40 bg-red-500/10",
  },
} as const;

type StatusType = keyof typeof STATUS;

function TaskStatus({
  status,
  children,
}: {
  status: StatusType;
  children: ReactNode;
}) {
  const item = STATUS[status];
  const Icon = item.Icon;

  return (
    <div
      className={`my-2 flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 shadow-sm transition-colors ${item.surface}`}
    >
      <Icon
        aria-label={item.label}
        className={`mt-0.5 h-4 w-4 shrink-0 ${item.color} ${
          status === "IN_PROGRESS" ? "animate-spin" : ""
        }`}
      />

      <div className="min-w-0 flex-1 break-words text-sm leading-6">
        {children}
      </div>
    </div>
  );
}

const STATUS_PATTERN =
  "ANALYZING|PLANNING|SEARCHING|READING|WRITING|CODING|DATABASE|CONNECTING|FIXING|GENERATING|REVIEWING|TESTING|IN_PROGRESS|PENDING|COMPLETED|DONE|ERROR";

function normalizeStatusLines(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const repeated = line.match(
        new RegExp(
          "^\\s*(?:[-*+]\\s*)?(" +
            STATUS_PATTERN +
            ")\\1\\s*(?:[-:—]\\s*|\\s+)(.+)$",
          "i"
        )
      );

      if (repeated) {
        return `- [${repeated[1].toUpperCase()}] ${repeated[2]}`;
      }

      const plain = line.match(
        new RegExp(
          "^\\s*(?:[-*+]\\s*)?(" +
            STATUS_PATTERN +
            ")\\s*[-:—]\\s*(.+)$",
          "i"
        )
      );

      if (plain) {
        return `- [${plain[1].toUpperCase()}] ${plain[2]}`;
      }

      return line;
    })
    .join("\n");
}

function StatusListItem({
  children,
}: {
  children?: ReactNode;
}) {
  const fullText = textOf(children);

  const match = new RegExp(
    "^\\s*\\[(" + STATUS_PATTERN + ")\\]\\s*",
    "i"
  ).exec(fullText);

  if (!match) {
    return <li className="my-1 pl-1">{children}</li>;
  }

  const status = match[1].toUpperCase() as StatusType;
  const cleaned = fullText.slice(match[0].length);

  return (
    <li className="my-1 list-none p-0">
      <TaskStatus status={status}>{cleaned}</TaskStatus>
    </li>
  );
}

export const Markdown = memo(function Markdown({
  content,
}: {
  content: string;
}) {
  const normalizedContent = normalizeStatusLines(content);

  return (
    <div className="zenn-prose min-w-0 break-words text-[15px] leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {children}
            </a>
          ),

          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-max border-collapse text-sm">
                {children}
              </table>
            </div>
          ),

          thead: ({ children }) => (
            <thead className="bg-muted/70">{children}</thead>
          ),

          th: ({ children }) => (
            <th className="border-b border-border/70 px-4 py-3 text-left font-semibold">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="border-b border-border/50 px-4 py-3 align-top">
              {children}
            </td>
          ),

          li: ({ children }) => (
            <StatusListItem>{children}</StatusListItem>
          ),

          input: ({ type, checked }) =>
            type === "checkbox" ? (
              <input
                type="checkbox"
                checked={Boolean(checked)}
                readOnly
                aria-label="Task status"
                className="mr-2 h-4 w-4 accent-emerald-500"
              />
            ) : null,

          pre: ({ children }) => {
            const child = Array.isArray(children)
              ? children[0]
              : children;

            const cls =
              (child as { props?: { className?: string } })?.props
                ?.className || "";

            const lang = /language-([\w-]+)/.exec(cls)?.[1];

            return (
              <CodeFrame
                lang={lang}
                code={textOf(children).replace(/\n$/, "")}
              >
                {children}
              </CodeFrame>
            );
          },

          code: ({ className, children, ...props }) => (
            <code
              className={
                className ||
                "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.88em]"
              }
              {...props}
            >
              {children}
            </code>
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});
