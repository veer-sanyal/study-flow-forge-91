import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { useFocusContext } from "@/contexts/FocusContext";
import { useCourses } from "@/hooks/use-focus";
import { duration, easing, stagger } from "@/lib/motion";

export function StudyLoadingScreen() {
  const { filterSummary, filters } = useFocusContext();
  const { data: courses = [] } = useCourses();

  // Resolve course name for display
  const courseName =
    filters.courseIds.length === 1
      ? courses.find((c) => c.id === filters.courseIds[0])?.title
      : null;
  const displaySummary = courseName
    ? filterSummary.replace("{{course}}", courseName)
    : filterSummary;

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-4">
      <motion.div
        className="flex flex-col items-center gap-6 max-w-sm text-center"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: { staggerChildren: stagger.slow, delayChildren: 0.1 },
          },
        }}
      >
        {/* Pulsing icon */}
        <motion.div
          variants={{
            hidden: { opacity: 0, scale: 0.8 },
            visible: { opacity: 1, scale: 1 },
          }}
          transition={{ duration: duration.slow, ease: easing.easeOut }}
          className="relative"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          {/* Ping ring */}
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-primary/30"
            animate={{ scale: [1, 1.3], opacity: [0.6, 0] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        </motion.div>

        {/* Text */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: duration.normal, ease: easing.easeOut }}
          className="space-y-2"
        >
          <h2 className="text-lg font-semibold">Preparing your session</h2>
          <p className="text-sm text-muted-foreground">{displaySummary}</p>
        </motion.div>

        {/* Skeleton question card preview */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: duration.normal, ease: easing.easeOut }}
          className="w-full space-y-3"
        >
          {/* Badge row skeleton */}
          <div className="flex gap-2">
            <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
          </div>

          {/* Question card skeleton */}
          <div className="rounded-lg border-2 border-primary/10 bg-card p-5 space-y-3">
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
          </div>

          {/* Choice skeletons */}
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-11 rounded-lg border bg-card animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
