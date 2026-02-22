import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Globe,
  GlobeLock,
  Loader2,
  Plus,
  CalendarDays,
  Pencil,
  Trash2,
  Save,
  Upload,
  Image,
  Check,
  Eye,
  Search,
  MoreHorizontal,
  SortAsc,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getCourseCardColor } from "@/lib/examUtils";
import { staggerContainer, staggerItem, reducedMotionProps } from "@/lib/motion";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePublishCourse } from "@/hooks/use-ingestion";
import {
  useTopicsForPack,
  useCoursePackMutations,
  useTopicMutations,
} from "@/hooks/use-admin";
import {
  useIngestionJobs,
  useCreateIngestionJob,
  useProcessJob,
  useCalendarEvents,
  useDeleteCalendarEvent,
  useUpdateCalendarEvent,
  useGenerateTopicsFromEvents,
} from "@/hooks/use-ingestion";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";

interface CourseWithStats {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  questionCount: number;
  examCount: number;
  needsReviewCount: number;
}

interface EditingTopic {
  id: string;
  title: string;
  description: string;
  scheduled_date: string | null;
}

function useCoursesWithStats() {
  return useQuery({
    queryKey: ["courses-with-stats"],
    queryFn: async () => {
      const { data: courses, error: coursesError } = await supabase
        .from("course_packs")
        .select("id, title, description, is_published")
        .order("title");

      if (coursesError) throw coursesError;

      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, course_pack_id, needs_review, source_exam, status, is_published");

      if (questionsError) throw questionsError;

      const coursesWithStats: CourseWithStats[] = (courses as unknown[]).map((course) => {
        const c = course as { id: string; title: string; description: string | null; is_published: boolean };
        const courseQuestions = questions.filter(
          (q) =>
            q.course_pack_id === c.id &&
            q.is_published !== false &&
            (q.status === "approved" || !q.status)
        );
        const uniqueExams = new Set(
          courseQuestions.map((q) => q.source_exam).filter(Boolean)
        );
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          isPublished: c.is_published ?? false,
          questionCount: courseQuestions.length,
          examCount: uniqueExams.size,
          needsReviewCount: courseQuestions.filter((q) => q.needs_review).length,
        };
      });

      return coursesWithStats;
    },
  });
}

// ─── Topic Row ──────────────────────────────────────────────────────────────

function TopicRow({
  topic,
  onEdit,
  onDelete,
}: {
  topic: { id: string; title: string; description: string | null; scheduled_date?: string | null };
  onEdit: (topic: EditingTopic) => void;
  onDelete: (type: "topic", id: string, name: string) => void;
}) {
  const scheduledDate = (topic as Record<string, unknown>).scheduled_date as string | null;
  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg group">
      <div>
        <p className="font-medium text-sm">{topic.title}</p>
        {topic.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{topic.description}</p>
        )}
        {scheduledDate && (
          <p className="text-xs text-muted-foreground mt-0.5">{scheduledDate}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            onEdit({
              id: topic.id,
              title: topic.title,
              description: topic.description || "",
              scheduled_date: scheduledDate,
            })
          }
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete("topic", topic.id, topic.title)}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ─── Course Manage Dialog ────────────────────────────────────────────────────

function CourseManageDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: topics, isLoading: topicsLoading } = useTopicsForPack(courseId);
  const { data: calendarJobs } = useIngestionJobs(courseId, "calendar");
  const { data: calendarEvents } = useCalendarEvents(courseId);

  const { createTopic, updateTopic, deleteTopic } = useTopicMutations();
  const createJob = useCreateIngestionJob();
  const processJob = useProcessJob();
  const deleteCalendarEvent = useDeleteCalendarEvent();
  const updateCalendarEvent = useUpdateCalendarEvent();
  const generateTopics = useGenerateTopicsFromEvents();

  const [activeTab, setActiveTab] = useState<"topics" | "calendar">("topics");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<EditingTopic | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTopic, setDeletingTopic] = useState<{ id: string; name: string } | null>(null);

  const scheduledTopics = topics?.filter((t) => (t as Record<string, unknown>).scheduled_date) ?? [];
  const unscheduledTopics = topics?.filter((t) => !(t as Record<string, unknown>).scheduled_date) ?? [];

  const eventsByWeek = calendarEvents?.reduce(
    (acc, event) => {
      const week = event.week_number ?? 0;
      if (!acc[week]) acc[week] = [];
      acc[week].push(event);
      return acc;
    },
    {} as Record<number, typeof calendarEvents>
  ) ?? {};
  const maxEventWeek = Math.max(...Object.keys(eventsByWeek).map(Number).filter((w) => w > 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><Check className="h-3 w-3 mr-1" />Completed</Badge>;
      case "processing":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getEventTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      topic: "bg-blue-500/20 text-blue-400",
      lesson: "bg-blue-500/20 text-blue-400",
      recitation: "bg-purple-500/20 text-purple-400",
      exam: "bg-red-500/20 text-red-400",
      quiz: "bg-orange-500/20 text-orange-400",
      homework: "bg-green-500/20 text-green-400",
      no_class: "bg-muted text-muted-foreground",
      review: "bg-yellow-500/20 text-yellow-400",
      activity: "bg-cyan-500/20 text-cyan-400",
    };
    return <Badge className={cn("text-xs", colors[type] || "bg-muted")}>{type}</Badge>;
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" });
      return;
    }
    toast({ title: "Uploading calendar image...", description: "Please wait while we process your file" });
    setUploadingImage(true);
    try {
      const job = await createJob.mutateAsync({ coursePackId: courseId, file, kind: "calendar" });
      toast({ title: "Calendar image uploaded", description: "Processing..." });
      await processJob.mutateAsync({ jobId: job.id, kind: "calendar" });
      toast({ title: "Calendar processed successfully!" });
      try {
        const result = await generateTopics.mutateAsync(courseId);
        toast({ title: "Topics generated!", description: `Created ${result.created} topics from calendar events` });
        setActiveTab("topics");
      } catch (topicError) {
        toast({
          title: "Events extracted, but topic generation failed",
          description: topicError instanceof Error ? topicError.message : "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error processing calendar",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleProcessJob = async (jobId: string) => {
    try {
      await processJob.mutateAsync({ jobId, kind: "calendar" });
      toast({ title: "Calendar processed successfully!" });
    } catch (error) {
      toast({ title: "Processing failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleGenerateTopics = async () => {
    try {
      const result = await generateTopics.mutateAsync(courseId);
      toast({ title: "Topics generated!", description: `Created ${result.created} topics from calendar events` });
      setActiveTab("topics");
    } catch (error) {
      toast({ title: "Failed to generate topics", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleSaveTopic = async () => {
    if (!editingTopic?.title.trim()) return;
    try {
      if (editingTopic.id) {
        await updateTopic.mutateAsync({
          id: editingTopic.id,
          title: editingTopic.title,
          description: editingTopic.description || undefined,
          scheduled_date: editingTopic.scheduled_date,
        });
        toast({ title: "Topic updated" });
      } else {
        await createTopic.mutateAsync({
          course_pack_id: courseId,
          title: editingTopic.title,
          description: editingTopic.description || undefined,
          scheduled_date: editingTopic.scheduled_date ?? undefined,
        });
        toast({ title: "Topic created" });
      }
      setTopicDialogOpen(false);
      setEditingTopic(null);
    } catch {
      toast({ title: "Error saving topic", variant: "destructive" });
    }
  };

  const handleDeleteTopic = async () => {
    if (!deletingTopic) return;
    try {
      await deleteTopic.mutateAsync(deletingTopic.id);
      toast({ title: "Topic deleted" });
    } catch {
      toast({ title: "Error deleting topic", variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingTopic(null);
    }
  };

  const openNewTopic = () => {
    setEditingTopic({ id: "", title: "", description: "", scheduled_date: null });
    setTopicDialogOpen(true);
  };

  const openEditTopic = (topic: EditingTopic) => {
    setEditingTopic(topic);
    setTopicDialogOpen(true);
  };

  const openDeleteTopic = (_type: "topic", id: string, name: string) => {
    setDeletingTopic({ id, name });
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {courseTitle}
            </DialogTitle>
            <DialogDescription>Manage topics and import calendar images for this course</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "topics" | "calendar")}>
            <TabsList className="mb-4">
              <TabsTrigger value="topics">Topics</TabsTrigger>
              <TabsTrigger value="calendar">
                Calendar Import
                {calendarEvents && calendarEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">{calendarEvents.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Topics Tab ── */}
            <TabsContent value="topics">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm text-muted-foreground">Topics Schedule</h4>
                  <Button size="sm" variant="outline" onClick={openNewTopic}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Topic
                  </Button>
                </div>

                {topicsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : !topics?.length ? (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                    No topics yet. Add manually or import from calendar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scheduledTopics.length > 0 && (
                      <div className="space-y-2">
                        <Badge className="text-xs">Scheduled</Badge>
                        {scheduledTopics.map((topic) => (
                          <TopicRow
                            key={topic.id}
                            topic={topic}
                            onEdit={openEditTopic}
                            onDelete={openDeleteTopic}
                          />
                        ))}
                      </div>
                    )}
                    {unscheduledTopics.length > 0 && (
                      <div className="space-y-2">
                        <Badge variant="secondary" className="text-xs">Unscheduled</Badge>
                        {unscheduledTopics.map((topic) => (
                          <TopicRow
                            key={topic.id}
                            topic={topic}
                            packId={courseId}
                            onEdit={openEditTopic}
                            onDelete={openDeleteTopic}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Calendar Import Tab ── */}
            <TabsContent value="calendar">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm text-muted-foreground">Import from Calendar Image</h4>
                  <div className="flex gap-2">
                    {calendarEvents && calendarEvents.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => setEventsDialogOpen(true)}>
                        <Eye className="h-3 w-3 mr-1" />
                        View Events ({calendarEvents.length})
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                    />
                    <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                      {uploadingImage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                      Upload Calendar
                    </Button>
                  </div>
                </div>

                {/* Drop Zone */}
                <div
                  className={cn(
                    "p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer",
                    isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50",
                    uploadingImage && "opacity-50 pointer-events-none"
                  )}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleImageUpload(f); }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onClick={() => !uploadingImage && fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    {uploadingImage ? (
                      <>
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <div>
                          <p className="font-medium text-foreground">Processing calendar...</p>
                          <p className="text-sm text-muted-foreground mt-1">AI is extracting events from your image</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={cn("p-4 rounded-full", isDragging ? "bg-primary/20" : "bg-muted")}>
                          <Upload className={cn("h-8 w-8", isDragging ? "text-primary" : "text-muted-foreground")} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {isDragging ? "Drop your calendar image here" : "Drag & drop calendar image"}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">or click to browse • PNG, JPG, WEBP</p>
                        </div>
                        <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                          AI will extract distinct topics with exact dates, exams, and quizzes from your calendar
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Recent Imports */}
                {calendarJobs && calendarJobs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-muted-foreground">Recent Imports</h5>
                    {calendarJobs.slice(0, 3).map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Image className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{job.file_name}</p>
                            <p className="text-xs text-muted-foreground">{job.questions_extracted ?? 0} events extracted</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(job.status)}
                          {(job.status === "pending" || job.status === "failed") && (
                            <Button size="sm" variant="outline" onClick={() => handleProcessJob(job.id)} disabled={processJob.isPending}>
                              {job.status === "failed" ? "Retry" : "Process"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Extracted Events Preview */}
                {calendarEvents && calendarEvents.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-muted-foreground">Extracted Events Preview</h5>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {Array.from({ length: Math.max(maxEventWeek, 1) }, (_, i) => i + 1).slice(0, 3).map(
                        (week) =>
                          eventsByWeek[week]?.length > 0 && (
                            <div key={week} className="space-y-1">
                              <Badge className="text-xs">Week {week}</Badge>
                              {eventsByWeek[week].slice(0, 3).map((event) => (
                                <div
                                  key={event.id}
                                  className={cn(
                                    "flex items-center justify-between p-2 rounded-md text-sm",
                                    event.needs_review ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-muted/30"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    {getEventTypeBadge(event.event_type)}
                                    <span>{event.title}</span>
                                  </div>
                                  {event.event_date && <span className="text-xs text-muted-foreground">{event.event_date}</span>}
                                </div>
                              ))}
                            </div>
                          )
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEventsDialogOpen(true)}>View All Events</Button>
                      <Button size="sm" onClick={handleGenerateTopics} disabled={generateTopics.isPending}>
                        {generateTopics.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                        Generate Topics
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Events Viewer Dialog */}
      <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extracted Calendar Events</DialogTitle>
            <DialogDescription>Review and manage events extracted from calendar images</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {calendarEvents && calendarEvents.length > 0 ? (
              Array.from({ length: maxEventWeek }, (_, i) => i + 1).map(
                (week) =>
                  eventsByWeek[week]?.length > 0 && (
                    <div key={week} className="space-y-2">
                      <Badge className="text-sm">Week {week}</Badge>
                      <div className="space-y-2">
                        {eventsByWeek[week].map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "flex items-start justify-between p-3 rounded-lg",
                              event.needs_review ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-muted/30"
                            )}
                          >
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge className={cn("text-xs", {
                                  "bg-blue-500/20 text-blue-400": event.event_type === "topic",
                                  "bg-red-500/20 text-red-400": event.event_type === "exam",
                                  "bg-orange-500/20 text-orange-400": event.event_type === "quiz",
                                })}>{event.event_type}</Badge>
                                <span className="font-medium">{event.title}</span>
                                {event.needs_review && (
                                  <Badge variant="outline" className="text-xs text-yellow-500">Needs Review</Badge>
                                )}
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground">{event.description}</p>
                              )}
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {event.day_of_week && <span>{event.day_of_week}</span>}
                                {event.event_date && <span>{event.event_date}</span>}
                              </div>
                            </div>
                            <div className="flex gap-1 ml-2">
                              {event.needs_review && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => updateCalendarEvent.mutate({ id: event.id, needs_review: false })}
                                >
                                  <Check className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => deleteCalendarEvent.mutate(event.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
              )
            ) : (
              <p className="text-center text-muted-foreground py-8">No events extracted yet. Upload a calendar image to get started.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Topic Edit Dialog */}
      <Dialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTopic?.id ? "Edit Topic" : "New Topic"}</DialogTitle>
            <DialogDescription>Topics are individual units students will practice</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="topic-title">Title</Label>
              <Input
                id="topic-title"
                value={editingTopic?.title ?? ""}
                onChange={(e) => setEditingTopic((prev) => prev ? { ...prev, title: e.target.value } : null)}
                placeholder="e.g., Limits and Continuity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-description">Description (optional)</Label>
              <Textarea
                id="topic-description"
                value={editingTopic?.description ?? ""}
                onChange={(e) => setEditingTopic((prev) => prev ? { ...prev, description: e.target.value } : null)}
                placeholder="Brief description of what this topic covers"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-date">Scheduled Date</Label>
              <Input
                id="topic-date"
                type="date"
                value={editingTopic?.scheduled_date ?? ""}
                onChange={(e) => setEditingTopic((prev) => prev ? { ...prev, scheduled_date: e.target.value || null } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopicDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveTopic}
              disabled={!editingTopic?.title.trim() || createTopic.isPending || updateTopic.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Topic Confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingTopic?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTopic}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Course Card ─────────────────────────────────────────────────────────────

type StatusFilter = "all" | "live" | "draft" | "review";
type SortKey = "name" | "questions";

function CourseCard({
  course,
  index,
  onPublish,
  isPublishing,
  onManageTopics,
  onDelete,
}: {
  course: CourseWithStats;
  index: number;
  onPublish: (courseId: string, isPublished: boolean) => void;
  isPublishing: boolean;
  onManageTopics: (courseId: string, courseTitle: string) => void;
  onDelete: (courseId: string, courseName: string) => void;
}) {
  const navigate = useNavigate();
  const { gradient } = getCourseCardColor(course.title, index);
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="h-full"
      {...(prefersReducedMotion ? reducedMotionProps : staggerItem)}
    >
      <Card className="h-full flex flex-col overflow-hidden border-0 bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
        {/* Compact colour strip — just the course code */}
        <div className={`bg-gradient-to-r ${gradient} px-4 py-3 flex items-center justify-between shrink-0`}>
          <span className="text-xl font-bold text-white tracking-wide truncate pr-2">
            {course.title}
          </span>
          <Badge
            className={cn(
              "shrink-0 gap-1 text-xs font-medium",
              course.isPublished
                ? "bg-white/90 text-green-700 hover:bg-white"
                : "bg-white/80 text-foreground/70 hover:bg-white"
            )}
          >
            {course.isPublished ? (
              <><Globe className="h-3 w-3" />Live</>
            ) : (
              <><GlobeLock className="h-3 w-3" />Draft</>
            )}
          </Badge>
        </div>

        {/* Body */}
        <CardContent className="p-4 flex flex-col flex-1 gap-3">
          {/* Full course name */}
          {course.description ? (
            <p className="text-sm font-medium text-foreground line-clamp-2">{course.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No description</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-5 text-sm">
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-none">{course.questionCount}</span>
              <span className="text-xs text-muted-foreground mt-0.5">questions</span>
            </div>
            <div className="w-px h-7 bg-border" />
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-none">{course.examCount}</span>
              <span className="text-xs text-muted-foreground mt-0.5">exams</span>
            </div>
            {course.needsReviewCount > 0 && (
              <>
                <div className="w-px h-7 bg-border" />
                <div className="flex flex-col">
                  <span className="text-lg font-semibold leading-none text-destructive">
                    {course.needsReviewCount}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">to review</span>
                </div>
              </>
            )}
          </div>

          {/* Actions — pushed to bottom */}
          <div className="flex gap-2 mt-auto pt-1">
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => navigate(`/admin/questions/${course.id}`)}
            >
              Manage
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="px-2.5">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onManageTopics(course.id, course.title)}>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Topics & Calendar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onPublish(course.id, !course.isPublished)}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : course.isPublished ? (
                    <GlobeLock className="h-4 w-4 mr-2" />
                  ) : (
                    <Globe className="h-4 w-4 mr-2" />
                  )}
                  {course.isPublished ? "Unpublish" : "Publish"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(course.id, course.title)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CourseCardSkeleton() {
  return (
    <Card className="h-full flex flex-col overflow-hidden border-0 shadow-sm">
      <Skeleton className="h-12 rounded-none" />
      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-9 w-full mt-auto" />
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminCoursesList() {
  const { data: courses, isLoading, error } = useCoursesWithStats();
  const prefersReducedMotion = useReducedMotion();
  const publishMutation = usePublishCourse();
  const { toast } = useToast();

  // Toolbar state
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [publishingCourseId, setPublishingCourseId] = useState<string | null>(null);

  // Add course dialog
  const [addCourseDialogOpen, setAddCourseDialogOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({ title: "", description: "" });

  // Manage topics dialog
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [managingCourseId, setManagingCourseId] = useState<string | null>(null);
  const [managingCourseTitle, setManagingCourseTitle] = useState<string>("");

  // Delete course dialog
  const [deleteCourseDialogOpen, setDeleteCourseDialogOpen] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState<{ id: string; name: string } | null>(null);

  const { createPack, deletePack } = useCoursePackMutations();

  // KPI totals (always from full dataset)
  const totalQuestions = courses?.reduce((sum, c) => sum + c.questionCount, 0) || 0;
  const totalNeedsReview = courses?.reduce((sum, c) => sum + c.needsReviewCount, 0) || 0;
  const totalApproved = totalQuestions - totalNeedsReview;

  // Client-side filter + sort
  const visibleCourses = (courses ?? [])
    .filter((c) => {
      const matchesSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.description ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "live" && c.isPublished) ||
        (statusFilter === "draft" && !c.isPublished) ||
        (statusFilter === "review" && c.needsReviewCount > 0);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sort === "questions") return b.questionCount - a.questionCount;
      return a.title.localeCompare(b.title);
    });

  const handlePublish = (courseId: string, isPublished: boolean) => {
    setPublishingCourseId(courseId);
    publishMutation.mutate(
      { courseId, isPublished },
      {
        onSuccess: () => {
          sonnerToast.success(isPublished ? "Course published!" : "Course unpublished");
          setPublishingCourseId(null);
        },
        onError: (err) => {
          sonnerToast.error("Failed to update course: " + err.message);
          setPublishingCourseId(null);
        },
      }
    );
  };

  const handleCreateCourse = async () => {
    if (!newCourse.title.trim()) return;
    try {
      const result = await createPack.mutateAsync({
        title: newCourse.title,
        description: newCourse.description || undefined,
      });
      toast({ title: "Course created!" });
      setAddCourseDialogOpen(false);
      setNewCourse({ title: "", description: "" });
      if (result && (result as { id?: string }).id) {
        setManagingCourseId((result as { id: string }).id);
        setManagingCourseTitle(newCourse.title);
        setManageDialogOpen(true);
      }
    } catch {
      toast({ title: "Error creating course", variant: "destructive" });
    }
  };

  const handleDeleteCourse = async () => {
    if (!deletingCourse) return;
    try {
      await deletePack.mutateAsync(deletingCourse.id);
      toast({ title: "Course deleted" });
    } catch {
      toast({ title: "Error deleting course", variant: "destructive" });
    } finally {
      setDeleteCourseDialogOpen(false);
      setDeletingCourse(null);
    }
  };

  const handleManageTopics = (courseId: string, courseTitle: string) => {
    setManagingCourseId(courseId);
    setManagingCourseTitle(courseTitle);
    setManageDialogOpen(true);
  };

  const handleDeleteRequest = (courseId: string, courseName: string) => {
    setDeletingCourse({ id: courseId, name: courseName });
    setDeleteCourseDialogOpen(true);
  };

  const filterChips: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "live", label: "Live" },
    { key: "draft", label: "Draft" },
    { key: "review", label: "Needs Review" },
  ];

  return (
    <PageTransition>
      <div className="container max-w-6xl py-6 space-y-5">

        {/* ── Header row ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Courses</h1>
            <p className="text-sm text-muted-foreground">Manage courses, topics, and exam questions</p>
          </div>

          {/* KPI chips + CTA */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter(statusFilter === "review" ? "all" : "review")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                statusFilter === "review"
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-card border-border hover:bg-muted"
              )}
            >
              <span className="font-bold text-destructive">{totalNeedsReview}</span>
              <span className="text-muted-foreground">needs review</span>
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === "live" ? "all" : "live")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                statusFilter === "live"
                  ? "bg-green-500/10 border-green-500/30 text-green-700"
                  : "bg-card border-border hover:bg-muted"
              )}
            >
              <span className="font-bold text-green-600">{totalApproved}</span>
              <span className="text-muted-foreground">approved</span>
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card border-border hover:bg-muted text-sm transition-colors"
            >
              <span className="font-bold">{totalQuestions}</span>
              <span className="text-muted-foreground">questions</span>
            </button>
            <Button onClick={() => setAddCourseDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Course
            </Button>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search courses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Sort */}
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-40 gap-2">
              <SortAsc className="h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="questions">Most Questions</SelectItem>
            </SelectContent>
          </Select>

          {/* Status filter chips */}
          <div className="flex items-center gap-1">
            {filterChips.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  statusFilter === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Course Grid ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
            {[...Array(6)].map((_, i) => <CourseCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <p className="text-destructive">Error loading courses: {error.message}</p>
          </Card>
        ) : visibleCourses.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground">
              {search || statusFilter !== "all"
                ? "No courses match your filters."
                : "No courses yet. Click \"Add Course\" to get started."}
            </p>
          </Card>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr"
            {...(prefersReducedMotion ? reducedMotionProps : staggerContainer)}
          >
            {visibleCourses.map((course, index) => (
              <CourseCard
                key={course.id}
                course={course}
                index={index}
                onPublish={handlePublish}
                isPublishing={publishingCourseId === course.id}
                onManageTopics={handleManageTopics}
                onDelete={handleDeleteRequest}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Add Course Dialog ── */}
      <Dialog open={addCourseDialogOpen} onOpenChange={setAddCourseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Course</DialogTitle>
            <DialogDescription>
              Create a new course pack. You can add topics and import a calendar after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="course-title">Course Name</Label>
              <Input
                id="course-title"
                value={newCourse.title}
                onChange={(e) => setNewCourse((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., IE 230 — Probability and Stats"
                onKeyDown={(e) => e.key === "Enter" && handleCreateCourse()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-description">Description (optional)</Label>
              <Textarea
                id="course-description"
                value={newCourse.description}
                onChange={(e) => setNewCourse((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the course"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCourseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCourse} disabled={!newCourse.title.trim() || createPack.isPending}>
              {createPack.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create & Set Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Course Manage Dialog (Topics + Calendar) ── */}
      {managingCourseId && (
        <CourseManageDialog
          open={manageDialogOpen}
          onOpenChange={setManageDialogOpen}
          courseId={managingCourseId}
          courseTitle={managingCourseTitle}
        />
      )}

      {/* ── Delete Course Confirm ── */}
      <AlertDialog open={deleteCourseDialogOpen} onOpenChange={setDeleteCourseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingCourse?.name}" and all its topics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCourse}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
