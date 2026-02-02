import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type TopicProgressRow, type TopicSortKey } from '@/types/progress';
import { TopicRiskRow } from './TopicRiskRow';

interface TopicRiskListProps {
  topics: TopicProgressRow[];
  onPractice: (topicId: string) => void;
}

const SORT_OPTIONS: Array<{ value: TopicSortKey; label: string }> = [
  { value: 'most-at-risk', label: 'Most at-risk' },
  { value: 'most-due', label: 'Most due' },
  { value: 'lowest-stability', label: 'Lowest stability' },
  { value: 'highest-difficulty', label: 'Highest difficulty' },
];

function sortTopics(topics: TopicProgressRow[], key: TopicSortKey): TopicProgressRow[] {
  const sorted = [...topics];
  switch (key) {
    case 'most-at-risk':
      return sorted.sort((a, b) => (a.r_now ?? 1) - (b.r_now ?? 1));
    case 'most-due':
      return sorted.sort((a, b) => b.due_today - a.due_today);
    case 'lowest-stability':
      return sorted.sort(
        (a, b) => (a.median_stability ?? Infinity) - (b.median_stability ?? Infinity),
      );
    case 'highest-difficulty':
      return sorted.sort(
        (a, b) => (b.median_difficulty ?? 0) - (a.median_difficulty ?? 0),
      );
  }
}

export function TopicRiskList({ topics, onPractice }: TopicRiskListProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<TopicSortKey>('most-at-risk');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const sortedTopics = useMemo(() => sortTopics(topics, sortKey), [topics, sortKey]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Topics</CardTitle>
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as TopicSortKey)}
          >
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {sortedTopics.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No topics available yet. Start studying to see your progress!
          </p>
        ) : (
          <div className="space-y-2">
            {sortedTopics.map((topic) => (
              <TopicRiskRow
                key={topic.topic_id}
                topic={topic}
                isExpanded={expandedTopicId === topic.topic_id}
                onToggle={() =>
                  setExpandedTopicId(
                    expandedTopicId === topic.topic_id ? null : topic.topic_id,
                  )
                }
                onPractice={onPractice}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
