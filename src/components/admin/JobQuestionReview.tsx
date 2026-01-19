import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Check, 
  Loader2,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface QuestionChoice {
  id: string;
  text: string;
  isCorrect?: boolean;
}

interface Question {
  id: string;
  prompt: string;
  choices: QuestionChoice[] | null;
  correct_answer: string | null;
  needs_review: boolean;
  guide_me_steps: unknown | null;
  question_order: number | null;
  difficulty: number | null;
  hint: string | null;
  topic_ids: string[];
  question_type_id: string | null;
}

interface JobQuestionReviewProps {
  jobId: string;
  sourceExam: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function useQuestionsForJob(sourceExam: string | null) {
  return useQuery({
    queryKey: ["questions-for-job", sourceExam],
    queryFn: async () => {
      if (!sourceExam) return [];
      const { data, error } = await supabase
        .from("questions")
        .select("id, prompt, choices, correct_answer, needs_review, guide_me_steps, question_order, difficulty, hint, topic_ids, question_type_id")
        .eq("source_exam", sourceExam)
        .order("question_order", { ascending: true });

      if (error) throw error;
      return data as unknown as Question[];
    },
    enabled: !!sourceExam,
  });
}

function useAnalyzeQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (questionId: string) => {
      const { data, error } = await supabase.functions.invoke("analyze-question", {
        body: { questionId },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["questions-for-job"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
      toast.success(`Analysis complete! Answer: ${data.correctAnswer}`);
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });
}

function useApproveQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (questionId: string) => {
      const { error } = await supabase
        .from("questions")
        .update({ needs_review: false })
        .eq("id", questionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions-for-job"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
      toast.success("Question approved!");
    },
  });
}

function QuestionCard({ question, onAnalyze, onApprove, isAnalyzing }: {
  question: Question;
  onAnalyze: () => void;
  onApprove: () => void;
  isAnalyzing: boolean;
}) {
  const needsAnalysis = !question.correct_answer || !question.guide_me_steps;
  const isAnalyzed = question.correct_answer && question.guide_me_steps;
  const isApproved = !question.needs_review && isAnalyzed;

  // Truncate prompt for display
  const displayPrompt = question.prompt.length > 150 
    ? question.prompt.slice(0, 150) + "..." 
    : question.prompt;

  return (
    <div className={cn(
      "p-3 rounded-lg border transition-colors",
      isApproved ? "bg-green-500/5 border-green-500/20" : 
      isAnalyzed ? "bg-blue-500/5 border-blue-500/20" : 
      "bg-muted/30 border-border"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
          {question.question_order || "?"}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground line-clamp-2">{displayPrompt}</p>
          
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {isApproved && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approved
              </Badge>
            )}
            {isAnalyzed && !isApproved && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-xs">
                <Check className="h-3 w-3 mr-1" />
                Analyzed
              </Badge>
            )}
            {needsAnalysis && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Needs Analysis
              </Badge>
            )}
            {question.correct_answer && (
              <Badge variant="outline" className="text-xs">
                Answer: {question.correct_answer.toUpperCase()}
              </Badge>
            )}
            {question.difficulty && (
              <Badge variant="outline" className="text-xs">
                Difficulty: {question.difficulty}/5
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {needsAnalysis && (
            <Button
              size="sm"
              variant="default"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="h-8"
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Analyze</span>
            </Button>
          )}
          {isAnalyzed && !isApproved && (
            <Button
              size="sm"
              variant="outline"
              onClick={onApprove}
              className="h-8"
            >
              <Check className="h-3.5 w-3.5" />
              <span className="ml-1.5">Approve</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function JobQuestionReview({ jobId, sourceExam, isExpanded, onToggle }: JobQuestionReviewProps) {
  const { data: questions, isLoading } = useQuestionsForJob(isExpanded ? sourceExam : null);
  const analyzeQuestion = useAnalyzeQuestion();
  const approveQuestion = useApproveQuestion();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const handleAnalyze = async (questionId: string) => {
    setAnalyzingId(questionId);
    try {
      await analyzeQuestion.mutateAsync(questionId);
    } finally {
      setAnalyzingId(null);
    }
  };

  const needsAnalysisCount = questions?.filter(q => !q.correct_answer || !q.guide_me_steps).length || 0;
  const analyzedCount = questions?.filter(q => q.correct_answer && q.guide_me_steps).length || 0;
  const approvedCount = questions?.filter(q => !q.needs_review && q.correct_answer && q.guide_me_steps).length || 0;

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="w-full justify-between h-8 text-sm hover:bg-muted/50"
      >
        <span className="text-muted-foreground">
          {isExpanded ? "Hide Questions" : "Review Questions"}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
                <span>{questions?.length || 0} total</span>
                <span className="text-amber-600">{needsAnalysisCount} need analysis</span>
                <span className="text-blue-600">{analyzedCount - approvedCount} ready to approve</span>
                <span className="text-green-600">{approvedCount} approved</span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !questions?.length ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No questions found for this job
                </div>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-2 pr-2">
                    {questions.map((question) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        onAnalyze={() => handleAnalyze(question.id)}
                        onApprove={() => approveQuestion.mutate(question.id)}
                        isAnalyzing={analyzingId === question.id}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}