import { PageTransition } from "@/components/motion/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTopicMastery, useTopics } from "@/hooks/use-study";
import { useAuth } from "@/hooks/use-auth";
import { TrendingUp, Brain, Clock, Target, Loader2 } from "lucide-react";

function getMasteryColor(mastery: number): string {
  if (mastery >= 0.8) return "text-success";
  if (mastery >= 0.6) return "text-primary";
  if (mastery >= 0.4) return "text-accent";
  return "text-destructive";
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.25, ease: "easeOut" }
    },
  };

  if (isLoading) {
    return (
      <PageTransition className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </PageTransition>
    );
  }

  // Merge all topics with mastery data
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
    };
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
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <motion.div variants={itemVariants}>
            <Card>
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
            <Card>
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
            <Card>
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
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Clock className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{Math.round(avgRetention * 100)}%</p>
                    <p className="text-xs text-muted-foreground">Avg Retention</p>
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
                className="space-y-4"
              >
                {topicsWithMastery.map((topic) => (
                  <motion.div
                    key={topic.id}
                    variants={itemVariants}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium">{topic.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {topic.questionsAttempted} questions • Last practiced {topic.lastPracticed}
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
                          <ProgressBar 
                            value={topic.retention * 100} 
                            className="h-2 [&>div]:bg-accent"
                          />
                        </div>
                        <span className="text-xs font-medium w-10 text-right">
                          {Math.round(topic.retention * 100)}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
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

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''} ago`;
}
