import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Loader2,
  ImagePlus,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MathRenderer } from "@/components/study/MathRenderer";
import { ChoiceEditor } from "@/components/admin/ChoiceEditor";
import {
  useUpdateQuestion,
  useUploadQuestionImage,
  useRemoveQuestionImage,
  useAllTopics,
} from "@/hooks/use-questions";
import { useUploadChoiceImage } from "@/hooks/use-choice-image";
import type { Tables, Json } from "@/integrations/supabase/types";

type Question = Tables<"questions">;

interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  imageUrl?: string;
}

function parseChoices(choices: Json | null): QuestionChoice[] {
  if (!choices || !Array.isArray(choices)) return [];
  return choices.map((c: any, index: number) => ({
    id: c.id || `choice-${index}`,
    text: c.text || "",
    isCorrect: c.isCorrect || false,
    imageUrl: c.imageUrl || undefined,
  }));
}

export default function AdminQuestionDetail() {
  const { courseId, examName, questionId } = useParams<{
    courseId: string;
    examName: string;
    questionId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch single question
  const { data: question, isLoading: questionLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("id", questionId)
        .single();
      if (error) throw error;
      return data as Question;
    },
    enabled: !!questionId,
  });

  // Fetch all questions for this exam (for prev/next navigation)
  const decodedExamName = examName ? decodeURIComponent(examName) : "";
  const { data: examQuestions } = useQuery({
    queryKey: ["questions-for-exam", courseId, decodedExamName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_order")
        .eq("course_pack_id", courseId)
        .eq("source_exam", decodedExamName)
        .order("question_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!decodedExamName,
  });

  // Fetch topics
  const { data: allTopics } = useAllTopics();
  const courseTopics = allTopics?.filter((t) => t.course_pack_id === courseId) || [];

  // Mutations
  const updateQuestion = useUpdateQuestion();
  const uploadQuestionImage = useUploadQuestionImage();
  const removeQuestionImage = useRemoveQuestionImage();
  const uploadChoiceImage = useUploadChoiceImage();

  // Local state
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState<QuestionChoice[]>([]);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [questionOrder, setQuestionOrder] = useState<number | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  // Initialize state from question
  useEffect(() => {
    if (question) {
      setPrompt(question.prompt || "");
      setChoices(parseChoices(question.choices));
      setDifficulty(question.difficulty);
      setQuestionOrder(question.question_order);
      setSelectedTopicIds(question.topic_ids || []);
      setImageUrl(question.image_url);
      setIsDirty(false);
    }
  }, [question]);

  // Navigation helpers
  const currentIndex = examQuestions?.findIndex((q) => q.id === questionId) ?? -1;
  const prevQuestion = currentIndex > 0 ? examQuestions?.[currentIndex - 1] : null;
  const nextQuestion =
    currentIndex >= 0 && currentIndex < (examQuestions?.length ?? 0) - 1
      ? examQuestions?.[currentIndex + 1]
      : null;

  const goToQuestion = (id: string) => {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Continue without saving?")) return;
    }
    navigate(`/admin/questions/${courseId}/${examName}/${id}`);
  };

  // Save handler
  const handleSave = async () => {
    if (!questionId) return;
    setIsSaving(true);
    try {
      const correctChoice = choices.find((c) => c.isCorrect);
      await updateQuestion.mutateAsync({
        id: questionId,
        prompt,
        choices: choices as unknown as Json,
        correct_answer: correctChoice?.text || null,
        difficulty,
        question_order: questionOrder,
        topic_ids: selectedTopicIds,
        image_url: imageUrl,
      });
      setIsDirty(false);
      toast.success("Question saved");
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to save question");
    } finally {
      setIsSaving(false);
    }
  };

  // Image upload handlers
  const handleQuestionImageUpload = async (file: File) => {
    if (!questionId) return;
    try {
      const url = await uploadQuestionImage.mutateAsync({ questionId, file });
      setImageUrl(url);
      setIsDirty(true);
    } catch (err) {
      toast.error("Failed to upload image");
    }
  };

  const handleQuestionImageRemove = async () => {
    if (!questionId) return;
    try {
      await removeQuestionImage.mutateAsync(questionId);
      setImageUrl(null);
      setIsDirty(true);
    } catch (err) {
      toast.error("Failed to remove image");
    }
  };

  const handleChoiceImageUpload = async (choiceId: string, file: File) => {
    try {
      const url = await uploadChoiceImage.mutateAsync({ choiceId, file });
      if (url) {
        setChoices((prev) =>
          prev.map((c) => (c.id === choiceId ? { ...c, imageUrl: url } : c))
        );
        setIsDirty(true);
      }
      return url;
    } catch (err) {
      toast.error("Failed to upload choice image");
      return undefined;
    }
  };

  const handleChoiceImageRemove = (choiceId: string) => {
    setChoices((prev) =>
      prev.map((c) => (c.id === choiceId ? { ...c, imageUrl: undefined } : c))
    );
    setIsDirty(true);
  };

  // Choice handlers
  const updateChoiceText = (id: string, text: string) => {
    setChoices((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)));
    setIsDirty(true);
  };

  const setCorrectChoice = (id: string) => {
    setChoices((prev) =>
      prev.map((c) => ({ ...c, isCorrect: c.id === id }))
    );
    setIsDirty(true);
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId]
    );
    setIsDirty(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !isSaving) handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, isSaving, handleSave]);

  if (questionLoading) {
    return (
      <PageTransition>
        <div className="container max-w-4xl py-8 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageTransition>
    );
  }

  if (!question) {
    return (
      <PageTransition>
        <div className="container max-w-4xl py-8">
          <p className="text-muted-foreground">Question not found.</p>
          <Button
            variant="ghost"
            onClick={() => navigate(`/admin/questions/${courseId}/${examName}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Exam
          </Button>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="container max-w-4xl py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/admin/questions/${courseId}/${examName}`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-lg font-semibold">
              Question #{questionOrder ?? currentIndex + 1}
            </div>
            {isDirty && (
              <Badge variant="secondary" className="text-xs">
                Unsaved
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Prev/Next navigation */}
            <Button
              variant="outline"
              size="icon"
              disabled={!prevQuestion}
              onClick={() => prevQuestion && goToQuestion(prevQuestion.id)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[60px] text-center">
              {currentIndex + 1} / {examQuestions?.length ?? 0}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={!nextQuestion}
              onClick={() => nextQuestion && goToQuestion(nextQuestion.id)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="ml-4"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </div>

        {/* Question Image */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Question Image
          </label>
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-6 transition-colors",
              isDraggingImage
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50",
              imageUrl && "border-solid"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingImage(true);
            }}
            onDragLeave={() => setIsDraggingImage(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDraggingImage(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) {
                await handleQuestionImageUpload(file);
              }
            }}
          >
            {imageUrl ? (
              <div className="relative flex justify-center">
                <img
                  src={imageUrl}
                  alt="Question"
                  className="max-h-64 object-contain rounded dark:invert dark:brightness-90 dark:contrast-110"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleQuestionImageRemove}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 cursor-pointer">
                <ImagePlus className="h-10 w-10 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQuestionImageUpload(file);
                  }}
                />
              </label>
            )}
          </div>
        </section>

        {/* Question Prompt */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Question Prompt
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Enter the question prompt..."
            className="min-h-[120px] font-mono text-sm"
          />
          {prompt && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <MathRenderer content={prompt} />
            </div>
          )}
        </section>

        {/* Answer Choices */}
        <section className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">
            Answer Choices
          </label>
          <div className="space-y-3">
            {choices.map((choice, index) => (
              <ChoiceEditor
                key={choice.id}
                id={choice.id}
                label={String.fromCharCode(65 + index)}
                text={choice.text}
                imageUrl={choice.imageUrl}
                isCorrect={choice.isCorrect}
                onTextChange={(text) => updateChoiceText(choice.id, text)}
                onImageUpload={(file) => handleChoiceImageUpload(choice.id, file)}
                onImageRemove={() => handleChoiceImageRemove(choice.id)}
                onSetCorrect={() => setCorrectChoice(choice.id)}
              />
            ))}
          </div>
        </section>

        {/* Metadata */}
        <section className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Difficulty
            </label>
            <Select
              value={difficulty?.toString() || ""}
              onValueChange={(val) => {
                setDifficulty(val ? parseInt(val) : null);
                setIsDirty(true);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((d) => (
                  <SelectItem key={d} value={d.toString()}>
                    {d} - {["Easy", "Medium-Easy", "Medium", "Medium-Hard", "Hard"][d - 1]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Question Order
            </label>
            <Input
              type="number"
              value={questionOrder ?? ""}
              onChange={(e) => {
                setQuestionOrder(e.target.value ? parseInt(e.target.value) : null);
                setIsDirty(true);
              }}
              placeholder="e.g. 1, 2, 3..."
            />
          </div>
        </section>

        {/* Topics */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Topics
          </label>
          <div className="flex flex-wrap gap-2">
            {courseTopics.map((topic) => (
              <Badge
                key={topic.id}
                variant={selectedTopicIds.includes(topic.id) ? "default" : "outline"}
                className="cursor-pointer transition-colors"
                onClick={() => toggleTopic(topic.id)}
              >
                {topic.title}
              </Badge>
            ))}
            {courseTopics.length === 0 && (
              <p className="text-sm text-muted-foreground">No topics available</p>
            )}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
