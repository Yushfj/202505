"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, UserPlus, UserCog, Users } from "lucide-react"; // Added icons for buttons

const EmployeeManagementPage = () => {
  return (
    <div className="relative flex flex-col items-center min-h-screen text-white font-sans">
      {/* Background Image */}
      <Image
        src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg" // Use the same background
        alt="Background Image"
        layout="fill"
        objectFit="cover"
        className="absolute inset-0 w-full h-full -z-10"
        priority
      />

      {/* Overlay - Matching opacity from the first example */}
      <div className="absolute inset-0 w-full h-full bg-black/60 -z-9" />

      {/* Content Area */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center">
        {/* Header (Matching style) */}
        <header className="w-full py-4 flex justify-between items-center border-b border-white/20 mb-12 sm:mb-16 md:mb-20">
          <Link href="/dashboard" passHref>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Dashboard</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100">
            Employee Management
          </h1>
          <Link href="/dashboard" passHref>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Home className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Button>
          </Link>
        </header>

        {/* Main Content - Navigation Buttons inside a Card (Matching style) */}
        <main className="flex flex-col items-center justify-center flex-grow w-full pb-16">
          {/* Card Container */}
          <div className="w-full max-w-md bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-8 shadow-xl">
            <nav className="flex flex-col justify-center items-center gap-5"> {/* Changed to flex-col and adjusted gap */}
              <Button
                asChild
                variant="secondary" // Changed variant
                size="lg" // Kept size large
                className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80" // Ensure full width in flex-col
              >
                <Link href="/employees/create">
                  <UserPlus className="h-5 w-5 mr-2" /> {/* Added Icon */}
                  New Employee
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary" // Changed variant
                size="lg"
                className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80" // Ensure full width in flex-col
              >
                <Link href="/employees/change">
                  <UserCog className="h-5 w-5 mr-2" /> {/* Added Icon */}
                  Change Employee Information
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary" // Changed variant
                size="lg"
                className="w-full flex items-center justify-center gap-2 hover:bg-gray-700/80" // Ensure full width in flex-col
              >
                <Link href="/employees/information">
                   <Users className="h-5 w-5 mr-2" /> {/* Added Icon */}
                   Employee Informations
                </Link>
              </Button>
            </nav>
          </div>
        </main>

        {/* Optional Footer */}
        {/* <footer className="w-full text-center py-4 text-xs text-gray-400 mt-auto">
             © {new Date().getFullYear()} Company Name
        </footer> */}

      </div>
    </div>
  );
};

export default EmployeeManagementPage;
