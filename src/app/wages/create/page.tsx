'use client';

import {useState, useEffect, useMemo, useCallback} from 'react';
import Image from 'next/image';
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
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
import {format, isValid as isDateValid } from 'date-fns'; // Use alias
import {CalendarIcon, ArrowLeft, Home, FileDown, FileText, Save, Loader2, Send, Copy} from 'lucide-react'; // Added Send, Copy icons
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
import { getEmployees, requestWageApproval, getWageRecords } from '@/services/employee-service'; // Use requestWageApproval
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

// Interface for wage records saved to the database (matches service)
interface WageRecord {
  id?: string;
  employeeId: string;
  employeeName: string;
  hourlyWage: number;
  totalHours: number;
  hoursWorked: number;
  overtimeHours: number;
  mealAllowance: number;
  fnpfDeduction: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  approvalId?: string; // Optional for viewing, required for saving via approval
  created_at?: Date;
}

// Interface for calculated wage data displayed in the table
interface CalculatedWageInfo {
    employeeId: string;
    employeeName: string;
    bankCode: string | null;
    bankAccountNumber: string | null;
    hourlyWage: number;
    totalHours: number;
    hoursWorked: number;
    overtimeHours: number;
    mealAllowance: number;
    otherDeductions: number;
    grossPay: number;
    fnpfDeduction: number;
    netPay: number;
    fnpfEligible: boolean;
    paymentMethod: 'cash' | 'online';
    branch: 'labasa' | 'suva';
}


