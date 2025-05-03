"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, UserPlus, UserCog, Users, Loader2 } from "lucide-react"; // Added icons for buttons
import { useState } from 'react'; // Import useState
import { useRouter } from 'next/navigation'; // Import useRouter

const EmployeeManagementPage = () => {
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const router = useRouter();

    const handleNavigation = (path: string) => {
        setLoading((prev) => ({ ...prev, [path]: true }));
        router.push(path);
        // No need to setLoading back to false if navigating away
    };

    return (
        // Use a div wrapper for layout control
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
            {/* Header - Make sticky */}
            <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-12 sm:mb-16 md:mb-20 bg-black/60 backdrop-blur-md">
                <Link href="/dashboard" passHref>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 ml-4"> {/* Added ml-4 */}
                        <ArrowLeft className="h-5 w-5" />
                        <span className="sr-only">Back to Dashboard</span>
                    </Button>
                </Link>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow"> {/* Added flex-grow */}
                    Employee Management
                </h1>
                <Link href="/dashboard" passHref>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 mr-4"> {/* Added mr-4 */}
                        <Home className="h-5 w-5" />
                        <span className="sr-only">Dashboard</span>
                    </Button>
                </Link>
            </header>

            {/* Main Content - Navigation Buttons inside a Card */}
            {/* Added pt-6 to account for sticky header */}
            <main className="flex flex-col items-center justify-center flex-grow w-full pb-16 pt-6">
                {/* Card Container */}
                <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
                    <nav className="flex flex-col justify-center items-center gap-5">
                         <Button
                           onClick={() => handleNavigation('/employees/create')}
                           variant="secondary"
                           size="lg"
                           className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80"
                           disabled={loading['/employees/create']}
                          >
                           {loading['/employees/create'] ? (
                             <Loader2 className="h-5 w-5 animate-spin" />
                           ) : (
                              <UserPlus className="h-5 w-5 mr-2" />
                           )}
                            New Employee
                          </Button>
                         <Button
                           onClick={() => handleNavigation('/employees/change')}
                           variant="secondary"
                           size="lg"
                           className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80"
                           disabled={loading['/employees/change']}
                          >
                            {loading['/employees/change'] ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <UserCog className="h-5 w-5 mr-2" />
                            )}
                              Change Employee Information
                          </Button>
                          <Button
                             onClick={() => handleNavigation('/employees/information')}
                             variant="secondary"
                             size="lg"
                             className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80"
                             disabled={loading['/employees/information']}
                           >
                             {loading['/employees/information'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                             ) : (
                                <Users className="h-5 w-5 mr-2" />
                             )}
                             Employee Information
                           </Button>
                    </nav>
                </div>
            </main>

            {/* Footer is handled by RootLayout */}
        </div>
    );
};

export default EmployeeManagementPage;