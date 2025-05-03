"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Calculator, History, Loader2 } from "lucide-react"; // Added icons for buttons
import { useState } from 'react'; // Import useState
import { useRouter } from 'next/navigation'; // Import useRouter

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
                <Link href="/dashboard" passHref className="ml-4"> {/* Added ml-4 */}
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <ArrowLeft className="h-5 w-5" />
                        <span className="sr-only">Back to Dashboard</span>
                    </Button>
                </Link>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
                    Wages Management
                </h1>
                <Link href="/dashboard" passHref className="mr-4"> {/* Added mr-4 */}
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <Home className="h-5 w-5" />
                        <span className="sr-only">Dashboard</span>
                    </Button>
                </Link>
            </header>

            {/* Main Content - Navigation Buttons inside a Card */}
            <main className="flex flex-col items-center justify-center flex-grow w-full pb-16 pt-6"> {/* Added pt-6 */}
                {/* Card Container */}
                <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
                    <nav className="flex flex-col justify-center items-center gap-5"> {/* Changed to flex-col and adjusted gap */}
                        <Button
                            onClick={() => handleNavigation('/wages/create')}
                            variant="secondary" // Changed variant
                            size="lg" // Kept size large
                            className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80" // Ensure full width in flex-col
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
                             variant="secondary" // Changed variant
                             size="lg"
                             className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80" // Ensure full width in flex-col
                            disabled={loading['/wages/records']}
                        >
                             {loading['/wages/records'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                             ) : (
                                 <History className="h-5 w-5 mr-2" />
                             )}
                             View Wages Records
                        </Button>
                    </nav>
                </div>
            </main>

            {/* Footer is handled by RootLayout */}

        </div>
    );
};

export default WagesManagementPage;