import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CourseMaterial, CourseEdition, MaterialChunk, Objective, MaterialType } from "@/types/materials";

// =====================================================
// COURSE EDITIONS
// =====================================================

export function useCourseEditions(coursePackId: string | null) {
  return useQuery({
    queryKey: ["course-editions", coursePackId],
    queryFn: async () => {
      if (!coursePackId) return [];
      
      const { data, error } = await supabase
        .from("course_editions")
        .select("*")
        .eq("course_pack_id", coursePackId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as CourseEdition[];
    },
    enabled: !!coursePackId,
  });
}

export function useCreateCourseEdition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      course_pack_id: string;
      term?: string;
      instructor?: string;
      section?: string;
    }) => {
      const { data: edition, error } = await supabase
        .from("course_editions")
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return edition as CourseEdition;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["course-editions", variables.course_pack_id] });
    },
  });
}

// =====================================================
// COURSE MATERIALS
// =====================================================

export function useCourseMaterials(coursePackId: string | null) {
  return useQuery({
    queryKey: ["course-materials", coursePackId],
    queryFn: async () => {
      if (!coursePackId) return [];

      const { data, error } = await supabase
        .from("course_materials")
        .select("*")
        .eq("course_pack_id", coursePackId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as CourseMaterial[];
    },
    enabled: !!coursePackId,
  });
}

export function useAllCourseMaterials() {
  return useQuery({
    queryKey: ["course-materials", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_materials")
        .select("*, course_packs(title)")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as (CourseMaterial & { course_packs: { title: string } | null })[];
    },
  });
}

export function useMaterialById(materialId: string | null) {
  return useQuery({
    queryKey: ["course-material", materialId],
    queryFn: async () => {
      if (!materialId) return null;
      
      const { data, error } = await supabase
        .from("course_materials")
        .select("*, course_packs(title)")
        .eq("id", materialId)
        .single();
      
      if (error) throw error;
      return data as unknown as CourseMaterial & { course_packs: { title: string } | null };
    },
    enabled: !!materialId,
  });
}

// Check for duplicate by SHA256
export function useCheckDuplicate() {
  return useMutation({
    mutationFn: async ({ coursePackId, sha256 }: { coursePackId: string; sha256: string }) => {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id, title, status")
        .eq("course_pack_id", coursePackId)
        .eq("sha256", sha256)
        .maybeSingle();
      
      if (error) throw error;
      return data as { id: string; title: string; status: string } | null;
    },
  });
}

// Upload material
export function useUploadMaterial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      file,
      coursePackId,
      editionId,
      materialType,
      title,
      sha256,
    }: {
      file: File;
      coursePackId: string;
      editionId?: string;
      materialType: MaterialType;
      title: string;
      sha256: string;
    }) => {
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const storagePath = `${coursePackId}/${editionId || 'default'}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('course-materials')
        .upload(storagePath, file);
      
      if (uploadError) throw uploadError;
      
      // Create material record
      const { data: material, error: insertError } = await supabase
        .from("course_materials")
        .insert({
          course_pack_id: coursePackId,
          edition_id: editionId || null,
          material_type: materialType,
          title,
          storage_path: storagePath,
          file_name: file.name,
          sha256,
          status: 'uploaded' as const,
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      return material as unknown as CourseMaterial;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["course-materials", variables.coursePackId] });
      queryClient.invalidateQueries({ queryKey: ["course-materials", "all"] });
    },
  });
}

// Update material status
export function useUpdateMaterialStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      materialId,
      status,
      analysisJson,
      errorMessage,
      topicsExtractedCount,
      questionsGeneratedCount,
    }: {
      materialId: string;
      status: string;
      analysisJson?: object;
      errorMessage?: string;
      topicsExtractedCount?: number;
      questionsGeneratedCount?: number;
    }) => {
      const updates: Record<string, unknown> = { status };
      if (analysisJson !== undefined) updates.analysis_json = analysisJson;
      if (errorMessage !== undefined) updates.error_message = errorMessage;
      if (topicsExtractedCount !== undefined) updates.topics_extracted_count = topicsExtractedCount;
      if (questionsGeneratedCount !== undefined) updates.questions_generated_count = questionsGeneratedCount;
      
      const { data, error } = await supabase
        .from("course_materials")
        .update(updates)
        .eq("id", materialId)
        .select()
        .single();
      
      if (error) throw error;
      return data as unknown as CourseMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
      queryClient.invalidateQueries({ queryKey: ["course-material"] });
    },
  });
}

// Delete material
export function useDeleteMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ materialId, storagePath }: { materialId: string; storagePath: string }) => {
      // Delete from storage only if path exists
      if (storagePath) {
        await supabase.storage.from('course-materials').remove([storagePath]);
      }

      // Delete record
      const { error } = await supabase
        .from("course_materials")
        .delete()
        .eq("id", materialId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
    },
  });
}

// Update material metadata
export function useUpdateMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      materialId,
      title,
      scheduledWeek,
      correspondsToMidterm,
    }: {
      materialId: string;
      title?: string;
      scheduledWeek?: number | null;
      correspondsToMidterm?: number | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (scheduledWeek !== undefined) updates.scheduled_week = scheduledWeek;
      if (correspondsToMidterm !== undefined) updates.corresponds_to_midterm = correspondsToMidterm;

      const { data, error } = await supabase
        .from("course_materials")
        .update(updates)
        .eq("id", materialId)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as CourseMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
      queryClient.invalidateQueries({ queryKey: ["course-material"] });
    },
  });
}

// Delete all questions for a material
export function useDeleteMaterialQuestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (materialId: string) => {
      const { data, error } = await supabase
        .from("questions")
        .delete()
        .eq("source_material_id", materialId)
        .select("id");

      if (error) throw error;

      // Verify that questions were actually deleted
      if (!data || data.length === 0) {
        throw new Error("No questions found to delete for this material");
      }

      // Log the number of deleted questions for debugging
      console.log(`Deleted ${data.length} question(s) for material ${materialId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["exams-for-course"] });
    },
  });
}

