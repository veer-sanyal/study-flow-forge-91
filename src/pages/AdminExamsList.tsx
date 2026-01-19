import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ChevronLeft, 
  FileText, 
  Trash2, 
  AlertCircle,
  ChevronRight 
} from "lucide-react";
import { parseExamName, sortExams, getExamDisplayLabel, ParsedExamInfo } from "@/lib/examUtils";
import { useState, useMemo } from "react";
import { toast } from "sonner";

interface ExamInfo {
  sourceExam: string;
  parsed: ParsedExamInfo;
  questionCount: number;
  needsReviewCount: number;
  midtermNumber: number | null;
}

interface YearGroup {
  year: string;
  exams: ExamInfo[];
}

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
      const { data: questions, error } = await supabase
        .from("questions")
        .select("id, source_exam, needs_review, midterm_number")
        .eq("course_pack_id", courseId);

      if (error) throw error;

      // Group by source_exam
      const examMap = new Map<string, { count: number; needsReview: number; midtermNumber: number | null }>();
      
      questions.forEach((q) => {
        if (!q.source_exam) return;
        
        const existing = examMap.get(q.source_exam) || { count: 0, needsReview: 0, midtermNumber: null };
        existing.count++;
        if (q.needs_review) existing.needsReview++;
        if (q.midterm_number) existing.midtermNumber = q.midterm_number;
        examMap.set(q.source_exam, existing);
      });

      // Convert to array and parse exam names
      const exams: ExamInfo[] = [];
      examMap.forEach((stats, sourceExam) => {
        exams.push({
          sourceExam,
          parsed: parseExamName(sourceExam),
          questionCount: stats.count,
          needsReviewCount: stats.needsReview,
          midtermNumber: stats.midtermNumber,
        });
      });

      // Sort exams
      exams.sort((a, b) => sortExams(a.parsed, b.parsed));

      // Group by year
      const yearGroups: YearGroup[] = [];
      const groupMap = new Map<string, ExamInfo[]>();

      exams.forEach((exam) => {
        const yearKey = exam.parsed.year?.toString() || "Unknown Year";
        if (!groupMap.has(yearKey)) {
          groupMap.set(yearKey, []);
        }
        groupMap.get(yearKey)!.push(exam);
      });

      // Sort years descending
      const sortedYears = Array.from(groupMap.keys()).sort((a, b) => {
        const aNum = parseInt(a) || 0;
        const bNum = parseInt(b) || 0;
        return bNum - aNum;
      });

      sortedYears.forEach((year) => {
        yearGroups.push({
          year,
          exams: groupMap.get(year)!,
        });
      });

      return yearGroups;
    },
    enabled: !!courseId,
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

function ExamCard({ 
  exam, 
  courseId, 
  onDelete 
}: { 
  exam: ExamInfo; 
  courseId: string;
  onDelete: (sourceExam: string) => void;
}) {
  const navigate = useNavigate();

  // Build display label with midterm info
  const displayLabel = useMemo(() => {
    const parts: string[] = [];
    
    if (exam.parsed.semester) parts.push(exam.parsed.semester);
    if (exam.parsed.year) parts.push(exam.parsed.year.toString());

    // Add midterm label
    if (exam.midtermNumber) {
      parts.push(`• Midterm ${exam.midtermNumber}`);
    } else if (exam.parsed.examType) {
      parts.push(`• ${exam.parsed.examType}`);
    }

    return parts.length > 0 ? parts.join(" ") : exam.sourceExam;
  }, [exam]);

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
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-24" />
          {[...Array(3)].map((_, j) => (
            <Card key={j}>
              <CardContent className="p-4 flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
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

  const [examToDelete, setExamToDelete] = useState<string | null>(null);

  const handleConfirmDelete = () => {
    if (examToDelete && courseId) {
      deleteExam.mutate({ courseId, sourceExam: examToDelete });
      setExamToDelete(null);
    }
  };

  const isLoading = courseLoading || examsLoading;

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
          <div>
            <h1 className="text-2xl font-bold">{course?.title || "Loading..."}</h1>
            <p className="text-muted-foreground">
              Select an exam to view and edit questions
            </p>
          </div>
        </div>

        {/* Exam List */}
        {isLoading ? (
          <ExamListSkeleton />
        ) : yearGroups?.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No exams yet</h3>
            <p className="text-muted-foreground">
              Upload exam PDFs to add questions to this course.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {yearGroups?.map((group) => (
              <div key={group.year} className="space-y-3">
                <h2 className="text-lg font-semibold text-muted-foreground">
                  {group.year}
                </h2>
                <div className="space-y-2">
                  {group.exams.map((exam) => (
                    <ExamCard
                      key={exam.sourceExam}
                      exam={exam}
                      courseId={courseId!}
                      onDelete={setExamToDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

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
