"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { useEffect, useState } from 'react';
import { Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Import Card components

interface WageRecord {
    employeeId: string;
    employeeName: string;
    hourlyWage: number;
    hoursWorked: number;
    mealAllowance: number; // Added meal allowance
    fnpfDeduction: number;
    otherDeductions: number;
    grossPay: number;
    netPay: number;
    dateFrom: Date;
    dateTo: Date;
}

const DashboardPage = () => {
    const [wageRecords, setWageRecords] = useState<WageRecord[]>([]);
    const router = useRouter();

    useEffect(() => {
        // Load wage records from local storage
        const storedWageRecords = localStorage.getItem('wageRecords');
        if (storedWageRecords) {
            try {
                const parsedRecords = JSON.parse(storedWageRecords);
                // Ensure data integrity before setting state
                if (Array.isArray(parsedRecords)) {
                    setWageRecords(
                        parsedRecords.map((record: any) => {
                            // Safely create Date objects, return null for invalid dates
                            const dateFrom = record.dateFrom ? new Date(record.dateFrom) : null;
                            const dateTo = record.dateTo ? new Date(record.dateTo) : null;

                            if (!dateFrom || isNaN(dateFrom.getTime()) || !dateTo || isNaN(dateTo.getTime())) {
                                console.warn("Skipping record with invalid date during dashboard load:", record);
                                return null; // Skip records with invalid dates
                            }

                            return {
                                ...record,
                                dateFrom,
                                dateTo,
                                // Ensure numeric types are numbers, default to 0 if invalid
                                hourlyWage: Number(record.hourlyWage) || 0,
                                hoursWorked: Number(record.hoursWorked) || 0,
                                mealAllowance: Number(record.mealAllowance) || 0, // Add meal allowance
                                fnpfDeduction: Number(record.fnpfDeduction) || 0,
                                otherDeductions: Number(record.otherDeductions) || 0,
                                grossPay: Number(record.grossPay) || 0,
                                netPay: Number(record.netPay) || 0,
                            };
                        }).filter((record: WageRecord | null): record is WageRecord => record !== null) // Filter out null records
                    );
                } else {
                    console.error("Stored wage records are not an array:", parsedRecords);
                    localStorage.removeItem('wageRecords'); // Clear invalid data
                }
            } catch (error) {
                console.error("Error parsing wage records from local storage:", error);
                localStorage.removeItem('wageRecords'); // Clear invalid data
            }
        }
    }, []);

    // Group wage records by pay period
    const payPeriodData = wageRecords.reduce((acc: { [key: string]: { payWeek: string; totalNetPay: number } }, record) => {
        // Dates are already validated in the useEffect hook
        const dateFromStr = record.dateFrom.toLocaleDateString();
        const dateToStr = record.dateTo.toLocaleDateString();

        const payWeek = `${dateFromStr} - ${dateToStr}`;

        if (!acc[payWeek]) {
            acc[payWeek] = {
                payWeek: payWeek,
                totalNetPay: 0,
            };
        }
        // Ensure netPay is a number before adding
        acc[payWeek].totalNetPay += (typeof record.netPay === 'number' ? record.netPay : 0);
        return acc;
    }, {});

    // Convert grouped data into an array for Recharts, sorting by start date
    const chartData = Object.values(payPeriodData).sort((a, b) => {
        try {
            const dateA = new Date(a.payWeek.split(' - ')[0]);
            const dateB = new Date(b.payWeek.split(' - ')[0]);
            // Check if dates are valid before comparing
            if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                return dateA.getTime() - dateB.getTime();
            }
        } catch (e) {
            console.error("Error sorting chart data by date:", e);
        }
        return 0; // Default: no sort if dates invalid or parsing fails
    });


    const handleLogout = () => {
        // Optional: Clear relevant session/local storage on logout
        // localStorage.removeItem('authToken'); // Example
        router.push("/"); // Redirect to the login page
    };

    return (
        <div className="relative flex flex-col items-center min-h-screen text-white font-sans">
            {/* Background Image */}
            <Image
                src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg" // Path to your image
                alt="Background Image"
                fill
                objectFit="cover"
                className="absolute inset-0 w-full h-full -z-10" // Use inset-0 for simplicity
                priority // Load background image faster
            />

            {/* Dark Overlay for contrast */}
            <div className="absolute inset-0 w-full h-full bg-black/70 -z-9" /> {/* Increased opacity */}

            {/* Content Area - Centered with padding */}
            <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow">

                {/* Header Section */}
                <header className="w-full py-4 flex justify-between items-center border-b border-white/20 mb-6">
                     {/* Logo */}
                     <div className="w-10 h-10 flex-shrink-0"> {/* Adjust size as needed */}
                         <Image src="/logo.png" alt="Company Logo" width={40} height={40} />
                    </div>
                    {/* Title */}
                    <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-center text-gray-100 flex-grow px-4">
                        Lal's Motor Winders (FIJI) PTE Limited Dashboard
                    </h1>
                     {/* Logout Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogout}
                        className="text-red-400 hover:bg-white/10 hover:text-red-300 flex-shrink-0"
                        aria-label="Logout"
                    >
                        <Power className="h-5 w-5" />
                        <span className="sr-only">Logout</span>
                    </Button>
                </header>

                {/* Navigation Section */}
                 <nav className="w-full flex flex-col sm:flex-row justify-center items-center gap-4 py-4 mb-8">
                    <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto hover:bg-gray-700/80">
                        <Link href="/employees">Employee Management</Link>
                    </Button>
                    <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto hover:bg-gray-700/80">
                        <Link href="/wages">Wages Management</Link>
                    </Button>
                     <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto hover:bg-gray-700/80">
                         <Link href="/admin">Administrator</Link>
                     </Button>
                 </nav>

                {/* Chart Section - Using a Card-like style */}
                <Card className="w-full bg-black/50 backdrop-blur-sm border border-white/20 rounded-xl shadow-xl mb-8 flex-grow overflow-hidden">
                    <CardHeader>
                         <CardTitle className="text-lg sm:text-xl font-medium text-center text-gray-200">
                             Total Net Pay Trend per Pay Period
                         </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 h-[350px] sm:h-[450px]"> {/* Container with explicit height */}
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={chartData}
                                    margin={{ top: 5, right: 20, left: 10, bottom: 40 }} // Adjusted margins, esp. bottom
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                                    <XAxis
                                        dataKey="payWeek"
                                        stroke="rgba(255, 255, 255, 0.7)"
                                        tick={{ fontSize: 10, fill: 'rgba(255, 255, 255, 0.7)' }}
                                        angle={-30} // Angle labels for better fit
                                        textAnchor="end" // Anchor angled text correctly
                                        height={60} // Increase height to accommodate angled labels
                                        interval={0} // Show all labels if space allows, adjust if too crowded
                                    />
                                    <YAxis
                                        stroke="rgba(255, 255, 255, 0.7)"
                                        tickFormatter={(value) => `$${value.toFixed(0)}`} // Format as currency, no decimals
                                        tick={{ fontSize: 11, fill: 'rgba(255, 255, 255, 0.7)' }}
                                        domain={['auto', 'auto']} // Or set specific min/max if needed e.g. [0, 'auto']
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(30, 30, 30, 0.9)', // Darker semi-transparent background
                                            border: '1px solid rgba(255, 255, 255, 0.3)',
                                            borderRadius: '8px',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                        }}
                                        itemStyle={{ color: '#a7a7a7', fontSize: '13px' }} // Lighter text color
                                        labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}
                                        formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, "Total Net Pay"]} // Format tooltip value precisely
                                        labelFormatter={(label: string) => `Period: ${label}`} // Customize tooltip title
                                        cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }} // Subtle cursor highlight
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="totalNetPay"
                                        stroke="#8884d8" // Primary line color
                                        strokeWidth={2.5}
                                        dot={{ r: 4, fill: '#8884d8', stroke: 'rgba(0,0,0,0.5)', strokeWidth: 1 }}
                                        activeDot={{ r: 7, fill: '#6a61cc', stroke: '#fff', strokeWidth: 1 }}
                                        connectNulls={true} // Good practice if data might have gaps
                                        name="Total Net Pay" // Used by Tooltip/Legend
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                No wage data available to display chart. Add records in Wages Management.
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>
            {/* Footer is now handled by RootLayout */}
        </div>
    );
};

export default DashboardPage;

    