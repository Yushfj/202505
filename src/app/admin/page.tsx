
"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Loader2 } from "lucide-react";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AdminPage = () => {
  const router = useRouter();
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
      router.replace('/');
    } else {
      setCurrentUser(storedUser);
      if (storedUser === 'Priyanka Sharma') {
        router.replace('/dashboard'); // Priyanka should not access this page
      } else if (storedUser !== 'ADMIN') {
        setAuthCheckLoading(false);
      }
       else {
        setAuthCheckLoading(false);
      }
    }
  }, [router]);

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
            Administrator Section
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
            {currentUser === 'ADMIN' ? (
              <p className="text-center text-gray-300">
                Administrator features will be implemented here.
              </p>
            ) : (
               <p className="text-center text-red-400">
                Access Denied. This section is for administrators only.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
