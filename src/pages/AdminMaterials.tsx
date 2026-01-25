import { useState, useCallback } from "react";
import { useCoursePacks } from "@/hooks/use-admin";
import { useAllCourseMaterials, useDeleteMaterial, useAnalyzeMaterial, useUploadMaterial, useCheckDuplicate, computeSha256 } from "@/hooks/use-materials";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Play, Eye, Sparkles, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MATERIAL_STATUS_CONFIG, MATERIAL_TYPE_LABELS, type MaterialStatus, type MaterialType } from "@/types/materials";
import { MaterialUploadDialog } from "@/components/admin/MaterialUploadDialog";
import { MaterialDetailDrawer } from "@/components/admin/MaterialDetailDrawer";
import { MaterialDropZone } from "@/components/admin/MaterialDropZone";
import { format } from "date-fns";

export default function AdminMaterials() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isQuickUploading, setIsQuickUploading] = useState(false);
  
  const { data: coursePacks, isLoading: loadingCourses } = useCoursePacks();
  const { data: materials, isLoading: loadingMaterials } = useAllCourseMaterials();
  const deleteMaterial = useDeleteMaterial();
  const analyzeMaterial = useAnalyzeMaterial();
  const uploadMaterial = useUploadMaterial();
  const checkDuplicate = useCheckDuplicate();
  const { toast } = useToast();
  
  // Filter materials by selected course
  const filteredMaterials = selectedCourseId
    ? materials?.filter(m => m.course_pack_id === selectedCourseId)
    : materials;
  
  const handleDelete = async (materialId: string, storagePath: string) => {
    if (!confirm("Are you sure you want to delete this material?")) return;
    
    try {
      await deleteMaterial.mutateAsync({ materialId, storagePath });
      toast({ title: "Material deleted" });
    } catch (error) {
      toast({ title: "Failed to delete material", variant: "destructive" });
    }
  };
  
  const handleAnalyze = async (materialId: string) => {
    try {
      toast({ title: "Starting analysis..." });
      await analyzeMaterial.mutateAsync(materialId);
      toast({ title: "Analysis complete!" });
    } catch (error) {
      toast({ title: "Analysis failed", description: String(error), variant: "destructive" });
    }
  };

  // Quick upload via drag-and-drop (uses first/selected course)
  const handleQuickUpload = useCallback(async (files: File[]) => {
    // Must have a course selected for quick upload
    const targetCourseId = selectedCourseId || (coursePacks && coursePacks.length === 1 ? coursePacks[0].id : null);
    
    if (!targetCourseId) {
      toast({ 
        title: "Select a course first", 
        description: "Choose a course from the filter to enable drag-and-drop upload.",
        variant: "destructive" 
      });
      return;
    }

    setIsQuickUploading(true);
    let successCount = 0;
    let duplicateCount = 0;

    try {
      for (const file of files) {
        // Compute hash and check for duplicates
        const sha256 = await computeSha256(file);
        const duplicate = await checkDuplicate.mutateAsync({ coursePackId: targetCourseId, sha256 });
        
        if (duplicate) {
          duplicateCount++;
          continue;
        }

        // Determine material type from extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        const materialType: MaterialType = ext === 'pptx' ? 'lecture_pptx' : 'lecture_pdf';
        
        // Title from filename (without extension)
        const title = file.name.replace(/\.[^.]+$/, '');

        await uploadMaterial.mutateAsync({
          file,
          coursePackId: targetCourseId,
          materialType,
          title,
          sha256,
        });
        successCount++;
      }

      if (successCount > 0) {
        toast({ title: `Uploaded ${successCount} file${successCount > 1 ? 's' : ''}` });
      }
      if (duplicateCount > 0) {
        toast({ 
          title: `${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} skipped`,
          variant: "default" 
        });
      }
    } catch (error) {
      toast({ title: "Upload failed", description: String(error), variant: "destructive" });
    } finally {
      setIsQuickUploading(false);
    }
  }, [selectedCourseId, coursePacks, checkDuplicate, uploadMaterial, toast]);
  
  const getStatusBadge = (status: MaterialStatus) => {
    const config = MATERIAL_STATUS_CONFIG[status];
    return (
      <Badge variant="secondary" className={`${config.color} text-white`}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course Materials</h1>
          <p className="text-muted-foreground">
            Upload and manage lecture materials for question generation
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Material
        </Button>
      </div>

      {/* Drag-and-Drop Upload Zone */}
      <Card>
        <CardContent className="pt-6">
          <MaterialDropZone 
            onFilesSelected={handleQuickUpload}
            isUploading={isQuickUploading}
          />
          {!selectedCourseId && coursePacks && coursePacks.length > 1 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Select a course below to enable drag-and-drop upload
            </p>
          )}
          {selectedCourseId && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Files will be uploaded to: <span className="font-medium">{coursePacks?.find(c => c.id === selectedCourseId)?.title}</span>
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select 
              value={selectedCourseId || "all"} 
              onValueChange={(v) => setSelectedCourseId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {coursePacks?.map(course => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Materials Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Materials ({filteredMaterials?.length || 0})
          </CardTitle>
          <CardDescription>
            Upload lecture PDFs to extract topics and generate practice questions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMaterials || loadingCourses ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !filteredMaterials?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No materials uploaded yet</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setUploadDialogOpen(true)}
              >
                Upload your first material
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Topics</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.map(material => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">
                      {material.title}
                      <div className="text-xs text-muted-foreground">
                        {material.file_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {material.course_packs?.title || '—'}
                    </TableCell>
                    <TableCell>
                      {MATERIAL_TYPE_LABELS[material.material_type as keyof typeof MATERIAL_TYPE_LABELS]}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(material.status as MaterialStatus)}
                    </TableCell>
                    <TableCell>
                      {material.topics_extracted_count || 0}
                    </TableCell>
                    <TableCell>
                      {material.questions_generated_count || 0}
                    </TableCell>
                    <TableCell>
                      {format(new Date(material.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedMaterialId(material.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {(material.status === 'uploaded' || material.status === 'failed') && (
                            <DropdownMenuItem 
                              onClick={() => handleAnalyze(material.id)}
                              disabled={analyzeMaterial.isPending}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Analyze
                            </DropdownMenuItem>
                          )}
                          {material.status === 'analyzed' && (
                            <DropdownMenuItem onClick={() => setSelectedMaterialId(material.id)}>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate Questions
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDelete(material.id, material.storage_path)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Upload Dialog */}
      <MaterialUploadDialog 
        open={uploadDialogOpen} 
        onOpenChange={setUploadDialogOpen}
        coursePacks={coursePacks || []}
      />
      
      {/* Detail Drawer */}
      <MaterialDetailDrawer 
        materialId={selectedMaterialId}
        onClose={() => setSelectedMaterialId(null)}
      />
    </div>
  );
}
