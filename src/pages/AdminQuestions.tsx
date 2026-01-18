import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  FileQuestion, 
  Check, 
  X, 
  Pencil, 
  Trash2, 
  AlertCircle,
  Filter,
  ChevronDown,
  Save,
  Tag,
  BookOpen,
  Image as ImageIcon,
  Upload,
  GripVertical
} from "lucide-react";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { 
  useAllQuestions, 
  useAllTopics, 
  useUpdateQuestion, 
  useDeleteQuestion,
  useQuestionStats,
  useUploadQuestionImage,
  QuestionChoice
} from "@/hooks/use-questions";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MathRenderer } from "@/components/study/MathRenderer";

interface EditingQuestion {
  id: string;
  prompt: string;
  choices: QuestionChoice[];
  topic_ids: string[];
  difficulty: number | null;
  hint: string | null;
  source_exam: string | null;
  unmapped_topic_suggestions: string[] | null;
  midterm_number: number | null;
  question_order: number | null;
  image_url: string | null;
}

export default function AdminQuestions() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  
  // Data fetching
  const [activeTab, setActiveTab] = useState<"review" | "all">("review");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [midtermFilter, setMidtermFilter] = useState<string>("all");
  
  const { data: stats, isLoading: statsLoading } = useQuestionStats();
  const { data: reviewQuestions, isLoading: reviewLoading } = useAllQuestions({ needsReview: true });
  const { data: allQuestions, isLoading: allLoading } = useAllQuestions(
    sourceFilter !== "all" ? { sourceExam: sourceFilter } : undefined
  );
  const { data: topics } = useAllTopics();
  
  // Mutations
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const uploadImage = useUploadQuestionImage();
  
  // UI state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<{ id: string; prompt: string } | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  // Filter and group questions
  const getFilteredQuestions = () => {
    let qs = activeTab === "review" ? reviewQuestions : allQuestions;
    if (!qs) return [];
    
    if (midtermFilter !== "all") {
      const midtermNum = parseInt(midtermFilter);
      qs = qs.filter(q => q.midterm_number === midtermNum);
    }
    
    // Sort by question_order if available
    return [...qs].sort((a, b) => {
      if (a.question_order !== null && b.question_order !== null) {
        return a.question_order - b.question_order;
      }
      if (a.question_order !== null) return -1;
      if (b.question_order !== null) return 1;
      return 0;
    });
  };

  // Group questions by source_exam
  const getGroupedQuestions = () => {
    const filtered = getFilteredQuestions();
    const groups: Record<string, typeof filtered> = {};
    
    filtered.forEach(q => {
      const key = q.source_exam || "No Exam";
      if (!groups[key]) groups[key] = [];
      groups[key].push(q);
    });
    
    return groups;
  };

  const questions = getFilteredQuestions();
  const groupedQuestions = getGroupedQuestions();
  const isLoading = activeTab === "review" ? reviewLoading : allLoading;

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedQuestions(newExpanded);
  };

  const handleApprove = async (questionId: string) => {
    try {
      await updateQuestion.mutateAsync({ id: questionId, needs_review: false });
      toast({ title: "Question approved" });
    } catch (error) {
      toast({ title: "Failed to approve", variant: "destructive" });
    }
  };

  const handleEdit = (question: any) => {
    const choices = (question.choices as QuestionChoice[]) || [];
    setEditingQuestion({
      id: question.id,
      prompt: question.prompt,
      choices,
      topic_ids: question.topic_ids || [],
      difficulty: question.difficulty,
      hint: question.hint,
      source_exam: question.source_exam,
      unmapped_topic_suggestions: question.unmapped_topic_suggestions,
      midterm_number: question.midterm_number,
      question_order: question.question_order,
      image_url: question.image_url,
    });
    setEditDialogOpen(true);
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion) return;

    try {
      await updateQuestion.mutateAsync({
        id: editingQuestion.id,
        prompt: editingQuestion.prompt,
        choices: editingQuestion.choices as any,
        topic_ids: editingQuestion.topic_ids,
        difficulty: editingQuestion.difficulty,
        hint: editingQuestion.hint,
        unmapped_topic_suggestions: editingQuestion.unmapped_topic_suggestions,
        midterm_number: editingQuestion.midterm_number,
        question_order: editingQuestion.question_order,
        image_url: editingQuestion.image_url,
        needs_review: false, // Saving = approving
      });
      toast({ title: "Question saved and approved" });
      setEditDialogOpen(false);
      setEditingQuestion(null);
    } catch (error) {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletingQuestion) return;

    try {
      await deleteQuestion.mutateAsync(deletingQuestion.id);
      toast({ title: "Question deleted" });
      setDeleteDialogOpen(false);
      setDeletingQuestion(null);
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const openDeleteConfirm = (question: { id: string; prompt: string }) => {
    setDeletingQuestion(question);
    setDeleteDialogOpen(true);
  };

  const handleTopicToggle = (topicId: string) => {
    if (!editingQuestion) return;
    
    const newTopicIds = editingQuestion.topic_ids.includes(topicId)
      ? editingQuestion.topic_ids.filter(id => id !== topicId)
      : [...editingQuestion.topic_ids, topicId];
    
    setEditingQuestion({ ...editingQuestion, topic_ids: newTopicIds });
  };

  const handleChoiceTextChange = (choiceId: string, newText: string) => {
    if (!editingQuestion) return;
    
    const newChoices = editingQuestion.choices.map(c => 
      c.id === choiceId ? { ...c, text: newText } : c
    );
    setEditingQuestion({ ...editingQuestion, choices: newChoices });
  };

  const handleCorrectAnswerChange = (choiceId: string) => {
    if (!editingQuestion) return;
    
    const newChoices = editingQuestion.choices.map(c => ({
      ...c,
      isCorrect: c.id === choiceId
    }));
    setEditingQuestion({ ...editingQuestion, choices: newChoices });
  };

  const getTopicName = (topicId: string) => {
    const topic = topics?.find(t => t.id === topicId);
    return topic?.title || topicId.slice(0, 8) + "...";
  };

  const handleImageDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, questionId: string) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) {
      toast({ title: "Please drop an image file", variant: "destructive" });
      return;
    }

    try {
      const url = await uploadImage.mutateAsync({ questionId, file });
      if (editingQuestion?.id === questionId) {
        setEditingQuestion({ ...editingQuestion, image_url: url });
      }
      toast({ title: "Image uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload image", variant: "destructive" });
    }
  }, [uploadImage, editingQuestion, toast]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingQuestion || !e.target.files?.[0]) return;
    
    const file = e.target.files[0];
    try {
      const url = await uploadImage.mutateAsync({ questionId: editingQuestion.id, file });
      setEditingQuestion({ ...editingQuestion, image_url: url });
      toast({ title: "Image uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload image", variant: "destructive" });
    }
  };

  if (statsLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-64" />
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
        <motion.div variants={staggerItem} className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileQuestion className="h-6 w-6" />
              Question Review
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review, edit, and approve extracted questions
            </p>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div variants={staggerItem} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Needs Review</CardDescription>
              <CardTitle className="text-3xl text-yellow-500">{stats?.needsReview || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-3xl text-green-500">{stats?.approved || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Questions</CardDescription>
              <CardTitle className="text-3xl">{stats?.total || 0}</CardTitle>
            </CardHeader>
          </Card>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={staggerItem}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "review" | "all")}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <TabsList>
                <TabsTrigger value="review">
                  Needs Review
                  {stats?.needsReview ? (
                    <Badge variant="secondary" className="ml-2">{stats.needsReview}</Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="all">All Questions</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                {/* Midterm filter */}
                <Select value={midtermFilter} onValueChange={setMidtermFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Midterm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Midterms</SelectItem>
                    <SelectItem value="1">Midterm 1</SelectItem>
                    <SelectItem value="2">Midterm 2</SelectItem>
                    <SelectItem value="3">Midterm 3</SelectItem>
                  </SelectContent>
                </Select>

                {/* Source exam filter */}
                {activeTab === "all" && stats?.sourceExams && stats.sourceExams.length > 0 && (
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-48">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by exam" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Exams</SelectItem>
                      {stats.sourceExams.map(exam => (
                        <SelectItem key={exam} value={exam}>{exam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <TabsContent value="review" className="mt-0">
              {sourceFilter === "all" ? (
                <GroupedQuestionsList
                  groupedQuestions={groupedQuestions}
                  isLoading={isLoading}
                  expandedQuestions={expandedQuestions}
                  onToggleExpand={toggleExpanded}
                  onApprove={handleApprove}
                  onEdit={handleEdit}
                  onDelete={openDeleteConfirm}
                  getTopicName={getTopicName}
                  showReviewBadge={false}
                />
              ) : (
                <QuestionsList
                  questions={questions}
                  isLoading={isLoading}
                  expandedQuestions={expandedQuestions}
                  onToggleExpand={toggleExpanded}
                  onApprove={handleApprove}
                  onEdit={handleEdit}
                  onDelete={openDeleteConfirm}
                  getTopicName={getTopicName}
                  showReviewBadge={false}
                />
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-0">
              {sourceFilter === "all" ? (
                <GroupedQuestionsList
                  groupedQuestions={groupedQuestions}
                  isLoading={isLoading}
                  expandedQuestions={expandedQuestions}
                  onToggleExpand={toggleExpanded}
                  onApprove={handleApprove}
                  onEdit={handleEdit}
                  onDelete={openDeleteConfirm}
                  getTopicName={getTopicName}
                  showReviewBadge={true}
                />
              ) : (
                <QuestionsList
                  questions={questions}
                  isLoading={isLoading}
                  expandedQuestions={expandedQuestions}
                  onToggleExpand={toggleExpanded}
                  onApprove={handleApprove}
                  onEdit={handleEdit}
                  onDelete={openDeleteConfirm}
                  getTopicName={getTopicName}
                  showReviewBadge={true}
                />
              )}
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Question</DialogTitle>
              <DialogDescription>
                Edit the question details and map to topics
              </DialogDescription>
            </DialogHeader>
            
            {editingQuestion && (
              <div className="space-y-6 py-4">
                {/* Unmapped suggestions warning */}
                {editingQuestion.unmapped_topic_suggestions && editingQuestion.unmapped_topic_suggestions.length > 0 && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-500">Unmapped topic suggestions:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {editingQuestion.unmapped_topic_suggestions.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Image Upload with Drag & Drop */}
                <div className="space-y-2">
                  <Label>Question Image</Label>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-4 transition-colors",
                      isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/30",
                      "cursor-pointer hover:border-primary/50"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => handleImageDrop(e, editingQuestion.id)}
                  >
                    {editingQuestion.image_url ? (
                      <div className="space-y-2">
                        <img 
                          src={editingQuestion.image_url} 
                          alt="Question" 
                          className="max-h-48 rounded object-contain mx-auto"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingQuestion({ ...editingQuestion, image_url: null })}
                          className="w-full"
                        >
                          Remove Image
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 cursor-pointer">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Drag & drop an image or click to upload
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Midterm Number & Question Order */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Midterm Number</Label>
                    <Select
                      value={editingQuestion.midterm_number?.toString() || "none"}
                      onValueChange={(v) => setEditingQuestion({
                        ...editingQuestion,
                        midterm_number: v === "none" ? null : parseInt(v)
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select midterm" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        <SelectItem value="1">Midterm 1</SelectItem>
                        <SelectItem value="2">Midterm 2</SelectItem>
                        <SelectItem value="3">Midterm 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Question Order</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editingQuestion.question_order ?? ""}
                      onChange={(e) => setEditingQuestion({
                        ...editingQuestion,
                        question_order: e.target.value ? parseInt(e.target.value) : null
                      })}
                      placeholder="e.g. 1, 2, 3..."
                    />
                  </div>
                </div>

                {/* Prompt */}
                <div className="space-y-2">
                  <Label>Question Prompt</Label>
                  <Textarea
                    value={editingQuestion.prompt}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, prompt: e.target.value })}
                    rows={3}
                  />
                  <div className="p-2 bg-muted rounded text-sm">
                    <MathRenderer content={editingQuestion.prompt} />
                  </div>
                </div>

                {/* Choices */}
                <div className="space-y-2">
                  <Label>Answer Choices</Label>
                  <div className="space-y-2">
                    {editingQuestion.choices.map((choice) => (
                      <div key={choice.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={choice.isCorrect}
                          onCheckedChange={() => handleCorrectAnswerChange(choice.id)}
                        />
                        <Input
                          value={choice.text}
                          onChange={(e) => handleChoiceTextChange(choice.id, e.target.value)}
                          className={cn(choice.isCorrect && "border-green-500")}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Check the correct answer</p>
                </div>

                {/* Topics */}
                <div className="space-y-2">
                  <Label>Topics</Label>
                  <div className="flex flex-wrap gap-2 p-3 border rounded-lg max-h-40 overflow-y-auto">
                    {topics?.map(topic => (
                      <Badge
                        key={topic.id}
                        variant={editingQuestion.topic_ids.includes(topic.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleTopicToggle(topic.id)}
                      >
                        {topic.title}
                        {topic.course_packs && (
                          <span className="text-xs opacity-70 ml-1">
                            ({topic.course_packs.title})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Difficulty */}
                <div className="space-y-2">
                  <Label>Difficulty (1-5)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={editingQuestion.difficulty ?? ""}
                    onChange={(e) => setEditingQuestion({ 
                      ...editingQuestion, 
                      difficulty: e.target.value ? parseInt(e.target.value) : null 
                    })}
                  />
                </div>

                {/* Hint */}
                <div className="space-y-2">
                  <Label>Hint (optional)</Label>
                  <Textarea
                    value={editingQuestion.hint ?? ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, hint: e.target.value || null })}
                    rows={2}
                    placeholder="A helpful hint for students..."
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveQuestion} disabled={updateQuestion.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save & Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Question?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this question. This action cannot be undone.
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

// Grouped Questions List by Exam
function GroupedQuestionsList({
  groupedQuestions,
  isLoading,
  expandedQuestions,
  onToggleExpand,
  onApprove,
  onEdit,
  onDelete,
  getTopicName,
  showReviewBadge,
}: {
  groupedQuestions: Record<string, any[]>;
  isLoading: boolean;
  expandedQuestions: Set<string>;
  onToggleExpand: (id: string) => void;
  onApprove: (id: string) => void;
  onEdit: (question: any) => void;
  onDelete: (question: { id: string; prompt: string }) => void;
  getTopicName: (id: string) => string;
  showReviewBadge: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const examNames = Object.keys(groupedQuestions);
  if (examNames.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Check className="h-12 w-12 text-green-500/50 mb-4" />
          <h3 className="font-medium text-lg">All caught up!</h3>
          <p className="text-muted-foreground text-sm mt-1">
            No questions to review
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {examNames.map(examName => (
        <div key={examName} className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">{examName}</h2>
            <Badge variant="secondary">{groupedQuestions[examName].length}</Badge>
          </div>
          <div className="space-y-3 pl-2 border-l-2 border-primary/20">
            {groupedQuestions[examName].map(question => (
              <QuestionCard
                key={question.id}
                question={question}
                isExpanded={expandedQuestions.has(question.id)}
                onToggleExpand={onToggleExpand}
                onApprove={onApprove}
                onEdit={onEdit}
                onDelete={onDelete}
                getTopicName={getTopicName}
                showReviewBadge={showReviewBadge}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Questions list component
function QuestionsList({
  questions,
  isLoading,
  expandedQuestions,
  onToggleExpand,
  onApprove,
  onEdit,
  onDelete,
  getTopicName,
  showReviewBadge,
}: {
  questions: any[] | undefined;
  isLoading: boolean;
  expandedQuestions: Set<string>;
  onToggleExpand: (id: string) => void;
  onApprove: (id: string) => void;
  onEdit: (question: any) => void;
  onDelete: (question: { id: string; prompt: string }) => void;
  getTopicName: (id: string) => string;
  showReviewBadge: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (!questions?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Check className="h-12 w-12 text-green-500/50 mb-4" />
          <h3 className="font-medium text-lg">All caught up!</h3>
          <p className="text-muted-foreground text-sm mt-1">
            No questions to review
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map(question => (
        <QuestionCard
          key={question.id}
          question={question}
          isExpanded={expandedQuestions.has(question.id)}
          onToggleExpand={onToggleExpand}
          onApprove={onApprove}
          onEdit={onEdit}
          onDelete={onDelete}
          getTopicName={getTopicName}
          showReviewBadge={showReviewBadge}
        />
      ))}
    </div>
  );
}

// Individual Question Card
function QuestionCard({
  question,
  isExpanded,
  onToggleExpand,
  onApprove,
  onEdit,
  onDelete,
  getTopicName,
  showReviewBadge,
}: {
  question: any;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onApprove: (id: string) => void;
  onEdit: (question: any) => void;
  onDelete: (question: { id: string; prompt: string }) => void;
  getTopicName: (id: string) => string;
  showReviewBadge: boolean;
}) {
  return (
    <Card className={cn(question.needs_review && "border-yellow-500/30")}>
      <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand(question.id)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {question.question_order && (
                    <Badge variant="outline" className="text-xs font-mono">
                      #{question.question_order}
                    </Badge>
                  )}
                  {showReviewBadge && question.needs_review && (
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Review
                    </Badge>
                  )}
                  {question.midterm_number && (
                    <Badge variant="default" className="text-xs">
                      Midterm {question.midterm_number}
                    </Badge>
                  )}
                  {question.source_exam && (
                    <Badge variant="secondary" className="text-xs">
                      {question.source_exam}
                    </Badge>
                  )}
                  {question.difficulty && (
                    <Badge variant="outline" className="text-xs">
                      Diff: {question.difficulty}
                    </Badge>
                  )}
                  {question.image_url && (
                    <Badge variant="outline" className="text-xs">
                      <ImageIcon className="h-3 w-3 mr-1" />
                      Image
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium line-clamp-2">
                  <MathRenderer content={question.prompt} />
                </p>
              </div>
              <ChevronDown className={cn(
                "h-5 w-5 text-muted-foreground transition-transform shrink-0",
                isExpanded && "rotate-180"
              )} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Image preview */}
            {question.image_url && (
              <div className="rounded-lg overflow-hidden border">
                <img src={question.image_url} alt="Question" className="max-h-48 object-contain mx-auto" />
              </div>
            )}

            {/* Choices */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Choices:</p>
              <div className="grid gap-2">
                {(question.choices as QuestionChoice[])?.map(choice => (
                  <div
                    key={choice.id}
                    className={cn(
                      "p-2 rounded-md text-sm",
                      choice.isCorrect 
                        ? "bg-green-500/10 border border-green-500/30" 
                        : "bg-muted/50"
                    )}
                  >
                    <MathRenderer content={choice.text} />
                    {choice.isCorrect && (
                      <Badge className="ml-2 text-xs bg-green-500">Correct</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Topics */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Topics:</p>
              <div className="flex flex-wrap gap-1">
                {question.topic_ids?.length > 0 ? (
                  question.topic_ids.map((topicId: string) => (
                    <Badge key={topicId} variant="secondary" className="text-xs">
                      <Tag className="h-3 w-3 mr-1" />
                      {getTopicName(topicId)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No topics assigned</span>
                )}
              </div>
            </div>

            {/* Unmapped suggestions */}
            {question.unmapped_topic_suggestions?.length > 0 && (
              <div className="p-2 bg-yellow-500/10 rounded-md">
                <p className="text-xs font-medium text-yellow-500 mb-1">Unmapped suggestions:</p>
                <div className="flex flex-wrap gap-1">
                  {question.unmapped_topic_suggestions.map((s: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
              {question.needs_review && (
                <Button size="sm" onClick={() => onApprove(question.id)}>
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onEdit(question)}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-destructive"
                onClick={() => onDelete({ id: question.id, prompt: question.prompt })}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
