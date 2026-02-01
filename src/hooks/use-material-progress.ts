import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MaterialJob {
  id: string;
  material_id: string;
  job_type: "analysis" | "generation";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  
  // Analysis-specific
  analysis_phase: "chunk_summarization" | "outline" | "topic_extraction" | null;
  total_chunks: number;
  completed_chunks: number;
  
  // Generation-specific
  total_topics: number;
  completed_topics: number;
  total_questions: number;
  completed_questions: number;
  
  // Current progress
  current_item: string | null;
  progress_message: string | null;
  error_message: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  
  // Joined data
  course_materials?: { title: string; course_pack_id: string } | null;
}

export function useMaterialProgress() {
  const [activeJobs, setActiveJobs] = useState<MaterialJob[]>([]);
  const queryClient = useQueryClient();

  // Fetch active material jobs
  const { data: jobs } = useQuery({
    queryKey: ["material-jobs-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_jobs")
        .select("*, course_materials(title, course_pack_id)")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as MaterialJob[]) || [];
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("material-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_jobs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["material-jobs-active"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Update active jobs when data changes
  useEffect(() => {
    if (jobs) {
      setActiveJobs(jobs);
    } else {
      setActiveJobs([]);
    }
  }, [jobs]);

  // Get analysis jobs
  const analysisJobs = activeJobs.filter(j => j.job_type === "analysis");
  const generationJobs = activeJobs.filter(j => j.job_type === "generation");

  // Calculate progress for a job
  const getProgress = (job: MaterialJob) => {
    if (job.job_type === "analysis") {
      if (job.analysis_phase === "chunk_summarization") {
        return job.total_chunks > 0 ? (job.completed_chunks / job.total_chunks) * 33 : 0;
      } else if (job.analysis_phase === "outline") {
        return 33 + (job.total_topics > 0 ? (job.completed_topics / job.total_topics) * 33 : 0);
      } else if (job.analysis_phase === "topic_extraction") {
        return 66 + (job.total_topics > 0 ? (job.completed_topics / job.total_topics) * 34 : 0);
      }
      return 0;
    } else {
      // Generation
      return job.total_topics > 0 ? (job.completed_topics / job.total_topics) * 100 : 0;
    }
  };

  return {
    activeJobs,
    analysisJobs,
    generationJobs,
    getProgress,
    hasActiveJobs: activeJobs.length > 0,
  };
}
