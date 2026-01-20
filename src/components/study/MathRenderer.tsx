import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

interface MathRendererProps {
  content: string;
  className?: string;
}

/**
 * Fallback: detect unwrapped LaTeX and add $ delimiters
 * Handles cases where AI extraction missed wrapping math expressions
 */
function ensureMathDelimiters(content: string): string {
  // Guard against undefined/null content
  if (!content) return '';
  
  // If already has delimiters, return as-is
  if (content.includes('$') || content.includes('\\(') || content.includes('\\[')) {
    return content;
  }
  
  // Check if content looks like pure LaTeX (starts with common LaTeX commands)
  const latexPatterns = [
    /^\\frac\b/,
    /^\\int\b/,
    /^\\sqrt\b/,
    /^\\sum\b/,
    /^\\prod\b/,
    /^\\lim\b/,
    /^\\infty\b/,
    /^\\pi\b/,
    /^\\[a-zA-Z]+\{/, // Generic \command{
  ];
  
  const trimmed = content.trim();
  const looksLikePureMath = latexPatterns.some(pattern => pattern.test(trimmed));
  
  if (looksLikePureMath) {
    return `$${content}$`;
  }
  
  return content;
}

export function MathRenderer({ content, className }: MathRendererProps) {
  const processedContent = ensureMathDelimiters(content);
  
  return (
    <div className={cn("math-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3">{children}</ol>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3">{children}</ul>,
          li: ({ children }) => <li className="ml-2">{children}</li>,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
