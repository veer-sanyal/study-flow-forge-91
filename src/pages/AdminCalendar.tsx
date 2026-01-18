import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Calendar, 
  Plus, 
  Pencil, 
  Trash2, 
  BookOpen, 
  ChevronDown,
  GripVertical,
  Save,
  X 
} from "lucide-react";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { 
  useCoursePacks, 
  useTopicsForPack, 
  useCoursePackMutations, 
  useTopicMutations 
} from "@/hooks/use-admin";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface EditingTopic {
  id: string;
  title: string;
  description: string;
  scheduled_week: number | null;
}

export default function AdminCalendar() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  
  // Data fetching
  const { data: coursePacks, isLoading: packsLoading } = useCoursePacks();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { data: topics, isLoading: topicsLoading } = useTopicsForPack(selectedPackId);
  
  // Mutations
  const { createPack, updatePack, deletePack } = useCoursePackMutations();
  const { createTopic, updateTopic, deleteTopic } = useTopicMutations();
  
  // UI state
  const [openPackIds, setOpenPackIds] = useState<Set<string>>(new Set());
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<{ id?: string; title: string; description: string } | null>(null);
  const [editingTopic, setEditingTopic] = useState<EditingTopic | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: "pack" | "topic"; id: string; name: string } | null>(null);
  const [activePackForTopic, setActivePackForTopic] = useState<string | null>(null);

  // Group topics by week
  const topicsByWeek = topics?.reduce((acc, topic) => {
    const week = topic.scheduled_week ?? 0; // 0 = unscheduled
    if (!acc[week]) acc[week] = [];
    acc[week].push(topic);
    return acc;
  }, {} as Record<number, typeof topics>) ?? {};

  const maxWeek = Math.max(...Object.keys(topicsByWeek).map(Number).filter(w => w > 0), 0);

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
          scheduled_week: editingTopic.scheduled_week,
        });
        toast({ title: "Topic updated" });
      } else {
        await createTopic.mutateAsync({
          course_pack_id: activePackForTopic,
          title: editingTopic.title,
          description: editingTopic.description || undefined,
          scheduled_week: editingTopic.scheduled_week ?? undefined,
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
    setEditingTopic({ id: "", title: "", description: "", scheduled_week: null });
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
              Manage course packs and schedule topics by week
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
                        {/* Topics by Week */}
                        {selectedPackId === pack.id && (
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
                                No topics yet. Add your first topic.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {/* Unscheduled topics */}
                                {topicsByWeek[0]?.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs">
                                        Unscheduled
                                      </Badge>
                                    </div>
                                    {topicsByWeek[0].map((topic) => (
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

                                {/* Scheduled weeks */}
                                {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => (
                                  topicsByWeek[week]?.length > 0 && (
                                    <div key={week} className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <Badge className="text-xs">
                                          Week {week}
                                        </Badge>
                                      </div>
                                      {topicsByWeek[week].map((topic) => (
                                        <TopicRow
                                          key={topic.id}
                                          topic={topic}
                                          packId={pack.id}
                                          onEdit={openEditTopic}
                                          onDelete={openDeleteConfirm}
                                        />
                                      ))}
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                          </div>
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
                  placeholder="e.g., Limits"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-description">Description (optional)</Label>
                <Textarea
                  id="topic-description"
                  value={editingTopic?.description ?? ""}
                  onChange={(e) => setEditingTopic(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="What this topic covers"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-week">Scheduled Week</Label>
                <Input
                  id="topic-week"
                  type="number"
                  min={1}
                  max={52}
                  value={editingTopic?.scheduled_week ?? ""}
                  onChange={(e) => setEditingTopic(prev => prev ? { 
                    ...prev, 
                    scheduled_week: e.target.value ? parseInt(e.target.value) : null 
                  } : null)}
                  placeholder="Leave empty for unscheduled"
                />
                <p className="text-xs text-muted-foreground">
                  The week in the semester when this topic is typically covered
                </p>
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

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deletingItem?.type === "pack" ? "Course Pack" : "Topic"}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingItem?.name}"? 
                {deletingItem?.type === "pack" && " This will also delete all topics in this pack."}
                This action cannot be undone.
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

// Topic Row Component
function TopicRow({ 
  topic, 
  packId,
  onEdit, 
  onDelete 
}: { 
  topic: { id: string; title: string; description: string | null; scheduled_week: number | null };
  packId: string;
  onEdit: (topic: EditingTopic, packId: string) => void;
  onDelete: (type: "pack" | "topic", id: string, name: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg group">
      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{topic.title}</p>
        {topic.description && (
          <p className="text-xs text-muted-foreground truncate">{topic.description}</p>
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
            scheduled_week: topic.scheduled_week,
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
