import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileQuestion, BookOpen, Tag, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TopicWithCount {
  id: string;
  title: string;
  midtermCoverage: number | null;
  questionCount: number;
  questionIds: string[];
}

interface TopicGroup {
  midtermNumber: number | null;
  label: string;
  topics: TopicWithCount[];
  totalQuestions: number;
}

interface TypeWithCount {
  id: string;
  name: string;
  midtermNumber: number | null;
  questionCount: number;
}

interface TypeGroup {
  midtermNumber: number | null;
  label: string;
  types: TypeWithCount[];
  totalQuestions: number;
}

// Hook to get topics with question counts for a course
function useTopicsWithCountsForCourse(coursePackId: string) {
  return useQuery({
    queryKey: ["admin-topics-with-counts", coursePackId],
    queryFn: async () => {
      // Get topics
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id, title, midterm_coverage")
        .eq("course_pack_id", coursePackId)
        .order("scheduled_week", { ascending: true, nullsFirst: true })
        .order("title");

      if (topicsError) throw topicsError;

      // Get questions with topic_ids
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, topic_ids")
        .eq("course_pack_id", coursePackId);

      if (questionsError) throw questionsError;

      // Count questions per topic and collect question IDs
      const topicCountMap = new Map<string, { count: number; questionIds: string[] }>();
      questions?.forEach((q) => {
        if (Array.isArray(q.topic_ids)) {
          q.topic_ids.forEach((topicId: string) => {
            const existing = topicCountMap.get(topicId) || { count: 0, questionIds: [] };
            existing.count++;
            existing.questionIds.push(q.id);
            topicCountMap.set(topicId, existing);
          });
        }
      });

      const topicsWithCounts: TopicWithCount[] = (topics || []).map((t) => ({
        id: t.id,
        title: t.title,
        midtermCoverage: t.midterm_coverage,
        questionCount: topicCountMap.get(t.id)?.count || 0,
        questionIds: topicCountMap.get(t.id)?.questionIds || [],
      }));

      // Group by midterm
      const groupMap = new Map<number | null, TopicWithCount[]>();

      topicsWithCounts.forEach((topic) => {
        const key = topic.midtermCoverage;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(topic);
      });

      // Sort and format groups
      const sortedKeys = [...groupMap.keys()].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return (a ?? 0) - (b ?? 0);
      });

      const groups: TopicGroup[] = sortedKeys.map((key) => {
        const topics = groupMap.get(key)!;
        let label = "Uncategorized";
        if (key === 0) label = "Final Topics";
        else if (key !== null) label = `Midterm ${key} Topics`;

        return {
          midtermNumber: key,
          label,
          topics,
          totalQuestions: topics.reduce((sum, t) => sum + t.questionCount, 0),
        };
      });

      return groups;
    },
    enabled: !!coursePackId,
  });
}

// Hook to get question types with counts for a course, grouped by midterm
function useTypesWithCountsForCourse(coursePackId: string) {
  return useQuery({
    queryKey: ["admin-types-with-counts", coursePackId],
    queryFn: async () => {
      // Get question types
      const { data: types, error: typesError } = await supabase
        .from("question_types")
        .select("id, name")
        .eq("course_pack_id", coursePackId)
        .order("name");

      if (typesError) throw typesError;

      // Get questions with type and midterm
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, question_type_id, midterm_number")
        .eq("course_pack_id", coursePackId);

      if (questionsError) throw questionsError;

      // Count per type and determine primary midterm
      const typeCountMap = new Map<string, Map<number | null, number>>();

      questions?.forEach((q) => {
        if (!q.question_type_id) return;

        if (!typeCountMap.has(q.question_type_id)) {
          typeCountMap.set(q.question_type_id, new Map());
        }

        const midtermMap = typeCountMap.get(q.question_type_id)!;
        const midterm = q.midterm_number;
        midtermMap.set(midterm, (midtermMap.get(midterm) || 0) + 1);
      });

      // Build types with counts and primary midterm
      const typesWithCounts: TypeWithCount[] = (types || []).map((type) => {
        const midtermCounts = typeCountMap.get(type.id);
        let primaryMidterm: number | null = null;
        let totalCount = 0;

        if (midtermCounts) {
          let maxCount = 0;
          midtermCounts.forEach((count, midterm) => {
            totalCount += count;
            if (count > maxCount) {
              maxCount = count;
              primaryMidterm = midterm;
            }
          });
        }

        return {
          id: type.id,
          name: type.name,
          midtermNumber: primaryMidterm,
          questionCount: totalCount,
        };
      });

      // Group by midterm
      const groupMap = new Map<number | null, TypeWithCount[]>();

      typesWithCounts.forEach((type) => {
        const key = type.midtermNumber;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(type);
      });

      // Sort and format groups
      const sortedKeys = [...groupMap.keys()].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return (a ?? 0) - (b ?? 0);
      });

      const groups: TypeGroup[] = sortedKeys.map((key) => {
        const types = groupMap.get(key)!;
        let label = "Uncategorized";
        if (key === 0) label = "Final Types";
        else if (key !== null) label = `Midterm ${key} Types`;

        return {
          midtermNumber: key,
          label,
          types,
          totalQuestions: types.reduce((sum, t) => sum + t.questionCount, 0),
        };
      });

      return groups;
    },
    enabled: !!coursePackId,
  });
}

