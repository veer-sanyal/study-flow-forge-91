import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ChevronLeft, 
  FileText, 
  Trash2, 
  AlertCircle,
  ChevronRight,
  Calendar,
  Pencil,
  Save,
  Loader2,
  Plus,
  Upload,
  X,
  Check,
  Wand2,
  Square,
  CheckSquare,
  BookOpen,
  Tag
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  parseExamName, 
  groupExamsByYearAndSemester, 
  getShortExamLabel,
  buildExamTitle,
  formatExamType,
  SEMESTERS,
  EXAM_TYPES,
  ExamInfo,
  YearGroup 
} from "@/lib/examUtils";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCreateIngestionJob, useProcessJob } from "@/hooks/use-ingestion";
import { useCanHover } from "@/hooks/use-can-hover";
import { useAnalysisQueue, QueuedExam } from "@/hooks/use-analysis-queue";
import { cn } from "@/lib/utils";
import { TopicsGroupedView, TypesGroupedView } from "@/components/admin/GroupedQuestionViews";

type ViewMode = "exams" | "topics" | "types";

function useCoursePack(courseId: string) {
  return useQuery({
    queryKey: ["course-pack", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_packs")
        .select("id, title, description")
        .eq("id", courseId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });
}

function useExamsForCourse(courseId: string) {
  return useQuery({
    queryKey: ["exams-for-course", courseId],
    queryFn: async () => {
      // Get questions grouped by exam
      const { data: questions, error: qError } = await supabase
        .from("questions")
        .select("id, source_exam, needs_review, midterm_number")
        .eq("course_pack_id", courseId);

      if (qError) throw qError;

      // Get ingestion jobs for exam metadata
      const { data: jobs, error: jError } = await supabase
        .from("ingestion_jobs")
        .select("id, exam_year, exam_semester, exam_type, is_final")
        .eq("course_pack_id", courseId);

      if (jError) throw jError;

      // Build a map of source_exam -> job info
      const jobMap = new Map<string, { 
        jobId: string; 
        examYear: number | null; 
        examSemester: string | null; 
        examType: string | null; 
        isFinal: boolean; 
      }>();
      
      // For now, associate jobs with questions based on matching patterns
      // This is simplified - ideally questions would have a job_id reference
      jobs?.forEach((job: any) => {
        const parts: string[] = [];
        if (job.exam_semester && job.exam_year) {
          parts.push(`${job.exam_semester} ${job.exam_year}`);
        }
        const formattedType = formatExamType(job.exam_type);
        if (formattedType) parts.push(formattedType);
        const sourceExam = parts.join(" ");
        if (sourceExam) {
          jobMap.set(sourceExam, {
            jobId: job.id,
            examYear: job.exam_year,
            examSemester: job.exam_semester,
            examType: job.exam_type,
            isFinal: job.is_final || false,
          });
        }
      });

      // Group by source_exam
      const examMap = new Map<string, { 
        count: number; 
        needsReview: number; 
        midtermNumber: number | null;
        jobId: string | null;
        examYear: number | null;
        examSemester: string | null;
        examType: string | null;
      }>();
      
      questions.forEach((q) => {
        if (!q.source_exam) return;
        
        const jobInfo = jobMap.get(q.source_exam);
        const existing = examMap.get(q.source_exam) || { 
          count: 0, 
          needsReview: 0, 
          midtermNumber: null,
          jobId: jobInfo?.jobId || null,
          examYear: jobInfo?.examYear || null,
          examSemester: jobInfo?.examSemester || null,
          examType: jobInfo?.examType || null,
        };
        existing.count++;
        if (q.needs_review) existing.needsReview++;
        if (q.midterm_number) existing.midtermNumber = q.midterm_number;
        examMap.set(q.source_exam, existing);
      });

      // Convert to array and parse exam names
      const exams: (ExamInfo & { 
        jobId: string | null;
        examYear: number | null;
        examSemester: string | null;
        examType: string | null;
      })[] = [];
      examMap.forEach((stats, sourceExam) => {
        exams.push({
          sourceExam,
          parsed: parseExamName(sourceExam),
          questionCount: stats.count,
          needsReviewCount: stats.needsReview,
          midtermNumber: stats.midtermNumber,
          jobId: stats.jobId,
          examYear: stats.examYear,
          examSemester: stats.examSemester,
          examType: stats.examType,
        });
      });

      // Group by year and semester
      return groupExamsByYearAndSemester(exams);
    },
    enabled: !!courseId,
  });
}

function useUpdateCourseName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, title }: { courseId: string; title: string }) => {
      const { error } = await supabase
        .from("course_packs")
        .update({ title })
        .eq("id", courseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-pack"] });
      queryClient.invalidateQueries({ queryKey: ["courses-with-stats"] });
      toast.success("Course name updated");
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

function useUpdateExamDetails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      courseId, 
      oldSourceExam, 
      examYear, 
      examSemester, 
      examType 
    }: { 
      courseId: string;
      oldSourceExam: string;
      examYear: number | null;
      examSemester: string | null;
      examType: string | null;
    }) => {
      // Build new source_exam string
      const parts: string[] = [];
      if (examSemester && examYear) {
        parts.push(`${examSemester} ${examYear}`);
      }
      const formattedType = formatExamType(examType);
      if (formattedType) parts.push(formattedType);
      const newSourceExam = parts.join(" ") || oldSourceExam;

      // Determine midterm number for non-finals
      const isFinal = examType === "f";
      let midtermNumber: number | null = null;
      if (!isFinal && examType) {
        const numVal = parseInt(examType, 10);
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 3) {
          midtermNumber = numVal;
        }
      }

      // Update all questions with this source_exam
      const updateData: { source_exam: string; midterm_number?: number | null } = { 
        source_exam: newSourceExam 
      };
      if (!isFinal && midtermNumber !== null) {
        updateData.midterm_number = midtermNumber;
      }

      const { error } = await supabase
        .from("questions")
        .update(updateData)
        .eq("course_pack_id", courseId)
        .eq("source_exam", oldSourceExam);

      if (error) throw error;

      return { newSourceExam };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams-for-course"] });
      queryClient.invalidateQueries({ queryKey: ["questions-for-review"] });
      toast.success("Exam details updated");
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}

function useDeleteExamQuestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ courseId, sourceExam }: { courseId: string; sourceExam: string }) => {
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("course_pack_id", courseId)
        .eq("source_exam", sourceExam);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams-for-course"] });
      queryClient.invalidateQueries({ queryKey: ["courses-with-stats"] });
      toast.success("All questions from this exam have been deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}

// Edit Course Name Dialog
function EditCourseDialog({
  open,
  onOpenChange,
  course,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: { id: string; title: string } | null;
  onSave: (title: string) => void;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState(course?.title || "");

  useEffect(() => {
    if (course?.title) setTitle(course.title);
  }, [course]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Course Name</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Course Name</Label>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Calculus 2"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(title)} disabled={isSaving || !title.trim()}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit Exam Details Dialog
function EditExamDialog({
  open,
  onOpenChange,
  exam,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: { 
    sourceExam: string; 
    examYear: number | null; 
    examSemester: string | null; 
    examType: string | null; 
  } | null;
  onSave: (data: { examYear: number | null; examSemester: string | null; examType: string | null }) => void;
  isSaving: boolean;
}) {
  const [examYear, setExamYear] = useState<number | null>(exam?.examYear || null);
  const [examSemester, setExamSemester] = useState<string | null>(exam?.examSemester || null);
  const [examType, setExamType] = useState<string | null>(exam?.examType || null);

  useEffect(() => {
    if (exam) {
      setExamYear(exam.examYear);
      setExamSemester(exam.examSemester);
      setExamType(exam.examType);
    }
  }, [exam]);

  const previewTitle = buildExamTitle(null, examYear, examSemester, examType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Exam Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Year */}
          <div className="space-y-2">
            <Label>Year</Label>
            <Input 
              type="number" 
              placeholder="e.g., 2024"
              value={examYear || ""}
              onChange={(e) => setExamYear(e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
          
          {/* Semester */}
          <div className="space-y-2">
            <Label>Semester</Label>
            <Select value={examSemester || ""} onValueChange={(v) => setExamSemester(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Select semester" />
              </SelectTrigger>
              <SelectContent>
                {SEMESTERS.map((sem) => (
                  <SelectItem key={sem} value={sem}>{sem}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Exam Type */}
          <div className="space-y-2">
            <Label>Exam Type</Label>
            <Select value={examType || ""} onValueChange={(v) => setExamType(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Select exam type" />
              </SelectTrigger>
              <SelectContent>
                {EXAM_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{formatExamType(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Preview */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-muted-foreground">Preview</Label>
            <div className="text-lg font-semibold">{previewTitle || "—"}</div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({ examYear, examSemester, examType })} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExamCard({ 
  exam, 
  courseId, 
  onDelete,
  onEdit,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: { 
  exam: ExamInfo & { 
    jobId?: string | null;
    examYear?: number | null;
    examSemester?: string | null;
    examType?: string | null;
  }; 
  courseId: string;
  onDelete: (sourceExam: string) => void;
  onEdit: (exam: { sourceExam: string; examYear: number | null; examSemester: string | null; examType: string | null }) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (sourceExam: string) => void;
}) {
  const navigate = useNavigate();
  
  // Get short label (just "Midterm 1", "Final", etc.)
  const displayLabel = getShortExamLabel(exam.parsed);

  const handleClick = () => {
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect(exam.sourceExam);
    } else {
      const encodedExam = encodeURIComponent(exam.sourceExam);
      navigate(`/admin/questions/${courseId}/${encodedExam}`);
    }
  };

  const [isHovered, setIsHovered] = useState(false);
  const canHover = useCanHover();
  const showActions = !isSelectionMode && (!canHover || isHovered);

  return (
    <Card 
      className={cn(
        "transition-colors cursor-pointer",
        isHovered && !isSelectionMode && "border-primary/50",
        isSelected && "border-primary bg-primary/5"
      )}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isSelectionMode ? (
            <div 
              className="flex items-center justify-center w-10 h-10"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(exam.sourceExam);
              }}
            >
              <Checkbox 
                checked={isSelected} 
                onCheckedChange={() => onToggleSelect?.(exam.sourceExam)}
              />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{displayLabel}</h3>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{exam.questionCount} questions</span>
              {exam.needsReviewCount > 0 && (
                <Badge variant="destructive" className="h-5 gap-1 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  {exam.needsReviewCount} need review
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showActions && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit({
                    sourceExam: exam.sourceExam,
                    examYear: exam.examYear || null,
                    examSemester: exam.examSemester || null,
                    examType: exam.examType || null,
                  });
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(exam.sourceExam);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {!isSelectionMode && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
}

function ExamListSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-7 w-16" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            {[...Array(2)].map((_, j) => (
              <Card key={j}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Add Exam Upload Dialog
function AddExamDialog({
  open,
  onOpenChange,
  courseId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  onSuccess: (sourceExam: string) => void;
}) {
  const examFileInputRef = useRef<HTMLInputElement>(null);
  const answerKeyFileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingExam, setIsDraggingExam] = useState(false);
  const [isDraggingAnswerKey, setIsDraggingAnswerKey] = useState(false);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: "idle" | "uploading" | "processing" | "complete" | "error";
    message: string;
    percent: number;
  }>({ stage: "idle", message: "", percent: 0 });

  const createJob = useCreateIngestionJob();
  const processJob = useProcessJob();

  const handleExamFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    setExamFile(file);
  };

  const handleAnswerKeyFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    setAnswerKeyFile(file);
  };

  const handleUpload = async () => {
    if (!examFile) {
      toast.error("Please select an exam PDF");
      return;
    }

    try {
      // Stage 1: Upload files
      setUploadProgress({ 
        stage: "uploading", 
        message: answerKeyFile ? "Uploading exam and answer key..." : "Uploading PDF...", 
        percent: 30 
      });
      const job = await createJob.mutateAsync({ 
        coursePackId: courseId, 
        file: examFile,
        answerKeyFile: answerKeyFile || undefined,
      });
      
      // Stage 2: Start async processing (returns immediately)
      setUploadProgress({ 
        stage: "processing", 
        message: "Starting background extraction...", 
        percent: 60 
      });
      
      await supabase.functions.invoke("process-exam-pdf", {
        body: { jobId: job.id, async: true }
      });
      
      // Stage 3: Complete - close dialog immediately
      setUploadProgress({ 
        stage: "complete", 
        message: "Exam added to processing queue!", 
        percent: 100 
      });

      toast.success("Exam added to processing queue!", {
        description: "You can track progress in the Queue Monitor or continue working."
      });

      // Close dialog immediately - don't wait for processing
      setTimeout(() => {
        onOpenChange(false);
        setUploadProgress({ stage: "idle", message: "", percent: 0 });
        setExamFile(null);
        setAnswerKeyFile(null);
      }, 500);

    } catch (error) {
      setUploadProgress({ 
        stage: "error", 
        message: error instanceof Error ? error.message : "Upload failed", 
        percent: 0 
      });
    }
  };

  const handleExamDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingExam(false);
    const file = e.dataTransfer.files[0];
    if (file) handleExamFile(file);
  };

  const handleAnswerKeyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAnswerKey(false);
    const file = e.dataTransfer.files[0];
    if (file) handleAnswerKeyFile(file);
  };

  const isProcessing = uploadProgress.stage === "uploading" || uploadProgress.stage === "processing";

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!isProcessing) {
        onOpenChange(o);
        if (!o) {
          setExamFile(null);
          setAnswerKeyFile(null);
          setUploadProgress({ stage: "idle", message: "", percent: 0 });
        }
      }
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Exam</DialogTitle>
          <DialogDescription>
            Upload a past exam PDF to extract questions. Optionally include an answer key to verify AI-generated answers.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {uploadProgress.stage === "idle" || uploadProgress.stage === "error" ? (
            <>
              {/* Exam PDF Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Exam PDF *</Label>
                <input
                  ref={examFileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleExamFile(file);
                  }}
                  className="hidden"
                />
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingExam(true); }}
                  onDragLeave={() => setIsDraggingExam(false)}
                  onDrop={handleExamDrop}
                  onClick={() => examFileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                    isDraggingExam 
                      ? "border-primary bg-primary/5" 
                      : examFile
                        ? "border-primary/50 bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  {examFile ? (
                    <div className="flex items-center gap-2">
                      <FileText className="h-6 w-6 text-primary" />
                      <span className="font-medium text-sm">{examFile.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExamFile(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="font-medium text-sm">Drop exam PDF here or click to browse</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Answer Key Upload (Optional) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Answer Key <Badge variant="outline" className="text-xs">Optional</Badge>
                </Label>
                <input
                  ref={answerKeyFileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAnswerKeyFile(file);
                  }}
                  className="hidden"
                />
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingAnswerKey(true); }}
                  onDragLeave={() => setIsDraggingAnswerKey(false)}
                  onDrop={handleAnswerKeyDrop}
                  onClick={() => answerKeyFileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                    isDraggingAnswerKey 
                      ? "border-primary bg-primary/5" 
                      : answerKeyFile
                        ? "border-green-500/50 bg-green-500/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  {answerKeyFile ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-sm">{answerKeyFile.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnswerKeyFile(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">Add answer key to verify AI answers</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  If provided, extracted questions will be checked against the answer key and mismatches will be flagged.
                </p>
              </div>

              {uploadProgress.stage === "error" && (
                <p className="text-destructive text-sm text-center">
                  {uploadProgress.message}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {uploadProgress.stage === "complete" ? (
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-green-600" />
                  </div>
                ) : (
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{uploadProgress.message}</p>
                  <Progress value={uploadProgress.percent} className="mt-2 h-2" />
                </div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          {uploadProgress.stage === "idle" || uploadProgress.stage === "error" ? (
            <>
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpload}
                disabled={!examFile}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload & Process
              </Button>
            </>
          ) : (
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              {uploadProgress.stage === "complete" ? "Done" : "Cancel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminExamsList() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: course, isLoading: courseLoading } = useCoursePack(courseId!);
  const { data: yearGroups, isLoading: examsLoading } = useExamsForCourse(courseId!);
  const deleteExam = useDeleteExamQuestions();
  const updateCourse = useUpdateCourseName();
  const updateExamDetails = useUpdateExamDetails();
  const { queueExamsForAnalysis, isProcessing, totalQueued, runningJob } = useAnalysisQueue();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("exams");

  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [addExamOpen, setAddExamOpen] = useState(false);
  const [examToEdit, setExamToEdit] = useState<{
    sourceExam: string;
    examYear: number | null;
    examSemester: string | null;
    examType: string | null;
  } | null>(null);

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());

  // Get all exams flat for easy lookup
  const allExams = yearGroups?.flatMap(yg => 
    yg.semesters?.flatMap(sg => sg.exams || []) || []
  ) || [];

  const handleToggleSelect = (sourceExam: string) => {
    setSelectedExams(prev => {
      const next = new Set(prev);
      if (next.has(sourceExam)) {
        next.delete(sourceExam);
      } else {
        next.add(sourceExam);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedExams.size === allExams.length) {
      setSelectedExams(new Set());
    } else {
      setSelectedExams(new Set(allExams.map(e => e.sourceExam)));
    }
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedExams(new Set());
  };

  const handleQueueAnalysis = async () => {
    if (selectedExams.size === 0 || !courseId) return;

    // Get question IDs for each selected exam
    const examsToQueue: QueuedExam[] = [];
    
    for (const sourceExam of selectedExams) {
      const { data: questions } = await supabase
        .from("questions")
        .select("id")
        .eq("course_pack_id", courseId)
        .eq("source_exam", sourceExam);

      if (questions && questions.length > 0) {
        examsToQueue.push({
          coursePackId: courseId,
          sourceExam,
          questionIds: questions.map(q => q.id),
        });
      }
    }

    if (examsToQueue.length === 0) {
      toast.error("No questions found in selected exams");
      return;
    }

    const results = await queueExamsForAnalysis.mutateAsync(examsToQueue);
    
    const successCount = results.filter(r => r.jobId).length;
    const failCount = results.filter(r => r.error).length;

    if (successCount > 0) {
      toast.success(`Queued ${successCount} exam${successCount > 1 ? "s" : ""} for analysis`);
    }
    if (failCount > 0) {
      toast.error(`Failed to queue ${failCount} exam${failCount > 1 ? "s" : ""}`);
    }

    handleExitSelectionMode();
  };

  const handleConfirmDelete = () => {
    if (examToDelete && courseId) {
      deleteExam.mutate({ courseId, sourceExam: examToDelete });
      setExamToDelete(null);
    }
  };

  const handleSaveCourse = (title: string) => {
    if (courseId) {
      updateCourse.mutate({ courseId, title }, {
        onSuccess: () => setEditCourseOpen(false),
      });
    }
  };

  const handleSaveExam = (data: { examYear: number | null; examSemester: string | null; examType: string | null }) => {
    if (courseId && examToEdit) {
      updateExamDetails.mutate({
        courseId,
        oldSourceExam: examToEdit.sourceExam,
        examYear: data.examYear,
        examSemester: data.examSemester,
        examType: data.examType,
      }, {
        onSuccess: () => setExamToEdit(null),
      });
    }
  };

  const handleExamAdded = (sourceExam: string) => {
    // Refresh the exams list
    queryClient.invalidateQueries({ queryKey: ["exams-for-course", courseId] });
    // Navigate to the new exam's questions page
    navigate(`/admin/questions/${courseId}/${encodeURIComponent(sourceExam)}`);
  };

  const isLoading = courseLoading || examsLoading;
  const hasExams = yearGroups && yearGroups.length > 0;

  return (
    <PageTransition>
      <div className="container max-w-4xl py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link 
            to="/admin/questions" 
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Courses
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{course?.title || "..."}</span>
        </div>

        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => isSelectionMode ? handleExitSelectionMode() : navigate("/admin/questions")}
          >
            {isSelectionMode ? <X className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
          <div className="flex-1">
            {isSelectionMode ? (
              <>
                <h1 className="text-2xl font-bold">
                  {selectedExams.size} exam{selectedExams.size !== 1 ? "s" : ""} selected
                </h1>
                <p className="text-muted-foreground">
                  Select exams to queue for analysis
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{course?.title || "Loading..."}</h1>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => setEditCourseOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  Select an exam to view and edit questions
                </p>
              </>
            )}
          </div>
          {isSelectionMode ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSelectAll}>
                {selectedExams.size === allExams.length ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Select All
                  </>
                )}
              </Button>
              <Button 
                onClick={handleQueueAnalysis}
                disabled={selectedExams.size === 0 || queueExamsForAnalysis.isPending}
              >
                {queueExamsForAnalysis.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Queue Analysis ({selectedExams.size})
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {hasExams && (
                <Button variant="outline" onClick={() => setIsSelectionMode(true)}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Batch Analyze
                </Button>
              )}
              <Button onClick={() => setAddExamOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Exam
              </Button>
            </div>
          )}
        </div>

        {/* Queue Status Banner */}
        {isProcessing && !isSelectionMode && (
          <Card className="p-4 border-primary/50 bg-primary/5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium">Analysis in progress</p>
                <p className="text-sm text-muted-foreground">
                  {runningJob ? `Processing: ${runningJob.source_exam}` : "Starting..."} 
                  {totalQueued > 1 && ` (${totalQueued} in queue)`}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Exam List - Hierarchy: Year → Semester → Exam - Only show in exams view mode */}
        {viewMode === "exams" && (
          <>
            {isLoading ? (
              <ExamListSkeleton />
            ) : !hasExams ? (
              <Card className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No exams yet</h3>
                <p className="text-muted-foreground">
                  Upload exam PDFs to add questions to this course.
                </p>
              </Card>
            ) : (
              <div className="space-y-8">
                {yearGroups?.map((yearGroup) => (
                  <div key={yearGroup.year} className="space-y-6">
                    {/* Year Header */}
                    <h2 className="text-xl font-bold text-foreground">
                      {yearGroup.year}
                    </h2>
                    
                    {/* Semesters within the year */}
                    <div className="space-y-6 pl-2 border-l-2 border-muted">
                      {yearGroup.semesters?.map((semesterGroup) => (
                        <div key={`${yearGroup.year}-${semesterGroup.semester}`} className="space-y-3 pl-4">
                          {/* Semester Header */}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-base font-semibold text-muted-foreground">
                              {semesterGroup.semester}
                            </h3>
                          </div>
                          
                          {/* Exams within the semester */}
                          <div className="space-y-2">
                            {semesterGroup.exams?.map((exam: any) => (
                              <ExamCard
                                key={exam.sourceExam}
                                exam={exam}
                                courseId={courseId!}
                                onDelete={setExamToDelete}
                                onEdit={setExamToEdit}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedExams.has(exam.sourceExam)}
                                onToggleSelect={handleToggleSelect}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Edit Course Dialog */}
        <EditCourseDialog
          open={editCourseOpen}
          onOpenChange={setEditCourseOpen}
          course={course ? { id: course.id, title: course.title } : null}
          onSave={handleSaveCourse}
          isSaving={updateCourse.isPending}
        />

        {/* Edit Exam Dialog */}
        <EditExamDialog
          open={!!examToEdit}
          onOpenChange={(open) => !open && setExamToEdit(null)}
          exam={examToEdit}
          onSave={handleSaveExam}
          isSaving={updateExamDetails.isPending}
        />

        {/* Add Exam Dialog */}
        <AddExamDialog
          open={addExamOpen}
          onOpenChange={setAddExamOpen}
          courseId={courseId!}
          onSuccess={handleExamAdded}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!examToDelete} onOpenChange={() => setExamToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Questions from Exam?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all questions from "{examToDelete}". 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}