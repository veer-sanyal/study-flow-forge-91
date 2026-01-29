import { MathRenderer } from "./MathRenderer";
import { QuestionImage } from "./QuestionImage";
import { BookOpen } from "lucide-react";

interface ParentContextCardProps {
  prompt: string;
  imageUrl?: string | null;
}

export function ParentContextCard({ prompt, imageUrl }: ParentContextCardProps) {
  return (
    <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">Question Context</span>
      </div>
      
      {/* Parent prompt */}
      <div className="text-sm leading-relaxed">
        <MathRenderer content={prompt} />
      </div>
      
      {/* Parent image if present */}
      {imageUrl && (
        <QuestionImage src={imageUrl} alt="Question context diagram" />
      )}
    </div>
  );
}
