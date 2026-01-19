import { useState } from "react";
import { Loader2 } from "lucide-react";

interface QuestionImageProps {
  src: string;
  alt?: string;
  isProcessing?: boolean;
  className?: string;
}

/**
 * A square-framed image container that:
 * 1. Centers the image within an aspect-square frame
 * 2. Adapts colors for dark mode using CSS invert (for line drawings)
 * 3. Shows loading state during processing
 */
export function QuestionImage({ 
  src, 
  alt = "Question diagram", 
  isProcessing = false,
  className = ""
}: QuestionImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  return (
    <div 
      className={`w-full max-w-sm mx-auto flex items-center justify-center relative ${className}`}
    >
      {(isProcessing || isLoading) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <img 
        src={src} 
        alt={alt}
        className={`max-w-full max-h-64 object-contain transition-opacity duration-200
          dark:invert dark:brightness-90 dark:contrast-110
          ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
