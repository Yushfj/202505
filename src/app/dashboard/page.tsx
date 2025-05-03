
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Power, Loader2 } from 'lucide-react'; // Added Loader2
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { format, parseISO, isValid } from 'date-fns';
import { getWageRecords } from '@/services/employee-service'; // Import service to fetch wage records

// Interface for wage records fetched from the database
interface WageRecord {
  id?: string; // DB record ID
  employeeId: string;
  employeeName: string;
  hourlyWage: number;
  totalHours: number; // Added total hours
  hoursWorked: number;
  overtimeHours: number;
  mealAllowance: number;
  fnpfDeduction: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  dateFrom: string; // Stored as YYYY-MM-DD string from DB
  dateTo: string;
  created_at?: Date; // Optional timestamp from DB
}

// Interface for data points in the chart
interface ChartDataPoint {
  payPeriod: string; // e.g., "Jan 01 - Jan 07, 2024"
  totalNetPay: number;
}

const DashboardPage = () => {
  const [wageRecords, setWageRecords] = useState<WageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({}); // Loading state for navigation buttons
  const router = useRouter();

  // Fetch wage records
  const fetchWages = useCallback(async () => {
    setIsLoading(true);
    try {
      const records = await getWageRecords(); // Fetch all records
      setWageRecords(records);
    } catch (error) {
      console.error("Error fetching wage records for dashboard:", error);
      // Handle error appropriately, maybe show a message
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWages();
  }, [fetchWages]);

  // Process data for the chart
  const chartData = useMemo(() => {
    const groupedByPeriod: { [key: string]: number } = {};

    wageRecords.forEach(record => {
      // Ensure date strings are valid before parsing
      const validDateFromStr = /^\d{4}-\d{2}-\d{2}$/.test(record.dateFrom) ? record.dateFrom : null;
      const validDateToStr = /^\d{4}-\d{2}-\d{2}$/.test(record.dateTo) ? record.dateTo : null;

      if (!validDateFromStr || !validDateToStr) {
        console.warn("Skipping record with invalid date string format:", record);
        return; // Skip this record
      }

       // Add time part for correct ISO parsing, assuming start of day
      const dateFrom = parseISO(validDateFromStr + 'T00:00:00');
      const dateTo = parseISO(validDateToStr + 'T00:00:00');

      if (isValid(dateFrom) && isValid(dateTo)) {
        const periodKey = `${format(dateFrom, 'MMM dd')} - ${format(dateTo, 'MMM dd, yyyy')}`; // Format for X-axis label
        groupedByPeriod[periodKey] = (groupedByPeriod[periodKey] || 0) + record.netPay;
      } else {
         console.warn("Skipping record with invalid parsed date:", record, dateFrom, dateTo);
      }
    });

    // Convert to array and sort by period start date (implicitly by key string format for now)
    return Object.entries(groupedByPeriod)
      .map(([payPeriod, totalNetPay]) => ({ payPeriod, totalNetPay }))
      // A more robust sort might be needed if keys don't sort chronologically naturally
      .sort((a, b) => {
          // Attempt to parse start date from key for sorting
          try {
             const dateA = parseISO(a.payPeriod.split(' - ')[0] + ', ' + a.payPeriod.split(', ')[1]);
             const dateB = parseISO(b.payPeriod.split(' - ')[0] + ', ' + b.payPeriod.split(', ')[1]);
             if (isValid(dateA) && isValid(dateB)) {
                 return dateA.getTime() - dateB.getTime();
             }
          } catch (e) {
              // Fallback to string sort if parsing fails
             return a.payPeriod.localeCompare(b.payPeriod);
          }
          return a.payPeriod.localeCompare(b.payPeriod); // Fallback sort
      });

  }, [wageRecords]);

  const handleLogout = () => {
    router.push('/'); // Redirect to the login page
  };

   const handleNavigation = (path: string) => {
    setLoading((prev) => ({ ...prev, [path]: true }));
    router.push(path);
    // No need to setLoading back to false if navigating away
  };

  return (
    // Removed outer div with background image and overlay, as it's handled globally
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
        {/* Header Section - Made sticky */}
        <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 sm:mb-16 bg-black/60 backdrop-blur-md">
             {/* Logo */}
             <div className="w-10 h-10 flex-shrink-0 ml-4 mr-4"> {/* Added margin right */}
                <Image src="/logo.png" alt="Company Logo" width={40} height={40} />
             </div>

             {/* Centered Title */}
             <div className="flex-grow text-center">
                 <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-100">
                     Lal&apos;s Motor Winders (FIJI) PTE Limited Dashboard
                 </h1>
             </div>

             {/* Logout Button */}
             <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-red-400 hover:bg-white/10 hover:text-red-300 flex-shrink-0 ml-4 mr-4" // Added margin left & right
                aria-label="Logout"
             >
                 <Power className="h-5 w-5" />
                 <span className="sr-only">Logout</span>
             </Button>
         </header>

         {/* Content Area - Adjusted top margin/padding implicitly by sticky header */}
        <div className="flex-grow flex flex-col items-center justify-start w-full pb-16 pt-6"> {/* Added pt-6 */}

             {/* Navigation Section - Centered */}
             <nav className="w-full flex justify-center items-center gap-5 py-4 mb-10">
              <Button
                onClick={() => handleNavigation('/employees')}
                variant="secondary"
                size="lg"
                className="hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                disabled={loading['/employees']}
               >
                 {loading['/employees'] ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Employee Management'}
               </Button>
               <Button
                 onClick={() => handleNavigation('/wages')}
                 variant="secondary"
                 size="lg"
                 className="hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                 disabled={loading['/wages']}
               >
                  {loading['/wages'] ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Wages Management'}
               </Button>
               <Button
                 onClick={() => handleNavigation('/admin')}
                 variant="secondary"
                 size="lg"
                 className="hover:bg-gray-700/80 transition-all duration-300 bg-white/10 border border-white/20 backdrop-blur-sm text-white"
                 disabled={loading['/admin']}
               >
                 {loading['/admin'] ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Administrator'}
               </Button>
             </nav>

            {/* Main Content Area - Graph Section */}
            {/* Changed to div as main is in RootLayout */}
            <div className="flex-grow flex items-center justify-center w-full">
               <Card className="w-full max-w-4xl bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-6 shadow-xl">
                 <CardHeader>
                   <CardTitle className="text-white text-center text-xl mb-4">
                     Total Net Pay Trend per Pay Period
                   </CardTitle>
                 </CardHeader>
                 <CardContent>
                   {isLoading ? (
                     <div className="text-center text-gray-400">Loading chart data...</div>
                   ) : chartData.length > 0 ? (
                       <ResponsiveContainer width="100%" height={300}>
                         <LineChart
                           data={chartData}
                           margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                         >
                           <CartesianGrid strokeDasharray="3 3" stroke="#555" />
                           <XAxis
                             dataKey="payPeriod"
                             stroke="#ccc"
                             tick={{ fontSize: 10 }} // Smaller font size for x-axis labels
                             angle={-30} // Angle labels if they overlap
                             textAnchor="end" // Adjust anchor for angled labels
                             height={50} // Increase height to accommodate angled labels
                             interval={0} // Show all labels initially, adjust if needed
                           />
                           <YAxis stroke="#ccc" tickFormatter={(value) => `$${value.toFixed(0)}`} />
                           <Tooltip
                             contentStyle={{ backgroundColor: '#333', border: 'none', borderRadius: '5px' }}
                             labelStyle={{ color: '#fff' }}
                             itemStyle={{ color: '#88d1ff' }} // Light blue for tooltip item
                             formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total Net Pay']}
                           />
                           <Legend wrapperStyle={{ color: '#ccc' }} />
                           <Line
                             type="monotone"
                             dataKey="totalNetPay"
                             stroke="#88d1ff" // Light blue line color
                             strokeWidth={2}
                             dot={{ r: 4, fill: "#88d1ff" }} // Style points
                             activeDot={{ r: 6, fill: "#fff", stroke: "#88d1ff" }} // Style active point
                             name="Total Net Pay" // Legend name
                           />
                         </LineChart>
                       </ResponsiveContainer>
                   ) : (
                     <div className="text-center text-gray-400">No wage data available to display the chart.</div>
                   )}
                 </CardContent>
               </Card>
            </div>
        </div>
        {/* Footer is handled by RootLayout */}
    </div>
  );
};

export default DashboardPage;
