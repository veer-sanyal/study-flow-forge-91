import { MathRenderer } from "./MathRenderer";
import { QuestionImage } from "./QuestionImage";
import { Badge } from "@/components/ui/badge";

interface QuestionPromptProps {
  prompt: string;
  topicName: string;
  questionType: string;
  difficulty: number;
  questionNumber: number;
  totalQuestions?: number; // Optional for infinite mode
  imageUrl?: string | null;
  sourceExam?: string | null;
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
}: QuestionPromptProps) {
  return (
    <div className="space-y-5">
      {/* Meta info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {sourceExam && (
            <Badge variant="default" className="text-xs">
              {sourceExam}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {topicName}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {questionType}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground shrink-0 ml-2">
          {totalQuestions ? `${questionNumber} / ${totalQuestions}` : `#${questionNumber}`}
        </span>
      </div>

      {/* Difficulty indicator */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={`h-1.5 w-4 rounded-full ${
              level <= difficulty ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          Difficulty {difficulty}/5
        </span>
      </div>

      {/* Question prompt - more prominent with visual separation */}
      <div className="p-5 rounded-lg border-2 border-primary/20 bg-card shadow-sm">
        <div className="text-lg leading-relaxed font-medium">
          <MathRenderer content={prompt} />
        </div>
      </div>

      {/* Question image */}
      {imageUrl && (
        <QuestionImage src={imageUrl} alt="Question diagram" />
      )}

      {/* Visual separator between question and choices */}
      <div className="h-px bg-border" />
    </div>
  );
}
