import { Target, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TARGET_RETENTION } from '@/lib/fsrs';
import { useNorthStar } from '@/hooks/use-north-star';

const pct = (x: number): string => `${Math.round(x * 100)}%`;

// Guardrail breach checks — see docs/metrics.md. Each returns a message when tripped.
function breaches(g: {
  cram_rate: number;
  high_conf_wrong_rate: number;
  retention_30d: number;
  max_topic_share: number;
  attempts: number;
}): string[] {
  const out: string[] = [];
  if (g.attempts === 0) return out;
  if (g.cram_rate > 0.3) out.push(`${pct(g.cram_rate)} of answers were rushed (<8s) — possible speed-running`);
  if (g.high_conf_wrong_rate > 0.2) out.push(`${pct(g.high_conf_wrong_rate)} confident-but-wrong — revisit these topics`);
  if (g.retention_30d > 0 && g.retention_30d < TARGET_RETENTION) out.push(`Older mastery slipping (${pct(g.retention_30d)} recall on 30-day-old items)`);
  if (g.max_topic_share > 0.6) out.push(`${pct(g.max_topic_share)} of practice on one topic — broaden coverage`);
  return out;
}

export function NorthStarCard(): React.ReactElement | null {
  const { data } = useNorthStar();
  if (!data) return null; // RPC not deployed or no data → hide

  const { north_star, inputs, guardrails } = data;
  const flags = breaches(guardrails);

  const inputItems = [
    { label: 'Topics this week', value: String(inputs.topic_breadth) },
    { label: 'New-item accuracy', value: pct(inputs.new_first_attempt_acc) },
    { label: 'Review pass rate', value: pct(inputs.promotion_rate) },
    { label: 'Reviews kept up', value: pct(inputs.review_completion_rate) },
  ];

  return (
    <Card className="bg-surface shadow-surface rounded-xl overflow-hidden">
      <CardContent className="py-5 space-y-4">
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 text-primary" />
          <div>
            <div className="text-3xl font-semibold leading-none">
              {north_star.durable_mastery_items}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              items durably mastered this week
              <span className="block text-xs">retained &amp; re-proven after ≥7 days — your learning that stuck</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {inputItems.map((it) => (
            <div key={it.label} className="rounded-lg bg-muted/40 px-3 py-2">
              <div className="text-lg font-medium">{it.value}</div>
              <div className="text-xs text-muted-foreground">{it.label}</div>
            </div>
          ))}
        </div>

        {flags.length > 0 && (
          <div className="space-y-1">
            {flags.map((f) => (
              <div key={f} className="flex items-start gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
