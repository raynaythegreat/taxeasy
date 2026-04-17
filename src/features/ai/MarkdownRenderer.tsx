import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm prose-gray dark:prose-invert max-w-none [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:text-sm [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:dark:border-neutral-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_hr]:border-gray-200 [&_hr]:dark:border-neutral-700 [&_img]:rounded-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code
                  className="block bg-gray-900 text-green-300 rounded-md p-4 overflow-auto text-xs font-mono leading-relaxed"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <div className="not-prose my-2">{children}</div>;
          },
          table({ children }) {
            return (
              <div className="not-prose my-2 overflow-auto">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-50 dark:bg-neutral-800">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="border border-gray-200 dark:border-neutral-700 px-3 py-1.5 text-left text-xs font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-gray-200 dark:border-neutral-700 px-3 py-1.5 text-xs">
                {children}
              </td>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {children}
              </a>
            );
          },
          input({ checked, ...props }) {
            if (props.type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-1.5 rounded border-gray-300 dark:border-neutral-600"
                  {...props}
                />
              );
            }
            return <input {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
