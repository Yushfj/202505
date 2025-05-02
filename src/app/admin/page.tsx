"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";

const AdminPage = () => {
  return (
    <div className="relative flex flex-col items-center min-h-screen text-white font-sans">
      {/* Background Image */}
      <Image
        src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg"
        alt="Background Image"
        layout="fill"
        objectFit="cover"
        className="absolute inset-0 w-full h-full -z-10"
        priority
      />

      {/* Overlay */}
      <div className="absolute inset-0 w-full h-full bg-black/70 -z-9" />

      {/* Content Area */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center">
        {/* Header */}
        <header className="w-full py-4 flex justify-between items-center border-b border-white/20 mb-12 sm:mb-16 md:mb-20">
          <Link href="/dashboard" passHref>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Dashboard</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100">
            Administrator Section
          </h1>
          <Link href="/dashboard" passHref>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Home className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Button>
          </Link>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center justify-center flex-grow w-full pb-16">
          <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
            <p className="text-center text-gray-300">
              Administrator features will be implemented here.
            </p>
            {/* Add admin-specific controls or links here */}
          </div>
        </main>

        {/* Footer is handled by RootLayout */}
      </div>
    </div>
  );
};

export default AdminPage;
