import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Check, Star, Calendar, Target, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
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

  const [expandedYears, setExpandedYears] = useState<string[]>([]);
  const [expandedSemesters, setExpandedSemesters] = useState<string[]>([]);
  const [expandedTopicGroups, setExpandedTopicGroups] = useState<number[]>([]);

  const allCoursesSelected = filters.courseIds.length === 0;

  const handleCourseToggle = (courseId: string) => {
    if (filters.courseIds.includes(courseId)) {
      onCourseIdsChange(filters.courseIds.filter(id => id !== courseId));
    } else {
      onCourseIdsChange([...filters.courseIds, courseId]);
    }
  };

  const handleAllCoursesToggle = () => {
    onCourseIdsChange([]);
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

            {/* Courses */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Courses
              </h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer">
                  <Checkbox
                    checked={allCoursesSelected}
                    onCheckedChange={handleAllCoursesToggle}
                  />
                  <span className="text-sm font-medium">All courses</span>
                </label>
                {courses.map((course) => (
                  <label
                    key={course.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.courseIds.includes(course.id)}
                      onCheckedChange={() => handleCourseToggle(course.id)}
                    />
                    <span className="text-sm">{course.title}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Narrow By */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Narrow by (optional)
              </h3>
              <RadioGroup
                value={narrowBy || ''}
                onValueChange={(v) => onNarrowByChange(v as NarrowByOption || null)}
              >
                <div className="space-y-2">
                  {[
                    { value: 'midterm', label: 'Upcoming Midterm' },
                    { value: 'exam', label: 'Past Exam' },
                    { value: 'topics', label: 'Topics' },
                    { value: 'types', label: 'Question Types' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                    >
                      <RadioGroupItem value={option.value} />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </section>

            {/* Conditional content based on narrowBy */}
            <AnimatePresence mode="wait">
              {narrowBy === 'midterm' && (
                <motion.section
                  key="midterm"
                  {...fadeSlideUp}
                  transition={{ duration: duration.fast }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Select Midterm
                  </h3>
                  <RadioGroup
                    value={filters.midtermNumber?.toString() || ''}
                    onValueChange={(v) => onMidtermNumberChange(v ? parseInt(v) : null)}
                  >
                    {upcomingExams
                      .filter(e => e.midtermNumber)
                      .map((exam) => (
                        <label
                          key={exam.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value={exam.midtermNumber!.toString()} />
                            <span className="text-sm font-medium">{exam.title}</span>
                          </div>
                          {exam.daysUntil !== null && exam.daysUntil >= 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {exam.daysUntil === 0 ? 'Today' : 
                               exam.daysUntil === 1 ? 'Tomorrow' : 
                               `${exam.daysUntil}d`}
                            </Badge>
                          )}
                        </label>
                      ))}
                  </RadioGroup>
                </motion.section>
              )}

              {narrowBy === 'topics' && (
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

              {narrowBy === 'types' && (
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

              {narrowBy === 'exam' && (
                <motion.section
                  key="exam"
                  {...fadeSlideUp}
                  transition={{ duration: duration.fast }}
                  className="space-y-3"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Past Exams
                  </h3>
                  {pastExams.map((yearGroup) => (
                    <Collapsible
                      key={yearGroup.year}
                      open={expandedYears.includes(yearGroup.year)}
                      onOpenChange={(open) => {
                        setExpandedYears(open 
                          ? [...expandedYears, yearGroup.year]
                          : expandedYears.filter(y => y !== yearGroup.year)
                        );
                      }}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-accent/50">
                        <span className="text-sm font-medium">{yearGroup.year}</span>
                        <ChevronRight className={cn(
                          'h-4 w-4 transition-transform',
                          expandedYears.includes(yearGroup.year) && 'rotate-90'
                        )} />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 space-y-1 pt-1">
                        {yearGroup.semesters.map((sem) => (
                          <Collapsible
                            key={`${yearGroup.year}-${sem.semester}`}
                            open={expandedSemesters.includes(`${yearGroup.year}-${sem.semester}`)}
                            onOpenChange={(open) => {
                              const key = `${yearGroup.year}-${sem.semester}`;
                              setExpandedSemesters(open 
                                ? [...expandedSemesters, key]
                                : expandedSemesters.filter(s => s !== key)
                              );
                            }}
                          >
                            <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-accent/50">
                              <span className="text-sm">{sem.semester}</span>
                              <ChevronRight className={cn(
                                'h-4 w-4 transition-transform',
                                expandedSemesters.includes(`${yearGroup.year}-${sem.semester}`) && 'rotate-90'
                              )} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pl-4 space-y-1 pt-1">
                              {sem.exams.map((exam) => (
                                <label
                                  key={exam}
                                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={filters.examNames.includes(exam)}
                                    onCheckedChange={() => handleExamToggle(exam)}
                                  />
                                  <span className="text-sm">{exam}</span>
                                </label>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
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
          <Button onClick={onApply} className="flex-1">
            Apply Focus
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
