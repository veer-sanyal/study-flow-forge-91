import { useState } from "react";
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
  Server
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
  useDeleteJob 
} from "@/hooks/use-ingestion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function AdminIngestion() {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // State
  const [deleteJob, setDeleteJob] = useState<any | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  
  // Data
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useIngestionJobs();
  
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