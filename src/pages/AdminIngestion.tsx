import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Play,
  Trash2,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useCoursePacks } from "@/hooks/use-admin";
import { 
  useIngestionJobs, 
  useCreateIngestionJob, 
  useProcessJob, 
  useDeleteJob 
} from "@/hooks/use-ingestion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function AdminIngestion() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [deleteJob, setDeleteJob] = useState<any | null>(null);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  
  // Data
  const { data: coursePacks, isLoading: packsLoading } = useCoursePacks();
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useIngestionJobs();
  
  // Mutations
  const createJob = useCreateIngestionJob();
  const processJob = useProcessJob();
  const deleteJobMutation = useDeleteJob();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedPackId) {
      toast({ title: "Please select a course pack first", variant: "destructive" });
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Only PDF files are supported", variant: "destructive" });
      return;
    }

    try {
      const job = await createJob.mutateAsync({ coursePackId: selectedPackId, file });
      toast({ title: "PDF uploaded successfully", description: "Click 'Process' to extract questions" });
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      toast({ 
        title: "Upload failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    }
  };

  const handleProcess = async (jobId: string) => {
    setProcessingJobId(jobId);
    try {
      const result = await processJob.mutateAsync({ jobId, kind: "pdf" });
      toast({ 
        title: "Processing complete", 
        description: `Extracted ${result.questionsExtracted} questions, ${result.questionsMapped} mapped, ${result.questionsPendingReview} need review` 
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

  if (packsLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
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
              <Upload className="h-6 w-6" />
              Exam PDF Ingestion
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Upload past exam PDFs to extract and import questions
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchJobs()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </motion.div>

        {/* Upload Section */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload New PDF</CardTitle>
              <CardDescription>
                Select a course pack and upload an exam PDF to extract questions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Select value={selectedPackId} onValueChange={setSelectedPackId}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Select course pack" />
                  </SelectTrigger>
                  <SelectContent>
                    {coursePacks?.map((pack) => (
                      <SelectItem key={pack.id} value={pack.id}>
                        {pack.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className={cn(
                      "flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                      selectedPackId 
                        ? "border-primary/50 hover:border-primary hover:bg-primary/5" 
                        : "border-muted cursor-not-allowed opacity-50",
                      createJob.isPending && "pointer-events-none"
                    )}
                  >
                    {createJob.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5" />
                        <span>Choose PDF file</span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {!coursePacks?.length && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Create a course pack first in the Calendar section
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Jobs List */}
        <motion.div variants={staggerItem}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Processing Jobs</CardTitle>
              <CardDescription>
                View and manage PDF processing jobs
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
                  <p>No ingestion jobs yet</p>
                  <p className="text-sm">Upload a PDF to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card"
                    >
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
                            {job.questions_pending_review > 0 && (
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
