import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Star, Calendar, Target, RefreshCw, Check, BookOpen } from 'lucide-react';
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
import { getCourseCardColor } from '@/lib/examUtils';

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

  const [expandedTopicGroups, setExpandedTopicGroups] = useState<number[]>([]);

  const hasCoursesSelected = filters.courseIds.length > 0;

  // Get upcoming midterms (future exams only)
  const upcomingMidterms = upcomingExams.filter(
    e => e.midtermNumber && e.daysUntil !== null && e.daysUntil >= 0
  );

  const handleCourseToggle = (courseId: string) => {
    if (filters.courseIds.includes(courseId)) {
      setCourseIds(filters.courseIds.filter(id => id !== courseId));
    } else {
      setCourseIds([...filters.courseIds, courseId]);
    }
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
        <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-8">
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

          {/* Courses - Bigger, more visual cards */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Select Course
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course, index) => {
                const isSelected = filters.courseIds.includes(course.id);
                const { gradient } = getCourseCardColor(course.title, index);
                
                return (
                  <motion.button
                    key={course.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCourseToggle(course.id)}
                    className={cn(
                      "relative p-6 rounded-xl text-left transition-all overflow-hidden",
                      "bg-gradient-to-br",
                      gradient,
                      isSelected 
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background" 
                        : "opacity-80 hover:opacity-100"
                    )}
                  >
                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-white/90 flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    
                    {/* Course icon */}
                    <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center mb-4">
                      <BookOpen className="h-5 w-5 text-white" />
                    </div>
                    
                    {/* Course title */}
                    <h3 className="font-semibold text-white text-lg leading-tight line-clamp-2">
                      {course.title}
                    </h3>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* Upcoming Midterms - Show automatically when courses are selected */}
          <AnimatePresence>
            {hasCoursesSelected && upcomingMidterms.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: duration.fast }}
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  Upcoming Exams
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcomingMidterms.map((exam) => (
                    <button
                      key={exam.id}
                      onClick={() => setMidtermNumber(exam.midtermNumber)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left",
                        filters.midtermNumber === exam.midtermNumber
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-accent/50"
                      )}
                    >
                      <div>
                        <span className="font-medium block">{exam.title}</span>
                        {exam.eventDate && (
                          <span className="text-sm text-muted-foreground">
                            {new Date(exam.eventDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        )}
                      </div>
                      {exam.daysUntil !== null && (
                        <Badge 
                          variant={exam.daysUntil <= 3 ? "destructive" : "secondary"} 
                          className="text-xs shrink-0"
                        >
                          {exam.daysUntil === 0 ? 'Today' : 
                           exam.daysUntil === 1 ? 'Tomorrow' : 
                           `${exam.daysUntil} days`}
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: duration.fast, delay: 0.05 }}
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Filter by (optional)
                </h2>
                <RadioGroup
                  value={narrowBy || ''}
                  onValueChange={(v) => setNarrowBy(v as NarrowByOption || null)}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {[
                    { value: 'exam', label: 'Past Exams', icon: Target },
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

            {narrowBy === 'types' && hasCoursesSelected && (
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

            {narrowBy === 'exam' && hasCoursesSelected && (
              <motion.section
                key="exam"
                {...fadeSlideUp}
                transition={{ duration: duration.fast }}
                className="space-y-4"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Past Exams
                </h2>
                <div className="space-y-4">
                  {pastExams.map((group) => (
                    <div key={group.examType} className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground">
                        {group.examType}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.exams.map((exam) => (
                          <label
                            key={exam.name}
                            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
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
          disabled={!hasCoursesSelected}
        >
          Start Practice
        </Button>
      </footer>
    </PageTransition>
  );
}
