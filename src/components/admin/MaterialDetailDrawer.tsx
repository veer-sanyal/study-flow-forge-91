import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useMaterialById, useUpdateMaterial, useDeleteMaterialQuestions, useCleanupMaterialStorage } from "@/hooks/use-materials";
import { useGenerateAndSaveQuestions } from "@/hooks/use-generate-one-question";
import { MATERIAL_STATUS_CONFIG, MATERIAL_TYPE_LABELS, type MaterialStatus } from "@/types/materials";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, AlertCircle, Save, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface MaterialDetailDrawerProps {
  materialId: string | null;
  onClose: () => void;
}

export function MaterialDetailDrawer({ materialId, onClose }: MaterialDetailDrawerProps) {
  const { data: material, isLoading } = useMaterialById(materialId);
  const updateMaterial = useUpdateMaterial();
  const deleteMaterialQuestions = useDeleteMaterialQuestions();
  const cleanupStorage = useCleanupMaterialStorage();
  const { generateAndSave, isGenerating, progress, reset: resetGeneration } = useGenerateAndSaveQuestions();
  const { toast } = useToast();

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editWeek, setEditWeek] = useState<string>("");
  const [editMidterm, setEditMidterm] = useState<string>("unassigned");
  const [questionCount, setQuestionCount] = useState<string>("5");

  // Sync editable fields when material loads
  useEffect(() => {
    if (material) {
      setEditTitle(material.title || "");
      setEditWeek((material as unknown as { scheduled_week?: number }).scheduled_week?.toString() || "");
      const mt = (material as unknown as { corresponds_to_midterm?: number }).corresponds_to_midterm;
      setEditMidterm(mt != null ? String(mt) : "unassigned");
    }
  }, [material]);

  // Reset generation state when drawer closes
  useEffect(() => {
    if (!materialId) {
      resetGeneration();
    }
  }, [materialId, resetGeneration]);

  const handleSaveMetadata = async () => {
    if (!materialId) return;
    try {
      await updateMaterial.mutateAsync({
        materialId,
        title: editTitle || undefined,
        scheduledWeek: editWeek ? parseInt(editWeek, 10) : null,
        correspondsToMidterm: editMidterm !== "unassigned" ? parseInt(editMidterm, 10) : null,
      });
      toast({ title: "Material updated" });
    } catch (error) {
      toast({ title: "Update failed", description: String(error), variant: "destructive" });
    }
  };

  const handleDeleteQuestions = async () => {
    if (!materialId) return;
    try {
      await deleteMaterialQuestions.mutateAsync(materialId);
      toast({ title: "Questions deleted", description: "All questions for this material have been removed." });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("No questions found")) {
        toast({
          title: "No questions to delete",
          description: "This material doesn't have any questions associated with it.",
          variant: "default"
        });
      } else {
        toast({
          title: "Delete failed",
          description: errorMessage || "An error occurred while deleting questions. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const handleGenerateQuestions = async () => {
    if (!materialId || !material) return;

    const count = parseInt(questionCount, 10);
    if (isNaN(count) || count < 1 || count > 20) {
      toast({ title: "Invalid count", description: "Please enter a number between 1 and 20", variant: "destructive" });
      return;
    }

    try {
      toast({ title: "Generating questions...", description: `Creating ${count} questions from the lecture material` });

      const result = await generateAndSave({
        materialId,
        count,
        coursePackId: material.course_pack_id,
      });

      if (result.saved > 0) {
        toast({
          title: "Questions generated!",
          description: `Successfully created ${result.saved} question${result.saved > 1 ? 's' : ''}`
        });

        // Auto-cleanup PDF storage after generation
        try {
          await cleanupStorage.mutateAsync(materialId);
        } catch {
          // Non-fatal: PDF cleanup is best-effort
        }
      } else {
        toast({
          title: "Generation failed",
          description: result.errors.join(", ") || "No questions were generated",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ title: "Generation failed", description: String(error), variant: "destructive" });
    }
  };

  const getStatusBadge = (status: MaterialStatus) => {
    const config = MATERIAL_STATUS_CONFIG[status];
    return (
      <Badge variant="secondary" className={`${config.color} text-white`}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Sheet open={!!materialId} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {material?.title || 'Material Details'}
          </SheetTitle>
          <SheetDescription>
            {material && (
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge(material.status as MaterialStatus)}
                <span>•</span>
                <span>{MATERIAL_TYPE_LABELS[material.material_type as keyof typeof MATERIAL_TYPE_LABELS]}</span>
                <span>•</span>
                <span>{material.course_packs?.title}</span>
              </div>
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : material ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Generate Questions Section */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Generate Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Generate MCQ questions from this lecture material using AI.
                  </p>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">Number of questions</Label>
                      <Select value={questionCount} onValueChange={setQuestionCount} disabled={isGenerating}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3">3 questions</SelectItem>
                          <SelectItem value="5">5 questions</SelectItem>
                          <SelectItem value="10">10 questions</SelectItem>
                          <SelectItem value="15">15 questions</SelectItem>
                          <SelectItem value="20">20 questions</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleGenerateQuestions}
                      disabled={isGenerating}
                      className="mt-5"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Progress indicator */}
                  {isGenerating && progress.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{progress.completed} / {progress.total}</span>
                      </div>
                      <Progress value={(progress.completed / progress.total) * 100} className="h-2" />
                      {progress.currentQuestion && (
                        <p className="text-xs text-muted-foreground truncate">
                          Latest: {progress.currentQuestion.stem.slice(0, 60)}...
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Error Message */}
              {material.error_message && (
                <Card className="border-destructive">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5 mt-0.5" />
                      <div>
                        <p className="font-medium">Error</p>
                        <p className="text-sm">{material.error_message}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Editable Metadata */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Edit Material</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Material title"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Week Number</Label>
                      <Input
                        type="number"
                        value={editWeek}
                        onChange={(e) => setEditWeek(e.target.value)}
                        placeholder="e.g., 3"
                        min={1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Midterm Assignment</Label>
                      <Select value={editMidterm} onValueChange={setEditMidterm}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          <SelectItem value="1">Midterm 1</SelectItem>
                          <SelectItem value="2">Midterm 2</SelectItem>
                          <SelectItem value="3">Midterm 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveMetadata}
                      disabled={updateMaterial.isPending}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {updateMaterial.isPending ? "Saving..." : "Save"}
                    </Button>
                    {material.questions_generated_count > 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteQuestions}
                        disabled={deleteMaterialQuestions.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {deleteMaterialQuestions.isPending ? "Deleting..." : "Delete Questions"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Separator />

              {/* Metadata */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">File Information</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File</span>
                    <span className="font-mono text-xs">{material.file_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SHA256</span>
                    <span className="font-mono text-xs truncate max-w-[200px]" title={material.sha256}>
                      {material.sha256.slice(0, 16)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uploaded</span>
                    <span>{format(new Date(material.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Questions Generated</span>
                    <span className="font-medium">{material.questions_generated_count}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
