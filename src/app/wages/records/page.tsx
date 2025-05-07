
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
import {CalendarIcon, Home, ArrowLeft, Trash2, FileText, FileDown, Loader2, CheckCircle, XCircle, AlertTriangle, Copy, FileType, Mail, RefreshCw, Download } from 'lucide-react'; // Added Download icon
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
  AlertDialogFooter, // Ensure AlertDialogFooter is imported
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {useRouter} from 'next/navigation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf'; // Import jsPDF
import autoTable from 'jspdf-autotable'; // Import autoTable for better table generation

// Import DB service functions for employees and wages
import { getEmployees, getWageRecords, deleteWageRecordsByApprovalId, getPayPeriodSummaries, requestWageApproval, type PayPeriodSummary, type Employee, type WageRecord } from '@/services/employee-service'; // Use requestWageApproval

// --- Component ---
const WagesRecordsPage = () => {
  // --- State ---
  const [payPeriodSummaries, setPayPeriodSummaries] = useState<{[key: string]: PayPeriodSummary[]}>({ approved: [], declined: [], pending: [] });
  const [selectedPeriodRecords, setSelectedPeriodRecords] = useState<WageRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Combined processing state
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null); // ID of the period selected for details/actions
  const [selectedStatus, setSelectedStatus] = useState<'approved' | 'declined' | 'pending'>('approved'); // Track current tab status
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionType, setActionType] = useState<'delete' | null>(null); // Simplified actionType
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
          // Fetch records specifically for this approval ID using getWageRecords
          // Determine the status from the fetched summaries
           const selectedPeriodSummary = [...payPeriodSummaries.approved, ...payPeriodSummaries.pending, ...payPeriodSummaries.declined].find(p => p.approvalId === approvalId);
           const statusToFetch = selectedPeriodSummary?.status || null; // Get the status or null

           if (!statusToFetch) {
               throw new Error("Could not determine the status of the selected period.");
           }

           const periodRecords = await getWageRecords(null, null, statusToFetch, approvalId);


          // Ensure dates are strings in YYYY-MM-DD format and numeric types are correct
          const parsedRecords = periodRecords.map(record => {
              // Ensure dateFrom and dateTo are valid before attempting to parse
                let dateFromStr = 'Invalid Date';
                let dateToStr = 'Invalid Date';

                if (record.dateFrom) {
                   const dateFromObj = typeof record.dateFrom === 'string' ? parseISO(record.dateFrom) : record.dateFrom;
                   if (isDateValid(dateFromObj)) {
                       dateFromStr = format(dateFromObj, 'yyyy-MM-dd');
                   }
                }

                 if (record.dateTo) {
                   const dateToObj = typeof record.dateTo === 'string' ? parseISO(record.dateTo) : record.dateTo;
                   if (isDateValid(dateToObj)) {
                       dateToStr = format(dateToObj, 'yyyy-MM-dd');
                   }
                 }

              if (dateFromStr === 'Invalid Date' || dateToStr === 'Invalid Date') {
                  console.warn("Invalid date encountered in record:", record);
                  // Consider how to handle invalid dates - skip, default, or show error?
                  // For now, we'll keep the 'Invalid Date' string.
              }

              return {
                  ...record,
                  hourlyWage: Number(record.hourlyWage) || 0,
                  totalHours: Number(record.totalHours) || 0,
                  hoursWorked: Number(record.hoursWorked) || 0,
                  overtimeHours: Number(record.overtimeHours) || 0,
                  mealAllowance: Number(record.mealAllowance) || 0,
                  fnpfDeduction: Number(record.fnpfDeduction) || 0,
                  otherDeductions: Number(record.otherDeductions) || 0,
                  grossPay: Number(record.grossPay) || 0,
                  netPay: Number(record.netPay) || 0,
                  dateFrom: dateFromStr,
                  dateTo: dateToStr,
              };
          }) as WageRecord[]; // Assert the type after mapping


          setSelectedPeriodRecords(parsedRecords);
      } catch (error: any) {
          console.error(`Error fetching details for approval ID ${approvalId}:`, error);
          toast({ title: "Error", description: `Failed to load details for the selected period. ${error.message}`, variant: "destructive" });
          setSelectedPeriodRecords([]); // Clear details on error
      } finally {
          setIsLoading(false);
      }
  }, [toast, payPeriodSummaries]); // Add payPeriodSummaries dependency

  // --- Event Handlers ---
  const handlePeriodSelect = (approvalId: string) => {
    // If clicking the same period again, deselect; otherwise, select and fetch details
    if (selectedApprovalId === approvalId) {
        setSelectedApprovalId(null);
        setSelectedPeriodRecords([]);
    } else {
        setSelectedApprovalId(approvalId);
        // Fetch details regardless of the current tab, as selection implies viewing details
        fetchPeriodDetails(approvalId);
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
      setActionType('delete'); // Set action type to delete
      setShowDeleteDialog(true);
  };

  // Define closeDialog function
  const closeDialog = () => {
    setShowDeleteDialog(false);
    setSelectedApprovalId(null);
    setDeletePassword(''); // Reset password input
    setActionType(null); // Reset action type
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
    setIsProcessing(true); // Indicate processing started

    try {
        // Call service function to delete records using the approval ID
        await deleteWageRecordsByApprovalId(selectedApprovalId);

        toast({ title: 'Success', description: 'Wage records deleted successfully!' });
        console.log(`Wage records for approval ID ${selectedApprovalId} deleted successfully!`);

        // Refetch the list of periods to update the UI
        await fetchInitialData();
        // Reset selection state
        closeDialog(); // Use the closeDialog function

    } catch (error: any) {
        console.error(`Error deleting records for approval ID ${selectedApprovalId}:`, error);
        toast({
            title: 'Error',
            description: error.message || `Failed to delete wage records.`,
            variant: 'destructive',
        });
    } finally {
       setIsDeleting(false);
       setIsProcessing(false); // Indicate processing finished
       // closeDialog(); // Also call closeDialog in finally if needed
       setShowDeleteDialog(false); // Explicitly hide dialog
       setDeletePassword('');
       setSelectedApprovalId(null); // Clear selection
    }
  };

   // Function to generate the approval link
   const generateApprovalLink = (token: string | undefined): string | null => {
        if (!token) return null;
        // Use the environment variable for the base URL or fallback to localhost for dev
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'; // Ensure this is set

        if (!baseURL) {
             console.warn("Warning: NEXT_PUBLIC_BASE_URL is not set. Using fallback http://localhost:9002. Approval links may not work in deployed environments.");
         } else if (baseURL.includes('localhost') && process.env.NODE_ENV === 'production') {
             console.warn("Warning: NEXT_PUBLIC_BASE_URL is set to localhost in production. Ensure it's set to the deployed application's public URL in your hosting environment (e.g., Railway).");
         }

        // Construct the link path carefully
        const path = '/approve-wages'; // Ensure leading slash
        const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        return `${cleanBaseURL}${path}?token=${token}`;
  };

  // Function to handle copying the approval link
    const handleApprovalLinkAction = async (approvalId: string, token: string | undefined) => {
        if (!token) {
            toast({ title: 'Error', description: 'Approval token is missing for this period.', variant: 'destructive' });
            return;
        }

        const link = generateApprovalLink(token);
        if (!link) {
             toast({ title: 'Error', description: 'Could not generate approval link. Check configuration.', variant: 'destructive' });
             return;
        }

        try {
            await navigator.clipboard.writeText(link);
            toast({ title: 'Success', description: 'Approval link copied to clipboard!' });
        } catch (err) {
            console.error('Could not copy text: ', err);
            toast({ title: 'Error', description: 'Failed to copy approval link.', variant: 'destructive' });
        }
    };


  // --- Export Functions ---
  const handleExport = (formatType: 'BSP' | 'BRED') => {
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
    const dateFromObj = parseISO(selectedGroup.dateFrom);
    const dateToObj = parseISO(selectedGroup.dateTo);

    if (!isDateValid(dateFromObj) || !isDateValid(dateToObj)) {
      toast({ title: 'Error', description: 'Invalid date range for the selected period.', variant: 'destructive' });
      console.error('Invalid date range for the selected period.');
      return;
    }
    const dateFromStr = format(dateFromObj, 'yyyyMMdd');
    const dateToStr = format(dateToObj, 'yyyyMMdd');

    const fileNameBase = `wage_records_${dateFromStr}_${dateToStr}`;


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
        const csvRows: string[][] = []; // No headers for BRED export
        onlineTransferRecords.forEach(record => {
            const employeeDetails = employees.find(emp => emp.id === record.employeeId);
            csvRows.push([
                employeeDetails?.bankCode || '', // BIC
                record.employeeName,             // Employee
                '',                              // Employee 2
                employeeDetails?.bankAccountNumber || '', // Account N
                record.netPay.toFixed(2),        // Amount
                'Salary',                        // Purpose
            ]);
        });
        // Convert array of arrays to CSV string
         csvData = csvRows.map(row => row.join(',')).join('\n');
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
  };

  // --- Payslip Generation (2 per page) ---
  const handleDownloadPayslips = () => {
      if (!selectedApprovalId || selectedStatus !== 'approved' || selectedPeriodRecords.length === 0) {
          toast({
              title: 'Info',
              description: 'Please select an approved pay period with records to generate payslips.',
              variant: 'default'
          });
          return;
      }

      const selectedGroup = payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId);
      if (!selectedGroup) {
          toast({ title: 'Error', description: 'Could not find selected period details.', variant: 'destructive' });
          return;
      }
       // Use parseISO for date strings
       const dateFromObj = parseISO(selectedGroup.dateFrom);
       const dateToObj = parseISO(selectedGroup.dateTo);

       if (!isDateValid(dateFromObj) || !isDateValid(dateToObj)) {
         toast({ title: 'Error', description: 'Invalid date range for payslip generation.', variant: 'destructive' });
         return;
       }

       const doc = new jsPDF({
          orientation: 'p', // portrait
          unit: 'mm', // millimeters
          format: 'a4' // standard A4 size
       });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const companyName = "Lal's Motor Winders (FIJI) PTE Limited";
      // Updated Address and Contact
      const companyAddress = "Nanuku Street, Labasa, Fiji";
      const companyContact = "Phone: +679 9926898";
      const payPeriodStr = `${format(dateFromObj, 'dd/MM/yyyy')} - ${format(dateToObj, 'dd/MM/yyyy')}`;

      const payslipHeight = (pageHeight / 2) - (margin/2); // Allocate half the page height per payslip, adjusted for potential margin
      const contentWidth = pageWidth - 2 * margin;

      // Placeholder for logo - Loading image data in this context can be complex.
      // Ideally, load the image data (e.g., base64) elsewhere and pass it here.
      // For now, we'll just position the text assuming a logo might be there.
      const logoWidth = 20; // Adjust as needed
      const logoHeight = 10; // Adjust as needed

      const drawPayslip = (record: WageRecord, employee: Employee | undefined, startY: number): number => {
           if (!employee) return startY; // Skip if employee details not found

           let currentY = startY + 5; // Start Y for this payslip with top padding

           // --- Company Header with Logo Placeholder ---
            try {
                // Attempt to add logo. If 'logoData' is not defined or invalid, this might fail.
                // Make sure logoData (base64 string) is correctly loaded and available here.
                // For example: const logoData = 'data:image/png;base64,...';
                // Uncomment the following line if logoData is ready:
                // doc.addImage(logoData, 'PNG', margin, currentY - 5, logoWidth, logoHeight);
            } catch (e) {
                console.error("Error adding logo to PDF, ensure logoData is a valid base64 string.", e);
                 // Optionally, draw a placeholder box if logo fails
                doc.rect(margin, currentY - 5, logoWidth, logoHeight);
                doc.text("Logo", margin + logoWidth / 2, currentY, { align: 'center' });
            }
           doc.setFontSize(14);
           doc.setFont('helvetica', 'bold');
           // Adjust text position to account for logo width if added
           doc.text(companyName, margin + logoWidth + 5, currentY, { align: 'left' }); // Example adjustment
           // Or center the text if logo is placed differently
           // doc.text(companyName, pageWidth / 2, currentY, { align: 'center' });
           currentY += 5;
           doc.setFontSize(9);
           doc.setFont('helvetica', 'normal');
           doc.text(companyAddress, margin + logoWidth + 5, currentY, { align: 'left' }); // Example adjustment
           currentY += 4;
           doc.text(companyContact, margin + logoWidth + 5, currentY, { align: 'left' }); // Example adjustment
           currentY += 6;
           doc.setFontSize(12);
           doc.setFont('helvetica', 'bold');
           doc.text('PAYSLIP', pageWidth / 2, currentY, { align: 'center' });
           currentY += 5;
           doc.setLineWidth(0.2);
           doc.line(margin, currentY, pageWidth - margin, currentY); // Separator line
           currentY += 6;

           // --- Employee & Period Details ---
           doc.setFontSize(9);
           const col1X = margin;
           const col2X = margin + contentWidth / 2 + 5; // Position for second column
           let detailY = currentY;

           doc.setFont('helvetica', 'bold');
           doc.text('Employee Name:', col1X, detailY);
           doc.setFont('helvetica', 'normal');
           doc.text(record.employeeName, col1X + 30, detailY);

           doc.setFont('helvetica', 'bold');
           doc.text('Pay Period:', col2X, detailY);
           doc.setFont('helvetica', 'normal');
           doc.text(payPeriodStr, col2X + 22, detailY);
           detailY += 5;

           doc.setFont('helvetica', 'bold');
           doc.text('Position:', col1X, detailY);
           doc.setFont('helvetica', 'normal');
           doc.text(employee.position, col1X + 30, detailY);

           doc.setFont('helvetica', 'bold');
           doc.text('Pay Date:', col2X, detailY);
           doc.setFont('helvetica', 'normal');
           doc.text(format(new Date(), 'dd/MM/yyyy'), col2X + 22, detailY);
           detailY += 5;

           if (employee.fnpfEligible && employee.fnpfNo) {
              doc.setFont('helvetica', 'bold');
              doc.text('FNPF No:', col1X, detailY);
              doc.setFont('helvetica', 'normal');
              doc.text(employee.fnpfNo, col1X + 30, detailY);
           }
           if (employee.tinNo) {
               doc.setFont('helvetica', 'bold');
               doc.text('TIN No:', col2X, detailY);
               doc.setFont('helvetica', 'normal');
               doc.text(employee.tinNo, col2X + 22, detailY);
           }

           currentY = detailY + 6;
           doc.line(margin, currentY - 1, pageWidth - margin, currentY - 1); // Separator line
           currentY += 2;

           // --- Earnings & Deductions Table ---
            let tableEndY = currentY; // Track Y position after tables
            autoTable(doc, {
                startY: currentY,
                head: [['Description', 'Rate ($)', 'Hours', 'Amount ($)']],
                body: [
                    ['Normal Pay', record.hourlyWage.toFixed(2), record.hoursWorked.toFixed(2), (record.hourlyWage * record.hoursWorked).toFixed(2)],
                    ['Overtime Pay', (record.hourlyWage * 1.5).toFixed(2), (record.overtimeHours || 0).toFixed(2), (record.hourlyWage * 1.5 * (record.overtimeHours || 0)).toFixed(2)],
                    ['Meal Allowance', '', '', record.mealAllowance.toFixed(2)],
                    [{ content: 'Gross Earnings', styles: { fontStyle: 'bold'} }, '', '', { content: record.grossPay.toFixed(2), styles: { fontStyle: 'bold'} }],
                ],
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.5, lineColor: [180, 180, 180], lineWidth: 0.1 },
                headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 'auto' },
                    1: { halign: 'right', cellWidth: 20 },
                    2: { halign: 'right', cellWidth: 20 },
                    3: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
                },
                margin: { left: margin, right: margin },
                tableWidth: 'auto',
                didDrawPage: (data) => { tableEndY = data.cursor?.y ?? tableEndY; } // Update end Y position
             });

             currentY = tableEndY + 1; // Space before deductions table

             autoTable(doc, {
                startY: currentY,
                head: [['Deductions', 'Amount ($)']],
                body: [
                    ['FNPF Deduction (8%)', employee.fnpfEligible ? record.fnpfDeduction.toFixed(2) : 'N/A'],
                    ['Other Deductions', record.otherDeductions.toFixed(2)],
                    [{ content: 'Total Deductions', styles: { fontStyle: 'bold'} }, { content: (record.fnpfDeduction + record.otherDeductions).toFixed(2), styles: { fontStyle: 'bold'} }],
                ],
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.5, lineColor: [180, 180, 180], lineWidth: 0.1 },
                headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 'auto' },
                    1: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
                },
                margin: { left: margin, right: margin },
                tableWidth: 'auto',
                didDrawPage: (data) => { tableEndY = data.cursor?.y ?? tableEndY; } // Update end Y position
             });

             currentY = tableEndY + 6;

             // --- Net Pay ---
             doc.setFontSize(10);
             doc.setFont('helvetica', 'bold');
             doc.text(`NET PAY: $${record.netPay.toFixed(2)}`, margin + contentWidth / 2, currentY, { align: 'center' });
             currentY += 5;

             // --- Payment Method ---
             doc.setFontSize(8);
             doc.setFont('helvetica', 'italic');
             const paymentMethodText = `Payment Method: ${employee.paymentMethod === 'online' ? 'Online Transfer' : 'Cash'}`;
             doc.text(paymentMethodText, margin, currentY);

             return currentY + 5; // Return the end Y position of this payslip
      };

      let payslipCounter = 0;
      selectedPeriodRecords.forEach((record, index) => {
           const employee = employees.find(emp => emp.id === record.employeeId);
           const isFirstOnPage = payslipCounter % 2 === 0;
           const startY = isFirstOnPage ? margin : payslipHeight + (margin); // Start Y for the second payslip

           if (index > 0 && isFirstOnPage) {
               doc.addPage(); // Add a new page before the first payslip of a new pair (except the very first one)
           }

           drawPayslip(record, employee, startY);

            // Draw separator line only if it's the first payslip on the page and not the very last one
           if (isFirstOnPage && index < selectedPeriodRecords.length - 1) {
               doc.setDrawColor(150); // Gray line
               doc.setLineWidth(0.3);
               doc.line(margin, payslipHeight + margin/2 , pageWidth - margin, payslipHeight + margin/2); // Line in the middle margin
           }

           payslipCounter++;
      });


      // --- Save the PDF ---
      const dateFromStrPdf = format(dateFromObj, 'yyyyMMdd');
      const dateToStrPdf = format(dateToObj, 'yyyyMMdd');
      const fileName = `payslips_${dateFromStrPdf}_${dateToStrPdf}.pdf`;
      doc.save(fileName);

      toast({ title: 'Success', description: 'Payslips PDF generated successfully!' });
  };

  // --- Download Summary PDF ---
  const handleDownloadSummaryPDF = () => {
      if (!selectedApprovalId || selectedStatus !== 'approved' || selectedPeriodRecords.length === 0) {
          toast({
              title: 'Info',
              description: 'Please select an approved pay period with records to generate the summary PDF.',
              variant: 'default'
          });
          return;
      }

      const selectedGroup = payPeriodSummaries.approved.find(g => g.approvalId === selectedApprovalId);
      if (!selectedGroup) {
          toast({ title: 'Error', description: 'Could not find selected period details.', variant: 'destructive' });
          return;
      }

      const dateFromObj = parseISO(selectedGroup.dateFrom);
      const dateToObj = parseISO(selectedGroup.dateTo);

      if (!isDateValid(dateFromObj) || !isDateValid(dateToObj)) {
          toast({ title: 'Error', description: 'Invalid date range for summary PDF generation.', variant: 'destructive' });
          return;
      }

      // Filter records for FNPF eligible employees
      const eligibleRecords = selectedPeriodRecords.filter(record => {
          const employee = employees.find(emp => emp.id === record.employeeId);
          // Ensure employee exists and fnpfEligible is explicitly true
          return employee && employee.fnpfEligible === true;
      });


      if (eligibleRecords.length === 0) {
          toast({
              title: 'Info',
              description: 'No FNPF-eligible employees found in this period to include in the summary.',
              variant: 'default'
          });
          return;
      }

      const doc = new jsPDF({
          orientation: 'l', // landscape
          unit: 'mm',
          format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const companyName = "Lal's Motor Winders (FIJI) PTE Limited";
      const title = `Wage Summary (FNPF Eligible) - ${format(dateFromObj, 'dd/MM/yyyy')} to ${format(dateToObj, 'dd/MM/yyyy')}`;
      let currentY = margin;

      // --- Header ---
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, pageWidth / 2, currentY, { align: 'center' });
      currentY += 7;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(title, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;

      // --- Table ---
      const head = [["Name", "Total Hours", "Normal Hours", "O/T Hrs", "Meal", "FNPF", "Deduction", "Gross", "Net"]];
      const body = eligibleRecords.map(record => [
          record.employeeName,
          record.totalHours.toFixed(2),
          record.hoursWorked.toFixed(2),
          record.overtimeHours.toFixed(2),
          record.mealAllowance.toFixed(2),
          record.fnpfDeduction.toFixed(2),
          record.otherDeductions.toFixed(2),
          record.grossPay.toFixed(2),
          record.netPay.toFixed(2),
      ]);

       // Calculate Totals for Eligible Employees
       const totalEligibleFNPF = eligibleRecords.reduce((sum, r) => sum + r.fnpfDeduction, 0);
       const totalEligibleGross = eligibleRecords.reduce((sum, r) => sum + r.grossPay, 0);
       const totalEligibleNet = eligibleRecords.reduce((sum, r) => sum + r.netPay, 0);
       const totalEligibleTotalHours = eligibleRecords.reduce((sum, r) => sum + r.totalHours, 0);
       const totalEligibleNormalHours = eligibleRecords.reduce((sum, r) => sum + r.hoursWorked, 0);
       const totalEligibleOvertimeHours = eligibleRecords.reduce((sum, r) => sum + r.overtimeHours, 0);
       const totalEligibleMeal = eligibleRecords.reduce((sum, r) => sum + r.mealAllowance, 0);
       const totalEligibleDeduction = eligibleRecords.reduce((sum, r) => sum + r.otherDeductions, 0);


       // Add totals row to the body
       body.push([
           { content: 'Totals', styles: { fontStyle: 'bold', halign: 'right' } },
           { content: totalEligibleTotalHours.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleNormalHours.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleOvertimeHours.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleMeal.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleFNPF.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleDeduction.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleGross.toFixed(2), styles: { fontStyle: 'bold' } },
           { content: totalEligibleNet.toFixed(2), styles: { fontStyle: 'bold' } },
       ]);


      autoTable(doc, {
          startY: currentY,
          head: head,
          body: body,
          theme: 'grid', // Use a theme like 'grid' or 'striped'
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }, // Example: blue header
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
              // Adjust column widths if needed
              0: { cellWidth: 'auto' }, // Name
              1: { halign: 'right' }, // Total Hours
              2: { halign: 'right' }, // Normal Hours
              3: { halign: 'right' }, // O/T Hrs
              4: { halign: 'right' }, // Meal
              5: { halign: 'right' }, // FNPF
              6: { halign: 'right' }, // Deduction
              7: { halign: 'right' }, // Gross
              8: { halign: 'right' }, // Net
          },
           footStyles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 0 }, // Style the footer row
            didParseCell: (data) => { // Ensure last row (totals) gets footer style
                if (data.row.index === body.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                     data.cell.styles.fillColor = [230, 230, 230]; // Light gray background
                     data.cell.styles.textColor = 0; // Black text
                }
            }
      });

      // --- Save the PDF ---
      const dateFromStrPdf = format(dateFromObj, 'yyyyMMdd');
      const dateToStrPdf = format(dateToObj, 'yyyyMMdd');
      const fileName = `wage_summary_${dateFromStrPdf}_${dateToStrPdf}.pdf`;
      doc.save(fileName);

      toast({ title: 'Success', description: 'Wage Summary PDF generated successfully!' });
  };


  const renderPayPeriodTable = (periods: PayPeriodSummary[], status: 'pending' | 'approved' | 'declined') => (
       <div className="border border-white/20 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto mb-6">
          <Table>
              <TableHeader className="bg-white/10 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                      <TableHead className="text-white border-r border-white/20">Pay Period</TableHead>
                      <TableHead className="text-white border-r border-white/20 text-right">Total Wages</TableHead>
                      <TableHead className="text-white border-r border-white/20 text-right">Total Cash</TableHead> {/* New Header */}
                      <TableHead className="text-white border-r border-white/20 text-right">Total Online</TableHead> {/* New Header */}
                      <TableHead className="text-white text-center">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
              {periods.length > 0 ? (
                  periods.map((period) => {
                    const dateFrom = period.dateFrom ? parseISO(period.dateFrom) : null;
                    const dateTo = period.dateTo ? parseISO(period.dateTo) : null;
                    const formattedPeriod = dateFrom && dateTo && isDateValid(dateFrom) && isDateValid(dateTo)
                      ? `${format(dateFrom, 'MMM dd, yyyy')} - ${format(dateTo, 'MMM dd, yyyy')}`
                      : 'Invalid Date Range';

                    return (
                      <TableRow
                          key={period.approvalId}
                          onClick={() => handlePeriodSelect(period.approvalId)} // Allow selecting any period now
                          className={cn(
                          "border-t border-white/10 hover:bg-white/15 cursor-pointer", // Always pointer
                          selectedApprovalId === period.approvalId && "bg-white/25 font-semibold"
                          )}
                      >
                          <TableCell className="font-medium text-white border-r border-white/20">{formattedPeriod}</TableCell>
                          <TableCell className="text-white border-r border-white/20 text-right">${period.totalWages.toFixed(2)}</TableCell>
                          <TableCell className="text-white border-r border-white/20 text-right">${period.totalCashWages.toFixed(2)}</TableCell> {/* Display Cash Total */}
                          <TableCell className="text-white border-r border-white/20 text-right">${period.totalOnlineWages.toFixed(2)}</TableCell> {/* Display Online Total */}
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

                                {/* Copy Approval Link Button (only for pending) */}
                              {status === 'pending' && period.token && (
                                  <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                          e.stopPropagation(); // Prevent row selection
                                          handleApprovalLinkAction(period.approvalId, period.token);
                                      }}
                                      className="h-7 px-2 text-white hover:bg-white/10 mr-2" // Added margin-right
                                      title="Copy Approval Link"
                                  >
                                      <Copy className="h-3.5 w-3.5" />
                                      <span className="sr-only">Copy Approval Link</span>
                                  </Button>
                              )}


                                {/* Export & Download Buttons (only for approved status and if selected) */}
                                {status === 'approved' && selectedApprovalId === period.approvalId && (
                                    <>
                                        <Button variant="secondary" size="sm" onClick={(e) => {e.stopPropagation(); handleExport('BSP');}} className="h-7 px-2 mr-2 bg-blue-600 hover:bg-blue-700 text-white" title="Export BSP CSV">
                                            <FileDown className="h-3.5 w-3.5 mr-1" /> BSP
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={(e) => {e.stopPropagation(); handleExport('BRED');}} className="h-7 px-2 mr-2 bg-red-600 hover:bg-red-700 text-white" title="Export BRED CSV">
                                            <FileDown className="h-3.5 w-3.5 mr-1" /> BRED
                                        </Button>
                                         {/* Download Payslip Button */}
                                          <Button variant="secondary" size="sm" onClick={(e) => {e.stopPropagation(); handleDownloadPayslips();}} className="h-7 px-2 mr-2 bg-purple-600 hover:bg-purple-700 text-white" title="Download Payslips PDF">
                                             <FileType className="h-3.5 w-3.5 mr-1" /> Payslips
                                         </Button>
                                         {/* Download Summary PDF Button */}
                                         <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={(e) => {e.stopPropagation(); handleDownloadSummaryPDF();}}
                                              className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white"
                                              title="Download Summary PDF (FNPF Eligible Only)"
                                          >
                                             <Download className="h-3.5 w-3.5 mr-1" /> Summary
                                         </Button>
                                    </>
                                )}
                          </TableCell>
                      </TableRow>
                    );
                  })
              ) : (
                  <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-400 py-4"> {/* Adjusted colSpan */}
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

      <main className="w-full flex-grow overflow-y-auto pb-16 pt-6">
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

               {isLoading && !selectedApprovalId ? ( // Show loading only when initially loading lists
                 <div className="text-center text-white py-10 flex items-center justify-center">
                   <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading records list...
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

             {/* Wage Details Section (Visible when a period is selected) */}
            {isLoading && selectedApprovalId && ( // Show loading specifically when fetching details
                <div className="text-center text-white py-10 flex items-center justify-center">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading period details...
                </div>
            )}
             {selectedApprovalId && !isLoading && selectedPeriodRecords.length > 0 && (
               <div className="mt-6">
                 <h3 className="text-lg font-medium text-white mb-4 text-center">
                   Wage Details for {
                      // Find the selected period from any status list to display the date range
                      (()=>{ // IIFE to find and format
                            const period = [...payPeriodSummaries.approved, ...payPeriodSummaries.declined, ...payPeriodSummaries.pending]
                                            .find(g => g.approvalId === selectedApprovalId);
                            if (!period) return 'Selected Period';
                            const dateFrom = period.dateFrom ? parseISO(period.dateFrom) : null;
                            const dateTo = period.dateTo ? parseISO(period.dateTo) : null;
                            return (dateFrom && dateTo && isDateValid(dateFrom) && isDateValid(dateTo))
                                ? `${format(dateFrom, 'MMM dd, yyyy')} - ${format(dateTo, 'MMM dd, yyyy')}`
                                : 'Invalid Date Range';
                        })()
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
                               ${selectedPeriodRecords.reduce((sum, r) => sum + (r.netPay || 0), 0).toFixed(2)}
                           </TableCell>
                       </TableRow>
                     </TableBody>
                   </Table>
                 </div>
               </div>
             )}
             {/* Show message if details are loaded but empty */}
             {selectedApprovalId && !isLoading && selectedPeriodRecords.length === 0 && (
                 <div className="text-center text-gray-400 mt-6 py-4">
                     No wage records found for the selected period.
                 </div>
             )}

              {/* Message when no period is selected and not loading */}
             {!selectedApprovalId && !isLoading && (
                 <div className="text-center text-gray-400 mt-6 py-4">
                     Select a pay period from the list above to view details or perform actions.
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
                  Are you sure you want to delete all wage records for the selected period? This action cannot be undone. Please enter the admin password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="action-password">Admin Password</Label>
                <Input
                  id="action-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="bg-gray-800 border-white/20 text-white"
                  onKeyPress={(e) => { if (e.key === 'Enter') handleDeleteRecords(); }}
                />
              </div>
               <AlertDialogFooter>
                 <AlertDialogCancel onClick={closeDialog} className="border-white/20 text-white hover:bg-white/10">
                   Cancel
                 </AlertDialogCancel>
                 <AlertDialogAction
                   onClick={handleDeleteRecords}
                   className={cn(
                     // Use actionType to dynamically set button color
                     actionType === 'delete' ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700" // Fallback yellow, though only delete is used here
                   )}
                   disabled={isProcessing}
                 >
                   {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Confirm Deletion`}
                 </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
    </div>
  );
};

export default WagesRecordsPage;