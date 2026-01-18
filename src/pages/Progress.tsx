import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTopicMastery, useTopics } from "@/hooks/use-study";
import { useAuth } from "@/hooks/use-auth";
import { TrendingUp, Brain, Clock, Target, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

function getMasteryColor(mastery: number): string {
  if (mastery >= 0.8) return "text-success";
  if (mastery >= 0.6) return "text-primary";
  if (mastery >= 0.4) return "text-accent";
  return "text-destructive";
}

function getRetentionStatus(retention: number): { label: string; color: string; icon: React.ReactNode } {
  if (retention >= 0.8) return { label: "Strong", color: "text-success", icon: <Sparkles className="h-3 w-3" /> };
  if (retention >= 0.5) return { label: "Fading", color: "text-amber-500", icon: <Clock className="h-3 w-3" /> };
  return { label: "Review needed", color: "text-destructive", icon: <AlertTriangle className="h-3 w-3" /> };
}

export default function Progress() {
  const prefersReducedMotion = useReducedMotion();
  const { user } = useAuth();
  const { data: masteryData, isLoading: masteryLoading } = useTopicMastery();
  const { data: allTopics, isLoading: topicsLoading } = useTopics();

  const isLoading = masteryLoading || topicsLoading;

  // Calculate stats
  const totalQuestions = masteryData?.reduce((sum, tm) => sum + tm.questions_attempted, 0) || 0;
  const totalCorrect = masteryData?.reduce((sum, tm) => sum + tm.questions_correct, 0) || 0;
  const avgMastery = masteryData && masteryData.length > 0 
    ? masteryData.reduce((sum, tm) => sum + Number(tm.mastery_0_1), 0) / masteryData.length 
    : 0;
  const avgRetention = masteryData && masteryData.length > 0 
    ? masteryData.reduce((sum, tm) => sum + Number(tm.retention_0_1), 0) / masteryData.length 
    : 0;

  // Count topics needing review
  const topicsNeedingReview = masteryData?.filter(tm => Number(tm.retention_0_1) < 0.5).length || 0;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.04,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.2, ease: "easeOut" }
    },
  };

  if (isLoading) {
    return (
      <PageTransition className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </PageTransition>
    );
  }

  // Merge all topics with mastery data, sorted by retention (lowest first = needs review)
  const topicsWithMastery = allTopics?.map(topic => {
    const mastery = masteryData?.find(m => m.topic_id === topic.id);
    return {
      id: topic.id,
      name: topic.title,
      description: topic.description,
      mastery: mastery ? Number(mastery.mastery_0_1) : 0,
      retention: mastery ? Number(mastery.retention_0_1) : 0,
      questionsAttempted: mastery?.questions_attempted || 0,
      questionsCorrect: mastery?.questions_correct || 0,
      lastPracticed: mastery?.last_practiced_at 
        ? formatTimeAgo(new Date(mastery.last_practiced_at))
        : 'Never',
      hasPracticed: !!mastery?.last_practiced_at,
    };
  }).sort((a, b) => {
    // Sort by: practiced topics first, then by retention (lowest first)
    if (a.hasPracticed && !b.hasPracticed) return -1;
    if (!a.hasPracticed && b.hasPracticed) return 1;
    return a.retention - b.retention;
  }) || [];

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Progress</h1>
          <p className="text-muted-foreground mt-1">Track your mastery and retention across topics</p>
        </div>

        {/* Stats Overview */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <motion.div variants={itemVariants}>
            <Card className="h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalQuestions}</p>
                    <p className="text-xs text-muted-foreground">Questions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <TrendingUp className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Accuracy</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="h-full">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Brain className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{Math.round(avgMastery * 100)}%</p>
                    <p className="text-xs text-muted-foreground">Avg Mastery</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className={cn(
              "h-full",
              topicsNeedingReview > 0 && "border-amber-500/50"
            )}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    topicsNeedingReview > 0 ? "bg-amber-500/10" : "bg-accent/10"
                  )}>
                    <Clock className={cn(
                      "h-5 w-5",
                      topicsNeedingReview > 0 ? "text-amber-500" : "text-accent"
                    )} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {topicsNeedingReview > 0 ? topicsNeedingReview : Math.round(avgRetention * 100) + '%'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {topicsNeedingReview > 0 ? 'Need Review' : 'Avg Retention'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Topic List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Topics</CardTitle>
          </CardHeader>
          <CardContent>
            {topicsWithMastery.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No topics available yet. Start studying to see your progress!
              </p>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-3"
              >
                {topicsWithMastery.map((topic) => {
                  const retentionStatus = getRetentionStatus(topic.retention);
                  
                  return (
                    <motion.div
                      key={topic.id}
                      variants={itemVariants}
                      className={cn(
                        "p-4 rounded-lg border bg-card transition-colors",
                        topic.retention < 0.5 && topic.hasPracticed && "border-amber-500/30 bg-amber-500/5"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{topic.name}</h3>
                            {topic.hasPracticed && topic.retention < 0.5 && (
                              <span className={cn(
                                "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                                "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              )}>
                                {retentionStatus.icon}
                                {retentionStatus.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {topic.questionsAttempted > 0 
                              ? `${topic.questionsAttempted} questions • ${topic.lastPracticed}`
                              : 'Not practiced yet'
                            }
                          </p>
                        </div>
                        <span className={`text-lg font-bold ${getMasteryColor(topic.mastery)}`}>
                          {Math.round(topic.mastery * 100)}%
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16">Mastery</span>
                          <div className="flex-1">
                            <ProgressBar 
                              value={topic.mastery * 100} 
                              className="h-2"
                            />
                          </div>
                          <span className="text-xs font-medium w-10 text-right">
                            {Math.round(topic.mastery * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16">Retention</span>
                          <div className="flex-1">
                            <div className="relative">
                              <ProgressBar 
                                value={topic.retention * 100} 
                                className={cn(
                                  "h-2",
                                  topic.retention >= 0.8 && "[&>div]:bg-success",
                                  topic.retention >= 0.5 && topic.retention < 0.8 && "[&>div]:bg-amber-500",
                                  topic.retention < 0.5 && "[&>div]:bg-destructive"
                                )}
                              />
                            </div>
                          </div>
                          <span className={cn(
                            "text-xs font-medium w-10 text-right",
                            topic.retention < 0.5 && "text-destructive"
                          )}>
                            {Math.round(topic.retention * 100)}%
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}