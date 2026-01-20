import { useState, useEffect, useCallback } from "react";

export interface AnalysisProgress {
  examName: string;
  coursePackTitle: string;
  coursePackId: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestionPrompt: string;
  startedAt: number;
  status: "analyzing" | "completed" | "cancelled";
  errorsCount: number;
  lastAnalyzedQuestion: string | null;
}

const STORAGE_KEY = "analysis-progress";
const CHANNEL_NAME = "analysis-progress-channel";

// Helper to get progress from localStorage
function getStoredProgress(): AnalysisProgress | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const progress = JSON.parse(stored) as AnalysisProgress;
    // Clear stale progress (older than 1 hour)
    if (Date.now() - progress.startedAt > 3600000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return progress;
  } catch {
    return null;
  }
}

// Helper to set progress to localStorage
function setStoredProgress(progress: AnalysisProgress | null) {
  if (progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useAnalysisProgress() {
  const [progress, setProgress] = useState<AnalysisProgress | null>(getStoredProgress);

  // Listen for cross-tab updates via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type: string; progress: AnalysisProgress | null };
      if (data.type === "progress-update") {
        setProgress(data.progress);
      }
    };

    channel.addEventListener("message", handleMessage);
    
    // Also listen for storage events (fallback for browsers without BroadcastChannel)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setProgress(event.newValue ? JSON.parse(event.newValue) : null);
      }
    };
    
    window.addEventListener("storage", handleStorage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      channel.close();
    };
  }, []);

  // Broadcast update to other tabs
  const broadcastUpdate = useCallback((newProgress: AnalysisProgress | null) => {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: "progress-update", progress: newProgress });
      channel.close();
    } catch {
      // BroadcastChannel not supported, rely on storage event
    }
  }, []);

  const startAnalysis = useCallback((params: {
    examName: string;
    coursePackTitle: string;
    coursePackId: string;
    totalQuestions: number;
  }) => {
    const newProgress: AnalysisProgress = {
      examName: params.examName,
      coursePackTitle: params.coursePackTitle,
      coursePackId: params.coursePackId,
      currentQuestionIndex: 0,
      totalQuestions: params.totalQuestions,
      currentQuestionPrompt: "",
      startedAt: Date.now(),
      status: "analyzing",
      errorsCount: 0,
      lastAnalyzedQuestion: null,
    };
    setStoredProgress(newProgress);
    setProgress(newProgress);
    broadcastUpdate(newProgress);
  }, [broadcastUpdate]);

  const updateProgress = useCallback((params: {
    currentQuestionIndex: number;
    currentQuestionPrompt: string;
    errorsCount?: number;
  }) => {
    setProgress((prev) => {
      if (!prev) return null;
      const updated: AnalysisProgress = {
        ...prev,
        currentQuestionIndex: params.currentQuestionIndex,
        currentQuestionPrompt: params.currentQuestionPrompt,
        lastAnalyzedQuestion: params.currentQuestionPrompt,
        errorsCount: params.errorsCount ?? prev.errorsCount,
      };
      setStoredProgress(updated);
      broadcastUpdate(updated);
      return updated;
    });
  }, [broadcastUpdate]);

  const incrementErrors = useCallback(() => {
    setProgress((prev) => {
      if (!prev) return null;
      const updated: AnalysisProgress = {
        ...prev,
        errorsCount: prev.errorsCount + 1,
      };
      setStoredProgress(updated);
      broadcastUpdate(updated);
      return updated;
    });
  }, [broadcastUpdate]);

  const completeAnalysis = useCallback(() => {
    setProgress((prev) => {
      if (!prev) return null;
      const updated: AnalysisProgress = {
        ...prev,
        status: "completed",
        currentQuestionIndex: prev.totalQuestions,
      };
      setStoredProgress(updated);
      broadcastUpdate(updated);
      // Auto-clear after 10 seconds
      setTimeout(() => {
        clearAnalysis();
      }, 10000);
      return updated;
    });
  }, [broadcastUpdate]);

  const clearAnalysis = useCallback(() => {
    setStoredProgress(null);
    setProgress(null);
    broadcastUpdate(null);
  }, [broadcastUpdate]);

  // Calculate derived values
  const elapsedMs = progress ? Date.now() - progress.startedAt : 0;
  const avgTimePerQuestion = progress && progress.currentQuestionIndex > 0 
    ? elapsedMs / progress.currentQuestionIndex 
    : 0;
  const remainingQuestions = progress 
    ? progress.totalQuestions - progress.currentQuestionIndex 
    : 0;
  const estimatedRemainingMs = avgTimePerQuestion * remainingQuestions;

  return {
    progress,
    startAnalysis,
    updateProgress,
    incrementErrors,
    completeAnalysis,
    clearAnalysis,
    // Derived values
    elapsedMs,
    avgTimePerQuestion,
    estimatedRemainingMs,
    remainingQuestions,
  };
}
