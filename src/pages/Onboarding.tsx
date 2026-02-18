import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useUserSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, BookOpen, Settings2 } from "lucide-react";
import { toast } from "sonner";

export default function Onboarding() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const {
        coursePacks,
        isLoadingCoursePacks,
        enroll,
        isEnrolling
    } = useEnrollments();
    const {
        updateSettings,
        isUpdating: isUpdatingSettings
    } = useUserSettings();

    const [step, setStep] = useState(1);
    const [isFinishing, setIsFinishing] = useState(false);
    const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
    const [localSettings, setLocalSettings] = useState({
        daily_goal: 10,
        pace_offset: 1, // 0 = standard, 1 = ahead, -1 = relax
        notifications_enabled: true
    });

    // Handle course toggle
    const toggleCourse = (courseId: string) => {
        setSelectedCourses(prev =>
            prev.includes(courseId)
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    // Submit Logic
    const handleFinish = async () => {
        setIsFinishing(true);
        try {
            // 1. Save Settings
            await updateSettings({
                daily_goal: localSettings.daily_goal,
                pace_offset: localSettings.pace_offset,
                notifications_enabled: localSettings.notifications_enabled
            });

            // 2. Enroll in courses sequentially
            for (const courseId of selectedCourses) {
                await enroll(courseId);
            }

            // 3. Wait for enrollments cache to be refreshed before navigating
            // This prevents the EnrollmentGuard from redirecting back
            await queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            await queryClient.refetchQueries({ queryKey: ['enrollments'] });

            toast.success("All set! Welcome to your study space.");
            navigate("/study", { replace: true });
        } catch (error) {
            console.error("Onboarding error:", error);
            // Log specific error details
            if (error instanceof Error) {
                console.error("Error message:", error.message);
                console.error("Error stack:", error.stack);
            }
            toast.error("Something went wrong. Please try again.");
            setIsFinishing(false);
        }
    };

    if (isLoadingCoursePacks) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
            <Card className="w-full max-w-2xl shadow-lg border-2">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        {step === 1 && <BookOpen className="h-8 w-8 text-primary" />}
                        {step === 2 && <Settings2 className="h-8 w-8 text-primary" />}
                        {step === 3 && <CheckCircle2 className="h-8 w-8 text-primary" />}
                    </div>
                    <CardTitle className="text-3xl font-bold">
                        {step === 1 && "Select Your Courses"}
                        {step === 2 && "Customize Your Habit"}
                        {step === 3 && "You're All Set!"}
                    </CardTitle>
                    <CardDescription className="text-lg">
                        {step === 1 && "Choose the courses you are currently taking."}
                        {step === 2 && "Tell us how you want to learn."}
                        {step === 3 && "We've built your personal learning path."}
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-8">
                    {/* STEP 1: COURSES */}
                    {step === 1 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {coursePacks.map((pack) => (
                                <div
                                    key={pack.id}
                                    className={`relative flex cursor-pointer items-start space-x-3 rounded-lg border p-4 shadow-sm transition-all hover:border-primary ${selectedCourses.includes(pack.id) ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                                        }`}
                                    onClick={() => toggleCourse(pack.id)}
                                >
                                    <Checkbox
                                        checked={selectedCourses.includes(pack.id)}
                                        onCheckedChange={() => toggleCourse(pack.id)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <p className="font-semibold">{pack.title}</p>
                                        <p className="text-sm text-muted-foreground line-clamp-2">
                                            {pack.description || "No description available."}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {coursePacks.length === 0 && (
                                <p className="col-span-2 text-center text-muted-foreground">
                                    No courses available at the moment.
                                </p>
                            )}
                        </div>
                    )}

                    {/* STEP 2: HABITS */}
                    {step === 2 && (
                        <div className="space-y-8">

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">Daily Goal</Label>
                                    <span className="text-sm text-muted-foreground">{localSettings.daily_goal} questions</span>
                                </div>
                                <Slider
                                    min={5}
                                    max={50}
                                    step={5}
                                    value={[localSettings.daily_goal]}
                                    onValueChange={(v) => setLocalSettings(prev => ({ ...prev, daily_goal: v[0] }))}
                                    className="py-2"
                                />
                                <p className="text-sm text-muted-foreground">
                                    How many questions do you want to solve each day?
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">Learning Pace</Label>
                                    <span className="text-sm text-muted-foreground">
                                        {localSettings.pace_offset === 0 ? "Standard" :
                                            localSettings.pace_offset > 0 ? "Accelerated" : "Relaxed"}
                                    </span>
                                </div>
                                <Slider
                                    min={-2}
                                    max={2}
                                    step={1}
                                    value={[localSettings.pace_offset]}
                                    onValueChange={(v) => setLocalSettings(prev => ({ ...prev, pace_offset: v[0] }))}
                                    className="py-2"
                                />
                                <p className="text-sm text-muted-foreground">
                                    Adjust how far ahead of the class schedule you want to study.
                                </p>
                            </div>

                            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-semibold">Study Reminders</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Receive notifications to keep your streak alive.
                                    </p>
                                </div>
                                <Switch
                                    checked={localSettings.notifications_enabled}
                                    onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, notifications_enabled: checked }))}
                                />
                            </div>

                        </div>
                    )}

                    {/* STEP 3: CONFIRM */}
                    {step === 3 && (
                        <div className="text-center space-y-4">
                            <p className="text-muted-foreground">
                                You've selected <span className="font-semibold text-foreground">{selectedCourses.length} courses</span> and set a goal of <span className="font-semibold text-foreground">{localSettings.daily_goal} questions/day</span>.
                            </p>
                            <div className="flex justify-center py-4">
                                <div className="h-2 w-24 rounded-full bg-primary/20">
                                    <div className="h-full w-24 animate-pulse rounded-full bg-primary"></div>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Click below to initialize your dashboard and start your first diagnostic quiz (if applicable).
                            </p>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-between p-8 pt-0">
                    {step > 1 ? (
                        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={isEnrolling || isUpdatingSettings}>
                            Back
                        </Button>
                    ) : (
                        <div></div> // Spacer
                    )}

                    {step < 3 ? (
                        <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && selectedCourses.length === 0 && coursePacks.length > 0}>
                            Next
                        </Button>
                    ) : (
                        <Button onClick={handleFinish} disabled={isFinishing || isEnrolling || isUpdatingSettings} className="min-w-[120px]">
                            {isFinishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Get Started"}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
