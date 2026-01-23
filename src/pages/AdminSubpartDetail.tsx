import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Save,
  Loader2,
  ImagePlus,
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MathRenderer } from "@/components/study/MathRenderer";
import { QuestionImage } from "@/components/study/QuestionImage";
import {
  useUpdateQuestion,
  useAllTopics,
} from "@/hooks/use-questions";
import type { Tables, Json } from "@/integrations/supabase/types";

type Question = Tables<"questions">;

interface Subpart {
  id: string;
  prompt: string;
  points: number | null;
  correctAnswer?: string | null;
  solutionSteps?: string[] | null;
  imageUrl?: string | null;
}

function parseSubparts(subparts: Json | null): Subpart[] {
  if (!subparts || !Array.isArray(subparts)) return [];
  return subparts.map((sp: any) => ({
    id: sp.id || "",
    prompt: sp.prompt || "",
    points: sp.points ?? null,
    correctAnswer: sp.correctAnswer || null,
    solutionSteps: sp.solutionSteps || null,
    imageUrl: sp.imageUrl || null,
  }));
}

export default function AdminSubpartDetail() {
  const { courseId, examName, questionId, subpartId } = useParams<{
    courseId: string;
    examName: string;
    questionId: string;
    subpartId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch the parent question
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

  // Fetch topics for display
  const { data: allTopics } = useAllTopics();
  const courseTopics = allTopics?.filter((t) => t.course_pack_id === courseId) || [];

  // Mutations
  const updateQuestion = useUpdateQuestion();

  // Parse subparts from question
  const subparts = question ? parseSubparts(question.subparts) : [];
  const currentSubpartIndex = subparts.findIndex((sp) => sp.id.toLowerCase() === subpartId?.toLowerCase());
  const currentSubpart = currentSubpartIndex >= 0 ? subparts[currentSubpartIndex] : null;

  // Local state for this subpart
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [solutionSteps, setSolutionSteps] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize state from subpart
  useEffect(() => {
    if (currentSubpart) {
      setPrompt(currentSubpart.prompt || "");
      setPoints(currentSubpart.points);
      setCorrectAnswer(currentSubpart.correctAnswer || "");
      setSolutionSteps(currentSubpart.solutionSteps?.join("\n\n") || "");
      setImageUrl(currentSubpart.imageUrl || null);
      setIsDirty(false);
    }
  }, [currentSubpart?.id, question?.id]);

  // Navigation helpers
  const prevSubpart = currentSubpartIndex > 0 ? subparts[currentSubpartIndex - 1] : null;
  const nextSubpart = currentSubpartIndex >= 0 && currentSubpartIndex < subparts.length - 1
    ? subparts[currentSubpartIndex + 1]
    : null;

  const goToSubpart = (spId: string) => {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Continue without saving?")) return;
    }
    navigate(`/admin/questions/${courseId}/${examName}/${questionId}/subpart/${spId}`);
  };

  // Image upload handler
  const handleImageUpload = async (file: File) => {
    if (!questionId || !subpartId) return;
    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${questionId}_${subpartId}_${Date.now()}.${fileExt}`;
      const filePath = `subparts/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("question-images")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Skip background removal for subpart images for now
      // The process-question-image function is designed for main question images
      // and updates the questions table directly, which isn't suitable for subparts

      setImageUrl(publicUrl);
      setIsDirty(true);
      toast.success("Image uploaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload image");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setImageUrl(null);
    setIsDirty(true);
  };

  // Save handler
  const handleSave = async () => {
    if (!questionId || !question || currentSubpartIndex < 0) return;
    setIsSaving(true);
    try {
      // Update the subpart in the array
      const updatedSubparts = subparts.map((sp, idx) => {
        if (idx === currentSubpartIndex) {
          return {
            ...sp,
            prompt,
            points,
            correctAnswer: correctAnswer || null,
            solutionSteps: solutionSteps.trim() 
              ? solutionSteps.split(/\n\n+/).filter(Boolean) 
              : null,
            imageUrl: imageUrl || null,
          };
        }
        return sp;
      });

      await updateQuestion.mutateAsync({
        id: questionId,
        subparts: updatedSubparts as unknown as Json,
      });
      setIsDirty(false);
      toast.success("Subpart saved");
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["questions-for-exam"] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to save subpart");
    } finally {
      setIsSaving(false);
    }
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
  }, [isDirty, isSaving]);

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

  if (!question || !currentSubpart) {
    return (
      <PageTransition>
        <div className="container max-w-4xl py-8">
          <p className="text-muted-foreground">Subpart not found.</p>
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

  const questionOrder = question.question_order;

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
              Question {questionOrder}.{subpartId?.toLowerCase()}
            </div>
            {points !== null && (
              <Badge variant="outline">{points} pts</Badge>
            )}
            {isDirty && (
              <Badge variant="secondary" className="text-xs">
                Unsaved
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Prev/Next subpart navigation */}
            <Button
              variant="outline"
              size="icon"
              disabled={!prevSubpart}
              onClick={() => prevSubpart && goToSubpart(prevSubpart.id)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[60px] text-center">
              {currentSubpartIndex + 1} / {subparts.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={!nextSubpart}
              onClick={() => nextSubpart && goToSubpart(nextSubpart.id)}
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

        {/* Parent Question Context */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Parent Question Context:</p>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MathRenderer content={question.prompt} />
            </div>
            {question.image_url && (
              <div className="mt-3 max-w-sm">
                <img
                  src={question.image_url}
                  alt="Question diagram"
                  className="rounded border dark:invert dark:brightness-90 dark:contrast-110"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subpart Prompt */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Subpart Prompt
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Enter the subpart prompt..."
            className="min-h-[100px] font-mono text-sm"
          />
          {prompt && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <MathRenderer content={prompt} />
            </div>
          )}
        </section>

        {/* Subpart Image */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Subpart Image
          </label>
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-6 transition-colors",
              isDraggingImage
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50",
              imageUrl && "border-solid",
              isUploadingImage && "opacity-50 pointer-events-none"
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
                await handleImageUpload(file);
              }
            }}
          >
            {isUploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {imageUrl ? (
              <div className="relative flex justify-center">
                <QuestionImage
                  src={imageUrl}
                  alt="Subpart diagram"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleRemoveImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 cursor-pointer">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
              </label>
            )}
          </div>
        </section>

        {/* Points */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Points
          </label>
          <Input
            type="number"
            value={points ?? ""}
            onChange={(e) => {
              setPoints(e.target.value ? parseInt(e.target.value) : null);
              setIsDirty(true);
            }}
            placeholder="e.g. 4"
            className="max-w-[120px]"
          />
        </section>

        {/* Model Answer */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Correct Answer / Model Answer
          </label>
          <Textarea
            value={correctAnswer}
            onChange={(e) => {
              setCorrectAnswer(e.target.value);
              setIsDirty(true);
            }}
            placeholder="The correct answer or model response..."
            className="min-h-[80px] font-mono text-sm"
          />
          {correctAnswer && (
            <div className="p-4 rounded-lg bg-accent/50 border border-primary/30">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <MathRenderer content={correctAnswer} />
            </div>
          )}
        </section>

        {/* Solution Steps */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Solution Steps (separate by blank lines)
          </label>
          <Textarea
            value={solutionSteps}
            onChange={(e) => {
              setSolutionSteps(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Step 1: Identify the distribution...

Step 2: Calculate the parameter..."
            className="min-h-[150px] font-mono text-sm"
          />
          {solutionSteps && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <div className="prose prose-sm dark:prose-invert max-w-none space-y-2">
                {solutionSteps.split(/\n\n+/).filter(Boolean).map((step, idx) => (
                  <div key={idx}>
                    <MathRenderer content={step} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Topics (read-only, inherited from parent) */}
        <section className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Topics (inherited from parent question)
          </label>
          <div className="flex flex-wrap gap-2">
            {question.topic_ids && question.topic_ids.length > 0 ? (
              question.topic_ids.map((topicId) => {
                const topic = courseTopics.find((t) => t.id === topicId);
                return (
                  <Badge key={topicId} variant="secondary">
                    {topic?.title || topicId}
                  </Badge>
                );
              })
            ) : (
              <span className="text-sm text-muted-foreground italic">No topics assigned</span>
            )}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
