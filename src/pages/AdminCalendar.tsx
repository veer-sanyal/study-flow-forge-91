import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, 
  Plus, 
  Pencil, 
  Trash2, 
  BookOpen, 
  ChevronDown,
  Save,
  Upload,
  Image,
  Loader2,
  Check,
  AlertCircle,
  Eye
} from "lucide-react";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { useToast } from "@/hooks/use-toast";
import { 
  useCoursePacks, 
  useTopicsForPack, 
  useCoursePackMutations, 
  useTopicMutations 
} from "@/hooks/use-admin";
import {
  useIngestionJobs,
  useCreateIngestionJob,
  useProcessJob,
  useDeleteJob,
  useCalendarEvents,
  useDeleteCalendarEvent,
  useUpdateCalendarEvent,
  useGenerateTopicsFromEvents,
} from "@/hooks/use-ingestion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface EditingTopic {
  id: string;
  title: string;
  description: string;
  scheduled_date: string | null;
}

export default function AdminCalendar() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Data fetching
  const { data: coursePacks, isLoading: packsLoading } = useCoursePacks();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { data: topics, isLoading: topicsLoading } = useTopicsForPack(selectedPackId);
  const { data: calendarJobs } = useIngestionJobs(selectedPackId ?? undefined, "calendar");
  const { data: calendarEvents } = useCalendarEvents(selectedPackId ?? undefined);
  
  // Mutations
  const { createPack, updatePack, deletePack } = useCoursePackMutations();
  const { createTopic, updateTopic, deleteTopic } = useTopicMutations();
  const createJob = useCreateIngestionJob();
  const processJob = useProcessJob();
  const deleteJob = useDeleteJob();
  const deleteCalendarEvent = useDeleteCalendarEvent();
  const updateCalendarEvent = useUpdateCalendarEvent();
  const generateTopics = useGenerateTopicsFromEvents();
  
  // UI state
  const [openPackIds, setOpenPackIds] = useState<Set<string>>(new Set());
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<{ id?: string; title: string; description: string } | null>(null);
  const [editingTopic, setEditingTopic] = useState<EditingTopic | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: "pack" | "topic"; id: string; name: string } | null>(null);
  const [activePackForTopic, setActivePackForTopic] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"topics" | "calendar">("topics");
  const [isDragging, setIsDragging] = useState(false);

  // Group topics: scheduled vs unscheduled (since scheduled_week is gone, use scheduled_date)
  const scheduledTopics = topics?.filter(t => (t as Record<string, unknown>).scheduled_date) ?? [];
  const unscheduledTopics = topics?.filter(t => !(t as Record<string, unknown>).scheduled_date) ?? [];

  // Group calendar events by week
  const eventsByWeek = calendarEvents?.reduce((acc, event) => {
    const week = event.week_number ?? 0;
    if (!acc[week]) acc[week] = [];
    acc[week].push(event);
    return acc;
  }, {} as Record<number, typeof calendarEvents>) ?? {};

  const maxEventWeek = Math.max(...Object.keys(eventsByWeek).map(Number).filter(w => w > 0), 0);

  // Handlers
  const handleOpenPack = (packId: string) => {
    const newOpen = new Set(openPackIds);
    if (newOpen.has(packId)) {
      newOpen.delete(packId);
      if (selectedPackId === packId) setSelectedPackId(null);
    } else {
      newOpen.add(packId);
      setSelectedPackId(packId);
    }
    setOpenPackIds(newOpen);
  };

  const handleSavePack = async () => {
    if (!editingPack?.title.trim()) return;
    
    try {
      if (editingPack.id) {
        await updatePack.mutateAsync({
          id: editingPack.id,
          title: editingPack.title,
          description: editingPack.description || undefined,
        });
        toast({ title: "Course pack updated" });
      } else {
        await createPack.mutateAsync({
          title: editingPack.title,
          description: editingPack.description || undefined,
        });
        toast({ title: "Course pack created" });
      }
      setPackDialogOpen(false);
      setEditingPack(null);
    } catch (error) {
      toast({ title: "Error saving course pack", variant: "destructive" });
    }
  };

  const handleSaveTopic = async () => {
    if (!editingTopic?.title.trim() || !activePackForTopic) return;
    
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
          course_pack_id: activePackForTopic,
          title: editingTopic.title,
          description: editingTopic.description || undefined,
          scheduled_date: editingTopic.scheduled_date ?? undefined,
        });
        toast({ title: "Topic created" });
      }
      setTopicDialogOpen(false);
      setEditingTopic(null);
    } catch (error) {
      toast({ title: "Error saving topic", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    
    try {
      if (deletingItem.type === "pack") {
        await deletePack.mutateAsync(deletingItem.id);
        toast({ title: "Course pack deleted" });
      } else {
        await deleteTopic.mutateAsync(deletingItem.id);
        toast({ title: "Topic deleted" });
      }
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    } catch (error) {
      toast({ title: "Error deleting item", variant: "destructive" });
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedPackId) {
      toast({ title: "Please select a course pack first", variant: "destructive" });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" });
      return;
    }
    
    toast({ title: "Uploading calendar image...", description: "Please wait while we process your file" });

    setUploadingImage(true);
    try {
      const job = await createJob.mutateAsync({
        coursePackId: selectedPackId,
        file,
        kind: "calendar",
      });

      toast({ title: "Calendar image uploaded", description: "Click Process to extract events" });

      // Auto-process the job
      await processJob.mutateAsync({ jobId: job.id, kind: "calendar" });
      toast({ title: "Calendar processed successfully!" });
    } catch (error) {
      toast({ 
        title: "Error processing calendar", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleProcessJob = async (jobId: string) => {
    try {
      await processJob.mutateAsync({ jobId, kind: "calendar" });
      toast({ title: "Calendar processed successfully!" });
    } catch (error) {
      toast({ 
        title: "Processing failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    }
  };

  const handleGenerateTopics = async () => {
    if (!selectedPackId) return;
    
    try {
      const result = await generateTopics.mutateAsync(selectedPackId);
      toast({ 
        title: "Topics generated!", 
        description: `Created ${result.created} topics from calendar events` 
      });
      setActiveTab("topics");
    } catch (error) {
      toast({ 
        title: "Failed to generate topics", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    }
  };

  const openNewPack = () => {
    setEditingPack({ title: "", description: "" });
    setPackDialogOpen(true);
  };

  const openEditPack = (pack: { id: string; title: string; description: string | null }) => {
    setEditingPack({ id: pack.id, title: pack.title, description: pack.description || "" });
    setPackDialogOpen(true);
  };

  const openNewTopic = (packId: string) => {
    setActivePackForTopic(packId);
    setEditingTopic({ id: "", title: "", description: "", scheduled_date: null });
    setTopicDialogOpen(true);
  };

  const openEditTopic = (topic: EditingTopic, packId: string) => {
    setActivePackForTopic(packId);
    setEditingTopic(topic);
    setTopicDialogOpen(true);
  };

  const openDeleteConfirm = (type: "pack" | "topic", id: string, name: string) => {
    setDeletingItem({ type, id, name });
    setDeleteDialogOpen(true);
  };

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

  if (packsLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-36" />
          </div>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="p-6 space-y-6 pb-24 md:pb-6"
      >
        {/* Header */}
        <motion.div 
          variants={staggerItem}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Calendar & Topics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage course packs, upload calendar images, and schedule topics
            </p>
          </div>
          <Button onClick={openNewPack}>
            <Plus className="h-4 w-4 mr-2" />
            New Course Pack
          </Button>
        </motion.div>

        {/* Course Packs List */}
        {!coursePacks?.length ? (
          <motion.div variants={staggerItem}>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg">No course packs yet</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Create your first course pack to get started
                </p>
                <Button className="mt-4" onClick={openNewPack}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Course Pack
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {coursePacks.map((pack) => (
              <motion.div key={pack.id} variants={staggerItem}>
                <Collapsible
                  open={openPackIds.has(pack.id)}
                  onOpenChange={() => handleOpenPack(pack.id)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <ChevronDown 
                              className={cn(
                                "h-5 w-5 text-muted-foreground transition-transform",
                                openPackIds.has(pack.id) && "rotate-180"
                              )} 
                            />
                            <div>
                              <CardTitle className="text-lg">{pack.title}</CardTitle>
                              {pack.description && (
                                <CardDescription className="mt-1">
                                  {pack.description}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditPack(pack)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteConfirm("pack", pack.id, pack.title)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {selectedPackId === pack.id && (
                          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "topics" | "calendar")}>
                            <TabsList className="mb-4">
                              <TabsTrigger value="topics">Topics</TabsTrigger>
                              <TabsTrigger value="calendar">
                                Calendar Import
                                {calendarEvents && calendarEvents.length > 0 && (
                                  <Badge variant="secondary" className="ml-2 text-xs">
                                    {calendarEvents.length}
                                  </Badge>
                                )}
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="topics">
                              {/* Topics by Week */}
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-sm text-muted-foreground">
                                    Topics Schedule
                                  </h4>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => openNewTopic(pack.id)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Topic
                                  </Button>
                                </div>

                                {topicsLoading ? (
                                  <div className="space-y-2">
                                    {[1, 2, 3].map((i) => (
                                      <Skeleton key={i} className="h-12 w-full" />
                                    ))}
                                  </div>
                                ) : !topics?.length ? (
                                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                                    No topics yet. Add manually or import from calendar.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {/* Scheduled topics (by date) */}
                                    {scheduledTopics.length > 0 && (
                                      <div className="space-y-2">
                                        <Badge className="text-xs">Scheduled</Badge>
                                        {scheduledTopics.map((topic) => (
                                          <TopicRow
                                            key={topic.id}
                                            topic={topic}
                                            packId={pack.id}
                                            onEdit={openEditTopic}
                                            onDelete={openDeleteConfirm}
                                          />
                                        ))}
                                      </div>
                                    )}

                                    {/* Unscheduled topics */}
                                    {unscheduledTopics.length > 0 && (
                                      <div className="space-y-2">
                                        <Badge variant="secondary" className="text-xs">Unscheduled</Badge>
                                        {unscheduledTopics.map((topic) => (
                                          <TopicRow
                                            key={topic.id}
                                            topic={topic}
                                            packId={pack.id}
                                            onEdit={openEditTopic}
                                            onDelete={openDeleteConfirm}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TabsContent>

                            <TabsContent value="calendar">
                              <div className="space-y-4">
                                {/* Upload Section */}
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-sm text-muted-foreground">
                                    Import from Calendar Image
                                  </h4>
                                  <div className="flex gap-2">
                                    {calendarEvents && calendarEvents.length > 0 && (
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => setEventsDialogOpen(true)}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        View Events ({calendarEvents.length})
                                      </Button>
                                    )}
                                    <input
                                      ref={fileInputRef}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={handleFileInputChange}
                                    />
                                    <Button 
                                      size="sm"
                                      onClick={() => fileInputRef.current?.click()}
                                      disabled={uploadingImage}
                                    >
                                      {uploadingImage ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Upload className="h-4 w-4 mr-2" />
                                      )}
                                      Upload Calendar Image
                                    </Button>
                                  </div>
                                </div>

                                {/* Drop Zone */}
                                <div 
                                  className={cn(
                                    "p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer",
                                    isDragging 
                                      ? "border-primary bg-primary/10" 
                                      : "border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50",
                                    uploadingImage && "opacity-50 pointer-events-none"
                                  )}
                                  onDrop={handleDrop}
                                  onDragOver={handleDragOver}
                                  onDragLeave={handleDragLeave}
                                  onClick={() => !uploadingImage && fileInputRef.current?.click()}
                                >
                                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                                    {uploadingImage ? (
                                      <>
                                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                        <div>
                                          <p className="font-medium text-foreground">Processing calendar...</p>
                                          <p className="text-sm text-muted-foreground mt-1">
                                            AI is extracting events from your image
                                          </p>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className={cn(
                                          "p-4 rounded-full",
                                          isDragging ? "bg-primary/20" : "bg-muted"
                                        )}>
                                          <Upload className={cn(
                                            "h-8 w-8",
                                            isDragging ? "text-primary" : "text-muted-foreground"
                                          )} />
                                        </div>
                                        <div>
                                          <p className="font-medium text-foreground">
                                            {isDragging ? "Drop your calendar image here" : "Drag & drop calendar image"}
                                          </p>
                                          <p className="text-sm text-muted-foreground mt-1">
                                            or click to browse • PNG, JPG, WEBP
                                          </p>
                                        </div>
                                        <div className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
                                          AI will extract distinct topics with exact dates, exams, and quizzes from your calendar
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Recent Imports */}
                                {calendarJobs && calendarJobs.length > 0 && (
                                  <div className="space-y-2">
                                    <h5 className="text-sm font-medium text-muted-foreground">Recent Imports</h5>
                                    {calendarJobs.slice(0, 3).map((job) => (
                                      <div 
                                        key={job.id}
                                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                                      >
                                        <div className="flex items-center gap-3">
                                          <Image className="h-4 w-4 text-muted-foreground" />
                                          <div>
                                            <p className="text-sm font-medium">{job.file_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {job.questions_extracted ?? 0} events extracted
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {getStatusBadge(job.status)}
                                          {job.status === "pending" && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleProcessJob(job.id)}
                                              disabled={processJob.isPending}
                                            >
                                              Process
                                            </Button>
                                          )}
                                          {job.status === "failed" && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleProcessJob(job.id)}
                                              disabled={processJob.isPending}
                                            >
                                              Retry
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
                                    <h5 className="text-sm font-medium text-muted-foreground">
                                      Extracted Events Preview
                                    </h5>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                      {Array.from({ length: Math.max(maxEventWeek, 1) }, (_, i) => i + 1).slice(0, 3).map((week) => (
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
                                                  {event.needs_review && (
                                                    <Badge variant="outline" className="text-xs text-yellow-500">
                                                      Needs Review
                                                    </Badge>
                                                  )}
                                                </div>
                                                {event.event_date && (
                                                  <span className="text-xs text-muted-foreground">
                                                    {event.event_date}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )
                                      ))}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => setEventsDialogOpen(true)}
                                      >
                                        View All Events
                                      </Button>
                                      <Button 
                                        size="sm"
                                        onClick={handleGenerateTopics}
                                        disabled={generateTopics.isPending}
                                      >
                                        {generateTopics.isPending ? (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                          <Plus className="h-4 w-4 mr-2" />
                                        )}
                                        Generate Topics
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TabsContent>
                          </Tabs>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </motion.div>
            ))}
          </div>
        )}

        {/* Course Pack Dialog */}
        <Dialog open={packDialogOpen} onOpenChange={setPackDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPack?.id ? "Edit Course Pack" : "New Course Pack"}
              </DialogTitle>
              <DialogDescription>
                Course packs are containers for related topics (e.g., "Calculus I")
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pack-title">Title</Label>
                <Input
                  id="pack-title"
                  value={editingPack?.title ?? ""}
                  onChange={(e) => setEditingPack(prev => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="e.g., Calculus I"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pack-description">Description (optional)</Label>
                <Textarea
                  id="pack-description"
                  value={editingPack?.description ?? ""}
                  onChange={(e) => setEditingPack(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="Brief description of the course"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPackDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSavePack}
                disabled={!editingPack?.title.trim() || createPack.isPending || updatePack.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Topic Dialog */}
        <Dialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTopic?.id ? "Edit Topic" : "New Topic"}
              </DialogTitle>
              <DialogDescription>
                Topics are individual units students will practice
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="topic-title">Title</Label>
                <Input
                  id="topic-title"
                  value={editingTopic?.title ?? ""}
                  onChange={(e) => setEditingTopic(prev => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="e.g., Limits and Continuity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-description">Description (optional)</Label>
                <Textarea
                  id="topic-description"
                  value={editingTopic?.description ?? ""}
                  onChange={(e) => setEditingTopic(prev => prev ? { ...prev, description: e.target.value } : null)}
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
                  onChange={(e) => setEditingTopic(prev => prev ? {
                    ...prev,
                    scheduled_date: e.target.value || null
                  } : null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTopicDialogOpen(false)}>
                Cancel
              </Button>
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

        {/* Events Viewer Dialog */}
        <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Extracted Calendar Events</DialogTitle>
              <DialogDescription>
                Review and manage events extracted from calendar images
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {calendarEvents && calendarEvents.length > 0 ? (
                Array.from({ length: maxEventWeek }, (_, i) => i + 1).map((week) => (
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
                                {getEventTypeBadge(event.event_type)}
                                <span className="font-medium">{event.title}</span>
                                {event.needs_review && (
                                  <Badge variant="outline" className="text-xs text-yellow-500">
                                    Needs Review
                                  </Badge>
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
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No events extracted yet. Upload a calendar image to get started.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{deletingItem?.name}".
                {deletingItem?.type === "pack" && " All topics in this pack will also be deleted."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </PageTransition>
  );
}

// Topic row component
function TopicRow({
  topic,
  packId,
  onEdit,
  onDelete
}: {
  topic: { id: string; title: string; description: string | null; scheduled_date?: string | null };
  packId: string;
  onEdit: (topic: EditingTopic, packId: string) => void;
  onDelete: (type: "pack" | "topic", id: string, name: string) => void;
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
          onClick={() => onEdit({
            id: topic.id,
            title: topic.title,
            description: topic.description || "",
            scheduled_date: scheduledDate,
          }, packId)}
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