// Cleanup storage for a material (delete PDF but keep record)
export function useCleanupMaterialStorage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (materialId: string) => {
      // Fetch the material to get storage_path
      const { data: material, error: fetchError } = await supabase
        .from("course_materials")
        .select("storage_path")
        .eq("id", materialId)
        .single();

      if (fetchError) throw fetchError;
      if (!material?.storage_path) return;

      // Delete file from bucket
      await supabase.storage.from('course-materials').remove([material.storage_path]);

      // Clear storage_path on record (keep DB record for metadata)
      const { error: updateError } = await supabase
        .from("course_materials")
        .update({ storage_path: '' })
        .eq("id", materialId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-materials"] });
      queryClient.invalidateQueries({ queryKey: ["course-material"] });
    },
  });
}

// =====================================================
// MATERIAL CHUNKS
// =====================================================

export function useMaterialChunks(materialId: string | null) {
  return useQuery({
    queryKey: ["material-chunks", materialId],
    queryFn: async () => {
      if (!materialId) return [];
      
      const { data, error } = await supabase
        .from("material_chunks")
        .select("*")
        .eq("material_id", materialId)
        .order("chunk_index");
      
      if (error) throw error;
      return data as MaterialChunk[];
    },
    enabled: !!materialId,
  });
}

// =====================================================
// OBJECTIVES
// =====================================================

export function useObjectivesForTopic(topicId: string | null) {
  return useQuery({
    queryKey: ["objectives", topicId],
    queryFn: async () => {
      if (!topicId) return [];
      
      const { data, error } = await supabase
        .from("objectives")
        .select("*")
        .eq("topic_id", topicId);
      
      if (error) throw error;
      return data as Objective[];
    },
    enabled: !!topicId,
  });
}

export function useObjectivesForMaterial(materialId: string | null) {
  return useQuery({
    queryKey: ["objectives", "material", materialId],
    queryFn: async () => {
      if (!materialId) return [];
      
      const { data, error } = await supabase
        .from("objectives")
        .select("*, topics(title)")
        .eq("source_material_id", materialId);
      
      if (error) throw error;
      return data as (Objective & { topics: { title: string } })[];
    },
    enabled: !!materialId,
  });
}

// =====================================================
// SHA256 HASHING UTILITY
// =====================================================

export async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
