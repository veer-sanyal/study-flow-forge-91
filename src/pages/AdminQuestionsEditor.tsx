import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
  Edit2,
  Trash2,
  Save,
  Loader2,
  Wand2,
  Upload,
  Globe,
  Lightbulb,
  MessageSquare,
  BookOpen,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { MathRenderer } from "@/components/study/MathRenderer";
import { QuestionImage } from "@/components/study/QuestionImage";
import { useAllTopics, useUploadQuestionImage, useRemoveQuestionImage } from "@/hooks/use-questions";
import { useUploadChoiceImage } from "@/hooks/use-choice-image";
import { usePublishExam } from "@/hooks/use-ingestion";
import { useAnalysisProgress } from "@/hooks/use-analysis-progress";
import { parseExamName } from "@/lib/examUtils";
import type { Json } from "@/integrations/supabase/types";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { ChoiceImage } from "@/components/study/ChoiceImage";

interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  imageUrl?: string;
}

interface Question {
  id: string;
  prompt: string;
  choices: QuestionChoice[] | null;
  correct_answer: string | null;
  difficulty: number | null;
  hint: string | null;
  solution_steps: string[] | null;
  guide_me_steps: Json | null;
  topic_ids: string[];
  unmapped_topic_suggestions: string[] | null;
  needs_review: boolean;
  question_order: number | null;
  image_url: string | null;
  question_type_id: string | null;
  source_exam: string | null;
  midterm_number: number | null;
  question_types?: { id: string; name: string } | null;
  answer_key_answer?: string | null;
  answer_mismatch?: boolean;
}

// Hooks
function useCoursePack(courseId: string) {
  return useQuery({
    queryKey: ["course-pack", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_packs")
        .select("id, title")
        .eq("id", courseId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });
}

function useQuestionsForExam(courseId: string, sourceExam: string) {
  return useQuery({
    queryKey: ["questions-for-exam", courseId, sourceExam],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, question_types(id, name)")
        .eq("course_pack_id", courseId)
        .eq("source_exam", sourceExam)
        .order("question_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      
      return data.map((q) => ({
        ...q,
        choices: Array.isArray(q.choices) 
          ? (q.choices as unknown as QuestionChoice[]) 
          : null,
        solution_steps: Array.isArray(q.solution_steps)
          ? (q.solution_steps as string[])
          : null,
      })) as Question[];
    },
    enabled: !!courseId && !!sourceExam,
  });
}

function useIngestionJobForExam(courseId: string, sourceExam: string) {
  return useQuery({
    queryKey: ["ingestion-job-for-exam", courseId, sourceExam],
    queryFn: async () => {
      // Try to find an ingestion job that matches this exam
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("id, is_published, exam_year, exam_semester, exam_type")
        .eq("course_pack_id", courseId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Find job that matches this source_exam
      const matchingJob = data?.find(job => {
        const parts: string[] = [];
        if (job.exam_semester && job.exam_year) {
          parts.push(`${job.exam_semester} ${job.exam_year}`);
        }
        if (job.exam_type) {
          const typeMap: Record<string, string> = { "1": "Midterm 1", "2": "Midterm 2", "3": "Midterm 3", "f": "Final" };
          parts.push(typeMap[job.exam_type] || job.exam_type);
        }
        return parts.join(" ") === sourceExam;
      });
      
      return matchingJob || null;
    },
    enabled: !!courseId && !!sourceExam,
  });
}

// Create ingestion job for legacy exams (exams created without PDF ingestion)
function useCreateLegacyIngestionJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      coursePackId, 
      sourceExam 
    }: { 
      coursePackId: string; 
      sourceExam: string;
    }) => {
      // Parse the exam name to extract metadata
      const parsed = parseExamName(sourceExam);
      
      // Map exam type to storage format
      let examType: string | null = null;
      if (parsed.examType === "Midterm" && parsed.midtermNumber) {
        examType = parsed.midtermNumber.toString();
      } else if (parsed.examType === "Final") {
        examType = "f";
      }
      
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .insert({
          course_pack_id: coursePackId,
          file_name: `${sourceExam} (legacy)`,
          file_path: "legacy",
          kind: "pdf",
          status: "completed",
          is_published: true,
          exam_year: parsed.year,
          exam_semester: parsed.semester,
          exam_type: examType,
          is_final: parsed.examType === "Final",
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingestion-job-for-exam"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
    },
  });
}