// Topic card component
function TopicCard({
  topic,
  courseId,
}: {
  topic: TopicWithCount;
  courseId: string;
}) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    // Navigate to questions filtered by this topic
    // We encode topic ID as a special filter in URL
    navigate(`/admin/questions/${courseId}?topic=${topic.id}`);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer",
        isHovered ? "border-primary/50 bg-muted/50" : "border-border"
      )}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-lg bg-muted">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="font-medium text-sm truncate">{topic.title}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs tabular-nums">
          {topic.questionCount} Q
        </Badge>
        {isHovered && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </div>
  );
}

// Question type card component
function TypeCard({
  type,
  courseId,
}: {
  type: TypeWithCount;
  courseId: string;
}) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    // Navigate to questions filtered by this type
    navigate(`/admin/questions/${courseId}?type=${type.id}`);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer",
        isHovered ? "border-primary/50 bg-muted/50" : "border-border"
      )}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-lg bg-muted">
          <Tag className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="font-medium text-sm truncate">{type.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs tabular-nums">
          {type.questionCount} Q
        </Badge>
        {isHovered && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </div>
  );
}

// Loading skeleton
function GroupedViewSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            {[...Array(4)].map((_, j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Topics view
export function TopicsGroupedView({ courseId }: { courseId: string }) {
  const { data: groups, isLoading } = useTopicsWithCountsForCourse(courseId);
  const [expandedGroups, setExpandedGroups] = useState<Set<number | null>>(new Set([1, 2, 3, null])); // All expanded by default

  const toggleGroup = (midterm: number | null) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(midterm)) {
        next.delete(midterm);
      } else {
        next.add(midterm);
      }
      return next;
    });
  };

  if (isLoading) return <GroupedViewSkeleton />;

  if (!groups || groups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No topics yet</h3>
        <p className="text-muted-foreground">
          Topics will appear here after they're added from the calendar.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Collapsible
          key={group.midtermNumber ?? "final"}
          open={expandedGroups.has(group.midtermNumber)}
          onOpenChange={() => toggleGroup(group.midtermNumber)}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{group.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {group.topics.length} topics • {group.totalQuestions} Q
                    </Badge>
                  </div>
                  {expandedGroups.has(group.midtermNumber) ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                {group.topics.map((topic) => (
                  <TopicCard key={topic.id} topic={topic} courseId={courseId} />
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

// Question Types view
export function TypesGroupedView({ courseId }: { courseId: string }) {
  const { data: groups, isLoading } = useTypesWithCountsForCourse(courseId);
  const [expandedGroups, setExpandedGroups] = useState<Set<number | null>>(new Set([1, 2, 3, null]));

  const toggleGroup = (midterm: number | null) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(midterm)) {
        next.delete(midterm);
      } else {
        next.add(midterm);
      }
      return next;
    });
  };

  if (isLoading) return <GroupedViewSkeleton />;

  if (!groups || groups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No question types yet</h3>
        <p className="text-muted-foreground">
          Question types will appear here after questions are added.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Collapsible
          key={group.midtermNumber ?? "final"}
          open={expandedGroups.has(group.midtermNumber)}
          onOpenChange={() => toggleGroup(group.midtermNumber)}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{group.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {group.types.length} types • {group.totalQuestions} Q
                    </Badge>
                  </div>
                  {expandedGroups.has(group.midtermNumber) ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                {group.types.map((type) => (
                  <TypeCard key={type.id} type={type} courseId={courseId} />
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}
