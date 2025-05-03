'use client';

import {useState, useEffect, useMemo, useCallback} from 'react';
import Image from 'next/image';
import Link from "next/link";
import { useToast } from '@/hooks/use-toast'; // Re-introduced useToast
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
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
// Import DB service functions
import { getEmployees, saveWageRecords, getWageRecords, checkWageRecordsExist } from '@/services/employee-service';
import * as XLSX from 'xlsx';


// --- Constants ---
const OVERTIME_RATE = 1.5;
const STANDARD_NORMAL_HOURS_THRESHOLD = 45;
const SPECIAL_EMPLOYEE_NAME = "Bimlesh Shashi Prakash";
const SPECIAL_NORMAL_HOURS_THRESHOLD = 48;


// --- Interfaces ---
// Matches the structure in employee-service.ts
interface Employee {
  id: string;
  name: string;
  position: string;
  hourlyWage: string; // Still string from DB initially
  fnpfNo: string | null;
  tinNo: string | null; // Allow null
  bankCode: string | null; // Allow null
  bankAccountNumber: string | null; // Allow null
  paymentMethod: 'cash' | 'online';
  branch: 'labasa' | 'suva';
  fnpfEligible: boolean;
}

// Combined interface for wage input details stored in state
interface WageInputDetails {
    totalHours: string; // User enters total hours here
    hoursWorked: string; // Normal hours (calculated)
    overtimeHours: string; // Overtime hours (calculated)
    mealAllowance: string;
    otherDeductions: string;
}

// Interface for wage records saved to the database
interface WageRecord {
  employeeId: string;
  employeeName: string;
  hourlyWage: number;
  totalHours: number; // Store total hours
  hoursWorked: number; // Store normal hours
  overtimeHours: number; // Store overtime hours
  mealAllowance: number;
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
    totalHours: number; // Added total hours
    hoursWorked: number; // Normal hours
    overtimeHours: number; // Overtime hours
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
  const {toast} = useToast(); // Initialize useToast
  const [deletePassword, setDeletePassword] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const ADMIN_PASSWORD = 'admin01'; // Store securely in a real application

