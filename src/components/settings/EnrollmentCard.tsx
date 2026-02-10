import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnrollments, CoursePack } from "@/hooks/use-enrollments";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EnrollmentCard() {
  const navigate = useNavigate();
  const {
    enrollments,
    isLoadingEnrollments,
    coursePacks,
    isLoadingCoursePacks,
    enrolledCourseIds,
    enroll,
    unenroll,
    isEnrolling,
    isUnenrolling,
  } = useEnrollments();
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleEnroll = async (coursePack: CoursePack) => {
    setPendingAction(coursePack.id);
    try {
      await enroll(coursePack.id);
      toast({
        title: "Enrolled!",
        description: `You've been enrolled in ${coursePack.title}. Complete the diagnostic quiz to personalize your study plan.`,
      });
      setAddDialogOpen(false);
      // Navigate to diagnostic page to complete diagnostic for the new course
      navigate("/diagnostic", { state: { newCourseId: coursePack.id } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Enrollment failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleUnenroll = async (coursePackId: string, title: string) => {
    setPendingAction(coursePackId);
    try {
      await unenroll(coursePackId);
      toast({
        title: "Removed",
        description: `You've been unenrolled from ${title}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Failed to remove",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPendingAction(null);
    }
  };

  // Get available courses (not yet enrolled)
  const availableCourses = coursePacks.filter(
    cp => !enrolledCourseIds.has(cp.id)
  );

  if (isLoadingEnrollments) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Enrollment</CardTitle>
          <CardDescription>Your courses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Enrollment</CardTitle>
            <CardDescription>Manage your courses</CardDescription>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Course
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a Course</DialogTitle>
                <DialogDescription>
                  Select a course to enroll in
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 mt-4">
                {isLoadingCoursePacks ? (
                  <>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </>
                ) : availableCourses.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Check className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="text-sm">You're enrolled in all available courses!</p>
                  </div>
                ) : (
                  availableCourses.map((course) => (
                    <button
                      key={course.id}
                      onClick={() => handleEnroll(course)}
                      disabled={pendingAction === course.id}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left disabled:opacity-50"
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <BookOpen className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{course.title}</p>
                        {course.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {course.description}
                          </p>
                        )}
                      </div>
                      {pendingAction === course.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground rounded-lg border border-dashed">
            <BookOpen className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">No courses enrolled</p>
            <p className="text-xs mt-1">Add a course to start studying</p>
          </div>
        ) : (
          <div className="space-y-2">
            {enrollments.map((enrollment) => {
              const coursePack = enrollment.course_packs as any;
              return (
                <div
                  key={enrollment.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{coursePack?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnenroll(enrollment.course_pack_id, coursePack?.title || 'course')}
                    disabled={pendingAction === enrollment.course_pack_id}
                  >
                    {pendingAction === enrollment.course_pack_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
