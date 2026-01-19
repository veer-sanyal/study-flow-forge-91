import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, FileQuestion, AlertCircle } from "lucide-react";
import { getCourseCardColor } from "@/lib/examUtils";
import { staggerContainer, staggerItem, reducedMotionProps } from "@/lib/motion";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface CourseWithStats {
  id: string;
  title: string;
  description: string | null;
  questionCount: number;
  examCount: number;
  needsReviewCount: number;
}

function useCoursesWithStats() {
  return useQuery({
    queryKey: ["courses-with-stats"],
    queryFn: async () => {
      // Get all course packs
      const { data: courses, error: coursesError } = await supabase
        .from("course_packs")
        .select("id, title, description")
        .order("title");

      if (coursesError) throw coursesError;

      // Get question counts per course
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, course_pack_id, needs_review, source_exam");

      if (questionsError) throw questionsError;

      // Calculate stats for each course
      const coursesWithStats: CourseWithStats[] = courses.map((course) => {
        const courseQuestions = questions.filter(
          (q) => q.course_pack_id === course.id
        );
        const uniqueExams = new Set(
          courseQuestions.map((q) => q.source_exam).filter(Boolean)
        );

        return {
          id: course.id,
          title: course.title,
          description: course.description,
          questionCount: courseQuestions.length,
          examCount: uniqueExams.size,
          needsReviewCount: courseQuestions.filter((q) => q.needs_review).length,
        };
      });

      return coursesWithStats;
    },
  });
}

function CourseCard({ course, index }: { course: CourseWithStats; index: number }) {
  const navigate = useNavigate();
  const { gradient, accentColor } = getCourseCardColor(course.title, index);
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      {...(prefersReducedMotion ? reducedMotionProps : staggerItem)}
    >
      <Card
        className="group cursor-pointer overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        onClick={() => navigate(`/admin/questions/${course.id}`)}
      >
        <div className={`h-32 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
          {/* Decorative circles */}
          <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${accentColor} opacity-30`} />
          <div className={`absolute -right-8 top-8 w-16 h-16 rounded-full ${accentColor} opacity-20`} />
          
          {/* Course title */}
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-xl font-bold text-white truncate">
              {course.title}
            </h3>
          </div>
        </div>

        <CardContent className="p-4 space-y-3">
          {course.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {course.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileQuestion className="h-4 w-4" />
              <span>{course.questionCount} questions</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>{course.examCount} exams</span>
            </div>
          </div>

          {course.needsReviewCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {course.needsReviewCount} need review
            </Badge>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CourseCardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <Skeleton className="h-32 rounded-none" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCoursesList() {
  const { data: courses, isLoading, error } = useCoursesWithStats();
  const prefersReducedMotion = useReducedMotion();

  // Calculate overall stats
  const totalQuestions = courses?.reduce((sum, c) => sum + c.questionCount, 0) || 0;
  const totalNeedsReview = courses?.reduce((sum, c) => sum + c.needsReviewCount, 0) || 0;
  const totalApproved = totalQuestions - totalNeedsReview;

  return (
    <PageTransition>
      <div className="container max-w-6xl py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Questions</h1>
          <p className="text-muted-foreground">
            Manage exam questions by course
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-destructive">{totalNeedsReview}</div>
            <div className="text-sm text-muted-foreground">Needs Review</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-success">{totalApproved}</div>
            <div className="text-sm text-muted-foreground">Approved</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{totalQuestions}</div>
            <div className="text-sm text-muted-foreground">Total Questions</div>
          </Card>
        </div>

        {/* Course Cards Grid */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <p className="text-destructive">Error loading courses: {error.message}</p>
          </Card>
        ) : courses?.length === 0 ? (
          <Card className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No courses yet</h3>
            <p className="text-muted-foreground">
              Upload exam PDFs to start adding questions to courses.
            </p>
          </Card>
        ) : (
          <motion.div
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            {...(prefersReducedMotion ? reducedMotionProps : staggerContainer)}
          >
            {courses?.map((course, index) => (
              <CourseCard key={course.id} course={course} index={index} />
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
