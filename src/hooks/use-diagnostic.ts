import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface DiagnosticQuestion {
    question: any; // Using 'any' for now to match Study.tsx types quickly, ideally proper Question type
    topicId: string;
    topicTitle: string;
}

export function useDiagnosticData(coursePackId: string | null) {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['diagnostic-data', coursePackId, user?.id],
        enabled: !!user && !!coursePackId,
        queryFn: async () => {
            if (!user || !coursePackId) return null;

            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

            // 1. Get covered topics by finding topics with scheduled_date <= today
            // First try topics with course_pack_id, then try via questions if that's empty
            let coveredTopicIds = new Set<string>();

            // Try 1: Topics directly linked to course_pack_id
            const { data: directTopics, error: directError } = await supabase
                .from('topics')
                .select('id')
                .eq('course_pack_id', coursePackId)
                .lte('scheduled_date', today)
                .not('scheduled_date', 'is', null);

            if (directError) {
                console.error('Error fetching direct topics:', directError);
            } else if (directTopics && directTopics.length > 0) {
                directTopics.forEach(t => coveredTopicIds.add(t.id));
            }

            // Try 2: If no direct topics found, find topics through questions for this course
            if (coveredTopicIds.size === 0) {
                // Get all questions for this course
                const { data: courseQuestions, error: qError } = await supabase
                    .from('questions')
                    .select('topic_ids')
                    .eq('course_pack_id', coursePackId)
                    .not('topic_ids', 'is', null);

                if (qError) {
                    console.error('Error fetching course questions:', qError);
                } else if (courseQuestions) {
                    // Collect all unique topic IDs from questions
                    const allTopicIds = new Set<string>();
                    courseQuestions.forEach(q => {
                        q.topic_ids?.forEach((id: string) => allTopicIds.add(id));
                    });

                    if (allTopicIds.size > 0) {
                        // Now check which of these topics are covered (scheduled_date <= today)
                        const { data: coveredTopics, error: coveredError } = await supabase
                            .from('topics')
                            .select('id')
                            .in('id', Array.from(allTopicIds))
                            .lte('scheduled_date', today)
                            .not('scheduled_date', 'is', null);

                        if (!coveredError && coveredTopics) {
                            coveredTopics.forEach(t => coveredTopicIds.add(t.id));
                        }
                    }
                }
            }

            if (coveredTopicIds.size === 0) return { questions: [], topicCount: 0, topicDetails: [] };

            // 2. Check which topics are ALREADY mastered/attempted
            const { data: interactionData, error: masteryError } = await supabase
                .from('topic_mastery')
                .select('topic_id')
                .eq('user_id', user.id)
                .in('topic_id', Array.from(coveredTopicIds));

            if (masteryError) throw masteryError;

            const masteredTopicIds = new Set(interactionData?.map(row => row.topic_id));

            // Filter for unassessed topics
            const unassessedTopicIds = Array.from(coveredTopicIds).filter(id => !masteredTopicIds.has(id));

            if (unassessedTopicIds.length === 0) return { questions: [], topicCount: 0, topicDetails: [] };

            // 3. Rate limit: Max 10 topics for diagnostic to keep it short
            const targetTopicIds = unassessedTopicIds.slice(0, 10);

            // 4. Fetch questions for these topics
            // We want ~1 question per topic. Hard to do efficient "1 per group" in Supabase API without RPC.
            // Strategy: Fetch 'limit' questions for EACH topic? Too many requests.
            // Strategy: Fetch a batch of questions that cover these topics and dedupe client side.
            const { data: questions, error: questionsError } = await supabase
                .from('questions')
                .select('*, question_types(id, name)')
                .overlaps('topic_ids', targetTopicIds)
                .limit(50); // Fetch enough to find matches

            if (questionsError) throw questionsError;

            // 5. Select ONE question per topic
            const selectedQuestions: DiagnosticQuestion[] = [];
            const usedQuestionIds = new Set<string>();

            // Fetch topic details for titles
            const { data: topics } = await supabase
                .from('topics')
                .select('id, title')
                .in('id', targetTopicIds);

            const topicMap = new Map(topics?.map(t => [t.id, t.title]));

            for (const topicId of targetTopicIds) {
                // Find a question for this topic that hasn't been used
                const match = questions?.find(q =>
                    q.topic_ids?.includes(topicId) && !usedQuestionIds.has(q.id)
                );

                if (match) {
                    usedQuestionIds.add(match.id);
                    selectedQuestions.push({
                        question: match,
                        topicId,
                        topicTitle: topicMap.get(topicId) || 'Unknown Topic'
                    });
                }
            }

            return {
                questions: selectedQuestions.map(sq => sq.question), // Return just questions for the player
                topicDetails: selectedQuestions,
                topicCount: selectedQuestions.length
            };
        }
    });
}

// Hook to submit diagnostic results specifically
export function useSubmitDiagnostic() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ results }: { results: Array<{ topicId: string, isCorrect: boolean }> }) => {
            if (!user) throw new Error("No user");

            // Bulk upsert topic mastery
            // If correct -> 0.6, If wrong -> 0.2 (arbitrary baselines for getting started)
            const updates = results.map(r => ({
                user_id: user.id,
                topic_id: r.topicId,
                mastery_0_1: r.isCorrect ? 0.6 : 0.2,
                questions_attempted: 1,
                questions_correct: r.isCorrect ? 1 : 0,
                // Optional: retention_0_1 initialization
            }));

            // We need to upsert. `topic_mastery` has (user_id, topic_id) unique constraint usually?
            // Let's assume onConflict works.
            const { error } = await supabase
                .from('topic_mastery')
                .upsert(updates, { onConflict: 'user_id, topic_id' });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
            queryClient.invalidateQueries({ queryKey: ['study-dashboard'] });
        }
    });
}
