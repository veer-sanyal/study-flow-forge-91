import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathRenderer } from "@/components/study/MathRenderer";

interface ChoiceEditorProps {
  id: string;
  label: string;
  text: string;
  imageUrl?: string;
  isCorrect: boolean;
  onTextChange: (text: string) => void;
  onImageUpload: (file: File) => Promise<string | undefined>;
  onImageRemove: () => void;
  onSetCorrect: () => void;
  isUploading?: boolean;
}

export function ChoiceEditor({
  id,
  label,
  text,
  imageUrl,
  isCorrect,
  onTextChange,
  onImageUpload,
  onImageRemove,
  onSetCorrect,
  isUploading = false,
}: ChoiceEditorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = isUploading || localUploading;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      setLocalUploading(true);
      try {
        await onImageUpload(files[0]);
      } finally {
        setLocalUploading(false);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalUploading(true);
      try {
        await onImageUpload(file);
      } finally {
        setLocalUploading(false);
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 p-4 transition-all",
        isCorrect
          ? "border-success/50 bg-success/5"
          : "border-border bg-card",
        isDragging && "border-primary bg-primary/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary/10 z-10">
          <div className="flex flex-col items-center gap-2 text-primary">
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-medium">Drop image here</span>
          </div>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Choice label */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            isCorrect
              ? "bg-success text-success-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {label}
        </div>

        {/* Content area */}
        <div className="flex-1 space-y-3">
          {/* Text input */}
          <Input
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Enter choice text..."
            className="w-full"
          />

          {/* Text preview */}
          {text && (
            <div className="text-sm text-muted-foreground p-2 bg-muted/50 rounded">
              <MathRenderer content={text} />
            </div>
          )}

          {/* Image section */}
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <div className="relative group">
                <img
                  src={imageUrl}
                  alt={`Choice ${label}`}
                  className="h-16 w-auto max-w-[120px] object-contain rounded border dark:invert dark:brightness-90 dark:contrast-110"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={onImageRemove}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4" />
                    Add Image
                  </>
                )}
              </Button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Correct toggle */}
        <Button
          variant={isCorrect ? "default" : "outline"}
          size="sm"
          className={cn(
            "shrink-0 gap-1",
            isCorrect && "bg-success hover:bg-success/90"
          )}
          onClick={onSetCorrect}
        >
          <Check className="h-4 w-4" />
          {isCorrect ? "Correct" : "Set Correct"}
        </Button>
      </div>
    </div>
  );
}
