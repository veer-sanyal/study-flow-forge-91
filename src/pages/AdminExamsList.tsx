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
  Loader2
} from "lucide-react";
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
import { useState, useEffect } from "react";
import { toast } from "sonner";

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
}) {
  const navigate = useNavigate();
  
  // Get short label (just "Midterm 1", "Final", etc.)
  const displayLabel = getShortExamLabel(exam.parsed);

  const handleClick = () => {
    // Encode the exam name for URL
    const encodedExam = encodeURIComponent(exam.sourceExam);
    navigate(`/admin/questions/${courseId}/${encodedExam}`);
  };

  return (
    <Card 
      className="group hover:border-primary/50 transition-colors cursor-pointer"
      onClick={handleClick}
    >
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          
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
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
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
            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(exam.sourceExam);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
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

export default function AdminExamsList() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading: courseLoading } = useCoursePack(courseId!);
  const { data: yearGroups, isLoading: examsLoading } = useExamsForCourse(courseId!);
  const deleteExam = useDeleteExamQuestions();
  const updateCourse = useUpdateCourseName();
  const updateExamDetails = useUpdateExamDetails();

  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [examToEdit, setExamToEdit] = useState<{
    sourceExam: string;
    examYear: number | null;
    examSemester: string | null;
    examType: string | null;
  } | null>(null);

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
            onClick={() => navigate("/admin/questions")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
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
          </div>
        </div>

        {/* Exam List - Hierarchy: Year → Semester → Exam */}
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