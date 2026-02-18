import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUploadMaterial, useCheckDuplicate, computeSha256 } from "@/hooks/use-materials";
import type { MaterialType } from "@/types/materials";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MaterialUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coursePacks: Array<{ id: string; title: string }>;
  preselectedCoursePackId?: string;
}

export function MaterialUploadDialog({ open, onOpenChange, coursePacks, preselectedCoursePackId }: MaterialUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; title: string; status: string } | null>(null);

  // Auto-resolve coursePackId: use preselected, or if only one course, use that
  const resolvedCoursePackId = preselectedCoursePackId || (coursePacks.length === 1 ? coursePacks[0].id : "");
  const [coursePackId, setCoursePackId] = useState<string>(resolvedCoursePackId);

  // Keep in sync when props change
  useState(() => {
    if (resolvedCoursePackId) setCoursePackId(resolvedCoursePackId);
  });

  const uploadMaterial = useUploadMaterial();
  const checkDuplicate = useCheckDuplicate();
  const { toast } = useToast();

  // Determine material type from file extension
  const detectMaterialType = (fileName: string): MaterialType => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pptx') return 'lecture_pptx';
    return 'lecture_pdf';
  };

  // Auto-generate a title from the filename
  const generateTitle = (fileName: string): string => {
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
    // Clean up common patterns to make a nice title
    return nameWithoutExt
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setDuplicateInfo(null);

    // Auto-fill title from filename
    if (!title) {
      setTitle(generateTitle(selectedFile.name));
    }

    // Check for duplicates
    const effectiveCourseId = preselectedCoursePackId || coursePackId;
    if (effectiveCourseId) {
      setIsHashing(true);
      try {
        const sha256 = await computeSha256(selectedFile);
        const duplicate = await checkDuplicate.mutateAsync({ coursePackId: effectiveCourseId, sha256 });
        if (duplicate) {
          setDuplicateInfo(duplicate);
        }
      } catch (error) {
        console.error('Error checking duplicate:', error);
      } finally {
        setIsHashing(false);
      }
    }
  }, [coursePackId, preselectedCoursePackId, title, checkDuplicate]);

  const handleUpload = async () => {
    const effectiveCourseId = preselectedCoursePackId || coursePackId;
    if (!file || !effectiveCourseId || !title) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    try {
      const sha256 = await computeSha256(file);
      const materialType = detectMaterialType(file.name);

      await uploadMaterial.mutateAsync({
        file,
        coursePackId: effectiveCourseId,
        materialType,
        title,
        sha256,
      });

      toast({
        title: "Material uploaded",
        description: "You can now analyze it to extract topics."
      });

      // Reset form
      setFile(null);
      setTitle("");
      setDuplicateInfo(null);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: String(error),
        variant: "destructive"
      });
    }
  };

  const effectiveCourseId = preselectedCoursePackId || coursePackId;
  const showCourseSelector = !preselectedCoursePackId && coursePacks.length > 1;
  const isValid = file && effectiveCourseId && title && !duplicateInfo;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Course Material</DialogTitle>
          <DialogDescription>
            Upload lecture PDFs to extract topics and generate practice questions.
            Duplicate files will be detected automatically.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Course Selection - only show if multiple courses and no preselection */}
          {showCourseSelector && (
            <div className="space-y-2">
              <Label htmlFor="course">Course *</Label>
              <Select value={coursePackId} onValueChange={setCoursePackId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {coursePacks.map(course => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="file">File *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept=".pdf,.pptx"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
            </div>
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
            {isHashing && (
              <div className="text-sm text-muted-foreground">
                Checking for duplicates...
              </div>
            )}
          </div>

          {/* Duplicate Warning */}
          {duplicateInfo && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This file already exists as <strong>"{duplicateInfo.title}"</strong>
                (Status: {duplicateInfo.status}). Upload will be blocked to avoid duplicates.
              </AlertDescription>
            </Alert>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Lecture 5 - Supply & Demand"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={!isValid || uploadMaterial.isPending}
          >
            {uploadMaterial.isPending ? (
              <>Uploading...</>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
