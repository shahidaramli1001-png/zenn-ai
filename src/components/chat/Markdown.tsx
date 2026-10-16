
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
  DONE: {
    label: "Selesai",
    Icon: Check,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  IN_PROGRESS: {
    label: "Sedang berjalan",
    Icon: LoaderCircle,
    color: "text-amber-600 dark:text-amber-400",
  },
  ERROR: {
    label: "Ralat",
    Icon: CircleX,
    color: "text-red-600 dark:text-red-400",
  },
  PENDING: {
    label: "Menunggu",
    Icon: Clock3,
    color: "text-muted-foreground",
  },
} as const;

function TaskStatus({
  status,
  children,
}: {
  status: keyof typeof STATUS;
  children: ReactNode;
}) {
  const item = STATUS[status];
  const Icon = item.Icon;

  return (
    <span className="inline-flex max-w-full items-start gap-2 align-baseline">
      <Icon
        aria-label={item.label}
        className={`mt-1 h-4 w-4 shrink-0 ${item.color} ${
          status === "IN_PROGRESS" ? "animate-spin" : ""
        }`}
      />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/**
 * Normalize common status formats produced by the AI.
 * Examples:
 * DONEDONE - Database connected
 * ERRORERROR - API request failed
 * DONE - Database connected
 */
function normalizeStatusLines(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const repeated = line.match(
        /^\s*(?:[-*+]\s*)?(DONE|IN_PROGRESS|ERROR|PENDING)\1\s*(?:[-:—]\s*|\s+)(.+)$/i
      );

      if (repeated) {
        return `- [${repeated[1].toUpperCase()}] ${repeated[2]}`;
      }

      const plain = line.match(
        /^\s*(?:[-*+]\s*)?(DONE|IN_PROGRESS|ERROR|PENDING)\s*[-:—]\s*(.+)$/i
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

  const match = /^\s*\[(DONE|IN_PROGRESS|ERROR|PENDING)\]\s*/i.exec(
    fullText
  );

  if (!match) {
    return <li className="my-1 pl-1">{children}</li>;
  }

  const status = match[1].toUpperCase() as keyof typeof STATUS;
  const cleaned = fullText.slice(match[0].length);

  return (
    <li className="my-1 list-none pl-0">
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
