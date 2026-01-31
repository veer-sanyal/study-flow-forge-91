import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useMaterialById, useMaterialChunks, useObjectivesForMaterial, useAnalyzeMaterial, useGenerateQuestions, useUpdateMaterial, useDeleteMaterialQuestions, useCleanupMaterialStorage } from "@/hooks/use-materials";
import { MATERIAL_STATUS_CONFIG, MATERIAL_TYPE_LABELS, type MaterialStatus, type MaterialAnalysis, type AnalyzedTopic, isAnalyzedTopicV2 } from "@/types/materials";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Sparkles, FileText, Target, BookOpen, AlertCircle, Save, Trash2, ChevronDown, Beaker, Brain, HelpCircle, BookMarked } from "lucide-react";
import { format } from "date-fns";

function TopicCard({ topic }: { topic: AnalyzedTopic }): JSX.Element {
  const v2 = isAnalyzedTopicV2(topic) ? topic : null;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {topic.topic_code && (
            <Badge variant="outline">{topic.topic_code}</Badge>
          )}
          {topic.title}
        </CardTitle>
        <CardDescription className="text-xs">
          {topic.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 pb-3 space-y-2">
        {/* Difficulty + type distribution */}
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">
            Difficulty: {topic.difficulty_estimate}/5
          </Badge>
          {v2?.question_type_distribution?.length ? (
            v2.question_type_distribution.map(({ type, proportion }) => (
              <Badge key={type} variant="outline" className="text-xs">
                {type} {Math.round(proportion * 100)}%
              </Badge>
            ))
          ) : (
            topic.recommended_question_types.map(type => (
              <Badge key={type} variant="outline" className="text-xs">
                {type}
              </Badge>
            ))
          )}
        </div>

        {/* Difficulty rationale (v2 only) */}
        {v2?.difficulty_rationale && (
          <p className="text-xs text-muted-foreground italic">
            {v2.difficulty_rationale}
          </p>
        )}

        {/* Objectives */}
        {topic.objectives.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc list-inside">
            {topic.objectives.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        )}

        {/* V2 expandable sections */}
        {v2 && (
          <div className="space-y-1 pt-1">
            {v2.key_terms.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <BookMarked className="h-3 w-3" />
                  Key Terms ({v2.key_terms.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-5 pt-1 space-y-1">
                  {v2.key_terms.map((kt, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{kt.term}</span>
                      <span className="text-muted-foreground"> - {kt.definition}</span>
                      {kt.page_ref != null && (
                        <span className="text-muted-foreground/60"> (p.{kt.page_ref + 1})</span>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {v2.formulas.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <Beaker className="h-3 w-3" />
                  Formulas ({v2.formulas.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-5 pt-1 space-y-1">
                  {v2.formulas.map((f, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{f.name}:</span>
                      <code className="ml-1 bg-muted px-1 rounded">{f.expression}</code>
                      <span className="text-muted-foreground ml-1">({f.context})</span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {v2.common_misconceptions.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <Brain className="h-3 w-3" />
                  Misconceptions ({v2.common_misconceptions.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-5 pt-1 space-y-1">
                  {v2.common_misconceptions.map((m, i) => (
                    <div key={i} className="text-xs space-y-0.5">
                      <p className="text-destructive/80">Wrong: {m.description}</p>
                      <p className="text-green-600/80">Correct: {m.correct_concept}</p>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {v2.example_questions.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-3 w-3" />
                  <HelpCircle className="h-3 w-3" />
                  Example Questions ({v2.example_questions.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-5 pt-1 space-y-1">
                  {v2.example_questions.map((eq, i) => (
                    <div key={i} className="text-xs">
                      <Badge variant="outline" className="text-[10px] mr-1">{eq.expected_answer_type}</Badge>
                      <Badge variant="secondary" className="text-[10px] mr-1">D{eq.difficulty}</Badge>
                      <span className="text-muted-foreground">{eq.stem}</span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MaterialDetailDrawerProps {
  materialId: string | null;
  onClose: () => void;
}

export function MaterialDetailDrawer({ materialId, onClose }: MaterialDetailDrawerProps) {
  const { data: material, isLoading } = useMaterialById(materialId);
  const { data: chunks } = useMaterialChunks(materialId);
  const { data: objectives } = useObjectivesForMaterial(materialId);
  const analyzeMaterial = useAnalyzeMaterial();
  const generateQuestions = useGenerateQuestions();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterialQuestions = useDeleteMaterialQuestions();
  const cleanupStorage = useCleanupMaterialStorage();
  const { toast } = useToast();

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editWeek, setEditWeek] = useState<string>("");
  const [editMidterm, setEditMidterm] = useState<string>("unassigned");

  // Sync editable fields when material loads
  useEffect(() => {
    if (material) {
      setEditTitle(material.title || "");
      setEditWeek((material as any).scheduled_week?.toString() || "");
      const mt = (material as any).corresponds_to_midterm;
      setEditMidterm(mt != null ? String(mt) : "unassigned");
    }
  }, [material]);

  const handleSaveMetadata = async () => {
    if (!materialId) return;
    try {
      await updateMaterial.mutateAsync({
        materialId,
        title: editTitle || undefined,
        scheduledWeek: editWeek ? parseInt(editWeek, 10) : null,
        correspondsToMidterm: editMidterm !== "unassigned" ? parseInt(editMidterm, 10) : null,
      });
      toast({ title: "Material updated" });
    } catch (error) {
      toast({ title: "Update failed", description: String(error), variant: "destructive" });
    }
  };

  const handleDeleteQuestions = async () => {
    if (!materialId) return;
    try {
      await deleteMaterialQuestions.mutateAsync(materialId);
      toast({ title: "Questions deleted" });
    } catch (error) {
      toast({ title: "Delete failed", description: String(error), variant: "destructive" });
    }
  };

  const handleAnalyze = async () => {
    if (!materialId) return;
    try {
      toast({ title: "Starting analysis..." });
      await analyzeMaterial.mutateAsync(materialId);
      toast({ title: "Analysis complete!" });
    } catch (error) {
      toast({ title: "Analysis failed", description: String(error), variant: "destructive" });
    }
  };

  const handleGenerateQuestions = async () => {
    if (!materialId) return;
    try {
      toast({ title: "Generating questions..." });
      await generateQuestions.mutateAsync({ materialId });
      toast({ title: "Questions generated!" });
      // Auto-cleanup PDF storage after generation
      try {
        await cleanupStorage.mutateAsync(materialId);
      } catch {
        // Non-fatal: PDF cleanup is best-effort
      }
    } catch (error) {
      toast({ title: "Generation failed", description: String(error), variant: "destructive" });
    }
  };
  
  const getStatusBadge = (status: MaterialStatus) => {
    const config = MATERIAL_STATUS_CONFIG[status];
    return (
      <Badge variant="secondary" className={`${config.color} text-white`}>
        {config.label}
      </Badge>
    );
  };
  
  const analysis = material?.analysis_json as MaterialAnalysis | null;
  
  return (
    <Sheet open={!!materialId} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {material?.title || 'Material Details'}
          </SheetTitle>
          <SheetDescription>
            {material && (
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge(material.status as MaterialStatus)}
                <span>•</span>
                <span>{MATERIAL_TYPE_LABELS[material.material_type as keyof typeof MATERIAL_TYPE_LABELS]}</span>
                <span>•</span>
                <span>{material.course_packs?.title}</span>
              </div>
            )}
          </SheetDescription>
        </SheetHeader>
        
        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : material ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Actions */}
              <div className="flex gap-2">
                {(material.status === 'uploaded' || material.status === 'failed') && (
                  <Button 
                    onClick={handleAnalyze}
                    disabled={analyzeMaterial.isPending}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {analyzeMaterial.isPending ? 'Analyzing...' : 'Analyze Material'}
                  </Button>
                )}
                {(material.status === 'analyzed' || material.status === 'ready') && (
                  <Button 
                    onClick={handleGenerateQuestions}
                    disabled={generateQuestions.isPending}
                    variant="secondary"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {generateQuestions.isPending ? 'Generating...' : 'Generate Questions'}
                  </Button>
                )}
              </div>
              
              {/* Editable Metadata */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Edit Material</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Material title"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Week Number</Label>
                      <Input
                        type="number"
                        value={editWeek}
                        onChange={(e) => setEditWeek(e.target.value)}
                        placeholder="e.g., 3"
                        min={1}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Midterm Assignment</Label>
                      <Select value={editMidterm} onValueChange={setEditMidterm}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          <SelectItem value="1">Midterm 1</SelectItem>
                          <SelectItem value="2">Midterm 2</SelectItem>
                          <SelectItem value="3">Midterm 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveMetadata}
                      disabled={updateMaterial.isPending}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {updateMaterial.isPending ? "Saving..." : "Save"}
                    </Button>
                    {material.questions_generated_count > 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteQuestions}
                        disabled={deleteMaterialQuestions.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {deleteMaterialQuestions.isPending ? "Deleting..." : "Delete Questions"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Error Message */}
              {material.error_message && (
                <Card className="border-destructive">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5 mt-0.5" />
                      <div>
                        <p className="font-medium">Error</p>
                        <p className="text-sm">{material.error_message}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Metadata */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Metadata</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File</span>
                    <span className="font-mono text-xs">{material.file_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SHA256</span>
                    <span className="font-mono text-xs truncate max-w-[200px]" title={material.sha256}>
                      {material.sha256.slice(0, 16)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uploaded</span>
                    <span>{format(new Date(material.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Topics Analyzed</span>
                    <span>{analysis?.topics?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Questions Generated</span>
                    <span>{material.questions_generated_count}</span>
                  </div>
                </CardContent>
              </Card>
              
              <Separator />
              
              {/* Tabs for Analysis Results */}
              <Tabs defaultValue="topics" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="topics" className="flex-1">
                    <Target className="h-4 w-4 mr-1" />
                    Topics ({analysis?.topics?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="chunks" className="flex-1">
                    <FileText className="h-4 w-4 mr-1" />
                    Pages ({chunks?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="objectives" className="flex-1">
                    <BookOpen className="h-4 w-4 mr-1" />
                    Objectives ({analysis?.topics?.reduce((acc, t) => acc + (t.objectives?.length || 0), 0) || 0})
                  </TabsTrigger>
                </TabsList>
                
                {/* Topics Tab */}
                <TabsContent value="topics" className="mt-4">
                  {analysis?.topics?.length ? (
                    <div className="space-y-3">
                      {analysis.topics.map((topic, idx) => (
                        <TopicCard key={idx} topic={topic} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No topics analyzed yet</p>
                      <p className="text-xs">Run analysis to identify topics in the material</p>
                    </div>
                  )}
                </TabsContent>
                
                {/* Chunks Tab */}
                <TabsContent value="chunks" className="mt-4">
                  {(analysis?.chunk_summaries?.length || chunks?.length) ? (
                    <div className="space-y-3">
                      {analysis?.chunk_summaries?.length ? (
                        analysis.chunk_summaries.map((cs) => (
                          <Card key={cs.chunk_index}>
                            <CardHeader className="py-2">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Badge variant="outline">
                                  {cs.chunk_type === 'page' ? 'Page' : 'Slide'} {cs.chunk_index + 1}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3 space-y-2">
                              <p className="text-xs text-muted-foreground">
                                {cs.summary}
                              </p>
                              {cs.key_terms.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {cs.key_terms.map((term) => (
                                    <Badge key={term} variant="outline" className="text-[10px]">
                                      {term}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        chunks?.map(chunk => (
                          <Card key={chunk.id}>
                            <CardHeader className="py-2">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Badge variant="outline">
                                  {chunk.chunk_type === 'page' ? 'Page' : 'Slide'} {chunk.chunk_index + 1}
                                </Badge>
                                {chunk.title_hint && (
                                  <span className="text-muted-foreground font-normal">
                                    {chunk.title_hint}
                                  </span>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3">
                              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                                {chunk.text}
                              </p>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No content extracted yet</p>
                      <p className="text-xs">Run analysis to extract pages</p>
                    </div>
                  )}
                </TabsContent>
                
                {/* Objectives Tab */}
                <TabsContent value="objectives" className="mt-4">
                  {analysis?.topics?.some(t => t.objectives?.length > 0) ? (
                    <div className="space-y-3">
                      {analysis.topics.map((topic, topicIdx) =>
                        topic.objectives?.length > 0 ? (
                          <div key={topicIdx}>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{topic.topic_code || `Topic ${topicIdx + 1}`}</Badge>
                              <span className="text-sm font-medium">{topic.title}</span>
                            </div>
                            <div className="space-y-2 ml-4">
                              {topic.objectives.map((obj, objIdx) => (
                                <Card key={`${topicIdx}-${objIdx}`}>
                                  <CardContent className="py-3">
                                    <div className="flex items-start gap-2">
                                      <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                      <p className="text-sm">{obj}</p>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No objectives analyzed yet</p>
                      <p className="text-xs">Run analysis to identify learning objectives</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
