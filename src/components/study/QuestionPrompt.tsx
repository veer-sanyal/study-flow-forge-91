import { MathRenderer } from "./MathRenderer";
import { Badge } from "@/components/ui/badge";

interface QuestionPromptProps {
  prompt: string;
  topicName: string;
  questionType: string;
  difficulty: number;
  questionNumber: number;
  totalQuestions: number;
}

export function QuestionPrompt({
  prompt,
  topicName,
  questionType,
  difficulty,
  questionNumber,
  totalQuestions,
}: QuestionPromptProps) {
  return (
    <div className="space-y-4">
      {/* Meta info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {topicName}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {questionType}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {questionNumber} / {totalQuestions}
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

      {/* Question prompt */}
      <div className="text-lg leading-relaxed">
        <MathRenderer content={prompt} />
      </div>
    </div>
  );
}