  // State for totals
  const [totalTotalHours, setTotalTotalHours] = useState<number>(0);
  const [totalHoursWorked, setTotalHoursWorked] = useState<number>(0);
  const [totalOvertimeHours, setTotalOvertimeHours] = useState<number>(0);
  const [totalMealAllowance, setTotalMealAllowance] = useState<number>(0);
  const [totalOtherDeductions, setTotalOtherDeductions] = useState<number>(0);
  const [totalFnpfDeduction, setTotalFnpfDeduction] = useState<number>(0);
  const [totalGrossPay, setTotalGrossPay] = useState<number>(0);
  const [totalNetPay, setTotalNetPay] = useState<number>(0);
  const [totalSuvaWages, setTotalSuvaWages] = useState<number>(0);
  const [totalLabasaWages, setTotalLabasaWages] = useState<number>(0);
  const [totalCashWages, setTotalCashWages] = useState<number>(0);


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
          initialWageInputs[emp.id] = { totalHours: '', hoursWorked: '0', overtimeHours: '0', mealAllowance: '', otherDeductions: '' };
        });
        setWageInputMap(initialWageInputs);
      } else {
          console.error("Fetched employee data is not an array:", fetchedEmployees);
          setEmployees([]);
          setWageInputMap({});
      }
    } catch (error: any) {
      console.error("Error fetching employees:", error);
      toast({ // Use toast for error
        title: 'Error Loading Employees',
        description: error.message || 'Failed to load employee data.',
        variant: 'destructive',
      });
      setEmployees([]);
      setWageInputMap({});
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Add toast to dependencies

  useEffect(() => {
    fetchEmployeesCallback();
  }, [fetchEmployeesCallback]); // Runs once on mount due to useCallback

  // --- Input Handlers ---
  // More robust validation allowing numbers and up to two decimal places
  const validateNumericInput = (value: string): string => {
      const sanitized = value.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) { // More than one decimal point
          return parts[0] + '.' + parts.slice(1).join('');
      }
      if (parts[1] && parts[1].length > 2) { // More than two decimal places
          return parts[0] + '.' + parts[1].substring(0, 2);
      }
      return sanitized;
  };

  // Handles changes to Meal Allowance and Other Deductions
  const handleWageInputChange = (employeeId: string, field: keyof Omit<WageInputDetails, 'totalHours' | 'hoursWorked' | 'overtimeHours'>, value: string) => {
    const validatedValue = validateNumericInput(value);
    setWageInputMap(prev => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [field]: validatedValue },
    }));
  };

   // Handles changes to the Total Hours input
   const handleTotalHoursChange = (employeeId: string, totalHoursStr: string) => {
       const validatedValue = validateNumericInput(totalHoursStr);

       const totalHoursNum = parseFloat(validatedValue || '0') || 0;

       // Find the employee to check for the special case
       const employee = employees.find(emp => emp.id === employeeId);
       const normalHoursThreshold = employee?.name === SPECIAL_EMPLOYEE_NAME
           ? SPECIAL_NORMAL_HOURS_THRESHOLD
           : STANDARD_NORMAL_HOURS_THRESHOLD;

       // Calculate normal and overtime hours based on the threshold
       const normalHours = Math.min(totalHoursNum, normalHoursThreshold);
       const overtimeHours = Math.max(0, totalHoursNum - normalHoursThreshold);

       // Update the state for this employee
       setWageInputMap(prev => ({
           ...prev,
           [employeeId]: {
               ...prev[employeeId],
               totalHours: validatedValue, // Store the validated input string
               hoursWorked: normalHours.toFixed(2), // Store calculated normal hours as string
               overtimeHours: overtimeHours.toFixed(2), // Store calculated overtime hours as string
           },
       }));
   };

  // --- Calculations (Memoized) ---
  const calculatedWageMap = useMemo(() => {
    const calculatedMap: { [employeeId: string]: CalculatedWageInfo } = {};

    employees.forEach(employee => {
      const inputs = wageInputMap[employee.id] || { totalHours: '0', hoursWorked: '0', overtimeHours: '0', mealAllowance: '0', otherDeductions: '0' };
      const hourlyWage = parseFloat(employee.hourlyWage || '0') || 0;
      // Use the calculated hours from the state (derived from totalHours)
      const totalHours = parseFloat(inputs.totalHours || '0') || 0;
      const hoursWorked = parseFloat(inputs.hoursWorked || '0') || 0;
      const overtimeHours = parseFloat(inputs.overtimeHours || '0') || 0;
      const mealAllowance = parseFloat(inputs.mealAllowance || '0') || 0;
      const otherDeductions = parseFloat(inputs.otherDeductions || '0') || 0;

      // Validate inputs are non-negative numbers
      if (isNaN(hourlyWage) || hourlyWage < 0 || isNaN(totalHours) || totalHours < 0 || isNaN(mealAllowance) || mealAllowance < 0 || isNaN(otherDeductions) || otherDeductions < 0) {
          console.warn(`Skipping wage calculation for ${employee.name} due to invalid input.`);
          // Provide default values for display
          calculatedMap[employee.id] = {
            employeeId: employee.id, employeeName: employee.name, bankCode: employee.bankCode,
            bankAccountNumber: employee.bankAccountNumber, hourlyWage: 0, totalHours: 0, hoursWorked: 0, overtimeHours: 0,
            mealAllowance: 0, otherDeductions: 0, grossPay: 0, fnpfDeduction: 0, netPay: 0,
            fnpfEligible: employee.fnpfEligible, paymentMethod: employee.paymentMethod, branch: employee.branch
          };
         return; // Go to the next employee
      }

      // Calculate pay components
      const regularPay = hourlyWage * hoursWorked;
      const overtimePay = overtimeHours * hourlyWage * OVERTIME_RATE;
      // Gross Pay includes regular pay, overtime pay, and meal allowance
      const grossPay = regularPay + overtimePay + mealAllowance;

      // FNPF calculation based *only* on regular pay (normal hours * hourly wage)
      let fnpfDeduction = 0;
      if (employee.fnpfEligible && regularPay > 0) {
        fnpfDeduction = regularPay * 0.08; // FNPF is 8% of regular pay
      }

      // Net Pay calculation: Gross Pay minus FNPF and Other Deductions
      const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductions); // Ensure net pay is not negative

      calculatedMap[employee.id] = {
        employeeId: employee.id,
        employeeName: employee.name,
        bankCode: employee.bankCode,
        bankAccountNumber: employee.bankAccountNumber,
        hourlyWage,
        totalHours, // Included total hours
        hoursWorked, // Normal hours
        overtimeHours, // Overtime hours
        mealAllowance,
        otherDeductions,
        grossPay,
        fnpfDeduction,
        netPay,
        fnpfEligible: employee.fnpfEligible,
        paymentMethod: employee.paymentMethod,
        branch: employee.branch,
      };
    });
    return calculatedMap;

  }, [employees, wageInputMap]); // Recalculate when employees or inputs change


   // Effect to calculate and set totals whenever the calculated map changes
   useEffect(() => {
       let runningTotalTotalHrs = 0;
       let runningTotalHours = 0;
       let runningTotalOvertime = 0;
       let runningTotalMeal = 0;
       let runningTotalOtherDed = 0;
       let runningTotalFnpf = 0;
       let runningTotalGross = 0;
       let runningTotalNet = 0;
       let runningTotalSuva = 0;
       let runningTotalLabasa = 0;
       let runningTotalCash = 0;

       Object.values(calculatedWageMap).forEach(details => {
           if (!details) return; // Skip if calculation failed for an employee

           runningTotalTotalHrs += details.totalHours;
           runningTotalHours += details.hoursWorked;
           runningTotalOvertime += details.overtimeHours;
           runningTotalMeal += details.mealAllowance;
           runningTotalOtherDed += details.otherDeductions;
           runningTotalFnpf += details.fnpfDeduction;
           runningTotalGross += details.grossPay;
           runningTotalNet += details.netPay;

           if (details.branch === 'suva') runningTotalSuva += details.netPay;
           if (details.branch === 'labasa') runningTotalLabasa += details.netPay;
           if (details.paymentMethod === 'cash') runningTotalCash += details.netPay;
       });

       setTotalTotalHours(runningTotalTotalHrs);
       setTotalHoursWorked(runningTotalHours);
       setTotalOvertimeHours(runningTotalOvertime);
       setTotalMealAllowance(runningTotalMeal);
       setTotalOtherDeductions(runningTotalOtherDed);
       setTotalFnpfDeduction(runningTotalFnpf);
       setTotalGrossPay(runningTotalGross);
       setTotalNetPay(runningTotalNet);
       setTotalSuvaWages(runningTotalSuva);
       setTotalLabasaWages(runningTotalLabasa);
       setTotalCashWages(runningTotalCash);

   }, [calculatedWageMap]); // Dependency on the calculated data

  // --- Helper Functions ---
  const getCurrentWageRecordsForDb = (): WageRecord[] => {
    if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
        console.error('Valid date range missing.'); // Keep logging error
        toast({ // Add user feedback
          title: 'Date Range Required',
          description: 'Please select a valid start and end date for the pay period.',
          variant: 'destructive',
        });
        return [];
    }
    const records: WageRecord[] = [];
    employees.forEach(employee => {
      const calculatedDetails = calculatedWageMap[employee.id];
      // Ensure calculation was successful and inputs are valid before adding
       if (calculatedDetails && calculatedDetails.totalHours >= 0 && calculatedDetails.mealAllowance >= 0 && calculatedDetails.otherDeductions >= 0) {
         // Only include records where totalHours > 0 or other fields have values? (Optional)
         // if (calculatedDetails.totalHours > 0 || calculatedDetails.mealAllowance > 0 || calculatedDetails.otherDeductions > 0) {
            records.push({
              employeeId: calculatedDetails.employeeId,
              employeeName: calculatedDetails.employeeName,
              hourlyWage: calculatedDetails.hourlyWage,
              totalHours: calculatedDetails.totalHours, // Include total hours
              hoursWorked: calculatedDetails.hoursWorked, // Normal hours
              overtimeHours: calculatedDetails.overtimeHours, // Overtime hours
              mealAllowance: calculatedDetails.mealAllowance,
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
           initialWageInputs[emp.id] = { totalHours: '', hoursWorked: '0', overtimeHours: '0', mealAllowance: '', otherDeductions: '' };
       });
       setWageInputMap(initialWageInputs);
   }, [employees]);

  // --- Event Handlers (Save, Export) ---
  const handleSaveWages = async () => {
       if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
          console.error('Please select a valid date range before saving.'); // Log error
          toast({ // Add user feedback
            title: 'Date Range Required',
            description: 'Please select a valid start and end date before saving.',
            variant: 'destructive',
          });
         return;
       }

       const recordsToSave = getCurrentWageRecordsForDb();
       if (recordsToSave.length === 0) {
         toast({ title: 'Info', description: 'No valid wage data calculated to save.', variant: 'default' }); // Use toast for info
         console.log('No valid wage data calculated to save.'); // Log info
         return;
       }

       setIsSaving(true);
       try {
           // Check if records exist for this period
           const recordsExist = await checkWageRecordsExist(dateRange.from, dateRange.to);

           if (recordsExist) {
               // If records exist, prompt for admin password
               setShowPasswordDialog(true);
           } else {
               // If no records exist, save directly
               await saveWageRecords(recordsToSave);
               toast({ title: 'Success', description: 'Wages calculated and recorded successfully!' }); // Use toast for success
               console.log('Wages calculated and recorded successfully!'); // Log success
               resetForm(); // Clear form after successful save
           }
       } catch (error: any) {
           console.error('Error during save process:', error);
           toast({ title: 'Save Error', description: error.message || 'Failed to check or save wage records.', variant: 'destructive' }); // Use toast for error
           console.error('Save Error:', error.message || 'Failed to check or save wage records.');
       } finally {
           setIsSaving(false);
       }
     };

   // Function called when password confirmation is submitted for saving/overwriting
   const confirmSaveWithPassword = async () => {
       if (deletePassword !== ADMIN_PASSWORD) {
           toast({ title: 'Error', description: 'Incorrect admin password.', variant: 'destructive' }); // Use toast for error
           console.error('Incorrect admin password.'); // Log error
           return; // Stop the process
       }

       // Close dialog first
       setShowPasswordDialog(false);
       setDeletePassword(''); // Clear password

       const recordsToSave = getCurrentWageRecordsForDb();
       if (recordsToSave.length === 0) {
           toast({ title: 'Info', description: 'No valid wage data to save.', variant: 'default' }); // Use toast for info
           console.log('No valid wage data to save.'); // Log info
           return;
       }

       setIsSaving(true);
       try {
           // Call the service function to save/overwrite records in DB
           await saveWageRecords(recordsToSave); // This will handle deleting existing records first.
           toast({ title: 'Success', description: 'Wages updated successfully!' }); // Use toast for success
           console.log('Wages updated successfully!'); // Log success
           resetForm(); // Clear form after successful update
       } catch (error: any) {
           console.error('Error updating wage records:', error);
           toast({ title: 'Update Error', description: error.message || 'Failed to update wage records.', variant: 'destructive' }); // Use toast for error
            console.error('Update Error:', error.message || 'Failed to update wage records.');
       } finally {
           setIsSaving(false);
       }
   };


    // Function to handle exporting data (CSV or Excel)
    const handleExport = (formatType: 'BSP' | 'BRED' | 'Excel') => {
        if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
            console.error('Please select a valid date range before exporting.'); // Log error
            toast({ // Add user feedback
              title: 'Date Range Required',
              description: 'Please select a valid date range before exporting.',
              variant: 'destructive',
            });
            return;
        }

        // Use the calculated data directly
        const recordsToExport = Object.values(calculatedWageMap)
            .filter(Boolean) as CalculatedWageInfo[]; // Filter out potential undefined values

        if (recordsToExport.length === 0) {
            toast({ title: 'Error', description: 'No valid wage records calculated to export.', variant: 'destructive' }); // Use toast for error
            console.error('No valid wage records calculated to export.'); // Log error
            return;
        }

        const fileNameBase = `wage_records_${format(dateRange.from, 'yyyyMMdd')}_${format(dateRange.to, 'yyyyMMdd')}`;

        if (formatType === 'BSP' || formatType === 'BRED') {
            // Filter for online transfer employees ONLY for BSP/BRED formats
             const onlineTransferRecords = recordsToExport.filter(record => record.paymentMethod === 'online');

            if (onlineTransferRecords.length === 0) {
                toast({ title: 'Info', description: `No online transfer employees for ${formatType} export.`, variant: 'default' }); // Use toast for info
                console.log(`No online transfer employees for ${formatType} export.`); // Log info
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
            toast({ title: 'Success', description: `Wage records exported to CSV (${formatType}) successfully!` }); // Use toast for success
            console.log(`Wage records exported to CSV (${formatType}) successfully!`); // Log success

        } else if (formatType === 'Excel') {
            const excelData = [
                [ // Headers
                    'Employee Name', 'Bank Code', 'Account #', 'Hourly Wage', 'Total Hours', 'Normal Hours', 'Overtime Hours', // Added Total Hours header
                    'Meal Allowance', 'FNPF Deduction', 'Other Deductions', 'Gross Pay', 'Net Pay',
                    'Date From', 'Date To', 'FNPF Eligible', 'Branch', 'Payment Method'
                ],
                // Use ALL calculated records for Excel export
                ...recordsToExport.map(record => [
                    record.employeeName,
                    record.bankCode || 'N/A',
                    record.bankAccountNumber || 'N/A',
                    record.hourlyWage.toFixed(2),
                    record.totalHours.toFixed(2), // Added total hours value
                    record.hoursWorked.toFixed(2),
                    record.overtimeHours.toFixed(2),
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
                     'Totals', '', '', '', // Spacers for name, bank details, wage
                     totalTotalHours.toFixed(2), // Total Total Hours
                     totalHoursWorked.toFixed(2), // Total Normal Hours
                     totalOvertimeHours.toFixed(2), // Total Overtime Hours
                     totalMealAllowance.toFixed(2), // Total Meal Allowance
                     totalFnpfDeduction.toFixed(2), // Total FNPF
                     totalOtherDeductions.toFixed(2), // Total Other Deductions
                     totalGrossPay.toFixed(2), // Gross Pay Total
                     totalNetPay.toFixed(2), // Net Pay Total
                     '', '', '', '', '' // Spacers for dates, eligibility, branch, payment
                 ],
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            // Optional: Adjust column widths
            ws['!cols'] = [
              {wch: 20}, {wch: 10}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 14}, // Name, Bank, Acct, Wage, TotalHrs, NormalHrs, OTHrs
              {wch: 15}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 12}, // Meal, FNPF, Other, Gross, Net
              {wch: 12}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 12} // DateFrom, DateTo, Eligible, Branch, Payment
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
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center min-h-screen text-white font-sans">
        {/* Header - Make sticky */}
         <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
           <Link href="/wages" passHref className="ml-4"> {/* Added ml-4 */}
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
               <ArrowLeft className="h-5 w-5" />
               <span className="sr-only">Back to Wages Management</span>
             </Button>
           </Link>
           <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
             Calculate Wages
           </h1>
           <Link href="/dashboard" passHref className="mr-4"> {/* Added mr-4 */}
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
               <Home className="h-5 w-5" />
               <span className="sr-only">Dashboard</span>
             </Button>
           </Link>
         </header>

        {/* Main Content */}
        <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6"> {/* Added pt-6 */}
          <Card className="w-full max-w-7xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-4"> {/* Increased max-width */}
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
                            <TableRow>
                                <TableHead className="text-white border-r border-white/20">Employee</TableHead>
                                <TableHead className="text-white border-r border-white/20">Bank Code</TableHead>
                                <TableHead className="text-white border-r border-white/20">Account #</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Wage</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Total Hours</TableHead> {/* New Total Hours */}
                                <TableHead className="text-white border-r border-white/20 text-right">Normal Hours</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Meal</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Deduct</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">FNPF</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Gross Pay</TableHead> {/* Added Gross Pay */}
                                <TableHead className="text-white text-right">Net Pay</TableHead>
                            </TableRow>
                        </TableHeader>
                         <TableBody>
                           {employees.map(employee => {
                                const calcDetails = calculatedWageMap[employee.id];
                                // Use calculated details if available, otherwise show input fields and defaults
                                const displayWage = calcDetails ? calcDetails.hourlyWage.toFixed(2) : (parseFloat(employee.hourlyWage) || 0).toFixed(2);
                                // Only display FNPF deduction amount if the employee is eligible
                                const displayFNPFDeduct = calcDetails?.fnpfEligible ? `$${(calcDetails.fnpfDeduction || 0).toFixed(2)}` : 'N/A';
                                const displayGrossPay = calcDetails ? `$${(calcDetails.grossPay || 0).toFixed(2)}` : '$0.00';
                                const displayNetPay = calcDetails ? `$${(calcDetails.netPay || 0).toFixed(2)}` : '$0.00';
                                const displayBankCode = employee.paymentMethod === 'online' ? (employee.bankCode || 'N/A') : 'Cash';
                                const displayAccountNum = employee.paymentMethod === 'online' ? (employee.bankAccountNumber || 'N/A') : 'N/A';
                                const displayNormalHours = wageInputMap[employee.id]?.hoursWorked || '0.00';
                                const displayOvertimeHours = wageInputMap[employee.id]?.overtimeHours || '0.00';

                                return (
                                    <TableRow key={employee.id} className="hover:bg-white/10">
                                        <TableCell className="text-white border-r border-white/20">{employee.name}</TableCell>
                                        <TableCell className="text-white border-r border-white/20">{displayBankCode}</TableCell>
                                        <TableCell className="text-white border-r border-white/20">{displayAccountNum}</TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">${displayWage}</TableCell>
                                        <TableCell className="border-r border-white/20"> {/* Total Hours Input */}
                                            <Input
                                                type="text" // Changed to text for better validation handling
                                                placeholder="Total"
                                                value={wageInputMap[employee.id]?.totalHours || ''}
                                                onChange={e => handleTotalHoursChange(employee.id, e.target.value)}
                                                className="w-16 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                inputMode="decimal" // Hint for mobile keyboards
                                            />
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right"> {/* Normal Hours Display */}
                                            {displayNormalHours}
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right"> {/* Overtime Hours Display */}
                                            {displayOvertimeHours}
                                        </TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                 type="text" // Use text for validation
                                                 placeholder="Amt"
                                                 value={wageInputMap[employee.id]?.mealAllowance || ''}
                                                 onChange={e => handleWageInputChange(employee.id, 'mealAllowance', e.target.value)}
                                                 className="w-16 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right" // Adjusted width
                                                 inputMode="decimal"
                                            />
                                        </TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                 type="text" // Use text for validation
                                                 placeholder="Amt"
                                                 value={wageInputMap[employee.id]?.otherDeductions || ''}
                                                 onChange={e => handleWageInputChange(employee.id, 'otherDeductions', e.target.value)}
                                                 className="w-16 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right" // Adjusted width
                                                 inputMode="decimal"
                                            />
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">
                                            {displayFNPFDeduct}
                                        </TableCell>
                                         <TableCell className="text-white border-r border-white/20 text-right"> {/* Gross Pay */}
                                             {displayGrossPay}
                                         </TableCell>
                                        <TableCell className="text-white font-medium text-right">
                                            {displayNetPay}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {/* Total Row */}
                           <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                             <TableCell colSpan={4} className="text-right text-white pr-4 border-r border-white/20">
                               Totals:
                             </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right"> {/* Total Total Hours */}
                                {totalTotalHours.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right"> {/* Total Normal Hours */}
                               {totalHoursWorked.toFixed(2)}
                             </TableCell>
                              <TableCell className="text-white border-r border-white/20 text-right"> {/* Total Overtime Hours */}
                               {totalOvertimeHours.toFixed(2)}
                              </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right">
                               ${totalMealAllowance.toFixed(2)}
                             </TableCell>
                              <TableCell className="text-white border-r border-white/20 text-right">
                               ${totalOtherDeductions.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right">
                               ${totalFnpfDeduction.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right"> {/* Total Gross Pay */}
                               ${totalGrossPay.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-white text-right">
                               ${totalNetPay.toFixed(2)}
                             </TableCell>
                           </TableRow>
                        </TableBody>
                    </Table>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  <Button
                      variant="secondary" size="lg" onClick={handleSaveWages}
                      disabled={isSaving || !dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)}
                      className="min-w-[150px] hover:bg-gray-700/80"
                   >
                    {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Wages</>}
                  </Button>
                  <Button
                     variant="secondary"
                     size="lg"
                     onClick={() => handleExport('BSP')}
                     disabled={!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)} // Disable if no valid date range
                     className="min-w-[150px] hover:bg-gray-700/80">
                     <FileDown className="mr-2 h-4 w-4" /> Export CSV (BSP)
                  </Button>
                  <Button
                     variant="secondary"
                     size="lg"
                     onClick={() => handleExport('BRED')}
                     disabled={!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)} // Disable if no valid date range
                     className="min-w-[150px] hover:bg-gray-700/80">
                     <FileDown className="mr-2 h-4 w-4" /> Export CSV (BRED)
                  </Button>
                   <Button
                     variant="secondary"
                     size="lg"
                     onClick={() => handleExport('Excel')}
                     disabled={!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)} // Disable if no valid date range
                     className="min-w-[150px] hover:bg-gray-700/80">
                     <FileText className="mr-2 h-4 w-4" /> Export to Excel
                  </Button>
                </div>

                {/* Branch/Cash Total Display */}
                <div className="mt-6 pt-4 border-t border-white/20 text-center space-y-1">
                  <div className="text-md text-gray-300">
                    Total Suva Branch Wages: <span className="font-semibold text-white">${totalSuvaWages.toFixed(2)}</span>
                  </div>
                  <div className="text-md text-gray-300">
                    Total Labasa Branch Wages: <span className="font-semibold text-white">${totalLabasaWages.toFixed(2)}</span>
                  </div>
                  <div className="text-md text-gray-300">
                    Total Cash Wages: <span className="font-semibold text-white">${totalCashWages.toFixed(2)}</span>
                  </div>
                </div>
            </CardContent>
          </Card>
        </main>

       {/* AlertDialog for admin password */}
        <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
           <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
               <AlertDialogHeader>
                   <AlertDialogTitle>Confirm Update</AlertDialogTitle>
                   <AlertDialogDescription className="text-gray-300">
                       Wage records already exist for this period. Enter the admin password to overwrite them.
                   </AlertDialogDescription>
               </AlertDialogHeader>
               <div className="grid gap-2">
                   <Label htmlFor="save-password">Admin Password</Label>
                   <Input
                       id="save-password"
                       type="password"
                       value={deletePassword}
                       onChange={(e) => setDeletePassword(e.target.value)}
                       className="bg-gray-800 border-white/20 text-white"
                       onKeyPress={(e) => { if (e.key === 'Enter') confirmSaveWithPassword(); }}
                   />
               </div>
               <AlertDialogFooter>
                   <AlertDialogCancel onClick={() => {setShowPasswordDialog(false); setDeletePassword('');}} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                   <AlertDialogAction
                       onClick={confirmSaveWithPassword}
                       disabled={isSaving}
                       className="bg-blue-600 hover:bg-blue-700"
                   >
                       {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Update'}
                   </AlertDialogAction>
               </AlertDialogFooter>
           </AlertDialogContent>
        </AlertDialog>
        {/* Footer is handled by RootLayout */}
    </div>
  );
};

export default CreateWagesPage;