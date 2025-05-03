"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";

const AdminPage = () => {
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
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow"> {/* Added flex-grow */}
          Administrator Section
        </h1>
        <Link href="/dashboard" passHref className="mr-4"> {/* Added mr-4 */}
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <Home className="h-5 w-5" />
            <span className="sr-only">Dashboard</span>
          </Button>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center flex-grow w-full pb-16 pt-6"> {/* Added pt-6 */}
        <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
          <p className="text-center text-gray-300">
            Administrator features will be implemented here.
          </p>
          {/* Add admin-specific controls or links here */}
        </div>
      </main>

      {/* Footer is handled by RootLayout */}
    </div>
  );
};

export default AdminPage;