// --- Component ---
const CreateWagesPage = () => {
  // --- State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [wageInputMap, setWageInputMap] = useState<{ [employeeId: string]: WageInputDetails }>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true); // Loading state for employees
  const [isSaving, setIsSaving] = useState(false); // Saving/Requesting state
  const {toast} = useToast();
  const [deletePassword, setDeletePassword] = useState(''); // Still used for potential future delete ops?
  const [showPasswordDialog, setShowPasswordDialog] = useState(false); // Maybe repurposed?
  const ADMIN_PASSWORD = 'admin01'; // Store securely
  const [generatedApprovalLink, setGeneratedApprovalLink] = useState<string | null>(null); // State to store the generated link

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
      const fetchedEmployees = await getEmployees();
      if (Array.isArray(fetchedEmployees)) {
        setEmployees(fetchedEmployees);
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
  }, [toast]);

  useEffect(() => {
    fetchEmployeesCallback();
  }, [fetchEmployeesCallback]);

  // --- Input Handlers ---
  const validateNumericInput = (value: string): string => {
      const sanitized = value.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) {
          return parts[0] + '.' + parts.slice(1).join('');
      }
      if (parts[1] && parts[1].length > 2) {
          return parts[0] + '.' + parts[1].substring(0, 2);
      }
      return sanitized;
  };

  const handleWageInputChange = (employeeId: string, field: keyof Omit<WageInputDetails, 'totalHours' | 'hoursWorked' | 'overtimeHours'>, value: string) => {
    const validatedValue = validateNumericInput(value);
    setWageInputMap(prev => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [field]: validatedValue },
    }));
  };

   const handleTotalHoursChange = (employeeId: string, totalHoursStr: string) => {
       const validatedValue = validateNumericInput(totalHoursStr);
       const totalHoursNum = parseFloat(validatedValue || '0') || 0;
       const employee = employees.find(emp => emp.id === employeeId);
       const normalHoursThreshold = employee?.name === SPECIAL_EMPLOYEE_NAME
           ? SPECIAL_NORMAL_HOURS_THRESHOLD
           : STANDARD_NORMAL_HOURS_THRESHOLD;
       const normalHours = Math.min(totalHoursNum, normalHoursThreshold);
       const overtimeHours = Math.max(0, totalHoursNum - normalHoursThreshold);

       setWageInputMap(prev => ({
           ...prev,
           [employeeId]: {
               ...prev[employeeId],
               totalHours: validatedValue,
               hoursWorked: normalHours.toFixed(2),
               overtimeHours: overtimeHours.toFixed(2),
           },
       }));
   };

  // --- Calculations (Memoized) ---
  const calculatedWageMap = useMemo(() => {
    const calculatedMap: { [employeeId: string]: CalculatedWageInfo } = {};

    employees.forEach(employee => {
      const inputs = wageInputMap[employee.id] || { totalHours: '0', hoursWorked: '0', overtimeHours: '0', mealAllowance: '0', otherDeductions: '0' };
      const hourlyWage = parseFloat(employee.hourlyWage || '0') || 0;
      const totalHours = parseFloat(inputs.totalHours || '0') || 0;
      const hoursWorked = parseFloat(inputs.hoursWorked || '0') || 0; // Normal hours
      const overtimeHours = parseFloat(inputs.overtimeHours || '0') || 0; // Overtime hours
      const mealAllowance = parseFloat(inputs.mealAllowance || '0') || 0;
      const otherDeductions = parseFloat(inputs.otherDeductions || '0') || 0;

      if (isNaN(hourlyWage) || hourlyWage < 0 || isNaN(totalHours) || totalHours < 0 || isNaN(mealAllowance) || mealAllowance < 0 || isNaN(otherDeductions) || otherDeductions < 0) {
          console.warn(`Skipping wage calculation for ${employee.name} due to invalid input.`);
          calculatedMap[employee.id] = {
            employeeId: employee.id, employeeName: employee.name, bankCode: employee.bankCode,
            bankAccountNumber: employee.bankAccountNumber, hourlyWage: 0, totalHours: 0, hoursWorked: 0, overtimeHours: 0,
            mealAllowance: 0, otherDeductions: 0, grossPay: 0, fnpfDeduction: 0, netPay: 0,
            fnpfEligible: employee.fnpfEligible, paymentMethod: employee.paymentMethod, branch: employee.branch
          };
         return;
      }

      // Calculate pay based on normal and overtime hours
      const regularPay = hourlyWage * hoursWorked;
      const overtimePay = overtimeHours * hourlyWage * OVERTIME_RATE;
      const grossPay = regularPay + overtimePay + mealAllowance; // Gross pay includes meal allowance

      // FNPF is calculated ONLY on regularPay (normal hours pay)
      let fnpfDeduction = 0;
      if (employee.fnpfEligible && regularPay > 0) {
        fnpfDeduction = regularPay * 0.08;
      }

      const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductions);

      calculatedMap[employee.id] = {
        employeeId: employee.id,
        employeeName: employee.name,
        bankCode: employee.bankCode,
        bankAccountNumber: employee.bankAccountNumber,
        hourlyWage,
        totalHours, // Keep total hours
        hoursWorked, // Keep normal hours
        overtimeHours, // Keep overtime hours
        mealAllowance,
        otherDeductions,
        grossPay,
        fnpfDeduction, // FNPF based on eligibility and regular pay
        netPay,
        fnpfEligible: employee.fnpfEligible,
        paymentMethod: employee.paymentMethod,
        branch: employee.branch,
      };
    });
    return calculatedMap;

  }, [employees, wageInputMap]);

   // Effect to calculate totals
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
           if (!details) return;
           runningTotalTotalHrs += details.totalHours;
           runningTotalHours += details.hoursWorked;
           runningTotalOvertime += details.overtimeHours;
           runningTotalMeal += details.mealAllowance;
           runningTotalOtherDed += details.otherDeductions;
           runningTotalFnpf += details.fnpfDeduction; // Sum up the calculated FNPF
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

   }, [calculatedWageMap]);

  // --- Helper Functions ---
  const getCurrentWageRecordsForRequest = (): Omit<WageRecord, 'id' | 'approvalId' | 'created_at'>[] => {
    if (!dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to)) {
        console.error('Valid date range missing for wage record generation.');
        return [];
    }
    const records: Omit<WageRecord, 'id' | 'approvalId' | 'created_at'>[] = [];
    employees.forEach(employee => {
      const calculatedDetails = calculatedWageMap[employee.id];
      // Ensure calculations are done and values are non-negative before adding
      if (calculatedDetails && calculatedDetails.totalHours >= 0 && calculatedDetails.mealAllowance >= 0 && calculatedDetails.otherDeductions >= 0) {
        records.push({
          employeeId: calculatedDetails.employeeId,
          employeeName: calculatedDetails.employeeName,
          hourlyWage: calculatedDetails.hourlyWage,
          totalHours: calculatedDetails.totalHours,
          hoursWorked: calculatedDetails.hoursWorked,
          overtimeHours: calculatedDetails.overtimeHours,
          mealAllowance: calculatedDetails.mealAllowance,
          otherDeductions: calculatedDetails.otherDeductions,
          grossPay: calculatedDetails.grossPay,
          fnpfDeduction: calculatedDetails.fnpfDeduction, // Use the calculated FNPF
          netPay: calculatedDetails.netPay,
          dateFrom: format(dateRange.from!, 'yyyy-MM-dd'),
          dateTo: format(dateRange.to!, 'yyyy-MM-dd'),
        });
      }
    });
    return records;
  };

  const resetForm = useCallback(() => {
       setDateRange(undefined);
       setGeneratedApprovalLink(null); // Also reset the generated link
       const initialWageInputs: { [employeeId: string]: WageInputDetails } = {};
       employees.forEach(emp => {
           initialWageInputs[emp.id] = { totalHours: '', hoursWorked: '0', overtimeHours: '0', mealAllowance: '', otherDeductions: '' };
       });
       setWageInputMap(initialWageInputs);
   }, [employees]);


    // --- Function to copy link to clipboard ---
    const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        toast({ title: 'Success', description: 'Approval link copied to clipboard!' });
      }, (err) => {
        console.error('Could not copy text: ', err);
        toast({ title: 'Error', description: 'Failed to copy link.', variant: 'destructive' });
      });
    };

  // --- Event Handlers (Request Approval, Export) ---
  const handleRequestApproval = async () => {
       if (!dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to)) {
          console.error('Please select a valid date range before requesting approval.');
          toast({
            title: 'Date Range Required',
            description: 'Please select a valid start and end date before requesting approval.',
            variant: 'destructive',
          });
         return;
       }
       setGeneratedApprovalLink(null); // Reset link display

       const recordsToRequest = getCurrentWageRecordsForRequest();
       if (recordsToRequest.length === 0) {
         toast({ title: 'Info', description: 'No valid wage data calculated to request approval.', variant: 'default' });
         console.log('No valid wage data calculated to request approval.');
         return;
       }

       setIsSaving(true); // Use isSaving state for the loading indicator
       try {
           // Request approval and get the link back
           const { approvalId, approvalLink } = await requestWageApproval(recordsToRequest);

           setGeneratedApprovalLink(approvalLink); // Store the link to display
           toast({
               title: 'Approval Request Created',
               description: `Approval link generated. Please copy and share it. Approval ID: ${approvalId}`,
               duration: 10000, // Show longer
           });
           console.log(`Wage approval request created. Approval ID: ${approvalId}, Link: ${approvalLink}`);
           // Optionally reset form parts, maybe keep inputs but clear date? Depends on workflow.
           // resetForm(); // Uncomment if full reset is desired

       } catch (error: any) {
           console.error('Error requesting wage approval:', error);
           toast({
               title: 'Approval Request Error',
               description: error.message || 'Failed to create wage approval request.',
               variant: 'destructive',
           });
       } finally {
           setIsSaving(false);
       }
     };

    const handleExport = (formatType: 'BSP' | 'BRED' | 'Excel') => {
        if (!dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to)) {
            console.error('Please select a valid date range before exporting.'); // Log error
            toast({
              title: 'Date Range Required',
              description: 'Please select a valid date range before exporting.',
              variant: 'destructive',
            });
            return;
        }

        const recordsToExport = Object.values(calculatedWageMap)
            .filter(Boolean) as CalculatedWageInfo[];

        if (recordsToExport.length === 0) {
            toast({ title: 'Info', description: 'No valid wage records calculated to export.', variant: 'default' }); // Changed to info
            console.log('No valid wage records calculated to export.'); // Log info
            return;
        }

        const fileNameBase = `wage_records_${format(dateRange.from, 'yyyyMMdd')}_${format(dateRange.to, 'yyyyMMdd')}`;

        if (formatType === 'BSP' || formatType === 'BRED') {
             const onlineTransferRecords = recordsToExport.filter(record => record.paymentMethod === 'online');
            if (onlineTransferRecords.length === 0) {
                toast({ title: 'Info', description: `No online transfer employees for ${formatType} export.`, variant: 'default' });
                console.log(`No online transfer employees for ${formatType} export.`);
                return;
            }

            let csvData = '';
            let fileName = `${fileNameBase}_${formatType}.csv`;

            if (formatType === 'BSP') {
                const csvRows: string[] = []; // No headers for BSP
                onlineTransferRecords.forEach(record => {
                    csvRows.push([
                        record.bankCode || '',
                        record.bankAccountNumber || '',
                        record.netPay.toFixed(2),
                        'Salary', // Adding "Salary" to the fourth column
                        record.employeeName, // Adding employee name to the fifth column
                    ].join(','));
                });
                csvData = csvRows.join('\n');
            } else { // BRED format
                const csvRows = [
                    // No headers for BRED as per spec
                    // ['BIC', 'Employee', 'Employee', 'Account N', 'Amount', 'Purpose of Note (optional)'].join(',')
                ];
                onlineTransferRecords.forEach(record => {
                    csvRows.push([
                        record.bankCode || '',
                        record.employeeName,
                        '', // Empty Employee 2 Column
                        record.bankAccountNumber || '',
                        record.netPay.toFixed(2),
                        'Salary',
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
            console.log(`Wage records exported to CSV (${formatType}) successfully!`);

        } else if (formatType === 'Excel') {
            const excelData = [
                [ // Headers
                    'Employee Name', 'Bank Code', 'Account #', 'Hourly Wage',
                    'Total Hours', 'Normal Hours', 'O/T Hours', 'Meal Allowance',
                    'FNPF Deduction', 'Other Deductions', 'Gross Pay', 'Net Pay',
                    'Date From', 'Date To', 'FNPF Eligible', 'Branch', 'Payment Method'
                ],
                ...recordsToExport.map(record => [ // Data rows
                    record.employeeName,
                    record.bankCode || 'N/A',
                    record.bankAccountNumber || 'N/A',
                    record.hourlyWage.toFixed(2),
                    record.totalHours.toFixed(2),
                    record.hoursWorked.toFixed(2),
                    record.overtimeHours.toFixed(2),
                    record.mealAllowance.toFixed(2),
                    record.fnpfEligible ? record.fnpfDeduction.toFixed(2) : 'N/A', // Display based on eligibility
                    record.otherDeductions.toFixed(2),
                    record.grossPay.toFixed(2),
                    record.netPay.toFixed(2),
                    format(dateRange.from!, 'yyyy-MM-dd'),
                    format(dateRange.to!, 'yyyy-MM-dd'),
                    record.fnpfEligible ? 'Yes' : 'No',
                    record.branch,
                    record.paymentMethod,
                ]),
                 [ // Totals row
                     'Totals', '', '', '', // Spacers for text columns
                     totalTotalHours.toFixed(2), // Total Total Hours
                     totalHoursWorked.toFixed(2), // Total Normal Hours
                     totalOvertimeHours.toFixed(2), // Total O/T Hours
                     totalMealAllowance.toFixed(2), // Total Meal Allowance
                     totalFnpfDeduction.toFixed(2), // Total FNPF
                     totalOtherDeductions.toFixed(2), // Total Other Deductions
                     totalGrossPay.toFixed(2), // Total Gross Pay
                     totalNetPay.toFixed(2), // Total Net Pay
                     '', '', '', '', '' // Spacers for date/text columns
                 ],
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
             // Set column widths (optional, adjust as needed)
            ws['!cols'] = [
              {wch: 20}, {wch: 10}, {wch: 15}, {wch: 12}, // Emp Name, Bank Code, Acc #, Wage
              {wch: 12}, {wch: 12}, {wch: 12}, {wch: 14}, // Total Hrs, Normal Hrs, OT Hrs, Meal
              {wch: 15}, {wch: 15}, {wch: 12}, {wch: 12}, // FNPF, Other Ded, Gross, Net
              {wch: 12}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 12} // Dates, Eligible, Branch, Payment
            ];
            XLSX.utils.book_append_sheet(wb, ws, 'Wage Records');
            XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
            toast({ title: 'Success', description: 'Wage records exported to Excel successfully!' });
            console.log('Wage records exported to Excel successfully!');
        }
    };

  // --- Render ---
  return (
     <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
         <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
           <Link href="/wages" passHref className="ml-4">
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
               <ArrowLeft className="h-5 w-5" />
               <span className="sr-only">Back to Wages Management</span>
             </Button>
           </Link>
           <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
             Calculate Wages
           </h1>
           <Link href="/dashboard" passHref className="mr-4">
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
               <Home className="h-5 w-5" />
               <span className="sr-only">Dashboard</span>
             </Button>
           </Link>
         </header>

        <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6">
          <Card className="w-full max-w-7xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-4">
            <CardHeader className="pb-2">
                <div className="flex justify-center mb-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={'outline'}
                                className={cn(
                                    'w-[240px] sm:w-[300px] justify-start text-left font-normal text-gray-900 bg-white hover:bg-gray-100',
                                    !dateRange?.from && 'text-muted-foreground'
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from && isDateValid(dateRange.from) ? (
                                    dateRange.to && isDateValid(dateRange.to) ? (
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
                                 numberOfMonths={1}
                                 disabled={isLoading} // Disable calendar while loading employees
                             />
                         </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent>
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
                                <TableHead className="text-white border-r border-white/20 text-right">Total Hours</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Normal Hours</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Meal</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Deduct</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">FNPF</TableHead>
                                <TableHead className="text-white border-r border-white/20 text-right">Gross Pay</TableHead>
                                <TableHead className="text-white text-right">Net Pay</TableHead>
                            </TableRow>
                        </TableHeader>
                         <TableBody>
                           {employees.map(employee => {
                                const calcDetails = calculatedWageMap[employee.id];
                                const displayWage = calcDetails ? calcDetails.hourlyWage.toFixed(2) : (parseFloat(employee.hourlyWage) || 0).toFixed(2);
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
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                type="text"
                                                placeholder="Total"
                                                value={wageInputMap[employee.id]?.totalHours || ''}
                                                onChange={e => handleTotalHoursChange(employee.id, e.target.value)}
                                                className="w-16 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                inputMode="decimal"
                                                disabled={isSaving} // Disable input while saving/requesting
                                            />
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">
                                            {displayNormalHours}
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">
                                            {displayOvertimeHours}
                                        </TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                 type="text"
                                                 placeholder="Amt"
                                                 value={wageInputMap[employee.id]?.mealAllowance || ''}
                                                 onChange={e => handleWageInputChange(employee.id, 'mealAllowance', e.target.value)}
                                                 className="w-16 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                 inputMode="decimal"
                                                 disabled={isSaving} // Disable input
                                            />
                                        </TableCell>
                                        <TableCell className="border-r border-white/20">
                                            <Input
                                                 type="text"
                                                 placeholder="Amt"
                                                 value={wageInputMap[employee.id]?.otherDeductions || ''}
                                                 onChange={e => handleWageInputChange(employee.id, 'otherDeductions', e.target.value)}
                                                 className="w-16 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                 inputMode="decimal"
                                                 disabled={isSaving} // Disable input
                                            />
                                        </TableCell>
                                        <TableCell className="text-white border-r border-white/20 text-right">
                                            {displayFNPFDeduct}
                                        </TableCell>
                                         <TableCell className="text-white border-r border-white/20 text-right">
                                             {displayGrossPay}
                                         </TableCell>
                                        <TableCell className="text-white font-medium text-right">
                                            {displayNetPay}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                           <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                             <TableCell colSpan={4} className="text-right text-white pr-4 border-r border-white/20">
                               Totals:
                             </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right">
                                {totalTotalHours.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-white border-r border-white/20 text-right">
                               {totalHoursWorked.toFixed(2)}
                             </TableCell>
                              <TableCell className="text-white border-r border-white/20 text-right">
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
                             <TableCell className="text-white border-r border-white/20 text-right">
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

                {/* Display generated link if available */}
                {generatedApprovalLink && (
                    <div className="mt-4 p-4 border border-green-500 rounded-md bg-green-900/30 text-white">
                        <p className="text-sm mb-2">Approval link generated successfully:</p>
                        <div className="flex items-center gap-2">
                             <Input
                                type="text"
                                value={generatedApprovalLink}
                                readOnly
                                className="flex-grow bg-gray-700 border-gray-600"
                             />
                             <Button
                                size="sm"
                                onClick={() => copyToClipboard(generatedApprovalLink)}
                                variant="secondary"
                             >
                                <Copy className="mr-1 h-3 w-3"/> Copy
                             </Button>
                         </div>
                        <p className="text-xs mt-2 text-gray-400">Please copy this link and send it to the administrator for approval.</p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                   {/* Changed Save button to Request Approval */}
                  <Button
                      variant="secondary" size="lg" onClick={handleRequestApproval}
                      disabled={isSaving || !dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to) || isLoading} // Disable while loading employees too
                      className="min-w-[180px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20" // Added styles
                   >
                    {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Requesting...</> : <><Send className="mr-2 h-4 w-4" /> Request Approval</>}
                  </Button>
                  <Button
                     variant="secondary"
                     size="lg"
                     onClick={() => handleExport('BSP')}
                     disabled={!dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to) || isLoading} // Disable export when loading/no data
                     className="min-w-[150px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20">
                     <FileDown className="mr-2 h-4 w-4" /> Export CSV (BSP)
                  </Button>
                  <Button
                     variant="secondary"
                     size="lg"
                     onClick={() => handleExport('BRED')}
                     disabled={!dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to) || isLoading} // Disable export when loading/no data
                     className="min-w-[150px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20">
                     <FileDown className="mr-2 h-4 w-4" /> Export CSV (BRED)
                  </Button>
                   <Button
                     variant="secondary"
                     size="lg"
                     onClick={() => handleExport('Excel')}
                     disabled={!dateRange?.from || !dateRange?.to || !isDateValid(dateRange.from) || !isDateValid(dateRange.to) || isLoading} // Disable export when loading/no data
                     className="min-w-[150px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20">
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
         {/* Footer handled by RootLayout */}
    </div>
  );
};

export default CreateWagesPage;
