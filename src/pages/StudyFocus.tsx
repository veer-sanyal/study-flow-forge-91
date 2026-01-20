import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Star, Calendar, Target, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/motion/PageTransition';
import { useFocusContext, FocusPreset, NarrowByOption } from '@/contexts/FocusContext';
import {
  useCourses,
  useTopicsGroupedByMidterm,
  useUpcomingExams,
  usePastExamsHierarchy,
  useQuestionTypesForCourses,
} from '@/hooks/use-focus';
import { useRecommendedPresets } from '@/hooks/use-study-recommendations';
import { fadeSlideUp, duration } from '@/lib/motion';

export default function StudyFocus() {
  const navigate = useNavigate();
  const {
    filters,
    narrowBy,
    setNarrowBy,
    setCourseIds,
    setMidtermNumber,
    setExamNames,
    setTopicIds,
    setQuestionTypeId,
    applyPreset,
    clearFilters,
    hasActiveFilters,
  } = useFocusContext();

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
      setCourseIds(filters.courseIds.filter(id => id !== courseId));
    } else {
      setCourseIds([...filters.courseIds, courseId]);
    }
  };

  const handleAllCoursesToggle = () => {
    setCourseIds([]);
  };

  const handleTopicToggle = (topicId: string) => {
    if (filters.topicIds.includes(topicId)) {
      setTopicIds(filters.topicIds.filter(id => id !== topicId));
    } else {
      setTopicIds([...filters.topicIds, topicId]);
    }
  };

  const handleSelectAllTopicsInGroup = (topicIds: string[]) => {
    const newIds = [...new Set([...filters.topicIds, ...topicIds])];
    setTopicIds(newIds);
  };

  const handleExamToggle = (examName: string) => {
    if (filters.examNames.includes(examName)) {
      setExamNames(filters.examNames.filter(n => n !== examName));
    } else {
      setExamNames([...filters.examNames, examName]);
    }
  };

  const handlePresetClick = (preset: FocusPreset) => {
    applyPreset(preset);
    navigate('/study', { state: { startPractice: true } });
  };

  const handleStartPractice = () => {
    navigate('/study', { state: { startPractice: true } });
  };

  const handleClear = () => {
    clearFilters();
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
    <PageTransition className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b bg-card">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/study')}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Custom Focus</h1>
          <p className="text-sm text-muted-foreground">Configure your study session</p>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8">
          {/* Recommended Presets */}
          {recommendedPresets.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                Recommended
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {recommendedPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant="outline"
                    className="w-full justify-between h-auto py-4 text-left"
                    onClick={() => handlePresetClick(preset)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        {presetIcon(preset.icon)}
                      </div>
                      <div>
                        <span className="font-medium block">{preset.label}</span>
                        {preset.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {preset.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Button>
                ))}
              </div>
            </section>
          )}

          {/* Courses */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Courses
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors">
                <Checkbox
                  checked={allCoursesSelected}
                  onCheckedChange={handleAllCoursesToggle}
                />
                <span className="text-sm font-medium">All courses</span>
              </label>
              {courses.map((course) => (
                <label
                  key={course.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
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
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Narrow by (optional)
            </h2>
            <RadioGroup
              value={narrowBy || ''}
              onValueChange={(v) => setNarrowBy(v as NarrowByOption || null)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {[
                { value: 'midterm', label: 'Upcoming Midterm', icon: Calendar },
                { value: 'exam', label: 'Past Exam', icon: Target },
                { value: 'topics', label: 'Topics', icon: Star },
                { value: 'types', label: 'Question Types', icon: RefreshCw },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    narrowBy === option.value 
                      ? "border-primary bg-primary/5" 
                      : "hover:bg-accent/50"
                  )}
                >
                  <RadioGroupItem value={option.value} />
                  <option.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </RadioGroup>
          </section>

          {/* Conditional content based on narrowBy */}
          <AnimatePresence mode="wait">
            {narrowBy === 'midterm' && (
              <motion.section
                key="midterm"
                {...fadeSlideUp}
                transition={{ duration: duration.fast }}
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Midterm
                </h2>
                <RadioGroup
                  value={filters.midtermNumber?.toString() || ''}
                  onValueChange={(v) => setMidtermNumber(v ? parseInt(v) : null)}
                  className="space-y-2"
                >
                  {upcomingExams
                    .filter(e => e.midtermNumber)
                    .map((exam) => (
                      <label
                        key={exam.id}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors",
                          filters.midtermNumber === exam.midtermNumber
                            ? "border-primary bg-primary/5"
                            : "hover:bg-accent/50"
                        )}
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
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Topics
                </h2>
                <div className="space-y-3">
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
                      className="border rounded-lg"
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-accent/50 rounded-t-lg">
                        <span className="text-sm font-medium">{group.label}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
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
                      <CollapsibleContent className="border-t">
                        <div className="p-2 grid gap-1 sm:grid-cols-2">
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
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </motion.section>
            )}

            {narrowBy === 'types' && (
              <motion.section
                key="types"
                {...fadeSlideUp}
                transition={{ duration: duration.fast }}
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Question Types
                </h2>
                <RadioGroup
                  value={filters.questionTypeId || ''}
                  onValueChange={(v) => setQuestionTypeId(v || null)}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {questionTypes.map((type) => (
                    <label
                      key={type.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        filters.questionTypeId === type.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent/50"
                      )}
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
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Past Exams
                </h2>
                <div className="space-y-3">
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
                      className="border rounded-lg"
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-accent/50 rounded-t-lg">
                        <span className="text-sm font-medium">{yearGroup.year}</span>
                        <ChevronRight className={cn(
                          'h-4 w-4 transition-transform',
                          expandedYears.includes(yearGroup.year) && 'rotate-90'
                        )} />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t">
                        <div className="p-2 space-y-2">
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
                                <span className="text-sm text-muted-foreground">{sem.semester}</span>
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
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Footer */}
      <footer className="border-t bg-card px-4 py-4 flex gap-3">
        <Button
          variant="outline"
          onClick={handleClear}
          className="flex-1"
          disabled={!hasActiveFilters}
        >
          Clear All
        </Button>
        <Button
          onClick={handleStartPractice}
          className="flex-1"
        >
          Start Practice
        </Button>
      </footer>
    </PageTransition>
  );
}
