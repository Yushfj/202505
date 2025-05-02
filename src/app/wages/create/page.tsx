
'use client';

import {useState, useEffect, useMemo, useCallback} from 'react';
import Image from 'next/image';
import Link from "next/link";
import {useToast} from '@/hooks/use-toast';
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
import {format, isValid, parseISO} from 'date-fns'; // Import isValid and parseISO for date validation
import {CalendarIcon, ArrowLeft, Home, FileDown, FileText, Save, Loader2} from 'lucide-react'; // Added Loader2
import {DateRange} from 'react-day-picker';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import * as XLSX from 'xlsx';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
// Import DB service functions
// Removed checkWageRecordsExist as it's handled by saveWageRecords now
import { getEmployees, saveWageRecords } from '@/services/employee-service';

// --- Interfaces ---
// Matches the structure in employee-service.ts
interface Employee {
  id: string;
  name: string;
  position: string;
  hourlyWage: string; // Still string from DB initially
  fnpfNo: string | null;
  tinNo: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  paymentMethod: 'cash' | 'online';
  branch: 'labasa' | 'suva';
  fnpfEligible: boolean;
}

// Combined interface for wage input details stored in state
interface WageInputDetails {
    hoursWorked: string;
    mealAllowance: string;
    otherDeductions: string;
}

// Interface for wage records saved to the database
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
  dateFrom: string; // Store dates as YYYY-MM-DD strings for DB compatibility
  dateTo: string;
}

// Interface for calculated wage data displayed in the table
interface CalculatedWageInfo {
    employeeId: string;
    employeeName: string;
    bankCode: string | null;
    bankAccountNumber: string | null;
    hourlyWage: number;
    hoursWorked: number;
    mealAllowance: number;
    otherDeductions: number;
    grossPay: number;
    fnpfDeduction: number;
    netPay: number;
    fnpfEligible: boolean; // Needed for display logic
    paymentMethod: 'cash' | 'online';
    branch: 'labasa' | 'suva';
}


