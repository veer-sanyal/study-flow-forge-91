import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Play,
  Trash2,
  RefreshCw,
  Server,
  Wand2,
  ExternalLink,
  AlertTriangle,
  Timer,
  Zap,
} from "lucide-react";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  useIngestionJobs, 
  useProcessJob, 
  useDeleteJob,
  useIngestionProgress 
} from "@/hooks/use-ingestion";
import { useAnalysisProgress } from "@/hooks/use-analysis-progress";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

// Ingestion Progress Card Component
function IngestionProgressCard() {
  const navigate = useNavigate();
  const { activeJob, processingJobs } = useIngestionProgress();
  
  const [now, setNow] = useState(Date.now());

  // Update elapsed time every second
  useEffect(() => {
    if (!activeJob || activeJob.status !== "processing") return;
    
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeJob]);

  if (!activeJob) return null;

  const progressPercent = activeJob.progress_pct || 0;
  const isCompleted = activeJob.status === "completed";
  const isFailed = activeJob.status === "failed";
  const startTime = activeJob.created_at ? new Date(activeJob.created_at).getTime() : now;
  const currentElapsed = now - startTime;

  const handleViewExam = () => {
    if (!activeJob.course_pack_id || !activeJob.exam_year || !activeJob.exam_semester) return;
    
    const parts: string[] = [];
    if (activeJob.exam_semester && activeJob.exam_year) {
      parts.push(`${activeJob.exam_semester} ${activeJob.exam_year}`);
    }
    if (activeJob.exam_type) {
      const type = activeJob.exam_type === "f" ? "Final" : `Midterm ${activeJob.exam_type}`;
      parts.push(type);
    }
    const sourceExam = encodeURIComponent(parts.join(" ") || activeJob.file_name);
    navigate(`/admin/questions/${activeJob.course_pack_id}/${sourceExam}`);
  };

  return (
    <motion.div
      variants={staggerItem}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card className={`border-2 ${isCompleted ? 'border-green-500/50 bg-green-500/5' : isFailed ? 'border-destructive/50 bg-destructive/5' : 'border-blue-500/50 bg-blue-500/5'}`}>
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${isCompleted ? 'bg-green-500/20' : isFailed ? 'bg-destructive/20' : 'bg-blue-500/20'}`}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : isFailed ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  ) : (
                    <FileText className="h-5 w-5 text-blue-500 animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">
                      {isCompleted ? "Extraction Complete" : isFailed ? "Extraction Failed" : "Extracting Questions"}
                    </h3>
                    <Badge variant={isCompleted ? "default" : isFailed ? "destructive" : "secondary"} className={isCompleted ? "bg-green-500" : ""}>
                      {isCompleted ? "Done" : isFailed ? "Failed" : "In Progress"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-xs">
                    {activeJob.file_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isCompleted && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleViewExam}
                    className="gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Exam
                  </Button>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Step: {activeJob.current_step || "Starting..."}
                </span>
                <span className="text-muted-foreground">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              {/* Elapsed Time */}
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-muted">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Elapsed</p>
                  <p className="font-medium text-sm">{formatDuration(currentElapsed)}</p>
                </div>
              </div>

              {/* Questions Extracted */}
              {activeJob.questions_extracted !== null && (
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Questions</p>
                    <p className="font-medium text-sm">{activeJob.questions_extracted}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {isFailed && activeJob.error_message && (
              <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">{activeJob.error_message}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Helper to format time in human readable format
function formatDuration(ms: number): string {
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// Analysis Progress Card Component
function AnalysisProgressCard() {
  const navigate = useNavigate();
  const { 
    progress, 
    elapsedMs, 
    avgTimePerQuestion, 
    estimatedRemainingMs, 
    remainingQuestions,
    cancelAnalysis,
  } = useAnalysisProgress();
  
  const [now, setNow] = useState(Date.now());

  // Update elapsed time every second
  useEffect(() => {
    if (!progress || progress.status !== "running") return;
    
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [progress]);

  if (!progress) return null;

  const progressPercent = progress.total_questions > 0 
    ? ((progress.completed_questions + progress.failed_questions) / progress.total_questions) * 100 
    : 0;

  const isCompleted = progress.status === "completed";
  const isFailed = progress.status === "failed";
  const currentElapsed = progress.started_at ? now - new Date(progress.started_at).getTime() : elapsedMs;

  const handleViewExam = () => {
    const encodedExam = encodeURIComponent(progress.source_exam);
    navigate(`/admin/questions/${progress.course_pack_id}/${encodedExam}`);
  };

  const handleDismiss = () => {
    if (progress?.id) {
      cancelAnalysis.mutate(progress.id);
    }
  };

  return (
    <motion.div
      variants={staggerItem}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card className={`border-2 ${isCompleted ? 'border-green-500/50 bg-green-500/5' : isFailed ? 'border-destructive/50 bg-destructive/5' : 'border-primary/50 bg-primary/5'}`}>
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${isCompleted ? 'bg-green-500/20' : isFailed ? 'bg-destructive/20' : 'bg-primary/20'}`}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : isFailed ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Wand2 className="h-5 w-5 text-primary animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">
                      {isCompleted ? "Analysis Complete" : isFailed ? "Analysis Failed" : "Analyzing Questions"}
                    </h3>
                    <Badge variant={isCompleted ? "default" : isFailed ? "destructive" : "secondary"} className={isCompleted ? "bg-green-500" : ""}>
                      {isCompleted ? "Done" : isFailed ? "Failed" : "In Progress"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {progress.source_exam}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleViewExam}
                  className="gap-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Exam
                </Button>
                {(isCompleted || isFailed) && (
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={handleDismiss}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {progress.completed_questions + progress.failed_questions} / {progress.total_questions} questions
                </span>
                <span className="text-muted-foreground">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {/* Current Question Preview (only when analyzing) */}
            {!isCompleted && !isFailed && progress.current_question_prompt && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Currently analyzing
                </div>
                <p className="text-sm line-clamp-2">
                  {progress.current_question_prompt}...
                </p>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* Elapsed Time */}
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-muted">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Elapsed</p>
                  <p className="font-medium text-sm">{formatDuration(currentElapsed)}</p>
                </div>
              </div>

              {/* Average Time */}
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-muted">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg/Question</p>
                  <p className="font-medium text-sm">
                    {avgTimePerQuestion > 0 ? formatDuration(avgTimePerQuestion) : "—"}
                  </p>
                </div>
              </div>

              {/* Estimated Remaining */}
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Est. Remaining</p>
                  <p className="font-medium text-sm">
                    {!isCompleted && !isFailed && estimatedRemainingMs > 0 
                      ? `~${formatDuration(estimatedRemainingMs)}` 
                      : "—"
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Errors Warning */}
            {progress.failed_questions > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">
                  {progress.failed_questions} question{progress.failed_questions > 1 ? 's' : ''} failed to analyze
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function AdminIngestion() {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // State
  const [deleteJob, setDeleteJob] = useState<any | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  
  // Data
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useIngestionJobs();
  const { progress: analysisProgress } = useAnalysisProgress();
  
  // Mutations
  const processJob = useProcessJob();
  const deleteJobMutation = useDeleteJob();

  const handleProcess = async (jobId: string) => {
    setProcessingJobId(jobId);
    try {
      const result = await processJob.mutateAsync({ jobId, kind: "pdf" });
      toast({ 
        title: "Processing complete", 
        description: `Extracted ${result.questionsExtracted} questions` 
      });
    } catch (error) {
      toast({ 
        title: "Processing failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setProcessingJobId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteJob) return;
    try {
      await deleteJobMutation.mutateAsync(deleteJob);
      toast({ title: "Job deleted" });
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleteJob(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "processing":
        return <Badge variant="default" className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleViewExam = (job: any) => {
    if (!job.course_pack_id || !job.exam_year || !job.exam_semester) return;
    
    // Build the source_exam string to navigate to the questions page
    const parts: string[] = [];
    if (job.exam_semester && job.exam_year) {
      parts.push(`${job.exam_semester} ${job.exam_year}`);
    }
    if (job.exam_type) {
      const type = job.exam_type === "f" ? "Final" : `Midterm ${job.exam_type}`;
      parts.push(type);
    }
    const sourceExam = encodeURIComponent(parts.join(" ") || job.file_name);
    navigate(`/admin/questions/${job.course_pack_id}/${sourceExam}`);
  };

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
              <Server className="h-6 w-6" />
              Advanced Queue Monitor
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track background processing jobs and their status
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchJobs()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </motion.div>

        {/* Ingestion Progress Card (PDF extraction) */}
        <IngestionProgressCard />

        {/* Analysis Progress Card */}
        {analysisProgress && <AnalysisProgressCard />}

        {/* Jobs List */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Processing Jobs</CardTitle>
              <CardDescription>
                Monitor PDF extraction and calendar processing jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : !jobs?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No processing jobs</p>
                  <p className="text-sm">Upload PDFs from the course questions page</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">{job.file_name}</span>
                            {getStatusBadge(job.status)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span>{job.course_packs?.title || "Unknown pack"}</span>
                            <span className="mx-2">•</span>
                            <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                          </div>
                          
                          {job.status === "processing" && (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span>Step: {job.current_step || "..."}</span>
                                <span>{job.progress_pct}%</span>
                              </div>
                              <Progress value={job.progress_pct || 0} className="h-1.5" />
                            </div>
                          )}

                          {job.status === "completed" && (
                            <div className="mt-2 flex gap-4 text-sm">
                              <span className="text-green-600">
                                ✓ {job.questions_extracted} extracted
                              </span>
                              <span className="text-blue-600">
                                {job.questions_mapped} mapped
                              </span>
                              {(job.questions_pending_review ?? 0) > 0 && (
                                <span className="text-amber-600">
                                  {job.questions_pending_review} need review
                                </span>
                              )}
                            </div>
                          )}

                          {job.status === "failed" && job.error_message && (
                            <div className="mt-2 text-sm text-destructive">
                              {job.error_message}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {job.status === "completed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewExam(job)}
                            >
                              View Questions
                            </Button>
                          )}
                          
                          {job.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => handleProcess(job.id)}
                              disabled={processingJobId === job.id}
                            >
                              {processingJobId === job.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              <span className="ml-1">Process</span>
                            </Button>
                          )}
                          
                          {job.status === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleProcess(job.id)}
                              disabled={processingJobId === job.id}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteJob(job)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteJob} onOpenChange={() => setDeleteJob(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Job?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteJob?.file_name}"? 
                This will remove the uploaded PDF. Extracted questions will remain in the database.
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
