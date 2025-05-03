'use client';

import {useEffect, useState, useMemo, useCallback} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {cn} from '@/lib/utils';
import {format, isValid, parseISO} from 'date-fns'; // Added parseISO and isValid
import {CalendarIcon, Home, ArrowLeft, Power, Trash2, FileText, FileDown, Loader2} from 'lucide-react'; // Added Loader2
import {DateRange} from 'react-day-picker';
import { useToast } from '@/hooks/use-toast'; // Re-introduced useToast import
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {useRouter} from 'next/navigation';
import * as XLSX from 'xlsx';
// Import DB service functions for employees and wages
import { getEmployees, getWageRecords, deleteWageRecordsByPeriod } from '@/services/employee-service';

// --- Interfaces ---
// Matches the structure in employee-service.ts
interface Employee {
  id: string;
  name: string;
  position: string;
  hourlyWage: string;
  fnpfNo: string | null;
  tinNo: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  paymentMethod: 'cash' | 'online';
  branch: 'labasa' | 'suva';
  fnpfEligible: boolean;
}

// Structure for wage records fetched from the database
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

// Structure for grouped records display
interface GroupedWageRecord {
  records: WageRecord[];
  totalWages: number;
  dateFrom: Date; // Date object for display and sorting
  dateTo: Date;
  payPeriodKey: string; // Unique key for the pay period (e.g., "YYYY-MM-DD_YYYY-MM-DD")
}