function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase
        .from("questions")
        .update(updates as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
      toast.success("Question updated");
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

function useDeleteQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
      queryClient.invalidateQueries({ queryKey: ["exams-for-course"] });
      toast.success("Question deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
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
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
      toast.success(`Analysis complete! Answer: ${data.correctAnswer}`);
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });
}

// Guide Me Step Card
function GuideMeStepCard({ 
  step, 
  stepIndex 
}: { 
  step: {
    stepNumber?: number;
    prompt?: string;
    choices?: Array<{ id: string; text: string; isCorrect: boolean }>;
    hints?: Array<{ tier: number; text: string }>;
    explanation?: string;
    keyTakeaway?: string;
  };
  stepIndex: number;
}) {
  const [revealedHints, setRevealedHints] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showKeyTakeaway, setShowKeyTakeaway] = useState(false);
  
  const totalHints = step.hints?.length || 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-primary/10 border-b flex items-center gap-2">
        <Badge variant="default" className="text-xs">Step {step.stepNumber || stepIndex + 1}</Badge>
      </div>
      
      <div className="p-4 border-b bg-card">
        <div className="prose prose-sm dark:prose-invert">
          <MathRenderer content={step.prompt || ''} />
        </div>
      </div>
      
      {step.choices && step.choices.length > 0 && (
        <div className="p-4 border-b bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground mb-2">Choices</div>
          <div className="space-y-1.5">
            {step.choices.map((choice) => (
              <div 
                key={choice.id} 
                className={`flex items-center gap-2 text-sm p-2 rounded ${
                  choice.isCorrect 
                    ? 'bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30' 
                    : 'bg-background text-muted-foreground border border-transparent'
                }`}
              >
                <span className="font-medium w-6">{choice.id.toUpperCase()}.</span>
                <MathRenderer content={choice.text} />
                {choice.isCorrect && <Check className="h-3 w-3 ml-auto flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {totalHints > 0 && (
        <div className="p-4 border-b bg-blue-500/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                Hints {revealedHints > 0 && `(${revealedHints}/${totalHints})`}
              </span>
            </div>
            {revealedHints < totalHints && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                onClick={() => setRevealedHints(prev => prev + 1)}
              >
                <Eye className="h-3 w-3" />
                Show Hint ({revealedHints + 1}/{totalHints})
              </Button>
            )}
          </div>
          {revealedHints > 0 && (
            <div className="space-y-2">
              {step.hints?.slice(0, revealedHints).map((hint, idx) => (
                <div key={idx} className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400 mb-1">
                    Tier {hint.tier}
                  </Badge>
                  <div className="text-sm prose prose-sm dark:prose-invert">
                    <MathRenderer content={hint.text} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {step.explanation && (
        <div className="p-4 border-b bg-amber-500/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Explanation</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
              onClick={() => setShowExplanation(!showExplanation)}
            >
              {showExplanation ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showExplanation ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showExplanation && (
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-sm prose prose-sm dark:prose-invert">
              <MathRenderer content={step.explanation} />
            </div>
          )}
        </div>
      )}
      
      {step.keyTakeaway && (
        <div className="p-4 bg-green-500/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-green-700 dark:text-green-400">Key Takeaway</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs gap-1 border-green-500/30 text-green-600 hover:bg-green-500/10"
              onClick={() => setShowKeyTakeaway(!showKeyTakeaway)}
            >
              {showKeyTakeaway ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showKeyTakeaway ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showKeyTakeaway && (
            <div className="p-3 rounded bg-green-500/10 border border-green-500/20 text-sm prose prose-sm dark:prose-invert">
              <MathRenderer content={step.keyTakeaway} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Question Card Component
function QuestionCard({
  question,
  index,
  topics,
  onEdit,
  onDelete,
  onAnalyze,
  onUploadImage,
  onRemoveImage,
  isAnalyzing,
}: { 
  question: Question;
  index: number;
  topics: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
  isAnalyzing: boolean;
}) {
  const getGuideSteps = (guideMeSteps: Json | null): Array<unknown> => {
    if (!guideMeSteps) return [];
    if (Array.isArray(guideMeSteps)) return guideMeSteps;
    if (typeof guideMeSteps === 'object' && 'steps' in guideMeSteps && Array.isArray((guideMeSteps as { steps: unknown[] }).steps)) {
      return (guideMeSteps as { steps: unknown[] }).steps;
    }
    return [];
  };
  
  const guideSteps = getGuideSteps(question.guide_me_steps);
  const hasGuideMe = guideSteps.length > 0;
  const needsAnalysis = !question.correct_answer || !hasGuideMe;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUploadImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Get guide data for preview
  const getGuideData = (guideMeSteps: Json | null) => {
    if (!guideMeSteps) return { steps: [], methodSummary: null };
    if (Array.isArray(guideMeSteps)) return { steps: guideMeSteps, methodSummary: null };
    if (typeof guideMeSteps === 'object') {
      const data = guideMeSteps as { 
        steps?: unknown[]; 
        methodSummary?: { bullets?: string[]; proTip?: string };
      };
      return { 
        steps: data.steps || [], 
        methodSummary: data.methodSummary || null,
      };
    }
    return { steps: [], methodSummary: null };
  };

  const guideData = getGuideData(question.guide_me_steps);

  return (
    <motion.div variants={staggerItem}>
      <Card 
        className={`relative transition-all ${
          isDragging 
            ? 'border-primary border-2 bg-primary/5' 
            : needsAnalysis 
              ? 'border-amber-500/50 bg-amber-500/5' 
              : 'border-green-500/30 bg-green-500/5'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 z-10 rounded-lg pointer-events-none">
            <div className="text-primary font-medium flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Drop image here
            </div>
          </div>
        )}
        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-lg">
                {question.question_order || index + 1}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {question.question_types?.name && (
                  <Badge variant="secondary">{question.question_types.name}</Badge>
                )}
                {question.midterm_number && (
                  <Badge variant="outline" className="gap-1">
                    Midterm {question.midterm_number}
                  </Badge>
                )}
                {question.difficulty && (
                  <Badge variant="outline">Difficulty: {question.difficulty}/5</Badge>
                )}
                {question.image_url && (
                  <Badge variant="outline" className="gap-1">
                    <ImageIcon className="h-3 w-3" />
                    Has Image
                  </Badge>
                )}
                {question.answer_mismatch && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Answer Mismatch
                  </Badge>
                )}
                {needsAnalysis && !question.answer_mismatch && (
                  <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3 w-3" />
                    Needs Analysis
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button 
                variant={needsAnalysis ? "default" : "outline"} 
                size="sm" 
                className="gap-1"
                onClick={onAnalyze}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {isAnalyzing ? "Analyzing..." : needsAnalysis ? "Analyze" : "Re-analyze"}
              </Button>
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Question Prompt */}
          <div className="prose prose-sm dark:prose-invert max-w-none text-base">
            <MathRenderer content={question.prompt} />
          </div>

          {/* Image */}
          {question.image_url && (
            <div className="relative group max-w-sm mx-auto">
              <QuestionImage 
                src={question.image_url} 
                alt="Question diagram"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={onRemoveImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Choices */}
          {question.choices && question.choices.length > 0 && (
            <div className="grid gap-2">
              {question.choices.map((choice) => (
                <div
                  key={choice.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border ${
                    choice.isCorrect 
                      ? 'bg-green-500/10 border-green-500/50' 
                      : 'bg-muted/30 border-border'
                  }`}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium flex-shrink-0 ${
                    choice.isCorrect
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {choice.isCorrect ? <Check className="h-4 w-4" /> : choice.id.toUpperCase()}
                  </div>
                  <div className="flex-1 pt-1">
                    {choice.text && <MathRenderer content={choice.text} />}
                    {choice.imageUrl && (
                      <div className="mt-2">
                        <ChoiceImage src={choice.imageUrl} alt={`Choice ${choice.id}`} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Answer Mismatch Warning */}
          {question.answer_mismatch && question.answer_key_answer && (
            <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="font-medium text-destructive">Answer Mismatch</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">AI Answer:</span>
                  <span className="ml-2 font-medium">{question.correct_answer?.toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Answer Key:</span>
                  <span className="ml-2 font-medium">{question.answer_key_answer.toUpperCase()}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Please review the question and determine the correct answer.
              </p>
            </div>
          )}

          {/* Topics */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            <span className="text-sm text-muted-foreground">Topics:</span>
            {question.topic_ids && question.topic_ids.length > 0 ? (
              question.topic_ids.map((topicId) => (
                <Badge key={topicId} variant="outline" className="text-xs">
                  {topics.get(topicId) || topicId}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground italic">No topics mapped</span>
            )}
          </div>

          {/* Solution Preview */}
          {question.solution_steps && question.solution_steps.length > 0 && (
            <details className="pt-2 border-t">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground font-medium">
                View Solution
              </summary>
              <div className="mt-3 p-4 rounded-lg bg-muted/50 prose prose-sm dark:prose-invert max-w-none">
                <MathRenderer content={question.solution_steps.join('\n\n')} />
              </div>
            </details>
          )}

          {/* Guide Me Preview */}
          {guideData.steps.length > 0 && (
            <details className="pt-2 border-t">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground font-medium flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                View Guide Me ({guideData.steps.length} steps)
              </summary>
              <div className="mt-3 space-y-4">
                {(guideData.steps as Array<{
                  stepNumber?: number;
                  prompt?: string;
                  choices?: Array<{ id: string; text: string; isCorrect: boolean }>;
                  hints?: Array<{ tier: number; text: string }>;
                  explanation?: string;
                  keyTakeaway?: string;
                }>).map((step, idx) => (
                  <GuideMeStepCard key={idx} step={step} stepIndex={idx} />
                ))}
                
                {guideData.methodSummary?.bullets && guideData.methodSummary.bullets.length > 0 && (
                  <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Method Summary</span>
                    </div>
                    <ul className="space-y-2 pl-4">
                      {guideData.methodSummary.bullets.map((bullet, idx) => (
                        <li key={idx} className="text-sm list-disc prose prose-sm dark:prose-invert">
                          <MathRenderer content={bullet} />
                        </li>
                      ))}
                    </ul>
                    {guideData.methodSummary.proTip && (
                      <div className="mt-3 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Lightbulb className="h-4 w-4 text-amber-600" />
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Pro Tip</span>
                        </div>
                        <div className="text-sm prose prose-sm dark:prose-invert">
                          <MathRenderer content={guideData.methodSummary.proTip} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Edit Question Dialog
function EditQuestionDialog({
  question,
  open,
  onOpenChange,
  onSave,
  topics,
  onUploadImage,
  onRemoveImage,
  onUploadChoiceImage,
}: {
  question: Question | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<Question>) => void;
  topics: { id: string; title: string }[];
  onUploadImage: (file: File) => Promise<string | undefined>;
  onRemoveImage: () => Promise<void>;
  onUploadChoiceImage: (choiceId: string, file: File) => Promise<string>;
}) {
  const [editedQuestion, setEditedQuestion] = useState<Partial<Question>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingChoiceId, setUploadingChoiceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const choiceFileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useMemo(() => {
    if (question) {
      setEditedQuestion({
        prompt: question.prompt,
        choices: question.choices,
        difficulty: question.difficulty,
        topic_ids: question.topic_ids,
        question_order: question.question_order,
        image_url: question.image_url,
      });
    }
  }, [question]);

  const handleSave = () => {
    onSave(editedQuestion);
    onOpenChange(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setIsUploading(true);
      try {
        const newUrl = await onUploadImage(file);
        if (newUrl) {
          setEditedQuestion(prev => ({ ...prev, image_url: newUrl }));
        }
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const newUrl = await onUploadImage(file);
        if (newUrl) {
          setEditedQuestion(prev => ({ ...prev, image_url: newUrl }));
        }
      } finally {
        setIsUploading(false);
      }
    }
  };

  if (!question) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Question #{question.question_order || 1}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto pr-4">
          <div className="space-y-4 py-4">
            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Question Image</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
                  isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <div className="text-sm font-medium">Uploading...</div>
                  </div>
                ) : editedQuestion.image_url ? (
                  <div className="space-y-3">
                    <div className="relative group">
                      <QuestionImage 
                        src={editedQuestion.image_url} 
                        alt="Question diagram"
                        className="max-w-sm mx-auto"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveImage();
                          setEditedQuestion(prev => ({ ...prev, image_url: null }));
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <div className="text-center text-sm text-muted-foreground">
                      Click or drag to replace image
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                    <Upload className="h-8 w-8" />
                    <div className="text-sm font-medium">Drag & drop an image here</div>
                    <div className="text-xs">or click to select a file</div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Prompt */}
            <div className="space-y-2">
              <Label>Question Prompt</Label>
              <Textarea
                value={editedQuestion.prompt || ""}
                onChange={(e) => setEditedQuestion({ ...editedQuestion, prompt: e.target.value })}
                rows={4}
                className="font-mono text-sm"
              />
              <div className="p-3 rounded border bg-muted/30 prose prose-sm dark:prose-invert">
                <MathRenderer content={editedQuestion.prompt || ""} />
              </div>
            </div>

            {/* Choices */}
            <div className="space-y-2">
              <Label>Choices</Label>
              {editedQuestion.choices?.map((choice, idx) => (
                <div key={choice.id} className="space-y-2 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
                      choice.isCorrect ? 'bg-success text-success-foreground' : 'bg-muted'
                    }`}>
                      {choice.id.toUpperCase()}
                    </div>
                    <Input
                      value={choice.text}
                      onChange={(e) => {
                        const newChoices = [...(editedQuestion.choices || [])];
                        newChoices[idx] = { ...newChoices[idx], text: e.target.value };
                        setEditedQuestion({ ...editedQuestion, choices: newChoices });
                      }}
                      placeholder="Choice text (or leave empty if using image)"
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant={choice.isCorrect ? "default" : "outline"}
                      size="sm"
                      className={choice.isCorrect ? "bg-success hover:bg-success/90" : ""}
                      onClick={() => {
                        const newChoices = editedQuestion.choices?.map((c, i) => ({
                          ...c,
                          isCorrect: i === idx,
                        }));
                        setEditedQuestion({ ...editedQuestion, choices: newChoices });
                      }}
                    >
                      {choice.isCorrect ? <Check className="h-4 w-4" /> : "Set Correct"}
                    </Button>
                  </div>
                  
                  {/* Choice Image Section */}
                  <div className="ml-10 flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => {
                        if (el) choiceFileInputRefs.current.set(choice.id, el);
                      }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadingChoiceId(choice.id);
                          try {
                            const imageUrl = await onUploadChoiceImage(choice.id, file);
                            const newChoices = [...(editedQuestion.choices || [])];
                            newChoices[idx] = { ...newChoices[idx], imageUrl };
                            setEditedQuestion({ ...editedQuestion, choices: newChoices });
                            toast.success("Choice image uploaded");
                          } catch (err) {
                            toast.error("Failed to upload image");
                          } finally {
                            setUploadingChoiceId(null);
                          }
                        }
                      }}
                    />
                    
                    {choice.imageUrl ? (
                      <div className="flex items-center gap-2">
                        <div className="border rounded p-1 bg-background">
                          <ChoiceImage src={choice.imageUrl} className="max-h-12" />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            const newChoices = [...(editedQuestion.choices || [])];
                            newChoices[idx] = { ...newChoices[idx], imageUrl: undefined };
                            setEditedQuestion({ ...editedQuestion, choices: newChoices });
                          }}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={uploadingChoiceId === choice.id}
                        onClick={() => choiceFileInputRefs.current.get(choice.id)?.click()}
                      >
                        {uploadingChoiceId === choice.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-3 w-3" />
                            Add Image
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label>Difficulty (1-5)</Label>
              <Select
                value={editedQuestion.difficulty?.toString() || "3"}
                onValueChange={(val) => setEditedQuestion({ ...editedQuestion, difficulty: parseInt(val) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <SelectItem key={d} value={d.toString()}>
                      {d} - {d === 1 ? "Easy" : d === 2 ? "Moderate" : d === 3 ? "Medium" : d === 4 ? "Hard" : "Very Hard"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Question Order */}
            <div className="space-y-2">
              <Label>Question Order</Label>
              <Input
                type="number"
                min={1}
                value={editedQuestion.question_order || 1}
                onChange={(e) => setEditedQuestion({ ...editedQuestion, question_order: parseInt(e.target.value) })}
              />
            </div>

            {/* Topics */}
            <div className="space-y-2">
              <Label>Topics</Label>
              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => {
                  const isSelected = editedQuestion.topic_ids?.includes(topic.id);
                  return (
                    <Badge
                      key={topic.id}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer transition-colors ${isSelected ? "" : "hover:bg-muted"}`}
                      onClick={() => {
                        const currentIds = editedQuestion.topic_ids || [];
                        const newIds = isSelected
                          ? currentIds.filter(id => id !== topic.id)
                          : [...currentIds, topic.id];
                        setEditedQuestion({ ...editedQuestion, topic_ids: newIds });
                      }}
                    >
                      {topic.title}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="gap-1">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="grid gap-2">
              {[...Array(4)].map((_, j) => (
                <Skeleton key={j} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Main Component
export default function AdminQuestionsEditor() {
  const { courseId, examName } = useParams<{ courseId: string; examName: string }>();
  const navigate = useNavigate();
  const decodedExamName = decodeURIComponent(examName || "");
  
  const { data: course } = useCoursePack(courseId!);
  const { data: questions, isLoading } = useQuestionsForExam(courseId!, decodedExamName);
  const { data: ingestionJob } = useIngestionJobForExam(courseId!, decodedExamName);
  const { data: allTopics } = useAllTopics();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const analyzeQuestion = useAnalyzeQuestion();
  const uploadImage = useUploadQuestionImage();
  const removeImage = useRemoveQuestionImage();
  const uploadChoiceImage = useUploadChoiceImage();
  const publishExam = usePublishExam();
  const createLegacyJob = useCreateLegacyIngestionJob();
  const { startBatchAnalysis, isAnalyzing: isBatchAnalyzing } = useAnalysisProgress();

  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [analyzingQuestionId, setAnalyzingQuestionId] = useState<string | null>(null);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [analyzeAllProgress, setAnalyzeAllProgress] = useState({ current: 0, total: 0 });

  // Build topic map
  const topicsMap = useMemo(() => {
    const map = new Map<string, string>();
    allTopics?.forEach((t) => map.set(t.id, t.title));
    return map;
  }, [allTopics]);

  const handleAnalyze = async (questionId: string) => {
    setAnalyzingQuestionId(questionId);
    try {
      await analyzeQuestion.mutateAsync(questionId);
    } finally {
      setAnalyzingQuestionId(null);
    }
  };

  const handleAnalyzeAll = async () => {
    const needsAnalysis = questions?.filter(q => !q.correct_answer || !q.guide_me_steps) || [];
    if (needsAnalysis.length === 0) {
      toast.info("All questions are already analyzed");
      return;
    }

    await runBatchAnalysis(needsAnalysis);
  };

  const handleReanalyzeAll = async () => {
    if (!questions || questions.length === 0) {
      toast.info("No questions to re-analyze");
      return;
    }

    await runBatchAnalysis(questions);
  };

  const runBatchAnalysis = async (questionsToAnalyze: Question[]) => {
    if (!courseId || !decodedExamName) return;
    
    setIsAnalyzingAll(true);
    setAnalyzeAllProgress({ current: 0, total: questionsToAnalyze.length });

    try {
      await startBatchAnalysis.mutateAsync({
        coursePackId: courseId,
        sourceExam: decodedExamName,
        questionIds: questionsToAnalyze.map(q => q.id),
      });
      
      toast.success(`Started batch analysis of ${questionsToAnalyze.length} questions. Progress will continue even if you close this page.`);
    } catch (error) {
      toast.error(`Failed to start batch analysis: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  const handleSaveEdit = (updates: Partial<Question>) => {
    if (editingQuestion) {
      updateQuestion.mutate({ id: editingQuestion.id, ...updates });
    }
  };

  const handleConfirmDelete = () => {
    if (questionToDelete) {
      deleteQuestion.mutate(questionToDelete);
      setQuestionToDelete(null);
    }
  };

  const handleUploadImage = async (questionId: string, file: File) => {
    try {
      await uploadImage.mutateAsync({ questionId, file });
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  const handleRemoveImage = async (questionId: string) => {
    try {
      await removeImage.mutateAsync(questionId);
    } catch (error) {
      console.error("Remove failed:", error);
    }
  };

  const handleTogglePublish = async () => {
    if (ingestionJob) {
      // Existing ingestion job - toggle its publish state
      publishExam.mutate({ 
        jobId: ingestionJob.id, 
        isPublished: !ingestionJob.is_published 
      });
    } else if (courseId && decodedExamName) {
      // No ingestion job exists - create one for this legacy exam and publish it
      try {
        await createLegacyJob.mutateAsync({
          coursePackId: courseId,
          sourceExam: decodedExamName
        });
        toast.success("Exam published successfully");
      } catch (error) {
        console.error("Failed to publish:", error);
        toast.error("Failed to publish exam");
      }
    }
  };

  const needsAnalysisCount = questions?.filter((q) => !q.correct_answer || !q.guide_me_steps).length || 0;
  const analyzedCount = (questions?.length || 0) - needsAnalysisCount;

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="container max-w-5xl py-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm mb-2">
              <Link 
                to="/admin/questions" 
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Courses
              </Link>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Link 
                to={`/admin/questions/${courseId}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {course?.title || "..."}
              </Link>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate">{decodedExamName}</span>
            </div>

            {/* Title and actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => navigate(`/admin/questions/${courseId}`)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold">{decodedExamName}</h1>
                  <p className="text-sm text-muted-foreground">
                    {questions?.length || 0} questions
                    {needsAnalysisCount > 0 && (
                      <span className="text-amber-600 ml-2">
                        • {needsAnalysisCount} need analysis
                      </span>
                    )}
                    {analyzedCount > 0 && needsAnalysisCount === 0 && (
                      <span className="text-green-600 ml-2">
                        • All analyzed ✓
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Analyze All / Re-analyze All button */}
                {needsAnalysisCount > 0 ? (
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleAnalyzeAll}
                    disabled={isAnalyzingAll}
                    className="gap-1"
                  >
                    {isAnalyzingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing {analyzeAllProgress.current}/{analyzeAllProgress.total}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Analyze All ({needsAnalysisCount})
                      </>
                    )}
                  </Button>
                ) : questions && questions.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleReanalyzeAll}
                    disabled={isAnalyzingAll}
                    className="gap-1"
                  >
                    {isAnalyzingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Re-analyzing {analyzeAllProgress.current}/{analyzeAllProgress.total}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Re-analyze All
                      </>
                    )}
                  </Button>
                )}

                {/* Publish toggle - always show, create ingestion job if needed */}
                <Button 
                  variant={ingestionJob?.is_published ? "secondary" : "outline"} 
                  size="sm"
                  onClick={handleTogglePublish}
                  disabled={needsAnalysisCount > 0 || publishExam.isPending || createLegacyJob.isPending}
                  className="gap-1"
                >
                  {(publishExam.isPending || createLegacyJob.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : ingestionJob?.is_published ? (
                    <>
                      <Check className="h-4 w-4" />
                      Published
                    </>
                  ) : (
                    "Publish"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="container max-w-5xl py-6">
          {isLoading ? (
            <QuestionListSkeleton />
          ) : questions?.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No questions found for this exam.</p>
            </Card>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-6"
            >
              {questions?.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  topics={topicsMap}
                  onEdit={() => navigate(`/admin/questions/${courseId}/${examName}/${question.id}`)}
                  onDelete={() => setQuestionToDelete(question.id)}
                  onAnalyze={() => handleAnalyze(question.id)}
                  onUploadImage={(file) => handleUploadImage(question.id, file)}
                  onRemoveImage={() => handleRemoveImage(question.id)}
                  isAnalyzing={analyzingQuestionId === question.id}
                />
              ))}
            </motion.div>
          )}
        </div>

        {/* Edit Dialog */}
        <EditQuestionDialog
          question={editingQuestion}
          open={!!editingQuestion}
          onOpenChange={(open) => !open && setEditingQuestion(null)}
          onSave={handleSaveEdit}
          topics={allTopics || []}
          onUploadImage={async (file) => {
            if (editingQuestion) {
              // The mutation returns the URL string directly, not an object
              const processedUrl = await uploadImage.mutateAsync({ questionId: editingQuestion.id, file });
              return processedUrl;
            }
          }}
          onRemoveImage={async () => {
            if (editingQuestion) {
              await removeImage.mutateAsync(editingQuestion.id);
            }
          }}
          onUploadChoiceImage={async (choiceId, file) => {
            const processedUrl = await uploadChoiceImage.mutateAsync({ choiceId, file });
            return processedUrl;
          }}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!questionToDelete} onOpenChange={() => setQuestionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Question?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this question. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}
