
"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Calculator, History, Edit, Loader2 } from "lucide-react"; // Added Edit icon
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const WagesManagementPage = () => {
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const router = useRouter();

     const handleNavigation = (path: string) => {
        setLoading((prev) => ({ ...prev, [path]: true }));
        router.push(path);
        // No need to reset loading state when navigating away
    };

    return (
        // Use a div wrapper for layout control
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">

            {/* Header - Make sticky */}
            <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-12 sm:mb-16 md:mb-20 bg-black/60 backdrop-blur-md">
                <Link href="/dashboard" passHref className="ml-4">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <ArrowLeft className="h-5 w-5" />
                        <span className="sr-only">Back to Dashboard</span>
                    </Button>
                </Link>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
                    Wages Management
                </h1>
                <Link href="/dashboard" passHref className="mr-4">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <Home className="h-5 w-5" />
                        <span className="sr-only">Dashboard</span>
                    </Button>
                </Link>
            </header>

            {/* Main Content - Navigation Buttons inside a Card */}
            <main className="flex flex-col items-center justify-center flex-grow w-full pb-16 pt-6">
                {/* Card Container */}
                <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
                    <nav className="flex flex-col justify-center items-center gap-5">
                        <Button
                            onClick={() => handleNavigation('/wages/create')}
                            variant="secondary"
                            size="lg"
                            className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                            disabled={loading['/wages/create']}
                        >
                            {loading['/wages/create'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Calculator className="h-5 w-5 mr-2" />
                            )}
                            Calculate Wages
                        </Button>
                        <Button
                             onClick={() => handleNavigation('/wages/records')}
                             variant="secondary"
                             size="lg"
                             className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                            disabled={loading['/wages/records']}
                        >
                             {loading['/wages/records'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                             ) : (
                                 <History className="h-5 w-5 mr-2" />
                             )}
                             View Wages Records
                        </Button>
                        <Button
                             onClick={() => handleNavigation('/wages/edit')}
                             variant="secondary"
                             size="lg"
                             className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                            disabled={loading['/wages/edit']}
                        >
                             {loading['/wages/edit'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                             ) : (
                                 <Edit className="h-5 w-5 mr-2" />
                             )}
                             Edit Wages
                        </Button>
                    </nav>
                </div>
            </main>
        </div>
    );
};

export default WagesManagementPage;

