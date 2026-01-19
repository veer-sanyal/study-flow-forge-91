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
  ChevronRight,
  Check,
  X,
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
  Edit2,
  Trash2,
  Save,
  RotateCcw,
  Loader2,
  Wand2
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { MathRenderer } from "@/components/study/MathRenderer";
import { useAllTopics } from "@/hooks/use-questions";
import type { Json } from "@/integrations/supabase/types";

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
  question_types?: { id: string; name: string } | null;
}

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
      
      // Parse choices from Json
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

function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from("questions")
        .update(updates)
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
      toast.success(`Analysis complete! Answer: ${data.correctAnswer}, ${data.guideMeSteps} guide steps generated`);
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });
}

function QuestionCard({ 
  question, 
  index,
  totalCount,
  topics,
  onApprove,
  onEdit,
  onDelete,
  onAnalyze,
  isAnalyzing,
}: { 
  question: Question;
  index: number;
  totalCount: number;
  topics: Map<string, string>;
  onApprove: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}) {
  const hasGuideMe = question.guide_me_steps && Array.isArray(question.guide_me_steps) && question.guide_me_steps.length > 0;
  const needsAnalysis = !question.correct_answer || !hasGuideMe;

  return (
    <Card className={`${question.needs_review ? 'border-destructive/50 bg-destructive/5' : ''}`}>
      <CardContent className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
              #{question.question_order || index + 1}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {question.question_types?.name && (
                <Badge variant="secondary">{question.question_types.name}</Badge>
              )}
              {question.difficulty && (
                <Badge variant="outline">Difficulty: {question.difficulty}</Badge>
              )}
              {question.image_url && (
                <Badge variant="outline" className="gap-1">
                  <ImageIcon className="h-3 w-3" />
                  Image
                </Badge>
              )}
              {hasGuideMe && (
                <Badge variant="default" className="gap-1 bg-primary/80">
                  <Sparkles className="h-3 w-3" />
                  Guide Me
                </Badge>
              )}
              {question.needs_review && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Needs Review
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {needsAnalysis && (
              <Button 
                variant="default" 
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
                {isAnalyzing ? "Analyzing..." : "Analyze"}
              </Button>
            )}
            {question.needs_review && !needsAnalysis && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-1 text-success hover:text-success"
                onClick={onApprove}
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
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
        <div className="prose prose-sm dark:prose-invert max-w-none">
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
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  choice.isCorrect 
                    ? 'bg-success/10 border-success/50' 
                    : 'bg-muted/30'
                }`}
              >
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                  choice.isCorrect
                    ? 'bg-success text-success-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {choice.isCorrect ? <Check className="h-4 w-4" /> : choice.id.toUpperCase()}
                </div>
                <div className="flex-1">
                  <MathRenderer content={choice.text} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Topics */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
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
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
              View Solution
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted/50 prose prose-sm dark:prose-invert max-w-none">
              <MathRenderer content={question.solution_steps.join('\n\n')} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
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

  // Reset when question changes
  useMemo(() => {
    if (question) {
      setEditedQuestion({
        prompt: question.prompt,
        choices: question.choices,
        difficulty: question.difficulty,
        hint: question.hint,
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
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Question #{question.question_order || 1}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
          <div className="space-y-4 py-4">
            {/* Prompt */}
            <div className="space-y-2">
              <Label>Question Prompt</Label>
              <Textarea
                value={editedQuestion.prompt || ""}
                onChange={(e) => setEditedQuestion({ ...editedQuestion, prompt: e.target.value })}
                rows={4}
              />
            </div>

            {/* Choices */}
            <div className="space-y-2">
              <Label>Choices</Label>
              {editedQuestion.choices?.map((choice, idx) => (
                <div key={choice.id} className="flex items-center gap-2">
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
                    className="flex-1"
                  />
                  <Button
                    variant={choice.isCorrect ? "default" : "outline"}
                    size="sm"
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

            {/* Hint */}
            <div className="space-y-2">
              <Label>Hint</Label>
              <Textarea
                value={editedQuestion.hint || ""}
                onChange={(e) => setEditedQuestion({ ...editedQuestion, hint: e.target.value })}
                rows={2}
              />
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
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

function QuestionListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
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

export default function AdminExamDetail() {
  const { courseId, examName } = useParams<{ courseId: string; examName: string }>();
  const navigate = useNavigate();
  const decodedExamName = decodeURIComponent(examName || "");
  
  const { data: course } = useCoursePack(courseId!);
  const { data: questions, isLoading } = useQuestionsForExam(courseId!, decodedExamName);
  const { data: allTopics } = useAllTopics();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const analyzeQuestion = useAnalyzeQuestion();

  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [analyzingQuestionId, setAnalyzingQuestionId] = useState<string | null>(null);

  // Build topic map
  const topicsMap = useMemo(() => {
    const map = new Map<string, string>();
    allTopics?.forEach((t) => map.set(t.id, t.title));
    return map;
  }, [allTopics]);

  const handleApprove = (questionId: string) => {
    updateQuestion.mutate({ id: questionId, needs_review: false });
  };

  const handleAnalyze = async (questionId: string) => {
    setAnalyzingQuestionId(questionId);
    try {
      await analyzeQuestion.mutateAsync(questionId);
    } finally {
      setAnalyzingQuestionId(null);
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

  const needsReviewCount = questions?.filter((q) => q.needs_review).length || 0;
  const needsAnalysisCount = questions?.filter((q) => !q.correct_answer || !q.guide_me_steps).length || 0;

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

            {/* Title and stats */}
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
                    {needsReviewCount > 0 && needsAnalysisCount === 0 && (
                      <span className="text-destructive ml-2">
                        • {needsReviewCount} need review
                      </span>
                    )}
                  </p>
                </div>
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
            <div className="space-y-6">
              {questions?.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  totalCount={questions.length}
                  topics={topicsMap}
                  onApprove={() => handleApprove(question.id)}
                  onEdit={() => setEditingQuestion(question)}
                  onDelete={() => setQuestionToDelete(question.id)}
                  onAnalyze={() => handleAnalyze(question.id)}
                  isAnalyzing={analyzingQuestionId === question.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <EditQuestionDialog
          question={editingQuestion}
          open={!!editingQuestion}
          onOpenChange={(open) => !open && setEditingQuestion(null)}
          onSave={handleSaveEdit}
          topics={allTopics || []}
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
