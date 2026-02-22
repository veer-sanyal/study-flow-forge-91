import { MathRenderer } from "./MathRenderer";
import { QuestionImage } from "./QuestionImage";
import { cn } from "@/lib/utils";

interface QuestionPromptProps {
  prompt: string;
  topicName: string;
  questionType: string;
  difficulty: number;
  questionNumber: number;
  totalQuestions?: number; // Optional for infinite mode
  imageUrl?: string | null;
  sourceExam?: string | null;
  courseName?: string | null;
}

export function QuestionPrompt({
  prompt,
  topicName,
  questionType,
  difficulty,
  questionNumber,
  totalQuestions,
  imageUrl,
  sourceExam,
  courseName,
}: QuestionPromptProps) {
  return (
    <div className="space-y-5">
      {/* Meta info — compact single line */}
      <div className="flex items-center justify-between">
        <span className="text-meta text-muted-foreground">
          {[sourceExam, topicName].filter(Boolean).join(' · ')}
        </span>
        <span className="text-meta text-muted-foreground shrink-0 ml-2">
          {totalQuestions ? `${questionNumber} / ${totalQuestions}` : `#${questionNumber}`}
        </span>
      </div>

      {/* Question prompt card — standard anatomy, difficulty dots top-right */}
      <div className="relative p-5 rounded-lg border border-border shadow-surface bg-surface">
        {/* Difficulty dots — top-right corner */}
        <div className="absolute top-3 right-3 flex gap-0.5">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={cn(
                "w-1 h-1 rounded-full",
                level <= difficulty ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        <div className="text-lg leading-relaxed font-medium">
          <MathRenderer content={prompt} />
        </div>
      </div>

      {/* Question image */}
      {imageUrl && (
        <QuestionImage src={imageUrl} alt="Question diagram" />
      )}
    </div>
  );
}
