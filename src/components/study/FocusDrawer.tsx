import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Check, Star, Calendar, Target, RefreshCw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  FocusFilters,
  FocusPreset,
  NarrowByOption,
  useCourses,
  useTopicsGroupedByMidterm,
  useUpcomingExams,
  usePastExamsHierarchy,
  useQuestionTypesForCourses,
} from '@/hooks/use-focus';
import { useRecommendedPresets } from '@/hooks/use-study-recommendations';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { getCourseCardColor } from '@/lib/examUtils';

interface FocusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FocusFilters;
  narrowBy: NarrowByOption;
  onNarrowByChange: (option: NarrowByOption) => void;
  onCourseIdsChange: (ids: string[]) => void;
  onMidtermNumberChange: (num: number | null) => void;
  onExamNamesChange: (names: string[]) => void;
  onTopicIdsChange: (ids: string[]) => void;
  onQuestionTypeIdChange: (id: string | null) => void;
  onApplyPreset: (preset: FocusPreset) => void;
  onClear: () => void;
  onApply: () => void;
}

export function FocusDrawer({
  open,
  onOpenChange,
  filters,
  narrowBy,
  onNarrowByChange,
  onCourseIdsChange,
  onMidtermNumberChange,
  onExamNamesChange,
  onTopicIdsChange,
  onQuestionTypeIdChange,
  onApplyPreset,
  onClear,
  onApply,
}: FocusDrawerProps) {
  const { data: courses = [] } = useCourses();
  const { data: upcomingExams = [] } = useUpcomingExams(filters.courseIds);
  const { data: topicGroups = [] } = useTopicsGroupedByMidterm(filters.courseIds);
  const { data: pastExams = [] } = usePastExamsHierarchy(filters.courseIds);
  const { data: questionTypes = [] } = useQuestionTypesForCourses(filters.courseIds);
  const recommendedPresets = useRecommendedPresets(filters.courseIds);

  const [expandedTopicGroups, setExpandedTopicGroups] = useState<number[]>([]);

  const hasCoursesSelected = filters.courseIds.length > 0;

  // Get upcoming midterms (future exams only)
  const upcomingMidterms = upcomingExams.filter(
    e => e.midtermNumber && e.daysUntil !== null && e.daysUntil >= 0
  );

  const handleCourseToggle = (courseId: string) => {
    if (filters.courseIds.includes(courseId)) {
      onCourseIdsChange(filters.courseIds.filter(id => id !== courseId));
    } else {
      onCourseIdsChange([...filters.courseIds, courseId]);
    }
  };

  const handleTopicToggle = (topicId: string) => {
    if (filters.topicIds.includes(topicId)) {
      onTopicIdsChange(filters.topicIds.filter(id => id !== topicId));
    } else {
      onTopicIdsChange([...filters.topicIds, topicId]);
    }
  };

  const handleSelectAllTopicsInGroup = (topicIds: string[]) => {
    const newIds = [...new Set([...filters.topicIds, ...topicIds])];
    onTopicIdsChange(newIds);
  };

  const handleExamToggle = (examName: string) => {
    if (filters.examNames.includes(examName)) {
      onExamNamesChange(filters.examNames.filter(n => n !== examName));
    } else {
      onExamNamesChange([...filters.examNames, examName]);
    }
  };

  const presetIcon = (icon?: string) => {
    switch (icon) {
      case 'calendar': return <Calendar className="h-4 w-4" />;
      case 'target': return <Target className="h-4 w-4" />;
      case 'refresh': return <RefreshCw className="h-4 w-4" />;
      default: return <Star className="h-4 w-4" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-4 border-b">
          <SheetTitle className="text-lg">Focus</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Recommended Presets */}
            {recommendedPresets.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  Recommended
                </h3>
                <div className="space-y-2">
                  {recommendedPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      className="w-full justify-between h-auto py-3 text-left"
                      onClick={() => onApplyPreset(preset)}
                    >
                      <div className="flex items-center gap-3">
                        {presetIcon(preset.icon)}
                        <div>
                          <span className="font-medium">{preset.label}</span>
                          {preset.description && (
                            <p className="text-xs text-muted-foreground">
                              {preset.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {/* Courses - Visual cards */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Course
              </h3>
              <div className="grid gap-3 grid-cols-2">
                {courses.map((course, index) => {
                  const isSelected = filters.courseIds.includes(course.id);
                  const { gradient } = getCourseCardColor(course.title, index);
                  
                  return (
                    <button
                      key={course.id}
                      onClick={() => handleCourseToggle(course.id)}
                      className={cn(
                        "relative p-4 rounded-xl text-left transition-all overflow-hidden",
                        "bg-gradient-to-br",
                        gradient,
                        isSelected 
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-background" 
                          : "opacity-75 hover:opacity-100"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                      )}
                      <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center mb-2">
                        <BookOpen className="h-4 w-4 text-white" />
                      </div>
                      <h4 className="font-medium text-white text-sm leading-tight line-clamp-2">
                        {course.title}
                      </h4>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Upcoming Midterms - Show automatically when courses are selected */}
            <AnimatePresence>
              {hasCoursesSelected && upcomingMidterms.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: duration.normal, ease: easing.easeOut }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-orange-500" />
                    Upcoming Exams
                  </h3>
                  <div className="space-y-2">
                    {upcomingMidterms.map((exam) => (
                      <button
                        key={exam.id}
                        onClick={() => onMidtermNumberChange(exam.midtermNumber)}
                        className={cn(
                          "flex items-center justify-between w-full p-3 rounded-lg border transition-all text-left",
                          filters.midtermNumber === exam.midtermNumber
                            ? "border-primary bg-primary/5"
                            : "hover:bg-accent/50"
                        )}
                      >
                        <span className="font-medium text-sm">{exam.title}</span>
                        {exam.daysUntil !== null && (
                          <Badge 
                            variant={exam.daysUntil <= 3 ? "destructive" : "secondary"} 
                            className="text-xs"
                          >
                            {exam.daysUntil === 0 ? 'Today' : 
                             exam.daysUntil === 1 ? 'Tomorrow' : 
                             `${exam.daysUntil}d`}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Narrow By - Only show after course is selected */}
            <AnimatePresence>
              {hasCoursesSelected && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: duration.normal, ease: easing.easeOut }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Filter by (optional)
                  </h3>
                  <RadioGroup
                    value={narrowBy || ''}
                    onValueChange={(v) => onNarrowByChange(v as NarrowByOption || null)}
                  >
                    <div className="space-y-2">
                      {[
                        { value: 'exam', label: 'Past Exams' },
                        { value: 'topics', label: 'Topics' },
                        { value: 'types', label: 'Question Types' },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                            narrowBy === option.value
                              ? "bg-primary/10"
                              : "hover:bg-accent/50"
                          )}
                        >
                          <RadioGroupItem value={option.value} />
                          <span className="text-sm">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </RadioGroup>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Conditional content based on narrowBy */}
            <AnimatePresence mode="wait">
              {narrowBy === 'topics' && hasCoursesSelected && (
                <motion.section
                  key="topics"
                  {...fadeSlideUp}
                  transition={{ duration: duration.fast }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Select Topics
                  </h3>
                  {topicGroups.map((group) => (
                    <Collapsible
                      key={group.midtermNumber ?? 'final'}
                      open={expandedTopicGroups.includes(group.midtermNumber ?? 0)}
                      onOpenChange={(open) => {
                        const key = group.midtermNumber ?? 0;
                        setExpandedTopicGroups(open 
                          ? [...expandedTopicGroups, key]
                          : expandedTopicGroups.filter(k => k !== key)
                        );
                      }}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-accent/50">
                        <span className="text-sm font-medium">{group.label}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAllTopicsInGroup(group.topics.map(t => t.id));
                            }}
                          >
                            Select all
                          </Button>
                          <ChevronRight className={cn(
                            'h-4 w-4 transition-transform',
                            expandedTopicGroups.includes(group.midtermNumber ?? 0) && 'rotate-90'
                          )} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 space-y-1 pt-1">
                        {group.topics.map((topic) => (
                          <label
                            key={topic.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={filters.topicIds.includes(topic.id)}
                              onCheckedChange={() => handleTopicToggle(topic.id)}
                            />
                            <span className="text-sm">{topic.title}</span>
                          </label>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </motion.section>
              )}

              {narrowBy === 'types' && hasCoursesSelected && (
                <motion.section
                  key="types"
                  {...fadeSlideUp}
                  transition={{ duration: duration.fast }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Question Types
                  </h3>
                  <RadioGroup
                    value={filters.questionTypeId || ''}
                    onValueChange={(v) => onQuestionTypeIdChange(v || null)}
                  >
                    {questionTypes.map((type) => (
                      <label
                        key={type.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                      >
                        <RadioGroupItem value={type.id} />
                        <span className="text-sm">{type.name}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </motion.section>
              )}

              {narrowBy === 'exam' && hasCoursesSelected && (
                <motion.section
                  key="exam"
                  {...fadeSlideUp}
                  transition={{ duration: duration.fast }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Past Exams
                  </h3>
                  <div className="space-y-4">
                    {pastExams.map((group) => (
                      <div key={group.examType} className="space-y-2">
                        <h4 className="text-sm font-medium text-foreground">
                          {group.examType}
                        </h4>
                        <div className="space-y-1 pl-2">
                          {group.exams.map((exam) => (
                            <label
                              key={exam.name}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={filters.examNames.includes(exam.name)}
                                onCheckedChange={() => handleExamToggle(exam.name)}
                              />
                              <span className="text-sm">{exam.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" onClick={onClear} className="flex-1">
            Clear All
          </Button>
          <Button onClick={onApply} className="flex-1" disabled={!hasCoursesSelected}>
            Apply Focus
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
