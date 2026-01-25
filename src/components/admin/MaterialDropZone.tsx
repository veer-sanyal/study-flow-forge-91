import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Upload, FileText, Loader2 } from "lucide-react";

interface MaterialDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  accept?: string;
  className?: string;
}

export function MaterialDropZone({
  onFilesSelected,
  isUploading = false,
  accept = ".pdf,.pptx",
  className,
}: MaterialDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        return ext === "pdf" || ext === "pptx";
      });

      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input
      e.target.value = "";
    },
    [onFilesSelected]
  );

  return (
    <label
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        isUploading && "pointer-events-none opacity-60",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleFileInput}
        disabled={isUploading}
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin" />
          <span className="text-sm font-medium">Uploading...</span>
        </div>
      ) : isDragging ? (
        <div className="flex flex-col items-center gap-2 text-primary">
          <Upload className="h-10 w-10" />
          <span className="text-sm font-medium">Drop files here</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="h-10 w-10" />
          <div className="text-center">
            <span className="text-sm font-medium">
              Drag & drop lecture PDFs here
            </span>
            <p className="text-xs mt-1">or click to browse</p>
          </div>
        </div>
      )}
    </label>
  );
}
