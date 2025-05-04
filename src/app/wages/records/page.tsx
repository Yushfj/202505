'use client';

import {useEffect, useState, useCallback} from 'react';
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
import {format, isValid as isDateValid, parseISO} from 'date-fns'; // Use alias
import {CalendarIcon, Home, ArrowLeft, Trash2, FileText, FileDown, Loader2, CheckCircle, XCircle, AlertTriangle, Mail} from 'lucide-react'; // Changed MailRepeat to Mail
import {DateRange} from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components
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
import { getEmployees, getWageRecords, deleteWageRecordsByApprovalId, getPayPeriodSummaries, type PayPeriodSummary, type Employee, type WageRecord } from '@/services/employee-service'; // Removed sendApprovalSMS

// --- Component ---
const WagesRecordsPage = () => {
  // --- State ---
  const [payPeriodSummaries, setPayPeriodSummaries] = useState<{[key: string]: PayPeriodSummary[]}>({ approved: [], declined: [], pending: [] });
  const [selectedPeriodRecords, setSelectedPeriodRecords] = useState<WageRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResending, setIsResending] = useState(false); // State for resend loading (can be removed if resend is gone)
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null); // ID of the period selected for details/actions
  const [selectedStatus, setSelectedStatus] = useState<'approved' | 'declined' | 'pending'>('approved'); // Track current tab status
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const {toast} = useToast();
  const router = useRouter();
  const ADMIN_PASSWORD = 'admin01'; // Store securely

  // --- Data Fetching ---
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedEmployees, approvedPeriods, declinedPeriods, pendingPeriods] = await Promise.all([
          getEmployees(true), // Fetch all employees (active and inactive) to display details correctly
          getPayPeriodSummaries('approved'),
          getPayPeriodSummaries('declined'),
          getPayPeriodSummaries('pending'),
      ]);
      setEmployees(fetchedEmployees);
      setPayPeriodSummaries({
          approved: approvedPeriods,
          declined: declinedPeriods,
          pending: pendingPeriods,
      });
      // Reset selected period details when fetching initial list
      setSelectedApprovalId(null);
      setSelectedPeriodRecords([]);
    } catch (error: any) {
      console.error("Error fetching initial data:", error);
      toast({ title: "Error", description: error.message || "Failed to load initial data.", variant: "destructive" });
      setEmployees([]);
      setPayPeriodSummaries({ approved: [], declined: [], pending: [] });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Fetch Details for Selected Period ---
  const fetchPeriodDetails = useCallback(async (approvalId: string) => {
      if (!approvalId) return;
      setIsLoading(true); // Indicate loading details
      try {
          // Fetch records specifically for this approval ID
          const allRecordsForStatus = await getWageRecords(null, null, selectedStatus); // Fetch records for the current status
          const periodRecords = allRecordsForStatus.filter(r => r.approvalId === approvalId); // Filter client-side

          // Ensure dates are strings in YYYY-MM-DD format
          const parsedRecords = periodRecords.map(record => {
            const dateFromStr = typeof record.dateFrom === 'string' ? record.dateFrom : (isDateValid(new Date(record.dateFrom)) ? format(new Date(record.dateFrom), 'yyyy-MM-dd') : 'Invalid Date');
            const dateToStr = typeof record.dateTo === 'string' ? record.dateTo : (isDateValid(new Date(record.dateTo)) ? format(new Date(record.dateTo), 'yyyy-MM-dd') : 'Invalid Date');

             if (dateFromStr === 'Invalid Date' || dateToStr === 'Invalid Date') {
                 console.warn("Invalid date encountered in record:", record);
             }

            return {
                ...record,
                dateFrom: dateFromStr,
                dateTo: dateToStr,
            };
           });


          setSelectedPeriodRecords(parsedRecords);
      } catch (error: any) {
          console.error(`Error fetching details for approval ID ${approvalId}:`, error);
          toast({ title: "Error", description: `Failed to load details for the selected period. ${error.message}`, variant: "destructive" });
          setSelectedPeriodRecords([]); // Clear details on error
      } finally {
          setIsLoading(false);
      }
  }, [toast, selectedStatus]); // Add selectedStatus dependency

  // --- Event Handlers ---
  const handlePeriodSelect = (approvalId: string) => {
    // If clicking the same period again, deselect; otherwise, select and fetch details
    if (selectedApprovalId === approvalId) {
        setSelectedApprovalId(null);
        setSelectedPeriodRecords([]);
    } else {
        setSelectedApprovalId(approvalId);
        // Only fetch details if the current tab is 'approved'
        if (selectedStatus === 'approved') {
            fetchPeriodDetails(approvalId);
        } else {
             setSelectedPeriodRecords([]); // Clear details for non-approved tabs for now
        }
    }
  };

  const handleTabChange = (status: string) => {
      const validStatus = status as 'approved' | 'declined' | 'pending';
      setSelectedStatus(validStatus);
      setSelectedApprovalId(null); // Deselect period when changing tabs
      setSelectedPeriodRecords([]);
  };

  // Triggered when delete button on a period is clicked
  const initiateDelete = (approvalId: string) => {
      setSelectedApprovalId(approvalId); // Set the target approval ID for deletion
      setShowDeleteDialog(true);
  };

  // Handle deletion confirmed via dialog
  const handleDeleteRecords = async () => {
    if (!selectedApprovalId) {
      toast({ title: 'Error', description: 'No pay period selected for deletion.', variant: 'destructive' });
      console.error('No pay period selected for deletion.');
      setShowDeleteDialog(false);
      return;
    }

    if (deletePassword !== ADMIN_PASSWORD) {
      toast({ title: 'Error', description: 'Incorrect password.', variant: 'destructive' });
      console.error('Incorrect password.');
      return;
    }

    setIsDeleting(true);

    try {
        // Call service function to delete records using the approval ID
        await deleteWageRecordsByApprovalId(selectedApprovalId);

        toast({ title: 'Success', description: 'Wage records deleted successfully!' });
        console.log(`Wage records for approval ID ${selectedApprovalId} deleted successfully!`);

        // Refetch the list of periods to update the UI
        await fetchInitialData();
        // Reset selection state
        setSelectedApprovalId(null);
        setSelectedPeriodRecords([]);

    } catch (error: any) {
        console.error(`Error deleting records for approval ID ${selectedApprovalId}:`, error);
        toast({ title: 'Error', description: error.message || `Failed to delete wage records.`, variant: 'destructive' });
    } finally {
       setIsDeleting(false);
       setShowDeleteDialog(false);
       setDeletePassword('');
    }
  };

  // Function to generate the approval link
  const generateApprovalLink = (token: string | undefined): string | null => {
    if (!token) return null;
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    return `${baseURL}/approve-wages?token=${token}`;
  };

  // --- Export Functions ---
  const handleExport = (formatType: 'BSP' | 'BRED' | 'Excel') => {
    if (!selectedApprovalId) {
      toast({ title: 'Error', description: 'Please select an approved pay period to export.', variant: 'destructive' });
      console.error('Please select an approved pay period to export.');
      return;
    }
     if (selectedStatus !== 'approved') {
         toast({ title: 'Info', description: 'Export is only available for approved records.', variant: 'default' });
         return;
     }

    // Use the currently loaded selectedPeriodRecords
    const recordsToExport = selectedPeriodRecords;

    if (recordsToExport.length === 0) {
      toast({ title: 'Info', description: 'No records to export for this period.', variant: 'default' });
      console.log('No records to export for this period.');
      return;
    }

    const selectedGroup = payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId);
     if (!selectedGroup) {
         toast({ title: 'Error', description: 'Could not find selected period details.', variant: 'destructive' });
         console.error('Could not find selected period details.');
         return;
     }
    // Use parseISO to handle YYYY-MM-DD strings, then format
    const dateFromStr = isDateValid(parseISO(selectedGroup.dateFrom)) ? format(parseISO(selectedGroup.dateFrom), 'yyyyMMdd') : 'invalid_date';
    const dateToStr = isDateValid(parseISO(selectedGroup.dateTo)) ? format(parseISO(selectedGroup.dateTo), 'yyyyMMdd') : 'invalid_date';
    const fileNameBase = `wage_records_${dateFromStr}_${dateToStr}`;


    if (formatType === 'BSP' || formatType === 'BRED') {
        const onlineTransferRecords = recordsToExport.filter(record => {
            const employee = employees.find(emp => emp.id === record.employeeId);
            return employee?.paymentMethod === 'online';
        });

        if (onlineTransferRecords.length === 0) {
            toast({ title: 'Info', description: `No online transfer employees found for this period.`, variant: 'default' });
            console.log(`No online transfer employees found for this period.`);
            return;
        }

        let csvData: string = '';
        let fileName = `${fileNameBase}_${formatType}.csv`;

        if (formatType === 'BSP') {
            const csvRows: string[] = []; // No header for BSP
            onlineTransferRecords.forEach(record => {
                const employeeDetails = employees.find(emp => emp.id === record.employeeId);
                csvRows.push([
                    employeeDetails?.bankCode || '',
                    employeeDetails?.bankAccountNumber || '',
                    record.netPay.toFixed(2),
                    'Salary',
                    record.employeeName,
                ].join(','));
            });
            csvData = csvRows.join('\n');
        } else { // BRED format
            const csvRows = [
                // No headers for BRED export as per request for create page
            ];
            onlineTransferRecords.forEach(record => {
                const employeeDetails = employees.find(emp => emp.id === record.employeeId);
                csvRows.push([
                    employeeDetails?.bankCode || '',
                    record.employeeName,
                    '', // Empty Employee 2 Column
                    employeeDetails?.bankAccountNumber || '',
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
                'Employee Name', 'Hourly Wage', 'Total Hours', 'Normal Hours', 'Overtime Hours', 'Meal Allowance',
                'FNPF Deduction', 'Other Deductions', 'Gross Pay', 'Net Pay',
                'Date From', 'Date To',
            ],
            ...recordsToExport.map(record => {
                const employee = employees.find(emp => emp.id === record.employeeId);
                return [ // Data rows
                    record.employeeName, record.hourlyWage.toFixed(2),
                    record.totalHours.toFixed(2), record.hoursWorked.toFixed(2), record.overtimeHours?.toFixed(2) || '0.00',
                    record.mealAllowance.toFixed(2),
                    employee?.fnpfEligible ? record.fnpfDeduction.toFixed(2) : 'N/A', // Check eligibility for display
                    record.otherDeductions.toFixed(2),
                    record.grossPay.toFixed(2), record.netPay.toFixed(2),
                    record.dateFrom, // Keep as YYYY-MM-DD string
                    record.dateTo,   // Keep as YYYY-MM-DD string
                ];
            }),
            [ // Totals row
                'Totals', '', // Spacers for name, wage
                recordsToExport.reduce((sum, r) => sum + r.totalHours, 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + r.hoursWorked, 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + (r.overtimeHours || 0), 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + r.mealAllowance, 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + r.fnpfDeduction, 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + r.otherDeductions, 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + r.grossPay, 0).toFixed(2),
                recordsToExport.reduce((sum, r) => sum + r.netPay, 0).toFixed(2),
                '', '', // Spacers for dates
            ],
        ];


        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        ws['!cols'] = [
          {wch: 20}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 14}, {wch: 15},
          {wch: 15}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Wage Records');
        XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
        toast({ title: 'Success', description: 'Wage records exported to Excel successfully!' });
        console.log('Wage records exported to Excel successfully!');
    }
  };

  const renderPayPeriodTable = (periods: PayPeriodSummary[], status: 'pending' | 'approved' | 'declined') => (
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
              {periods.length > 0 ? (
                  periods.map((period) => (
                  <TableRow
                      key={period.approvalId}
                      onClick={() => status === 'approved' && handlePeriodSelect(period.approvalId)} // Only allow select on approved
                      className={cn(
                      "border-t border-white/10 hover:bg-white/15",
                       status === 'approved' && "cursor-pointer", // Cursor pointer only for approved
                      selectedApprovalId === period.approvalId && "bg-white/25 font-semibold"
                      )}
                  >
                      <TableCell className="font-medium text-white border-r border-white/20">{`${isDateValid(parseISO(period.dateFrom)) ? format(parseISO(period.dateFrom), 'MMM dd, yyyy') : 'Invalid Date'} - ${isDateValid(parseISO(period.dateTo)) ? format(parseISO(period.dateTo), 'MMM dd, yyyy'): 'Invalid Date'}`}</TableCell>
                      <TableCell className="text-white border-r border-white/20 text-right">${period.totalWages.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                           {/* Delete Button (available for all statuses) */}
                           <Button
                               variant="destructive"
                               size="sm"
                               onClick={(e) => {
                                    e.stopPropagation(); // Prevent row selection
                                    initiateDelete(period.approvalId);
                               }}
                               className="h-7 px-2 mr-2" // Added margin-right
                               disabled={isDeleting && selectedApprovalId === period.approvalId}
                               title="Delete Period Records"
                           >
                               {isDeleting && selectedApprovalId === period.approvalId ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                               <span className="sr-only">Delete Period</span>
                           </Button>

                           {/* Display Approval Link Button (only for pending) */}
                           {status === 'pending' && period.token && (
                              <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                      e.stopPropagation(); // Prevent row selection
                                      const link = generateApprovalLink(period.token);
                                      if (link) {
                                          navigator.clipboard.writeText(link).then(() => {
                                              toast({ title: 'Success', description: 'Approval link copied to clipboard!' });
                                          }, (err) => {
                                              console.error('Could not copy text: ', err);
                                              toast({ title: 'Error', description: 'Failed to copy link.', variant: 'destructive' });
                                          });
                                      } else {
                                          toast({ title: 'Error', description: 'Could not generate approval link.', variant: 'destructive' });
                                      }
                                  }}
                                  className="h-7 px-2 text-white hover:bg-white/10"
                                  title="Copy Approval Link"
                              >
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="sr-only">Copy Approval Link</span>
                              </Button>
                           )}
                      </TableCell>
                  </TableRow>
                  ))
              ) : (
                  <TableRow>
                  <TableCell colSpan={3} className="text-center text-gray-400 py-4">
                      No records found for this status.
                  </TableCell>
                  </TableRow>
              )}
              </TableBody>
          </Table>
          </div>
  );


  // --- Render ---
  return (
     <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
       <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-6 bg-black/60 backdrop-blur-md">
         <Link href="/wages" passHref className="ml-4">
           <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
             <ArrowLeft className="h-5 w-5" />
             <span className="sr-only">Back to Wages Management</span>
           </Button>
         </Link>
         <h1 className="text-xl sm:text-2xl font-semibold text-center text-gray-100 flex-grow px-4">
           Wage Records
         </h1>
         <div className="flex items-center gap-2 mr-4">
           <Link href="/dashboard" passHref>
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
               <Home className="h-5 w-5" />
               <span className="sr-only">Dashboard</span>
             </Button>
           </Link>
         </div>
       </header>

      <main className="flex-grow w-full pb-16 pt-6">
         <Card className="w-full bg-black/50 backdrop-blur-sm border border-white/20 rounded-xl shadow-xl mb-8 flex-grow">
           <CardHeader>
             <CardTitle className="text-white text-center text-lg sm:text-xl">Pay Period Records</CardTitle>
           </CardHeader>

           <CardContent>
             <Tabs defaultValue="approved" onValueChange={handleTabChange} className="w-full">
               <TabsList className="grid w-full grid-cols-3 mb-6 bg-gray-800/60 border border-white/15 text-gray-300">
                 <TabsTrigger value="approved" className="data-[state=active]:bg-green-700/80 data-[state=active]:text-white">
                   <CheckCircle className="mr-2 h-4 w-4" /> Approved
                 </TabsTrigger>
                 <TabsTrigger value="declined" className="data-[state=active]:bg-red-700/80 data-[state=active]:text-white">
                   <XCircle className="mr-2 h-4 w-4" /> Declined
                 </TabsTrigger>
                 <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-600/80 data-[state=active]:text-white">
                   <AlertTriangle className="mr-2 h-4 w-4" /> Pending
                 </TabsTrigger>
               </TabsList>

               {isLoading ? (
                 <div className="text-center text-white py-10 flex items-center justify-center">
                   <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading records...
                 </div>
               ) : (
                 <>
                   <TabsContent value="approved">
                     {renderPayPeriodTable(payPeriodSummaries.approved, 'approved')}
                   </TabsContent>
                   <TabsContent value="declined">
                     {renderPayPeriodTable(payPeriodSummaries.declined, 'declined')}
                   </TabsContent>
                   <TabsContent value="pending">
                     {renderPayPeriodTable(payPeriodSummaries.pending, 'pending')}
                   </TabsContent>
                 </>
               )}
             </Tabs>

             {/* Wage Details Section (Visible when an approved period is selected) */}
             {selectedApprovalId && selectedStatus === 'approved' && selectedPeriodRecords.length > 0 && (
               <div className="mt-6">
                 <h3 className="text-lg font-medium text-white mb-4 text-center">
                   Wage Details for {
                     payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId) ?
                     `${isDateValid(parseISO(payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId)!.dateFrom)) ? format(parseISO(payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId)!.dateFrom), 'MMM dd, yyyy') : 'Invalid Date'} - ${isDateValid(parseISO(payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId)!.dateTo)) ? format(parseISO(payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId)!.dateTo), 'MMM dd, yyyy') : 'Invalid Date'}`
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
                             <TableHead className="text-white border-r border-white/20 text-right">Total Hrs</TableHead>
                             <TableHead className="text-white border-r border-white/20 text-right">Normal Hrs</TableHead>
                             <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead>
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
                               <TableCell className="text-white border-r border-white/20 text-right">{record.totalHours?.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">{record.hoursWorked?.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">{record.overtimeHours?.toFixed(2) || '0.00'}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${record.mealAllowance?.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">{displayFNPF}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${record.otherDeductions?.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${record.grossPay?.toFixed(2)}</TableCell>
                               <TableCell className="text-white text-right font-medium">${record.netPay?.toFixed(2)}</TableCell>
                           </TableRow>
                         );
                       })}
                       {/* Add totals row for details table if needed */}
                       <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                           <TableCell colSpan={11} className="text-right text-white pr-4 border-r border-white/20">
                               Total Net Pay:
                           </TableCell>
                           <TableCell className="text-white text-right">
                               ${selectedPeriodRecords.reduce((sum, r) => sum + r.netPay, 0).toFixed(2)}
                           </TableCell>
                       </TableRow>
                     </TableBody>
                   </Table>
                 </div>

                 {/* Action Buttons for Selected Approved Period */}
                 <div className="flex flex-wrap gap-3 mt-6 justify-center">
                   <Button variant="secondary" onClick={() => handleExport('BSP')} className="min-w-[140px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20" disabled={!selectedApprovalId || selectedPeriodRecords.length === 0}>
                     <FileDown className="mr-2 h-4 w-4" /> BSP CSV
                   </Button>
                   <Button variant="secondary" onClick={() => handleExport('BRED')} className="min-w-[140px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20" disabled={!selectedApprovalId || selectedPeriodRecords.length === 0}>
                     <FileDown className="mr-2 h-4 w-4" /> BRED CSV
                   </Button>
                   <Button variant="secondary" onClick={() => handleExport('Excel')} className="min-w-[140px] hover:bg-gray-700/80 bg-white/10 text-white border border-white/20" disabled={!selectedApprovalId || selectedPeriodRecords.length === 0}>
                     <FileText className="mr-2 h-4 w-4" /> Excel
                   </Button>
                 </div>
               </div>
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
                <AlertDialogCancel onClick={() => {setShowDeleteDialog(false); setDeletePassword(''); setSelectedApprovalId(null);}} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteRecords} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                   {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : 'Delete'}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

         {/* Footer is handled by RootLayout */}
         <footer className="w-full text-center py-4 text-xs text-white relative z-10 bg-black/30 backdrop-blur-sm">
             © {new Date().getFullYear()} Aayush Atishay Lal 北京化工大学
         </footer>
    </div>
  );
};

export default WagesRecordsPage;
