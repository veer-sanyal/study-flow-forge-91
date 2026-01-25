import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUploadMaterial, useCheckDuplicate, computeSha256 } from "@/hooks/use-materials";
import { MATERIAL_TYPE_LABELS, type MaterialType } from "@/types/materials";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MaterialUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coursePacks: Array<{ id: string; title: string }>;
}

export function MaterialUploadDialog({ open, onOpenChange, coursePacks }: MaterialUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [coursePackId, setCoursePackId] = useState<string>("");
  const [materialType, setMaterialType] = useState<MaterialType>("lecture_pdf");
  const [isHashing, setIsHashing] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; title: string; status: string } | null>(null);
  
  const uploadMaterial = useUploadMaterial();
  const checkDuplicate = useCheckDuplicate();
  const { toast } = useToast();
  
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setDuplicateInfo(null);
    
    // Auto-fill title from filename
    if (!title) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^.]+$/, '');
      setTitle(nameWithoutExt);
    }
    
    // Auto-detect type from extension
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      setMaterialType('lecture_pdf');
    } else if (ext === 'pptx') {
      setMaterialType('lecture_pptx');
    }
    
    // Check for duplicates if course is selected
    if (coursePackId) {
      setIsHashing(true);
      try {
        const sha256 = await computeSha256(selectedFile);
        const duplicate = await checkDuplicate.mutateAsync({ coursePackId, sha256 });
        if (duplicate) {
          setDuplicateInfo(duplicate);
        }
      } catch (error) {
        console.error('Error checking duplicate:', error);
      } finally {
        setIsHashing(false);
      }
    }
  }, [coursePackId, title, checkDuplicate]);
  
  const handleCourseChange = useCallback(async (newCoursePackId: string) => {
    setCoursePackId(newCoursePackId);
    setDuplicateInfo(null);
    
    // Re-check duplicate with new course
    if (file && newCoursePackId) {
      setIsHashing(true);
      try {
        const sha256 = await computeSha256(file);
        const duplicate = await checkDuplicate.mutateAsync({ coursePackId: newCoursePackId, sha256 });
        if (duplicate) {
          setDuplicateInfo(duplicate);
        }
      } catch (error) {
        console.error('Error checking duplicate:', error);
      } finally {
        setIsHashing(false);
      }
    }
  }, [file, checkDuplicate]);
  
  const handleUpload = async () => {
    if (!file || !coursePackId || !title) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    
    try {
      const sha256 = await computeSha256(file);
      
      await uploadMaterial.mutateAsync({
        file,
        coursePackId,
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
      setCoursePackId("");
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
  
  const isValid = file && coursePackId && title && !duplicateInfo;
  
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
          {/* Course Selection */}
          <div className="space-y-2">
            <Label htmlFor="course">Course *</Label>
            <Select value={coursePackId} onValueChange={handleCourseChange}>
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
          
          {/* Material Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Material Type</Label>
            <Select value={materialType} onValueChange={(v) => setMaterialType(v as MaterialType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MATERIAL_TYPE_LABELS)
                  .filter(([key]) => key !== 'lecture_pptx') // PDF only for MVP
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
