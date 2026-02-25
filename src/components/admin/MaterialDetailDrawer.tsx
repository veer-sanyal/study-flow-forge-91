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
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useMaterialById, useUpdateMaterial, useDeleteMaterialQuestions, useCleanupMaterialStorage, useAnalyzeLecturePdf } from "@/hooks/use-materials";
import { useBatchGenerateFromMaterial, useGenerationJobStatus } from "@/hooks/use-generate-one-question";
import { MATERIAL_STATUS_CONFIG, MATERIAL_TYPE_LABELS, type MaterialStatus } from "@/types/materials";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, FileText, AlertCircle, Save, Trash2, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface MaterialDetailDrawerProps {
  materialId: string | null;
  onClose: () => void;
}

export function MaterialDetailDrawer({ materialId, onClose }: MaterialDetailDrawerProps) {
  const queryClient = useQueryClient();
  const { data: material, isLoading } = useMaterialById(materialId);
  const updateMaterial = useUpdateMaterial();
  const deleteMaterialQuestions = useDeleteMaterialQuestions();
  const cleanupStorage = useCleanupMaterialStorage();
  const { startJob, isStarting } = useBatchGenerateFromMaterial();
  const analyzeLecturePdf = useAnalyzeLecturePdf();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { job: activeJob } = useGenerationJobStatus(activeJobId);
  const [analysisPollCount, setAnalysisPollCount] = useState(0);
  const { toast } = useToast();

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editWeek, setEditWeek] = useState<string>("");
  const [editMidterm, setEditMidterm] = useState<string>("unassigned");

  // Sync editable fields when material loads
  useEffect(() => {
    if (material) {
      setEditTitle(material.title || "");
      setEditWeek((material as unknown as { scheduled_date?: number }).scheduled_date?.toString() || "");
      const mt = (material as unknown as { corresponds_to_midterm?: number }).corresponds_to_midterm;
      setEditMidterm(mt != null ? String(mt) : "unassigned");
    }
  }, [material]);

  // Clear job tracking and poll count when drawer closes
  useEffect(() => {
    if (!materialId) {
      setActiveJobId(null);
      setAnalysisPollCount(0);
    }
  }, [materialId]);

  // Poll single-material query every 3s while analysis is in progress.
  // Hard cap at 200 polls (~10 min) to prevent infinite polling on stuck jobs.
  const MAX_ANALYSIS_POLLS = 200;
  useEffect(() => {
    if (material?.status !== "analyzing") {
      setAnalysisPollCount(0);
      return;
    }
    if (analysisPollCount >= MAX_ANALYSIS_POLLS) return;
    const id = setInterval(() => {
      setAnalysisPollCount((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ["course-material", materialId] });
    }, 3000);
    return () => clearInterval(id);
  }, [material?.status, materialId, queryClient, analysisPollCount]);

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

  const handleAnalyzeV4 = async () => {
    if (!materialId) return;
    try {
      await analyzeLecturePdf.mutateAsync(materialId);
      toast({
        title: "Analysis started — processing in background",
        description: "The material status will update to 'analyzed' when complete.",
      });
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleGenerateQuestions = async () => {
    if (!materialId) return;

    try {
      const { jobId, totalQuestionsTarget } = await startJob(materialId);
      setActiveJobId(jobId);
      toast({
        title: "Generation started",
        description: `Targeting up to ${totalQuestionsTarget} questions — auto-computed from content analysis.`,
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleResetJob = async () => {
    if (!activeJobId) return;
    await supabase
      .from("generation_jobs")
      .update({ status: "failed", error_message: "Manually reset (job was stuck)" })
      .eq("id", activeJobId);
    setActiveJobId(null);
    toast({ title: "Job reset", description: "You can now re-trigger generation." });
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
                  {(() => {
                    const hasV4 = !!(material as unknown as { analysis_json_v4?: unknown }).analysis_json_v4;

                    // Job in terminal state
                    if (activeJob?.status === "completed") {
                      return (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>
                            {activeJob.total_questions_generated} question{activeJob.total_questions_generated !== 1 ? "s" : ""} generated successfully.
                          </span>
                        </div>
                      );
                    }

                    if (activeJob?.status === "failed") {
                      return (
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{activeJob.error_message ?? "Generation failed."}</span>
                        </div>
                      );
                    }

                    // Job running
                    if (activeJob?.status === "running" || activeJob?.status === "pending") {
                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {activeJob.current_chunk_summary
                                ? `Processing: ${activeJob.current_chunk_summary.slice(0, 50)}…`
                                : "Starting…"}
                            </span>
                            <span>{activeJob.completed_chunks} / {activeJob.total_chunks} chunks</span>
                          </div>
                          <Progress
                            value={activeJob.total_chunks > 0
                              ? (activeJob.completed_chunks / activeJob.total_chunks) * 100
                              : 0}
                            className="h-2"
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              Targeting {activeJob.total_questions_target} questions — running in background
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={handleResetJob}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    // No V4 analysis yet — show Analyze step
                    if (!hasV4) {
                      const isStuck = material.status === "analyzing" && analysisPollCount >= MAX_ANALYSIS_POLLS;
                      return (
                        <div className="space-y-2">
                          {isStuck ? (
                            <div className="flex items-start gap-2 text-sm text-destructive">
                              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>Analysis appears stuck — no response after 10 min. Re-trigger below.</span>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Step 1 of 2: Extract question-ready facts from the PDF before generating questions.
                            </p>
                          )}
                          <Button
                            onClick={handleAnalyzeV4}
                            disabled={analyzeLecturePdf.isPending}
                            variant="outline"
                            className="w-full"
                          >
                            {analyzeLecturePdf.isPending ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing PDF…</>
                            ) : (
                              <><Sparkles className="h-4 w-4 mr-2" />Analyze PDF (V4)</>
                            )}
                          </Button>
                        </div>
                      );
                    }

                    // V4 ready — show Generate step
                    return (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Step 2 of 2: Question count is auto-determined from the content analysis.
                        </p>
                        <Button
                          onClick={handleGenerateQuestions}
                          disabled={isStarting}
                          className="w-full"
                        >
                          {isStarting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting…</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-2" />Generate Questions</>
                          )}
                        </Button>
                      </div>
                    );
                  })()}
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
