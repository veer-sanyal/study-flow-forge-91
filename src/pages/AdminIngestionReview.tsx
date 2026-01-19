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
} from "@/components/ui/dialog";
import { 
  ChevronLeft,
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
  FileText,
  Lightbulb,
  Eye,
  MessageSquare,
  BookOpen,
  Globe,
  EyeOff
} from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { MathRenderer } from "@/components/study/MathRenderer";
import { useAllTopics, useUploadQuestionImage } from "@/hooks/use-questions";
import type { Json } from "@/integrations/supabase/types";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
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
  question_types?: { id: string; name: string } | null;
}

function useIngestionJob(jobId: string) {
  return useQuery({
    queryKey: ["ingestion-job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("*, course_packs(id, title)")
        .eq("id", jobId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });
}

function useQuestionsForCoursePack(coursePackId: string | null) {
  return useQuery({
    queryKey: ["questions-for-review", coursePackId],
    queryFn: async () => {
      if (!coursePackId) return [];
      
      const { data, error } = await supabase
        .from("questions")
        .select("*, question_types(id, name)")
        .eq("course_pack_id", coursePackId)
        .order("source_exam", { ascending: false })
        .order("question_order", { ascending: true });

      if (error) throw error;
      return data as unknown as Question[];
    },
    enabled: !!coursePackId,
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
      queryClient.invalidateQueries({ queryKey: ["questions-for-review"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
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
      queryClient.invalidateQueries({ queryKey: ["questions-for-review"] });
      queryClient.invalidateQueries({ queryKey: ["ingestion-jobs"] });
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
      queryClient.invalidateQueries({ queryKey: ["questions-for-review"] });
      toast.success(`Analysis complete! Answer: ${data.correctAnswer}`);
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });
}

// Guide Me Step Card with interactive hints
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
  
  const handleRevealHint = () => {
    if (revealedHints < totalHints) {
      setRevealedHints(prev => prev + 1);
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Step Header - Primary color */}
      <div className="px-4 py-3 bg-primary/10 border-b flex items-center gap-2">
        <Badge variant="default" className="text-xs">Step {step.stepNumber || stepIndex + 1}</Badge>
      </div>
      
      {/* Prompt Section */}
      <div className="p-4 border-b bg-card">
        <div className="prose prose-sm dark:prose-invert">
          <MathRenderer content={step.prompt || ''} />
        </div>
      </div>
      
      {/* Choices Section - Slightly muted background */}
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
      
      {/* Hints Section - Blue tinted */}
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
                onClick={handleRevealHint}
              >
                <Eye className="h-3 w-3" />
                Show Hint ({revealedHints + 1}/{totalHints})
              </Button>
            )}
          </div>
          {revealedHints > 0 && (
            <div className="space-y-2">
              {step.hints?.slice(0, revealedHints).map((hint, idx) => (
                <div 
                  key={idx} 
                  className="p-3 rounded bg-blue-500/10 border border-blue-500/20"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400">
                      Tier {hint.tier}
                    </Badge>
                  </div>
                  <div className="text-sm prose prose-sm dark:prose-invert">
                    <MathRenderer content={hint.text} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {revealedHints === 0 && (
            <div className="text-xs text-muted-foreground italic">
              Click "Show Hint" to reveal hints progressively
            </div>
          )}
        </div>
      )}
      
      {/* Explanation Section - Amber tinted */}
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
              <Eye className="h-3 w-3" />
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
      
      {/* Key Takeaway Section - Green tinted */}
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
              <Eye className="h-3 w-3" />
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

function QuestionCard({
  question,
  index,
  topics,
  onEdit,
  onDelete,
  onAnalyze,
  onUploadImage,
  isAnalyzing,
}: { 
  question: Question;
  index: number;
  topics: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  onUploadImage: (file: File) => void;
  isAnalyzing: boolean;
}) {
  // Check for guide me steps - handle both old format (array) and new format (object with steps property)
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
    }
  };

  return (
    <motion.div variants={staggerItem}>
      <Card className={`${needsAnalysis ? 'border-amber-500/50 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-lg">
                {question.question_order || index + 1}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {question.source_exam && (
                  <Badge variant="outline" className="text-xs">
                    {question.source_exam}
                  </Badge>
                )}
                {question.question_types?.name && (
                  <Badge variant="secondary">{question.question_types.name}</Badge>
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
                {hasGuideMe && (
                  <Badge variant="default" className="gap-1 bg-primary/80">
                    <Sparkles className="h-3 w-3" />
                    Guide Me
                  </Badge>
                )}
                {needsAnalysis && (
                  <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3 w-3" />
                    Needs Analysis
                  </Badge>
                )}
                {!needsAnalysis && (
                  <Badge variant="default" className="gap-1 bg-green-500">
                    <Check className="h-3 w-3" />
                    Ready
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
            <div className="rounded-lg overflow-hidden border bg-muted/50 max-w-md">
              <img 
                src={question.image_url} 
                alt="Question diagram" 
                className="w-full h-auto"
              />
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
                    <MathRenderer content={choice.text} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Topics */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            <span className="text-sm text-muted-foreground">Topics:</span>
            {question.topic_ids.length > 0 ? (
              question.topic_ids.map((topicId) => (
                <Badge key={topicId} variant="outline" className="text-xs">
                  {topics.get(topicId) || topicId}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground italic">No topics mapped</span>
            )}
            {question.unmapped_topic_suggestions?.map((suggestion) => (
              <Badge key={suggestion} variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                {suggestion} (suggested)
              </Badge>
            ))}
          </div>

          {/* Solution Preview */}
          {question.solution_steps && question.solution_steps.length > 0 && (
            <details className="pt-2 border-t">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground font-medium">
                View Solution ({question.solution_steps.length} steps)
              </summary>
              <div className="mt-3 p-4 rounded-lg bg-muted/50 prose prose-sm dark:prose-invert max-w-none">
                <MathRenderer content={question.solution_steps.join('\n\n')} />
              </div>
            </details>
          )}

          {/* Guide Me Steps Preview */}
          {(() => {
            // Handle both old format (array) and new format (object with steps property)
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
            const hasSteps = guideData.steps.length > 0;
            const hasSummary = guideData.methodSummary?.bullets?.length;
            
            if (!hasSteps && !hasSummary) return null;
            
            return (
              <details className="pt-2 border-t">
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground font-medium flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  View Guide Me ({guideData.steps.length} steps{hasSummary ? ' + Summary' : ''})
                </summary>
                <div className="mt-3 space-y-4">
                  {/* Steps */}
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
                  
                  {/* Method Summary */}
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
            );
          })()}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EditQuestionDialog({
  question,
  open,
  onOpenChange,
  onSave,
  topics,
}: {
  question: Question | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<Question>) => void;
  topics: { id: string; title: string }[];
}) {
  const [editedQuestion, setEditedQuestion] = useState<Partial<Question>>({});

  useMemo(() => {
    if (question) {
      setEditedQuestion({
        prompt: question.prompt,
        choices: question.choices,
        difficulty: question.difficulty,
        topic_ids: question.topic_ids,
        question_order: question.question_order,
      });
    }
  }, [question]);

  const handleSave = () => {
    onSave(editedQuestion);
    onOpenChange(false);
  };

  if (!question) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] z-50 flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Question #{question.question_order || 1}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto pr-4">
          <div className="space-y-4 py-4">
            {/* Prompt */}
            <div className="space-y-2">
              <Label>Question Prompt (supports LaTeX with $...$ or $$...$$)</Label>
              <Textarea
                value={editedQuestion.prompt || ""}
                onChange={(e) => setEditedQuestion({ ...editedQuestion, prompt: e.target.value })}
                rows={4}
                className="font-mono text-sm"
              />
              <div className="text-xs text-muted-foreground">
                Preview:
              </div>
              <div className="p-3 rounded border bg-muted/30 prose prose-sm dark:prose-invert">
                <MathRenderer content={editedQuestion.prompt || ""} />
              </div>
            </div>

            {/* Choices */}
            <div className="space-y-2">
              <Label>Choices</Label>
              {editedQuestion.choices?.map((choice, idx) => (
                <div key={choice.id} className="flex items-center gap-2">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
                    choice.isCorrect ? 'bg-green-500 text-white' : 'bg-muted'
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
                    className="flex-1 font-mono text-sm"
                    placeholder="Choice text (supports LaTeX)"
                  />
                  <Button
                    variant={choice.isCorrect ? "default" : "outline"}
                    size="sm"
                    className={`min-w-[90px] ${choice.isCorrect ? "bg-green-500 hover:bg-green-600" : ""}`}
                    onClick={() => {
                      const newChoices = editedQuestion.choices?.map((c, i) => ({
                        ...c,
                        isCorrect: i === idx,
                      }));
                      setEditedQuestion({ ...editedQuestion, choices: newChoices });
                    }}
                  >
                    {choice.isCorrect ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Correct
                      </>
                    ) : (
                      "Set Correct"
                    )}
                  </Button>
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

        <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="gap-1">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminIngestionReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading } = useIngestionJob(jobId || "");
  const { data: questions, isLoading: questionsLoading } = useQuestionsForCoursePack(job?.course_pack_id);
  const { data: allTopics } = useAllTopics();

  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const analyzeQuestion = useAnalyzeQuestion();
  const uploadImage = useUploadQuestionImage();
  
  const [publishingExam, setPublishingExam] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Question | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const topics = useMemo(() => {
    const map = new Map<string, string>();
    allTopics?.forEach((t) => map.set(t.id, t.title));
    return map;
  }, [allTopics]);

  const topicsList = useMemo(() => {
    return allTopics?.filter(t => t.course_pack_id === job?.course_pack_id) || [];
  }, [allTopics, job]);

  // Group questions by source exam
  const groupedQuestions = useMemo(() => {
    if (!questions) return {};
    return questions.reduce((acc, q) => {
      const exam = q.source_exam || "Unknown Exam";
      if (!acc[exam]) acc[exam] = [];
      acc[exam].push(q);
      return acc;
    }, {} as Record<string, Question[]>);
  }, [questions]);

  const stats = useMemo(() => {
    if (!questions) return { total: 0, needsAnalysis: 0, ready: 0 };
    
    const needsAnalysis = questions.filter(q => {
      const hasGuide = q.guide_me_steps && 
        (Array.isArray(q.guide_me_steps) 
          ? q.guide_me_steps.length > 0 
          : typeof q.guide_me_steps === 'object' && Object.keys(q.guide_me_steps as object).length > 0);
      return !q.correct_answer || !hasGuide;
    }).length;
    const ready = questions.length - needsAnalysis;
    
    return { total: questions.length, needsAnalysis, ready };
  }, [questions]);

  // Check if exam can be published (all questions analyzed)
  const canPublish = stats.needsAnalysis === 0 && stats.total > 0;
  const isPublished = (job as any)?.is_published ?? false;

  const handlePublishToggle = async () => {
    if (!jobId) return;
    setPublishingExam(true);
    try {
      const newPublishedState = !isPublished;
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ is_published: newPublishedState } as any)
        .eq("id", jobId);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["ingestion-job", jobId] });
      toast.success(newPublishedState ? "Exam published! Questions are now visible to students." : "Exam unpublished.");
    } catch (error) {
      toast.error("Failed to update exam status");
    } finally {
      setPublishingExam(false);
    }
  };

  const handleSaveEdit = async (updates: Partial<Question>) => {
    if (!editingQuestion) return;
    try {
      await updateQuestion.mutateAsync({ id: editingQuestion.id, ...updates });
      toast.success("Question updated!");
      setEditingQuestion(null);
    } catch (error) {
      toast.error("Failed to update question");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteQuestion.mutateAsync(deleteConfirm.id);
      toast.success("Question deleted");
      setDeleteConfirm(null);
    } catch (error) {
      toast.error("Failed to delete question");
    }
  };

  const handleAnalyze = async (questionId: string) => {
    setAnalyzingId(questionId);
    try {
      await analyzeQuestion.mutateAsync(questionId);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleUploadImage = async (questionId: string, file: File) => {
    try {
      await uploadImage.mutateAsync({ questionId, file });
      toast.success("Image uploaded!");
    } catch (error) {
      toast.error("Failed to upload image");
    }
  };

  if (jobLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageTransition>
    );
  }

  if (!job) {
    return (
      <PageTransition>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Job not found</p>
          <Button asChild className="mt-4">
            <Link to="/admin/ingestion">Back to Ingestion</Link>
          </Button>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="p-6 space-y-6 pb-24 md:pb-6"
      >
        {/* Header */}
        <motion.div variants={staggerItem} className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/ingestion">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6" />
              {job.file_name}
              {isPublished && (
                <Badge className="bg-green-500 gap-1">
                  <Globe className="h-3 w-3" />
                  Published
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground text-sm">
              {job.course_packs?.title} • Review and analyze extracted questions
            </p>
          </div>
          
          {/* Publish Button */}
          <div className="flex-shrink-0">
            {isPublished ? (
              <Button
                variant="outline"
                onClick={handlePublishToggle}
                disabled={publishingExam}
                className="gap-2"
              >
                {publishingExam ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                Unpublish
              </Button>
            ) : (
              <Button
                onClick={handlePublishToggle}
                disabled={!canPublish || publishingExam}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {publishingExam ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                Publish Exam
              </Button>
            )}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium">{stats.total}</span>
                </div>
                <div>
                  <span className="text-amber-600">{stats.needsAnalysis} need analysis</span>
                </div>
                <div>
                  <span className="text-green-600">{stats.ready} ready</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Questions */}
        {questionsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <Skeleton className="h-20 w-full" />
                  <div className="grid gap-2">
                    {[1, 2, 3, 4].map((j) => (
                      <Skeleton key={j} className="h-14 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : questions?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No questions found for this course pack</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedQuestions).map(([examName, examQuestions]) => (
              <motion.div key={examName} variants={staggerItem} className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="text-sm font-normal">
                    {examQuestions.length} questions
                  </Badge>
                  {examName}
                </h2>
                <div className="space-y-4">
                  {examQuestions.map((question, index) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      index={index}
                      topics={topics}
                      onEdit={() => setEditingQuestion(question)}
                      onDelete={() => setDeleteConfirm(question)}
                      onAnalyze={() => handleAnalyze(question.id)}
                      onUploadImage={(file) => handleUploadImage(question.id, file)}
                      isAnalyzing={analyzingId === question.id}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <EditQuestionDialog
          question={editingQuestion}
          open={!!editingQuestion}
          onOpenChange={(open) => !open && setEditingQuestion(null)}
          onSave={handleSaveEdit}
          topics={topicsList}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Question?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete question #{deleteConfirm?.question_order}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </PageTransition>
  );
}