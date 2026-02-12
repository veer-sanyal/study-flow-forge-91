import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Loader2,
  Save,
  X,
  FileQuestion,
} from "lucide-react";
import { toast } from "sonner";
import {
  useQuestionTypesWithCounts,
  useCreateQuestionType,
  useUpdateQuestionType,
  useDeleteQuestionType,
  QuestionTypeWithCount,
} from "@/hooks/use-question-types";
import { cn } from "@/lib/utils";

// Hook for courses
function useCourses() {
  return useQuery({
    queryKey: ["courses-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_packs")
        .select("id, title")
        .order("title");

      if (error) throw error;
      return data;
    },
  });
}

// Tag input component for aliases
function AliasInput({
  aliases,
  onChange,
}: {
  aliases: string[];
  onChange: (aliases: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = inputValue.trim();
      if (value && !aliases.includes(value)) {
        onChange([...aliases, value]);
      }
      setInputValue("");
    }
  };

  const handleRemove = (alias: string) => {
    onChange(aliases.filter((a) => a !== alias));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {aliases.map((alias) => (
          <Badge
            key={alias}
            variant="secondary"
            className="gap-1 pr-1"
          >
            {alias}
            <button
              type="button"
              onClick={() => handleRemove(alias)}
              className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type and press Enter to add"
        className="h-9"
      />
      <p className="text-xs text-muted-foreground">
        Aliases help the AI match similar type names during ingestion
      </p>
    </div>
  );
}

// Question Type Editor Dialog
function QuestionTypeDialog({
  open,
  onOpenChange,
  questionType,
  courses,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionType: QuestionTypeWithCount | null;
  courses: { id: string; title: string }[];
  onSave: (data: {
    name: string;
    description: string;
    coursePackId: string;
    aliases: string[];
  }) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(questionType?.name || "");
  const [description, setDescription] = useState(questionType?.description || "");
  const [coursePackId, setCoursePackId] = useState(questionType?.course_pack_id || "");
  const [aliases, setAliases] = useState<string[]>(questionType?.aliases || []);

  // Reset form when dialog opens/closes or questionType changes
  const resetForm = () => {
    setName(questionType?.name || "");
    setDescription(questionType?.description || "");
    setCoursePackId(questionType?.course_pack_id || courses[0]?.id || "");
    setAliases(questionType?.aliases || []);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {questionType ? "Edit Question Type" : "Add Question Type"}
          </DialogTitle>
          <DialogDescription>
            Question types help categorize questions and enable filtering during study.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Multiple Choice"
            />
          </div>

          {/* Course */}
          <div className="space-y-2">
            <Label>Course *</Label>
            <Select
              value={coursePackId}
              onValueChange={setCoursePackId}
              disabled={!!questionType} // Can't change course after creation
            >
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this question type"
              rows={2}
            />
          </div>

          {/* Aliases */}
          <div className="space-y-2">
            <Label>Aliases</Label>
            <AliasInput aliases={aliases} onChange={setAliases} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({ name, description, coursePackId, aliases })
            }
            disabled={isSaving || !name.trim() || !coursePackId}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {questionType ? "Save Changes" : "Create Type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Question Type Card
function QuestionTypeCard({
  type,
  onEdit,
  onDelete,
}: {
  type: QuestionTypeWithCount;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors",
        isHovered ? "border-primary/50 bg-muted/50" : "border-border"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-lg bg-muted">
          <Tag className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{type.name}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {type.questionCount} Q
            </Badge>
          </div>
          {type.aliases && type.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {type.aliases.slice(0, 3).map((alias) => (
                <span
                  key={alias}
                  className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                >
                  {alias}
                </span>
              ))}
              {type.aliases.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{type.aliases.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isHovered && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminQuestionTypes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: types, isLoading: typesLoading } = useQuestionTypesWithCounts();
  const { data: courses, isLoading: coursesLoading } = useCourses();

  const createType = useCreateQuestionType();
  const updateType = useUpdateQuestionType();
  const deleteType = useDeleteQuestionType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<QuestionTypeWithCount | null>(null);
  const [typeToDelete, setTypeToDelete] = useState<QuestionTypeWithCount | null>(null);

  // Group types by course
  const typesByCourse = types?.reduce(
    (acc, type) => {
      const courseId = type.course_pack_id || "uncategorized";
      if (!acc[courseId]) {
        acc[courseId] = {
          courseName: type.coursePack?.title || "Uncategorized",
          types: [],
        };
      }
      acc[courseId].types.push(type);
      return acc;
    },
    {} as Record<string, { courseName: string; types: QuestionTypeWithCount[] }>
  );

  const handleOpenCreate = () => {
    setEditingType(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (type: QuestionTypeWithCount) => {
    setEditingType(type);
    setDialogOpen(true);
  };

  const handleSave = async (data: {
    name: string;
    description: string;
    coursePackId: string;
    aliases: string[];
  }) => {
    try {
      if (editingType) {
        await updateType.mutateAsync({
          id: editingType.id,
          name: data.name,
          description: data.description || null,
          aliases: data.aliases,
        });
        toast.success("Question type updated");
      } else {
        await createType.mutateAsync({
          name: data.name,
          description: data.description,
          coursePackId: data.coursePackId,
          aliases: data.aliases,
        });
        toast.success("Question type created");
      }
      setDialogOpen(false);
      setEditingType(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!typeToDelete) return;
    try {
      await deleteType.mutateAsync(typeToDelete.id);
      toast.success("Question type deleted");
      setTypeToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const isLoading = typesLoading || coursesLoading;
  const hasTypes = types && types.length > 0;

  return (
    <PageTransition>
      <div className="container max-w-4xl py-6 space-y-6">
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
            <h1 className="text-2xl font-bold">Question Types</h1>
            <p className="text-muted-foreground">
              Manage question type categories for each course
            </p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Type
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...Array(3)].map((_, j) => (
                    <Skeleton key={j} className="h-14 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !hasTypes ? (
          <Card className="p-8 text-center">
            <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No question types yet</h3>
            <p className="text-muted-foreground mb-4">
              Create question types to categorize questions during ingestion and enable filtering during study.
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Question Type
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(typesByCourse || {}).map(([courseId, { courseName, types: courseTypes }]) => (
              <Card key={courseId}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{courseName}</span>
                    <Badge variant="secondary">{courseTypes.length} types</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {courseTypes.map((type) => (
                    <QuestionTypeCard
                      key={type.id}
                      type={type}
                      onEdit={() => handleOpenEdit(type)}
                      onDelete={() => setTypeToDelete(type)}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <QuestionTypeDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          questionType={editingType}
          courses={courses || []}
          onSave={handleSave}
          isSaving={createType.isPending || updateType.isPending}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!typeToDelete}
          onOpenChange={() => setTypeToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Question Type?</AlertDialogTitle>
              <AlertDialogDescription>
                {typeToDelete?.questionCount
                  ? `This type has ${typeToDelete.questionCount} questions. Deleting it will unassign the type from those questions.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteType.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}