// --- Component ---
const CreateWagesPage = () => {
  // --- State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Single state object for wage input details, keyed by employee ID
  const [wageInputMap, setWageInputMap] = useState<{ [employeeId: string]: WageInputDetails }>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true); // Loading state for employees
  const [isSaving, setIsSaving] = useState(false); // Saving state for buttons
  const {toast} = useToast();

  // --- Data Fetching ---
  const fetchEmployeesCallback = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedEmployees = await getEmployees(); // Use DB service function
      if (Array.isArray(fetchedEmployees)) {
        setEmployees(fetchedEmployees);
        // Initialize wageInputMap based on fetched employees
        const initialWageInputs: { [employeeId: string]: WageInputDetails } = {};
        fetchedEmployees.forEach((emp: Employee) => {
          initialWageInputs[emp.id] = { hoursWorked: '', mealAllowance: '', otherDeductions: '' };
        });
        setWageInputMap(initialWageInputs);
      } else {
          console.error("Fetched employee data is not an array:", fetchedEmployees);
          setEmployees([]);
          setWageInputMap({});
      }
    } catch (error: any) {
      console.error("Error fetching employees:", error);
      toast({
        title: 'Error Loading Employees',
        description: error.message || 'Failed to load employee data.',
        variant: 'destructive',
      });
      setEmployees([]);
      setWageInputMap({});
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Dependency array includes toast

  useEffect(() => {
    fetchEmployeesCallback();
  }, [fetchEmployeesCallback]); // Runs once on mount due to useCallback

  // --- Input Handlers ---
  const handleWageInputChange = (employeeId: string, field: keyof WageInputDetails, value: string) => {
    // Basic input validation: allow only numbers and optionally a decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    if ((sanitizedValue.match(/\./g) || []).length > 1) {
      return; // Don't update state if invalid number format
    }
    setWageInputMap(prev => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [field]: sanitizedValue },
    }));
  };

  // --- Calculations (Memoized) ---
  const calculatedWageData = useMemo(() => {
    const calculatedMap: { [employeeId: string]: CalculatedWageInfo } = {};
    let totalNet = 0;
    let totalFnpf = 0;
    let totalSuva = 0;
    let totalLabasa = 0;
    let totalCash = 0;

    employees.forEach(employee => {
      const inputs = wageInputMap[employee.id] || { hoursWorked: '0', mealAllowance: '0', otherDeductions: '0' };
      const hourlyWage = parseFloat(employee.hourlyWage || '0') || 0; // Ensure number, default 0
      const hoursWorked = parseFloat(inputs.hoursWorked || '0') || 0;
      const mealAllowance = parseFloat(inputs.mealAllowance || '0') || 0;
      const otherDeductions = parseFloat(inputs.otherDeductions || '0') || 0;

      // Validate inputs are non-negative numbers
      if (isNaN(hourlyWage) || hourlyWage < 0 || isNaN(hoursWorked) || hoursWorked < 0 || isNaN(mealAllowance) || mealAllowance < 0 || isNaN(otherDeductions) || otherDeductions < 0) {
          console.warn(`Skipping wage calculation for ${employee.name} due to invalid input.`);
          // Provide default values for display
          calculatedMap[employee.id] = {
            employeeId: employee.id, employeeName: employee.name, bankCode: employee.bankCode,
            bankAccountNumber: employee.bankAccountNumber, hourlyWage: 0, hoursWorked: 0,
            mealAllowance: 0, otherDeductions: 0, grossPay: 0, fnpfDeduction: 0, netPay: 0,
            fnpfEligible: employee.fnpfEligible, paymentMethod: employee.paymentMethod, branch: employee.branch
          };
         return; // Go to the next employee
      }

      const grossPay = (hourlyWage * hoursWorked) + mealAllowance;
      let fnpfDeduction = 0;
      if (employee.fnpfEligible && grossPay > 0) {
        fnpfDeduction = grossPay * 0.08; // Calculate FNPF only if eligible and grossPay is positive
      }
      const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductions); // Ensure net pay is not negative

      calculatedMap[employee.id] = {
        employeeId: employee.id,
        employeeName: employee.name,
        bankCode: employee.bankCode,
        bankAccountNumber: employee.bankAccountNumber,
        hourlyWage,
        hoursWorked,
        mealAllowance,
        otherDeductions,
        grossPay,
        fnpfDeduction,
        netPay,
        fnpfEligible: employee.fnpfEligible,
        paymentMethod: employee.paymentMethod,
        branch: employee.branch,
      };

      // Accumulate totals
      totalNet += netPay;
      totalFnpf += fnpfDeduction;
      if (employee.branch === 'suva') totalSuva += netPay;
      if (employee.branch === 'labasa') totalLabasa += netPay;
      if (employee.paymentMethod === 'cash') totalCash += netPay;
    });

    return { calculatedMap, totals: { totalNet, totalFnpf, totalSuva, totalLabasa, totalCash } };
  }, [employees, wageInputMap]);

  // --- Helper Functions ---
  const getCurrentWageRecordsForDb = (): WageRecord[] => {
    if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      toast({ title: 'Error', description: 'Valid date range missing.', variant: 'destructive' });
      return [];
    }
    const records: WageRecord[] = [];
    employees.forEach(employee => {
      const calculatedDetails = calculatedWageData.calculatedMap[employee.id];
      // Ensure calculation was successful and inputs are valid before adding
       if (calculatedDetails && calculatedDetails.hoursWorked >= 0 && calculatedDetails.mealAllowance >= 0 && calculatedDetails.otherDeductions >= 0) {
         // Only include records where hoursWorked > 0 or other fields have values? (Optional)
         // if (calculatedDetails.hoursWorked > 0 || calculatedDetails.mealAllowance > 0 || calculatedDetails.otherDeductions > 0) {
            records.push({
              employeeId: calculatedDetails.employeeId,
              employeeName: calculatedDetails.employeeName,
              hourlyWage: calculatedDetails.hourlyWage,
              hoursWorked: calculatedDetails.hoursWorked,
              mealAllowance: calculatedDetails.mealAllowance, // Include meal allowance
              otherDeductions: calculatedDetails.otherDeductions,
              grossPay: calculatedDetails.grossPay,
              fnpfDeduction: calculatedDetails.fnpfEligible ? calculatedDetails.fnpfDeduction : 0, // Only include FNPF if eligible
              netPay: calculatedDetails.netPay,
              // Format dates as 'YYYY-MM-DD' strings for DB
              dateFrom: format(dateRange.from!, 'yyyy-MM-dd'),
              dateTo: format(dateRange.to!, 'yyyy-MM-dd'),
            });
         // }
       }
    });
    return records;
  };

  const resetForm = useCallback(() => {
       setDateRange(undefined);
       const initialWageInputs: { [employeeId: string]: WageInputDetails } = {};
       employees.forEach(emp => {
           initialWageInputs[emp.id] = { hoursWorked: '', mealAllowance: '', otherDeductions: '' };
       });
       setWageInputMap(initialWageInputs);
   }, [employees]);

  // --- Event Handlers (Save, Export) ---
  const handleSaveWages = async () => {
    if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      toast({ title: 'Error', description: 'Please select a valid date range.', variant: 'destructive' });
      return;
    }

    const recordsToSave = getCurrentWageRecordsForDb();
    if (recordsToSave.length === 0) {
      toast({ title: 'Info', description: 'No valid wage data calculated to save.', variant: 'default' });
      return;
    }

    setIsSaving(true);
    try {
      // Call the service function to save/overwrite records in DB
      // This will handle deleting existing records for the period first.
      await saveWageRecords(recordsToSave);
      toast({ title: 'Success', description: 'Wages calculated and recorded successfully!' });
      resetForm(); // Clear form after successful save
    } catch (error: any) {
      console.error('Error saving wage records:', error);
      toast({ title: 'Save Error', description: error.message || 'Failed to save wage records.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

    // Function to handle exporting data (CSV or Excel)
    const handleExport = (formatType: 'BSP' | 'BRED' | 'Excel') => {
        if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
            toast({ title: 'Error', description: 'Please select a valid date range before exporting.', variant: 'destructive' });
            return;
        }

        // Use the calculated data directly
        const recordsToExport = Object.values(calculatedWageData.calculatedMap)
            .filter(Boolean) as CalculatedWageInfo[]; // Filter out potential undefined values

        if (recordsToExport.length === 0) {
            toast({ title: 'Error', description: 'No valid wage records calculated to export.', variant: 'destructive' });
            return;
        }

        const fileNameBase = `wage_records_${format(dateRange.from, 'yyyyMMdd')}_${format(dateRange.to, 'yyyyMMdd')}`;

        if (formatType === 'BSP' || formatType === 'BRED') {
            // Filter for online transfer employees ONLY for BSP/BRED formats
             const onlineTransferRecords = recordsToExport.filter(record => record.paymentMethod === 'online');

            if (onlineTransferRecords.length === 0) {
                toast({ title: 'Info', description: `No online transfer employees for ${formatType} export.`, variant: 'default' });
                return;
            }

            let csvData = '';
            let fileName = `${fileNameBase}_${formatType}.csv`;

            if (formatType === 'BSP') {
                const csvRows: string[] = []; // No header row for BSP
                onlineTransferRecords.forEach(record => {
                    csvRows.push([
                        record.bankCode || '',
                        record.bankAccountNumber || '',
                        record.netPay.toFixed(2),
                        'Salary', // Column 4
                        record.employeeName, // Column 5
                    ].join(','));
                });
                csvData = csvRows.join('\n');
            } else { // BRED format
                const csvRows = [
                    ['BIC', 'Employee', 'Employee', 'Account N', 'Amount', 'Purpose of Note (optional)'].join(',') // Header
                ];
                onlineTransferRecords.forEach(record => {
                    csvRows.push([
                        record.bankCode || '', // BIC
                        record.employeeName, // Employee 1
                        '', // Empty Employee 2 Column
                        record.bankAccountNumber || '', // Account N
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
            toast({ title: 'Success', description: `Wage records exported to CSV (${formatType}) successfully!` });

        } else if (formatType === 'Excel') {
            const excelData = [
                [ // Headers
                    'Employee Name', 'Bank Code', 'Account #', 'Hourly Wage', 'Hours Worked', 'Meal Allowance',
                    'FNPF Deduction', 'Other Deductions', 'Gross Pay', 'Net Pay',
                    'Date From', 'Date To', 'FNPF Eligible', 'Branch', 'Payment Method'
                ],
                // Use ALL calculated records for Excel export
                ...recordsToExport.map(record => [
                    record.employeeName,
                    record.bankCode || 'N/A',
                    record.bankAccountNumber || 'N/A',
                    record.hourlyWage.toFixed(2),
                    record.hoursWorked.toFixed(2),
                    record.mealAllowance.toFixed(2), // Include meal allowance
                    record.fnpfEligible ? record.fnpfDeduction.toFixed(2) : 'N/A', // Only show FNPF if eligible
                    record.otherDeductions.toFixed(2),
                    record.grossPay.toFixed(2),
                    record.netPay.toFixed(2),
                    format(dateRange.from!, 'yyyy-MM-dd'),
                    format(dateRange.to!, 'yyyy-MM-dd'),
                    record.fnpfEligible ? 'Yes' : 'No',
                    record.branch, // Add branch
                    record.paymentMethod, // Add payment method
                ]),
                [ // Totals row
                    'Totals', '', '', '', '', '', // Spacers for name, bank details, wage, hours, meal
                    calculatedWageData.totals.totalFnpf.toFixed(2), // FNPF Total
                    recordsToExport.reduce((sum, r) => sum + r.otherDeductions, 0).toFixed(2), // Other Deductions Total
                    recordsToExport.reduce((sum, r) => sum + r.grossPay, 0).toFixed(2), // Gross Pay Total
                    calculatedWageData.totals.totalNet.toFixed(2), // Net Pay Total
                    '', '', '', '', '' // Spacers for dates, eligibility, branch, payment
                ],
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            // Optional: Adjust column widths
            ws['!cols'] = [
              {wch: 20}, {wch: 10}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 15}, // Name, Bank, Acct, Wage, Hrs, Meal
              {wch: 15}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, // FNPF, Other, Gross, Net, DateFrom, DateTo
              {wch: 12}, {wch: 10}, {wch: 12} // Eligible, Branch, Payment
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Wage Records');
            XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
            toast({ title: 'Success', description: 'Wage records exported to Excel successfully!' });
        }
    };

  // --- Render ---
  return (
    <div className="relative flex flex-col items-center min-h-screen text-white font-sans">
      {/* Background Image */}
      <Image
        src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg"
        alt="Background Image"
        fill
        style={{objectFit: 'cover'}}
        className="absolute inset-0 w-full h-full -z-10"
        priority
      />
      {/* Overlay */}
      <div className="absolute inset-0 w-full h-full bg-black/60 -z-9" />

      {/* Content Area */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center">
        {/* Header */}
        <header className="w-full py-4 flex justify-between items-center border-b border-white/20 mb-8 sm:mb-10 md:mb-12">
          <Link href="/wages" passHref>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Wages Management</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100">
            Calculate Wages
          </h1>
          <Link href="/dashboard" passHref>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Home className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Button>
          </Link>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center flex-grow w-full pb-16">
          <Card className="w-full max-w-6xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-4">
             {/* Date Picker */}
            <CardHeader className="pb-2">
                <div className="flex justify-center mb-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={'outline'}
                                className={cn(
                                    'w-[240px] sm:w-[300px] justify-start text-left font-normal text-gray-900 bg-white hover:bg-gray-100',
                                    !dateRange?.from && 'text-muted-foreground' // Use from date existence
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from && isValid(dateRange.from) ? (
                                    dateRange.to && isValid(dateRange.to) ? (
                                        `${format(dateRange.from, 'LLL dd, yyyy')} - ${format(dateRange.to, 'LLL dd, yyyy')}`
                                    ) : (
                                        format(dateRange.from, 'LLL dd, yyyy')
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                         <PopoverContent className="w-auto p-0 bg-white text-black" align="center">
                             <Calendar
                                 initialFocus
                                 mode="range"
                                 defaultMonth={dateRange?.from}
                                 selected={dateRange}
                                 onSelect={setDateRange}
                                 numberOfMonths={1} // Simplified to one month
                                 // Optional: Add restrictions if needed
                                 // disabled={{ after: new Date() }}
                             />
                         </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent>
                {/* Wage Calculation Table */}
                 {isLoading ? (
                    <div className="text-center text-white py-10 flex items-center justify-center">
                       <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading employees...
                    </div>
                ) : employees.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">No employees found. Please add employees first.</div>
                ) : (
                    <div className="overflow-x-auto mb-6 border border-white/20 rounded-lg">
                    <Table>
                        <TableHeader className="bg-white/10">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="text-white border-r border-white/20">Employee</TableHead>
                            <TableHead className="text-white border-r border-white/20">Bank Code</TableHead>
                            <TableHead className="text-white border-r border-white/20">Account #</TableHead>
                            <TableHead className="text-white border-r border-white/20 text-right">Wage</TableHead>
                            <TableHead className="text-white border-r border-white/20 text-right">Hours</TableHead>
                            <TableHead className="text-white border-r border-white/20 text-right">Meal</TableHead>
                            <TableHead className="text-white border-r border-white/20 text-right">Deduct</TableHead>
                            <TableHead className="text-white border-r border-white/20 text-right">FNPF</TableHead>
                            <TableHead className="text-white text-right">Net Pay</TableHead>
                        </TableRow>
                        </TableHeader>
                         <TableBody>
                           {employees.map(employee => {
                                const calcDetails = calculatedWageData.calculatedMap[employee.id];
                                // Use calculated details if available, otherwise show input fields and defaults
                                const displayWage = calcDetails ? calcDetails.hourlyWage.toFixed(2) : (parseFloat(employee.hourlyWage) || 0).toFixed(2);
                                // Only display FNPF deduction amount if the employee is eligible
                                const displayFNPFDeduct = calcDetails?.fnpfEligible ? `$${(calcDetails.fnpfDeduction || 0).toFixed(2)}` : 'N/A';
                                const displayNetPay = calcDetails ? `$${(calcDetails.netPay || 0).toFixed(2)}` : '$0.00';
                                const displayBankCode = employee.paymentMethod === 'online' ? (employee.bankCode || 'N/A') : 'Cash';
                                const displayAccountNum = employee.paymentMethod === 'online' ? (employee.bankAccountNumber || 'N/A') : 'N/A';

                                return (
                                    <TableRow key={employee.id} className="hover:bg-white/5 border-t border-white/10">
                                        <TableCell className="text-white border-r border-white/20">{employee.name}</TableCell>
                                        <TableCell className="text-white border-r border-white/20">{displayBankCode}</TableCell>
                                        <TableCell className="text-white border-r border-white/20">{displayAccountNum}</TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">${displayWage}</TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                type="text" // Use text to allow easier input with validation
                                                pattern="[0-9]*\.?[0-9]*" // Basic pattern for numbers/decimals
                                                placeholder="Hrs"
                                                value={wageInputMap[employee.id]?.hoursWorked || ''}
                                                onChange={e => handleWageInputChange(employee.id, 'hoursWorked', e.target.value)}
                                                className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                inputMode="decimal" // Hint for mobile keyboards
                                            />
                                        </TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                 type="text" // Use text for validation
                                                 pattern="[0-9]*\.?[0-9]*"
                                                 placeholder="Amt"
                                                 value={wageInputMap[employee.id]?.mealAllowance || ''}
                                                 onChange={e => handleWageInputChange(employee.id, 'mealAllowance', e.target.value)}
                                                 className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                 inputMode="decimal"
                                            />
                                        </TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                 type="text" // Use text for validation
                                                 pattern="[0-9]*\.?[0-9]*"
                                                 placeholder="Amt"
                                                 value={wageInputMap[employee.id]?.otherDeductions || ''}
                                                 onChange={e => handleWageInputChange(employee.id, 'otherDeductions', e.target.value)}
                                                 className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                 inputMode="decimal"
                                            />
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">
                                            {displayFNPFDeduct}
                                        </TableCell>
                                        <TableCell className="text-white font-medium text-right">
                                            {displayNetPay}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {/* Total Row */}
                            <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                            <TableCell colSpan={7} className="text-right text-white pr-4">
                                Totals:
                            </TableCell>
                            <TableCell className="text-white border-l border-r border-white/20 text-right">
                                ${calculatedWageData.totals.totalFnpf.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-white text-right">
                                ${calculatedWageData.totals.totalNet.toFixed(2)}
                            </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  <Button variant="secondary" size="lg" onClick={handleSaveWages} disabled={isSaving} className="min-w-[150px] hover:bg-gray-700/80">
                    {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Wages</>}
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => handleExport('BSP')} className="min-w-[150px] hover:bg-gray-700/80">
                     <FileDown className="mr-2 h-4 w-4" /> Export CSV (BSP)
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => handleExport('BRED')} className="min-w-[150px] hover:bg-gray-700/80">
                     <FileDown className="mr-2 h-4 w-4" /> Export CSV (BRED)
                  </Button>
                   <Button variant="secondary" size="lg" onClick={() => handleExport('Excel')} className="min-w-[150px] hover:bg-gray-700/80">
                     <FileText className="mr-2 h-4 w-4" /> Export to Excel
                  </Button>
                </div>

                {/* Branch/Cash Total Display */}
                <div className="mt-6 pt-4 border-t border-white/20 text-center space-y-1">
                  <div className="text-md text-gray-300">
                    Total Suva Branch Wages: <span className="font-semibold text-white">${calculatedWageData.totals.totalSuva.toFixed(2)}</span>
                  </div>
                  <div className="text-md text-gray-300">
                    Total Labasa Branch Wages: <span className="font-semibold text-white">${calculatedWageData.totals.totalLabasa.toFixed(2)}</span>
                  </div>
                  <div className="text-md text-gray-300">
                    Total Cash Wages: <span className="font-semibold text-white">${calculatedWageData.totals.totalCash.toFixed(2)}</span>
                  </div>
                </div>
            </CardContent>
          </Card>
        </main>

      </div>
        {/* Footer is handled by RootLayout */}
    </div>
  );
};

export default CreateWagesPage;