// --- Component ---
const WagesRecordsPage = () => {
  // --- State ---
  const [allWageRecords, setAllWageRecords] = useState<WageRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Combined loading state
  const [isDeleting, setIsDeleting] = useState(false); // Deleting state
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined); // Filter range
  const [selectedPayPeriodKey, setSelectedPayPeriodKey] = useState<string | null>(null); // Key of the selected period for details view
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false); // Control delete dialog visibility
  const {toast} = useToast(); // Initialize useToast
  const router = useRouter();
  const ADMIN_PASSWORD = 'admin01'; // Store securely in real app

  // --- Data Fetching ---
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch Employees from DB
      const fetchedEmployees = await getEmployees();
      setEmployees(fetchedEmployees);

      // Fetch All Wage Records from DB initially (no filter)
      const fetchedWageRecords = await getWageRecords();
      setAllWageRecords(fetchedWageRecords);

    } catch (error: any) {
      console.error("Error fetching initial data:", error);
      toast({ title: "Error", description: error.message || "Failed to load initial data.", variant: "destructive" }); // Use toast for error
      setEmployees([]);
      setAllWageRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Add toast to dependencies

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

   // --- Data Fetching based on Filter ---
   // Fetch filtered records when dateRange changes
   const fetchFilteredRecords = useCallback(async () => {
       if (!dateRange?.from || !dateRange.to) {
            // If no date range is selected, show all records fetched initially
           await fetchInitialData(); // Refetch all data or use cached if smart
           return;
       }
       setIsLoading(true); // Show loading indicator for filtering
       try {
           const filteredRecords = await getWageRecords(dateRange.from, dateRange.to);
           setAllWageRecords(filteredRecords); // Update state with filtered records
       } catch (error: any) {
            console.error("Error fetching filtered wage records:", error);
            toast({ title: "Error", description: error.message || "Failed to load filtered records.", variant: "destructive" }); // Use toast for error
            setAllWageRecords([]); // Clear records on error
       } finally {
            setIsLoading(false);
       }
   }, [dateRange, fetchInitialData, toast]); // Add fetchInitialData and toast to deps

    // Effect to trigger fetching when dateRange changes
    useEffect(() => {
        // Only fetch if a valid range is selected, otherwise fetchInitialData handles it
        if (dateRange?.from && dateRange.to && isValid(dateRange.from) && isValid(dateRange.to)) {
            fetchFilteredRecords();
        } else if (!dateRange?.from && !dateRange?.to) {
            // If date range is cleared, fetch all data again
             fetchInitialData();
        }
    }, [dateRange, fetchFilteredRecords, fetchInitialData]);


  // --- Data Processing (Grouping & Filtering - Now primarily done by DB query) ---
  const groupedWageRecords = useMemo(() => {
    // Group the fetched records (which might already be filtered by the DB)
    const grouped = allWageRecords.reduce((acc: {[key: string]: GroupedWageRecord}, record) => {
      // Parse dates fetched as strings (YYYY-MM-DD)
      // Ensure date strings are correctly formatted before parsing
      const validDateFromStr = /^\d{4}-\d{2}-\d{2}$/.test(record.dateFrom) ? record.dateFrom : null;
      const validDateToStr = /^\d{4}-\d{2}-\d{2}$/.test(record.dateTo) ? record.dateTo : null;

      if (!validDateFromStr || !validDateToStr) {
          console.warn("Skipping record with invalid date string format:", record);
          return acc; // Skip records with invalid date strings
      }

      const dateFrom = parseISO(validDateFromStr + 'T00:00:00'); // Add time part for correct parsing
      const dateTo = parseISO(validDateToStr + 'T00:00:00');


      if (!isValid(dateFrom) || !isValid(dateTo)) {
        console.warn("Skipping record with invalid parsed date during grouping:", record, dateFrom, dateTo);
        return acc; // Skip invalid records
      }

      // Use a consistent key format (YYYY-MM-DD_YYYY-MM-DD)
      const payPeriodKey = `${validDateFromStr}_${validDateToStr}`;

      if (!acc[payPeriodKey]) {
        acc[payPeriodKey] = {
          records: [],
          totalWages: 0,
          dateFrom: dateFrom, // Store Date object for sorting/display
          dateTo: dateTo,
          payPeriodKey: payPeriodKey
        };
      }
      acc[payPeriodKey].records.push(record);
      acc[payPeriodKey].totalWages += (typeof record.netPay === 'number' ? record.netPay : 0);
      return acc;
    }, {});

    // Convert grouped object to array and sort by start date (most recent first)
    return Object.values(grouped).sort((a, b) => b.dateFrom.getTime() - a.dateFrom.getTime());

  }, [allWageRecords]); // Depend only on the fetched records


  // Get records for the selected period details view
  const selectedPeriodRecords = useMemo(() => {
    if (!selectedPayPeriodKey) return [];
    const selectedGroup = groupedWageRecords.find(group => group.payPeriodKey === selectedPayPeriodKey);
    return selectedGroup ? selectedGroup.records : [];
  }, [selectedPayPeriodKey, groupedWageRecords]);

  // --- Event Handlers ---
  const handlePeriodSelect = (key: string) => {
    setSelectedPayPeriodKey(prevKey => prevKey === key ? null : key);
  };

  const handleLogout = () => {
    // Add any necessary logout logic (clearing session, etc.)
    router.push("/");
  };

  // Triggered when delete button on a period is clicked
  const initiateDelete = (key: string) => {
    setSelectedPayPeriodKey(key); // Ensure the correct period is targeted
    setShowDeleteDialog(true); // Show the confirmation dialog
  };

  // Handle deletion confirmed via dialog
  const handleDeleteRecords = async () => {
    if (!selectedPayPeriodKey) {
      toast({ title: 'Error', description: 'No pay period selected for deletion.', variant: 'destructive' }); // Use toast for error
      console.error('No pay period selected for deletion.'); // Log error
      setShowDeleteDialog(false);
      return;
    }

    if (deletePassword !== ADMIN_PASSWORD) {
      toast({ title: 'Error', description: 'Incorrect password.', variant: 'destructive' }); // Use toast for error
      console.error('Incorrect password.'); // Log error
      // Don't clear password here, let user retry
      return;
    }

    setIsDeleting(true); // Indicate deletion in progress

    const selectedGroup = groupedWageRecords.find(group => group.payPeriodKey === selectedPayPeriodKey);
    if (!selectedGroup) {
        toast({ title: 'Error', description: 'Selected pay period not found.', variant: 'destructive' }); // Use toast for error
        console.error('Selected pay period not found.'); // Log error
        setIsDeleting(false);
        setShowDeleteDialog(false);
        return;
    }

     // Dates are already YYYY-MM-DD strings from grouping logic
     const dateFromToDelete = selectedGroup.payPeriodKey.split('_')[0];
     const dateToToDelete = selectedGroup.payPeriodKey.split('_')[1];


    try {
        // Call service function to delete records from DB for this period
        await deleteWageRecordsByPeriod(dateFromToDelete, dateToToDelete);

        // Refetch records to update the UI (could optimize by filtering state)
        await fetchFilteredRecords(); // Refetch based on current date filter

        setSelectedPayPeriodKey(null); // Deselect the period after deletion
        toast({ title: 'Success', description: 'Wage records deleted successfully!' }); // Use toast for success
        console.log('Wage records deleted successfully!'); // Log success

    } catch (error: any) {
        console.error("Error deleting records from database:", error);
        toast({ title: 'Error', description: error.message || 'Failed to delete wage records.', variant: 'destructive' }); // Use toast for error
    } finally {
        setIsDeleting(false); // Finish deletion process
        setShowDeleteDialog(false); // Close dialog
        setDeletePassword(''); // Clear password
    }
  };

  // --- Export Functions ---
  const handleExport = (formatType: 'BSP' | 'BRED' | 'Excel') => {
    if (!selectedPayPeriodKey) {
      toast({ title: 'Error', description: 'Please select a pay period to export.', variant: 'destructive' }); // Use toast for error
      console.error('Please select a pay period to export.'); // Log error
      return;
    }

    const recordsToExport = selectedPeriodRecords; // Use already filtered records for the selected period

    if (recordsToExport.length === 0) {
      toast({ title: 'Info', description: 'No records to export for this period.', variant: 'default' }); // Use toast for info
      console.log('No records to export for this period.'); // Log info
      return;
    }

    const selectedGroup = groupedWageRecords.find(g => g.payPeriodKey === selectedPayPeriodKey);
     if (!selectedGroup) {
         toast({ title: 'Error', description: 'Could not find selected period details.', variant: 'destructive' }); // Use toast for error
         console.error('Could not find selected period details.'); // Log error
         return;
     }
    const dateFromStr = format(selectedGroup.dateFrom, 'yyyyMMdd');
    const dateToStr = format(selectedGroup.dateTo, 'yyyyMMdd');
    const fileNameBase = `wage_records_${dateFromStr}_${dateToStr}`;


    if (formatType === 'BSP' || formatType === 'BRED') {
        const onlineTransferRecords = recordsToExport.filter(record => {
            const employee = employees.find(emp => emp.id === record.employeeId);
            return employee?.paymentMethod === 'online';
        });

        if (onlineTransferRecords.length === 0) {
            toast({ title: 'Info', description: `No online transfer employees found for this period.`, variant: 'default' }); // Use toast for info
            console.log(`No online transfer employees found for this period.`); // Log info
            return;
        }

        let csvData: string = '';
        let fileName = `${fileNameBase}_${formatType}.csv`;

        if (formatType === 'BSP') {
            const csvRows: string[] = []; // No header row for BSP
            onlineTransferRecords.forEach(record => {
                const employeeDetails = employees.find(emp => emp.id === record.employeeId);
                csvRows.push([
                    employeeDetails?.bankCode || '',
                    employeeDetails?.bankAccountNumber || '',
                    record.netPay.toFixed(2),
                    'Salary', // Column 4
                    record.employeeName, // Column 5
                ].join(','));
            });
            csvData = csvRows.join('\n');
        } else { // BRED format
            const csvRows = [ // Header row
                ['BIC', 'Employee', 'Employee', 'Account N', 'Amount', 'Purpose of Note (optional)'].join(',')
            ];
            onlineTransferRecords.forEach(record => {
                const employeeDetails = employees.find(emp => emp.id === record.employeeId);
                csvRows.push([
                    employeeDetails?.bankCode || '', // BIC
                    record.employeeName, // Employee 1
                    '', // Empty Employee 2 Column
                    employeeDetails?.bankAccountNumber || '', // Account N
                    record.netPay.toFixed(2), // Amount
                    'Salary', // Purpose
                ].join(','));
            });
            csvData = csvRows.join('\n');
        }

        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: 'Success', description: `Wage records exported to CSV (${formatType}) successfully!` }); // Use toast for success
        console.log(`Wage records exported to CSV (${formatType}) successfully!`); // Log success

    } else if (formatType === 'Excel') {
        const excelData = [
            [ // Headers
                'Employee Name', 'Hourly Wage', 'Total Hours', 'Normal Hours', 'Overtime Hours', 'Meal Allowance', // Updated headers
                'FNPF Deduction', 'Other Deductions', 'Gross Pay', 'Net Pay',
                'Date From', 'Date To',
            ],
            ...recordsToExport.map(record => [ // Data rows
                record.employeeName, record.hourlyWage.toFixed(2),
                record.totalHours.toFixed(2), record.hoursWorked.toFixed(2), record.overtimeHours?.toFixed(2) || '0.00', // Include new fields
                record.mealAllowance.toFixed(2),
                record.fnpfDeduction.toFixed(2), record.otherDeductions.toFixed(2),
                record.grossPay.toFixed(2), record.netPay.toFixed(2),
                record.dateFrom, // Use the YYYY-MM-DD string directly
                record.dateTo,   // Use the YYYY-MM-DD string directly
            ]),
            [ // Totals row
                'Totals', '', // Spacers for name, wage
                recordsToExport.reduce((sum, r) => sum + r.totalHours, 0).toFixed(2), // Total Total Hours
                recordsToExport.reduce((sum, r) => sum + r.hoursWorked, 0).toFixed(2), // Total Normal Hours
                recordsToExport.reduce((sum, r) => sum + (r.overtimeHours || 0), 0).toFixed(2), // Total OT Hours
                recordsToExport.reduce((sum, r) => sum + r.mealAllowance, 0).toFixed(2), // Total Meal Allowance
                recordsToExport.reduce((sum, r) => sum + r.fnpfDeduction, 0).toFixed(2), // Total FNPF
                recordsToExport.reduce((sum, r) => sum + r.otherDeductions, 0).toFixed(2), // Total Other Ded
                recordsToExport.reduce((sum, r) => sum + r.grossPay, 0).toFixed(2), // Total Gross Pay
                recordsToExport.reduce((sum, r) => sum + r.netPay, 0).toFixed(2), // Total Net Pay
                '', '', // Spacers for dates
            ],
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        ws['!cols'] = [ // Adjust widths
          {wch: 20}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 14}, {wch: 15}, // Name, Wage, TotHrs, NormalHrs, OT Hrs, Meal
          {wch: 15}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12} // FNPF, Other Ded, Gross, Net, DateFrom, DateTo
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Wage Records');
        XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
        toast({ title: 'Success', description: 'Wage records exported to Excel successfully!' }); // Use toast for success
        console.log('Wage records exported to Excel successfully!'); // Log success
    }
  };


  // --- Render ---
  return (
    // Use a div wrapper for layout control
     <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
      {/* Header - Make sticky */}
       <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-6 bg-black/60 backdrop-blur-md">
         <Link href="/wages" passHref className="ml-4"> {/* Added ml-4 */}
           <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
             <ArrowLeft className="h-5 w-5" />
             <span className="sr-only">Back to Wages Management</span>
           </Button>
         </Link>
         <h1 className="text-xl sm:text-2xl font-semibold text-center text-gray-100 flex-grow px-4">
           Wage Records
         </h1>
         <div className="flex items-center gap-2 mr-4"> {/* Added mr-4 */}
           <Link href="/dashboard" passHref>
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
               <Home className="h-5 w-5" />
               <span className="sr-only">Dashboard</span>
             </Button>
           </Link>
           <Button
             variant="ghost" size="icon" onClick={handleLogout}
             className="text-red-400 hover:bg-white/10 hover:text-red-300" aria-label="Logout"
           >
             <Power className="h-5 w-5" />
             <span className="sr-only">Logout</span>
           </Button>
         </div>
       </header>

      {/* Main Content Card */}
      <main className="flex-grow w-full pb-16 pt-6"> {/* Added pt-6 */}
         <Card className="w-full bg-black/50 backdrop-blur-sm border border-white/20 rounded-xl shadow-xl mb-8 flex-grow">
           <CardHeader>
             <CardTitle className="text-white text-center text-lg sm:text-xl">Wage Records Summary</CardTitle>
             {/* Date Range Picker */}
             <div className="flex justify-center mt-4">
               <Popover>
                 <PopoverTrigger asChild>
                   <Button
                     id="date" variant={'outline'}
                     className={cn(
                       'w-[240px] sm:w-[300px] justify-start text-left font-normal text-gray-900 bg-white hover:bg-gray-100',
                        // Highlight if a range is selected
                       !dateRange?.from && 'text-muted-foreground'
                     )}
                     // Clear range button (optional)
                     onClick={() => { if(dateRange?.from) setDateRange(undefined); }}
                   >
                     <CalendarIcon className="mr-2 h-4 w-4" />
                     {dateRange?.from && isValid(dateRange.from) ? (
                       dateRange.to && isValid(dateRange.to) ? (
                         <>{format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}</>
                       ) : (
                         format(dateRange.from, 'LLL dd, y')
                       )
                     ) : (
                       <span>Pick a date range (or view all)</span>
                     )}
                   </Button>
                 </PopoverTrigger>
                 <PopoverContent className="w-auto p-0 bg-white text-black" align="center">
                   <Calendar
                     initialFocus mode="range" defaultMonth={dateRange?.from}
                     selected={dateRange} onSelect={setDateRange} numberOfMonths={1} // Simpler one month view
                   />
                 </PopoverContent>
               </Popover>
             </div>
           </CardHeader>

           <CardContent>
             {isLoading ? (
                 <div className="text-center text-white py-10 flex items-center justify-center">
                     <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading records...
                 </div>
             ) : (
                 <>
                  {/* Pay Period Summary Table */}
                  <div className="border border-white/20 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto mb-6">
                  <Table>
                      <TableHeader className="bg-white/10 sticky top-0 z-10">
                          <TableRow className="hover:bg-transparent">
                              <TableHead className="text-white border-r border-white/20">Pay Period</TableHead>
                              <TableHead className="text-white border-r border-white/20 text-right">Total Wages</TableHead>
                              <TableHead className="text-white text-center">Actions</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                      {groupedWageRecords.length > 0 ? (
                          groupedWageRecords.map((group) => (
                          <TableRow
                              key={group.payPeriodKey}
                              onClick={() => handlePeriodSelect(group.payPeriodKey)}
                              className={cn(
                              "cursor-pointer border-t border-white/10 hover:bg-white/15",
                              selectedPayPeriodKey === group.payPeriodKey && "bg-white/25 font-semibold" // Highlight selected
                              )}
                          >
                              <TableCell className="font-medium text-white border-r border-white/20">{`${format(group.dateFrom, 'MMM dd, yyyy')} - ${format(group.dateTo, 'MMM dd, yyyy')}`}</TableCell>
                              <TableCell className="text-white border-r border-white/20 text-right">${group.totalWages.toFixed(2)}</TableCell>
                              <TableCell className="text-center">
                                  <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={(e) => {
                                           e.stopPropagation(); // Prevent row selection when clicking delete
                                           initiateDelete(group.payPeriodKey);
                                      }}
                                      className="h-7 px-2"
                                      disabled={isDeleting && selectedPayPeriodKey === group.payPeriodKey} // Disable while deleting this period
                                  >
                                      {isDeleting && selectedPayPeriodKey === group.payPeriodKey ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                                      <span className="sr-only">Delete Period</span>
                                  </Button>
                              </TableCell>
                          </TableRow>
                          ))
                      ) : (
                          <TableRow>
                          <TableCell colSpan={3} className="text-center text-gray-400 py-4">
                              No wage records found{dateRange?.from ? " for the selected period" : "."}
                          </TableCell>
                          </TableRow>
                      )}
                      </TableBody>
                  </Table>
                  </div>

                  {/* Wage Details Section (Visible when a period is selected) */}
                  {selectedPayPeriodKey && (
                  <div className="mt-6">
                      <h3 className="text-lg font-medium text-white mb-4 text-center">
                      Wage Details for {
                          groupedWageRecords.find(g => g.payPeriodKey === selectedPayPeriodKey) ?
                          `${format(groupedWageRecords.find(g => g.payPeriodKey === selectedPayPeriodKey)!.dateFrom, 'MMM dd, yyyy')} - ${format(groupedWageRecords.find(g => g.payPeriodKey === selectedPayPeriodKey)!.dateTo, 'MMM dd, yyyy')}`
                          : 'Selected Period'
                      }
                      </h3>
                      <div className="border border-white/20 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                      <Table>
                          <TableHeader className="bg-white/10 sticky top-0 z-10">
                              <TableRow className="hover:bg-transparent">
                                  <TableHead className="text-white border-r border-white/20">Employee</TableHead>
                                  <TableHead className="text-white border-r border-white/20">Bank Code</TableHead>
                                  <TableHead className="text-white border-r border-white/20">Account #</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right">Wage</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right">Total Hours</TableHead> {/* Updated Header */}
                                  <TableHead className="text-white border-r border-white/20 text-right">Normal Hours</TableHead> {/* Updated Header */}
                                  <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead> {/* Added O/T Header */}
                                  <TableHead className="text-white border-r border-white/20 text-right">Meal</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right">FNPF</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right">Deduct</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right">Gross</TableHead>
                                  <TableHead className="text-white text-right">Net</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                          {selectedPeriodRecords.map((record) => {
                              const employee = employees.find(emp => emp.id === record.employeeId);
                              const displayBankCode = employee?.paymentMethod === 'online' ? (employee.bankCode || 'N/A') : 'Cash';
                              const displayAccountNum = employee?.paymentMethod === 'online' ? (employee.bankAccountNumber || 'N/A') : 'N/A';
                              const displayFNPF = employee?.fnpfEligible ? `$${record.fnpfDeduction?.toFixed(2)}` : 'N/A';

                              return (
                              <TableRow key={record.id} className="border-t border-white/10 hover:bg-white/5">
                                  <TableCell className="text-white border-r border-white/20">{record.employeeName}</TableCell>
                                  <TableCell className="text-white border-r border-white/20">{displayBankCode}</TableCell>
                                  <TableCell className="text-white border-r border-white/20">{displayAccountNum}</TableCell>
                                  <TableCell className="text-white border-r border-white/20 text-right">${record.hourlyWage?.toFixed(2)}</TableCell>
                                  <TableCell className="text-white border-r border-white/20 text-right">{record.totalHours?.toFixed(2)}</TableCell> {/* Display Total Hours */}
                                  <TableCell className="text-white border-r border-white/20 text-right">{record.hoursWorked?.toFixed(2)}</TableCell> {/* Display Normal Hours */}
                                  <TableCell className="text-white border-r border-white/20 text-right">{record.overtimeHours?.toFixed(2) || '0.00'}</TableCell> {/* Display O/T Hours */}
                                  <TableCell className="text-white border-r border-white/20 text-right">${record.mealAllowance?.toFixed(2)}</TableCell>
                                  <TableCell className="text-white border-r border-white/20 text-right">{displayFNPF}</TableCell>
                                  <TableCell className="text-white border-r border-white/20 text-right">${record.otherDeductions?.toFixed(2)}</TableCell>
                                  <TableCell className="text-white border-r border-white/20 text-right">${record.grossPay?.toFixed(2)}</TableCell>
                                  <TableCell className="text-white text-right">${record.netPay?.toFixed(2)}</TableCell>
                              </TableRow>
                              );
                          })}
                          </TableBody>
                      </Table>
                      </div>

                      {/* Action Buttons for Selected Period */}
                      <div className="flex flex-wrap gap-3 mt-6 justify-center">
                      <Button variant="secondary" onClick={() => handleExport('BSP')} className="min-w-[140px] hover:bg-gray-700/80" disabled={!selectedPayPeriodKey}>
                          <FileDown className="mr-2 h-4 w-4" /> BSP CSV
                      </Button>
                      <Button variant="secondary" onClick={() => handleExport('BRED')} className="min-w-[140px] hover:bg-gray-700/80" disabled={!selectedPayPeriodKey}>
                          <FileDown className="mr-2 h-4 w-4" /> BRED CSV
                      </Button>
                      <Button variant="secondary" onClick={() => handleExport('Excel')} className="min-w-[140px] hover:bg-gray-700/80" disabled={!selectedPayPeriodKey}>
                          <FileText className="mr-2 h-4 w-4" /> Excel
                      </Button>
                      {/* Delete button is now on the period row */}
                      </div>
                  </div>
                  )}
                  </>
              )}
           </CardContent>
         </Card>
       </main>

        {/* AlertDialog for delete confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
            <AlertDialogHeader>
                <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-300">
                Delete wage records for the selected period? This cannot be undone. Enter admin password.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
                <Label htmlFor="password-delete" className="text-gray-300">Admin Password</Label>
                <Input
                id="password-delete" type="password" value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                className="bg-gray-800 border-white/20 text-white"
                onKeyPress={(e) => { if (e.key === 'Enter') handleDeleteRecords(); }}
                />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => {setShowDeleteDialog(false); setDeletePassword(''); setSelectedPayPeriodKey(null);}} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteRecords} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                   {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : 'Delete'}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

       {/* Footer is handled by RootLayout */}
     </div>
  );
};

export default WagesRecordsPage;