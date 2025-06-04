
"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Home, Calculator, History, Edit, Loader2, Clock, ListChecks, Plane } from "lucide-react"; // Added Plane
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";

const WagesManagementPage = () => {
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [authCheckLoading, setAuthCheckLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('username');
        if (!storedUser) {
            router.replace('/');
        } else {
            setCurrentUser(storedUser);
            if (storedUser === 'Priyanka Sharma') {
                // Priyanka can now access this page, specific step visibility will handle her options
                setAuthCheckLoading(false);
            } else {
                setAuthCheckLoading(false);
            }
        }
    }, [router]);

     const handleNavigation = (path: string) => {
        setLoading((prev) => ({ ...prev, [path]: true }));
        router.push(path);
    };

    if (authCheckLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-black/70">
                <Loader2 className="h-12 w-12 animate-spin text-white" />
            </div>
        );
    }

    const wageSteps = [
        {
            title: "Step 1: Daily Work Input",
            description: "Enter daily hours and attendance for employees.",
            buttonText: "Time Sheet Entry",
            icon: Clock,
            path: "/wages/timesheet",
            visibleTo: ["ADMIN", "Karishma", "Renuka", "Priyanka Sharma"]
        },
        {
            title: "Step 2: Employee Leaves",
            description: "Submit and manage employee leave requests.",
            buttonText: "Manage Leaves",
            icon: Plane,
            path: "/wages/leaves",
            visibleTo: ["ADMIN", "Karishma", "Renuka", "Priyanka Sharma"] // Added Priyanka Sharma
        },
        {
            title: "Step 3: Review Timesheets & Submit",
            description: "Review recorded timesheets and submit completed periods for admin approval.",
            buttonText: "Time Sheet Records & Review",
            icon: ListChecks,
            path: "/wages/timesheet-records",
            visibleTo: ["ADMIN", "Karishma", "Renuka", "Priyanka Sharma"]
        },
        {
            title: "Step 4: Process Approved Timesheets",
            description: "Calculate final wages based on admin-approved timesheet periods.",
            buttonText: "Calculate Final Wages",
            icon: Calculator,
            path: "/wages/create",
            visibleTo: ["ADMIN", "Karishma", "Renuka"]
        },
        {
            title: "Step 5: View & Manage Final Wages",
            description: "View, export, and manage processed wage records (pending, approved, declined).",
            buttonText: "View Wages Records",
            icon: History,
            path: "/wages/records",
            visibleTo: ["ADMIN", "Karishma", "Renuka"]
        },
        {
            title: "Step 6: Correct Final Wages (If Needed)",
            description: "Edit wage records that have been submitted or approved, if corrections are necessary.",
            buttonText: "Edit Wages Records",
            icon: Edit,
            path: "/wages/edit",
            visibleTo: ["ADMIN", "Karishma", "Renuka"]
        }
    ];

    const visibleSteps = wageSteps.filter(step => currentUser && step.visibleTo.includes(currentUser));
    const stepsRow1 = visibleSteps.slice(0, 3); 
    const stepsRow2 = visibleSteps.slice(3);  


    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
            <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
                <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
                    <Link href="/dashboard" passHref className="ml-4">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                            <ArrowLeft className="h-5 w-5" />
                            <span className="sr-only">Back to Dashboard</span>
                        </Button>
                    </Link>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
                        Wages Management Workflow
                    </h1>
                    <Link href="/dashboard" passHref className="mr-4">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                            <Home className="h-5 w-5" />
                            <span className="sr-only">Dashboard</span>
                        </Button>
                    </Link>
                </header>

                <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6">
                    <div className="w-full max-w-6xl mx-auto">
                        {stepsRow1.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mb-8">
                                {stepsRow1.map((step) => (
                                    <Card key={step.path} className="w-full bg-black/40 backdrop-blur-sm border border-white/20 shadow-xl flex flex-col">
                                        <CardHeader className="flex-shrink-0">
                                            <CardTitle className="text-md lg:text-lg text-white flex items-center">
                                                <step.icon className="h-5 w-5 mr-2.5 text-purple-400 flex-shrink-0" />
                                                {step.title}
                                            </CardTitle>
                                            <CardDescription className="text-xs lg:text-sm text-gray-300 pt-1">
                                                {step.description}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex-grow flex flex-col justify-end">
                                            <Button
                                                onClick={() => handleNavigation(step.path)}
                                                variant="secondary"
                                                size="lg"
                                                className="w-full flex items-center justify-center gap-2 hover:bg-purple-700/80 transition-all duration-300 bg-purple-600/70 border border-purple-500/50 backdrop-blur-sm text-white mt-auto text-sm py-2"
                                                disabled={loading[step.path]}
                                            >
                                                {loading[step.path] ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <span className="truncate">{step.buttonText}</span>
                                                )}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {stepsRow2.length > 0 && (
                             <div className={`grid grid-cols-1 ${stepsRow2.length === 1 ? 'md:grid-cols-1 justify-items-center' : 'md:grid-cols-2'} lg:grid-cols-${stepsRow2.length === 1 ? '3' : (stepsRow2.length === 2 ? '2' : '3')} gap-6 lg:gap-8 ${stepsRow2.length === 1 ? 'lg:justify-items-center' : ''}`}>
                                {stepsRow2.map((step, index) => (
                                    <div
                                        key={step.path}
                                        className={cn(
                                            "w-full",
                                            stepsRow2.length === 1 && "lg:col-start-2 lg:max-w-md", 
                                            stepsRow2.length === 2 && "" 
                                        )}
                                    >
                                        <Card className="w-full h-full bg-black/40 backdrop-blur-sm border border-white/20 shadow-xl flex flex-col">
                                            <CardHeader className="flex-shrink-0">
                                                <CardTitle className="text-md lg:text-lg text-white flex items-center">
                                                    <step.icon className="h-5 w-5 mr-2.5 text-purple-400 flex-shrink-0" />
                                                    {step.title}
                                                </CardTitle>
                                                <CardDescription className="text-xs lg:text-sm text-gray-300 pt-1">
                                                    {step.description}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="flex-grow flex flex-col justify-end">
                                                <Button
                                                    onClick={() => handleNavigation(step.path)}
                                                    variant="secondary"
                                                    size="lg"
                                                    className="w-full flex items-center justify-center gap-2 hover:bg-purple-700/80 transition-all duration-300 bg-purple-600/70 border border-purple-500/50 backdrop-blur-sm text-white mt-auto text-sm py-2"
                                                    disabled={loading[step.path]}
                                                >
                                                    {loading[step.path] ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <span className="truncate">{step.buttonText}</span>
                                                    )}
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default WagesManagementPage;
