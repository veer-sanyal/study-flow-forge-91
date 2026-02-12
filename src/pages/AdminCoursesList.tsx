import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, FileQuestion, AlertCircle, Globe, GlobeLock, Loader2 } from "lucide-react";
import { getCourseCardColor } from "@/lib/examUtils";
import { staggerContainer, staggerItem, reducedMotionProps } from "@/lib/motion";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePublishCourse } from "@/hooks/use-ingestion";
import { toast } from "sonner";

interface CourseWithStats {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
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
        .select("id, title, description, is_published")
        .order("title");

      if (coursesError) throw coursesError;

      // Get question counts per course
      // Only count published/approved questions (matching the standard filters used elsewhere)
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, course_pack_id, needs_review, source_exam, status, is_published");

      if (questionsError) throw questionsError;

      // Calculate stats for each course
      const coursesWithStats: CourseWithStats[] = (courses as any[]).map((course) => {
        // Filter to only count published/approved questions (matching standard behavior)
        const courseQuestions = questions.filter(
          (q) => q.course_pack_id === course.id &&
            (q.is_published !== false) && // is_published is true or null (defaults to true)
            (q.status === 'approved' || !q.status) // status is 'approved' or null (defaults to 'approved')
        );
        const uniqueExams = new Set(
          courseQuestions.map((q) => q.source_exam).filter(Boolean)
        );

        return {
          id: course.id,
          title: course.title,
          description: course.description,
          isPublished: course.is_published ?? false,
          questionCount: courseQuestions.length,
          examCount: uniqueExams.size,
          needsReviewCount: courseQuestions.filter((q) => q.needs_review).length,
        };
      });

      return coursesWithStats;
    },
  });
}

function CourseCard({
  course,
  index,
  onPublish,
  isPublishing
}: {
  course: CourseWithStats;
  index: number;
  onPublish: (courseId: string, isPublished: boolean) => void;
  isPublishing: boolean;
}) {
  const navigate = useNavigate();
  const { gradient, accentColor } = getCourseCardColor(course.title, index);
  const prefersReducedMotion = useReducedMotion();

  const handlePublishClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPublish(course.id, !course.isPublished);
  };

  return (
    <motion.div
      {...(prefersReducedMotion ? reducedMotionProps : staggerItem)}
    >
      <Card
        className="group cursor-pointer overflow-hidden border-0 bg-card shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        onClick={() => navigate(`/admin/questions/${course.id}`)}
      >
        {/* Header with gradient */}
        <div className={`h-28 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
          {/* Decorative circles */}
          <div className={`absolute -right-6 -top-6 w-28 h-28 rounded-full ${accentColor} opacity-20`} />
          <div className={`absolute -right-2 top-12 w-16 h-16 rounded-full ${accentColor} opacity-15`} />

          {/* Status badge */}
          <div className="absolute top-3 right-3">
            <Badge
              className={`gap-1.5 text-xs font-medium shadow-sm ${course.isPublished
                  ? "bg-white/95 text-green-700 hover:bg-white"
                  : "bg-white/90 text-muted-foreground hover:bg-white"
                }`}
            >
              {course.isPublished ? (
                <>
                  <Globe className="h-3 w-3" />
                  Live
                </>
              ) : (
                <>
                  <GlobeLock className="h-3 w-3" />
                  Draft
                </>
              )}
            </Badge>
          </div>

          {/* Course title */}
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="text-lg font-bold text-white drop-shadow-sm truncate">
              {course.title}
            </h3>
          </div>
        </div>

        {/* Content section */}
        <CardContent className="p-4 space-y-4">
          {/* Description if exists */}
          {course.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {course.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-foreground">{course.questionCount}</span>
              <span className="text-xs text-muted-foreground">questions</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-foreground">{course.examCount}</span>
              <span className="text-xs text-muted-foreground">exams</span>
            </div>
          </div>

          {/* Action button */}
          <Button
            variant={course.isPublished ? "outline" : "default"}
            size="sm"
            className="w-full gap-2"
            onClick={handlePublishClick}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : course.isPublished ? (
              <GlobeLock className="h-4 w-4" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
            {course.isPublished ? "Unpublish Course" : "Publish Course"}
          </Button>
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
  const publishMutation = usePublishCourse();
  const [publishingCourseId, setPublishingCourseId] = useState<string | null>(null);

  // Calculate overall stats
  const totalQuestions = courses?.reduce((sum, c) => sum + c.questionCount, 0) || 0;
  const totalNeedsReview = courses?.reduce((sum, c) => sum + c.needsReviewCount, 0) || 0;
  const totalApproved = totalQuestions - totalNeedsReview;

  const handlePublish = (courseId: string, isPublished: boolean) => {
    setPublishingCourseId(courseId);
    publishMutation.mutate(
      { courseId, isPublished },
      {
        onSuccess: () => {
          toast.success(isPublished ? "Course published!" : "Course unpublished");
          setPublishingCourseId(null);
        },
        onError: (err) => {
          toast.error("Failed to update course: " + err.message);
          setPublishingCourseId(null);
        },
      }
    );
  };

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
              <CourseCard
                key={course.id}
                course={course}
                index={index}
                onPublish={handlePublish}
                isPublishing={publishingCourseId === course.id}
              />
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
