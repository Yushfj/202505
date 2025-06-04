
"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, UserPlus, UserCog, Users, Loader2, Plane } from "lucide-react";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const EmployeeManagementPage = () => {
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const router = useRouter();
    const [authCheckLoading, setAuthCheckLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<string | null>(null);


    useEffect(() => {
        const storedUser = localStorage.getItem('username');
        if (!storedUser) {
            router.replace('/');
        } else if (storedUser === 'Priyanka Sharma') {
            router.replace('/dashboard'); // Priyanka should not access this page
        } else {
            setCurrentUser(storedUser);
            setAuthCheckLoading(false);
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

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
            <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-12 sm:mb-16 md:mb-20 bg-black/60 backdrop-blur-md">
                <Link href="/dashboard" passHref className="ml-4">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <ArrowLeft className="h-5 w-5" />
                        <span className="sr-only">Back to Dashboard</span>
                    </Button>
                </Link>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
                    Employee Management
                </h1>
                <Link href="/dashboard" passHref className="mr-4">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <Home className="h-5 w-5" />
                        <span className="sr-only">Dashboard</span>
                    </Button>
                </Link>
            </header>

            <main className="flex flex-col items-center justify-center flex-grow w-full pb-16 pt-6">
                <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
                    <nav className="flex flex-col justify-center items-center gap-5">
                         <Button
                           onClick={() => handleNavigation('/employees/create')}
                           variant="secondary"
                           size="lg"
                           className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
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
                           className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
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
                             className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                             disabled={loading['/employees/information']}
                           >
                             {loading['/employees/information'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                             ) : (
                                <Users className="h-5 w-5 mr-2" />
                             )}
                             Employee Information
                           </Button>
                           <Button
                             onClick={() => handleNavigation('/wages/leaves')}
                             variant="secondary"
                             size="lg"
                             className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                             disabled={loading['/wages/leaves']}
                           >
                             {loading['/wages/leaves'] ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                             ) : (
                                <Plane className="h-5 w-5 mr-2" />
                             )}
                             Employee Leaves
                           </Button>
                    </nav>
                </div>
            </main>
        </div>
      </div>
    );
};

export default EmployeeManagementPage;
