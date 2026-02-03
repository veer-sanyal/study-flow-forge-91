import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/motion/PageTransition';

interface NoCoursesEmptyStateProps {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
}

export function NoCoursesEmptyState({
  title = "You're not enrolled in any courses yet.",
  subtitle = "Enroll in a course to generate a study plan and track progress.",
  buttonLabel = "Enroll in courses",
}: NoCoursesEmptyStateProps): React.ReactElement {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">{title}</p>
              {subtitle && (
                <p className="text-sm text-muted-foreground/70">{subtitle}</p>
              )}
            </div>
            <Button onClick={() => navigate('/settings')}>
              {buttonLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
