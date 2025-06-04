
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, CalendarIcon, Upload, Send, Loader2, Copy, FileText, Eye, Trash2, AlertTriangle, CheckCircle, XCircle, BarChartHorizontalBig } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, isValid, parseISO, differenceInDays, startOfYear, endOfYear } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { getEmployees, requestLeaveApproval, getLeaveRequestsWithDetails, deleteWageRecordsByApprovalId, getLeaveCarryOverForYear, type Employee, type LeaveRequestData, type LeaveRequestDisplayDetails } from '@/services/employee-service';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Image from 'next/image'; 

interface LeaveFormDataState {
  employeeId: string | null;
  leaveType: string | null;
  dateRange: DateRange | undefined;
  letterFile: File | null; 
  letterPreviewUri: string | null; 
  isPdf: boolean; 
  notes: string;
}

const initialFormData: LeaveFormDataState = {
  employeeId: null,
  leaveType: null,
  dateRange: undefined,
  letterFile: null,
  letterPreviewUri: null,
  isPdf: false,
  notes: '',
};

const leaveTypes = [
  { value: 'annual', label: 'Annual Leave', baseAllotment: 10 },
  { value: 'sick', label: 'Sick Leave', baseAllotment: 10 },
  { value: 'bereavement', label: 'Bereavement Leave', baseAllotment: 5 },
  { value: 'maternity_paternity', label: 'Maternity/Paternity Leave', baseAllotment: 5 },
  { value: 'unpaid', label: 'Unpaid Leave', baseAllotment: Infinity },
  { value: 'other', label: 'Other (Specify in notes)', baseAllotment: Infinity },
];

const ADMIN_PASSWORD = 'admin01';

interface LeaveBalance {
  leaveType: string;
  label: string;
  baseAllotment: number;
  carriedOver: number;
  totalEntitlement: number;
  usedThisYear: number;
  remainingBalance: number;
}


const EmployeeLeavesPage = () => {
  const [formData, setFormData] = useState<LeaveFormDataState>(initialFormData);
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedApprovalLink, setGeneratedApprovalLink] = useState<string | null>(null);
  
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequestDisplayDetails[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequestDisplayDetails[]>([]);
  const [declinedLeaves, setDeclinedLeaves] = useState<LeaveRequestDisplayDetails[]>([]);
  const [isLoadingLeaveLists, setIsLoadingLeaveLists] = useState(false);
  const [activeTab, setActiveTab] = useState("new_request");
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);


  const { toast } = useToast();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDeleteApprovalId, setItemToDeleteApprovalId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [letterToViewUri, setLetterToViewUri] = useState<string | null>(null);
  const [isViewingPdf, setIsViewingPdf] = useState(false);

  const isPriyanka = currentUser === 'Priyanka Sharma';
  const branchForPriyanka = isPriyanka ? 'suva' : null;


  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
      router.replace('/');
    } else {
      setCurrentUser(storedUser);
      setAuthCheckLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!authCheckLoading && formData.employeeId && isPriyanka) {
        const selectedEmp = activeEmployees.find(e => e.id === formData.employeeId);
        if (selectedEmp && selectedEmp.branch !== 'suva') {
            setFormData(prev => ({...prev, employeeId: null}));
            setLeaveBalances([]); 
        }
    }
  }, [authCheckLoading, formData.employeeId, activeEmployees, isPriyanka]);


  const fetchLeaveLists = useCallback(async (employeeIdToFilter: string | null = null) => {
    if (authCheckLoading || !currentUser) return;
    setIsLoadingLeaveLists(true);
    try {
        const effectiveEmployeeIdFilter = employeeIdToFilter || formData.employeeId;
        const [pending, approved, declined] = await Promise.all([
            getLeaveRequestsWithDetails('pending', branchForPriyanka, effectiveEmployeeIdFilter),
            getLeaveRequestsWithDetails('approved', branchForPriyanka, effectiveEmployeeIdFilter),
            getLeaveRequestsWithDetails('declined', branchForPriyanka, effectiveEmployeeIdFilter)
        ]);
        setPendingLeaves(pending);
        setApprovedLeaves(approved);
        setDeclinedLeaves(declined);
    } catch (error: any) {
        toast({ title: 'Error Loading Leave Lists', description: error.message, variant: 'destructive' });
    } finally {
        setIsLoadingLeaveLists(false);
    }
  }, [authCheckLoading, currentUser, branchForPriyanka, toast, formData.employeeId]);


  const fetchActiveEmployees = useCallback(async () => {
    if (authCheckLoading) return;
    setIsLoadingEmployees(true);
    try {
      const fetchedEmployees = await getEmployees(false); 
      let relevantEmployees = fetchedEmployees;
      if (isPriyanka) {
        relevantEmployees = fetchedEmployees.filter(emp => emp.branch === 'suva');
      }
      setActiveEmployees(relevantEmployees);
    } catch (error: any) {
      toast({
        title: 'Error Loading Employees',
        description: error.message || 'Failed to load employee data.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [toast, authCheckLoading, isPriyanka]);

  useEffect(() => {
    fetchActiveEmployees();
    fetchLeaveLists(); 
  }, [fetchActiveEmployees, fetchLeaveLists]);

  const calculateLeaveBalances = useCallback(async (employeeId: string) => {
      if (!employeeId) {
          setLeaveBalances([]);
          return;
      }
      setIsLoadingBalances(true);
      try {
          const currentYear = new Date().getFullYear();
          const approvedLeaveRecords = await getLeaveRequestsWithDetails('approved', null, employeeId);
          
          const yearlyApprovedLeaves = approvedLeaveRecords.filter(leave => {
              const leaveStartDateYear = parseISO(leave.dateFrom).getFullYear();
              return leaveStartDateYear === currentYear;
          });

          const calculatedBalancesPromises = leaveTypes.map(async (lt) => {
              const usedForTypeThisYear = yearlyApprovedLeaves
                  .filter(al => al.leave_type === lt.value)
                  .reduce((totalDays, leave) => {
                      const start = parseISO(leave.dateFrom);
                      const end = parseISO(leave.dateTo);
                      if (isValid(start) && isValid(end)) {
                          return totalDays + (differenceInDays(end, start) + 1);
                      }
                      return totalDays;
                  }, 0);
              
              let carriedOverDays = 0;
              if (lt.value !== 'annual') { 
                  // carriedOverDays = await getLeaveCarryOverForYear(employeeId, lt.value, currentYear);
                  // For now, other types also default to 0 carry-over unless specific logic is added.
              }


              const totalEntitlement = lt.baseAllotment === Infinity 
                ? Infinity 
                : (lt.baseAllotment + carriedOverDays);
              
              const remaining = totalEntitlement === Infinity 
                ? Infinity 
                : Math.max(0, totalEntitlement - usedForTypeThisYear);

              return {
                  leaveType: lt.value,
                  label: lt.label,
                  baseAllotment: lt.baseAllotment,
                  carriedOver: carriedOverDays, 
                  totalEntitlement: totalEntitlement,
                  usedThisYear: usedForTypeThisYear,
                  remainingBalance: remaining,
              };
          });
          
          const newBalances = await Promise.all(calculatedBalancesPromises);
          setLeaveBalances(newBalances);

      } catch (error: any) {
          toast({ title: 'Error Calculating Balances', description: error.message, variant: 'destructive' });
          setLeaveBalances([]);
      } finally {
          setIsLoadingBalances(false);
      }
  }, [toast]);


  const handleEmployeeSelect = (employeeIdValue: string | null) => {
    setFormData(prev => ({ ...prev, employeeId: employeeIdValue }));
    if (employeeIdValue) {
      fetchLeaveLists(employeeIdValue); 
      calculateLeaveBalances(employeeIdValue); 
    } else {
      fetchLeaveLists(null); 
      setLeaveBalances([]); 
    }
  };


  const handleLeaveTypeSelect = (leaveType: string) => {
    setFormData(prev => ({ ...prev, leaveType }));
  };

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setFormData(prev => ({ ...prev, dateRange: range }));
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, notes: e.target.value }));
  };

  const handleLetterUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { 
        toast({ title: "File Too Large", description: "Leave letter file must be less than 5MB.", variant: "destructive"});
        setFormData(prev => ({ ...prev, letterFile: null, letterPreviewUri: null, isPdf: false }));
        event.target.value = ""; 
        return;
      }
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
      const allowedPdfType = 'application/pdf';

      if (![...allowedImageTypes, allowedPdfType].includes(file.type)) {
        toast({ title: "Invalid File Type", description: "Please upload a JPG, PNG, GIF image, or a PDF file.", variant: "destructive"});
        setFormData(prev => ({ ...prev, letterFile: null, letterPreviewUri: null, isPdf: false }));
        event.target.value = "";
        return;
      }
      
      const isPdfFile = file.type === allowedPdfType;
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          letterFile: file,
          letterPreviewUri: reader.result as string, 
          isPdf: isPdfFile,
        }));
      };
      reader.readAsDataURL(file); 
    } else {
      setFormData(prev => ({ ...prev, letterFile: null, letterPreviewUri: null, isPdf: false }));
    }
  };

  const validateForm = (): boolean => {
    if (!formData.employeeId) {
      toast({ title: 'Validation Error', description: 'Please select an employee.', variant: 'destructive' }); return false;
    }
    if (!formData.leaveType) {
      toast({ title: 'Validation Error', description: 'Please select a leave type.', variant: 'destructive' }); return false;
    }
    if (!formData.dateRange?.from || !formData.dateRange?.to) {
      toast({ title: 'Validation Error', description: 'Please select leave start and end dates.', variant: 'destructive' }); return false;
    }
    if (differenceInDays(formData.dateRange.to, formData.dateRange.from) < 0) {
      toast({ title: 'Validation Error', description: 'Leave end date cannot be before start date.', variant: 'destructive' }); return false;
    }
    return true;
  };

  const handleSubmitLeaveRequest = async () => {
    if (!validateForm() || !currentUser) return;
    setIsSubmitting(true);
    setGeneratedApprovalLink(null);

    const employee = activeEmployees.find(e => e.id === formData.employeeId);
    if (!employee) {
        toast({ title: "Error", description: "Selected employee not found.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const letterDataUriToSend = formData.letterPreviewUri;

    const leaveRequestPayload: LeaveRequestData = {
      employeeId: formData.employeeId!,
      leaveType: formData.leaveType!,
      dateFrom: format(formData.dateRange!.from!, 'yyyy-MM-dd'),
      dateTo: format(formData.dateRange!.to!, 'yyyy-MM-dd'),
      letterImageDataUri: letterDataUriToSend, 
      notes: formData.notes.trim(),
      branch: employee.branch, 
    };

    try {
      const result = await requestLeaveApproval(leaveRequestPayload, currentUser);
      toast({
        title: 'Leave Request Submitted',
        description: `Approval link generated for leave request ID: ${result.approvalId}.`,
        duration: 7000,
      });
      setGeneratedApprovalLink(result.approvalLink);
      setFormData(initialFormData); 
      const fileInput = document.getElementById('letter-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      fetchLeaveLists(formData.employeeId); 
      if(formData.employeeId) calculateLeaveBalances(formData.employeeId);
      setActiveTab("pending"); 

    } catch (error: any) {
      console.error('Error submitting leave request:', error);
      toast({
        title: 'Submission Error',
        description: error.message || 'Failed to submit leave request.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const copyToClipboard = useCallback((text: string | null) => {
    if (!text) {
      toast({ title: 'Error', description: 'Failed to copy link. No link available.', variant: 'destructive' });
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Success', description: 'Approval link copied to clipboard!' });
    }).catch((err) => {
      toast({ title: 'Error', description: 'Failed to copy link. Please copy it manually.', variant: 'destructive' });
      console.error('Failed to copy: ', err);
    });
  }, [toast]);

  const openDeleteActionDialog = (approvalId: string) => {
    setItemToDeleteApprovalId(approvalId);
    setShowDeleteDialog(true);
    setDeletePassword('');
  };

  const confirmDeleteRequest = async () => {
    if (!itemToDeleteApprovalId) return;
    if (deletePassword !== ADMIN_PASSWORD) {
      toast({ title: 'Error', description: 'Incorrect admin password.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteWageRecordsByApprovalId(itemToDeleteApprovalId); 
      toast({ title: 'Success', description: 'Leave request and approval deleted successfully.' });
      setShowDeleteDialog(false);
      setItemToDeleteApprovalId(null);
      fetchLeaveLists(formData.employeeId); 
      if(formData.employeeId) calculateLeaveBalances(formData.employeeId);
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to delete leave request: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewLetter = (leave: LeaveRequestDisplayDetails) => {
    if (leave.letterImageDataUri) {
        setLetterToViewUri(leave.letterImageDataUri);
        setIsViewingPdf(leave.letterImageDataUri.startsWith('data:application/pdf'));
        setShowLetterModal(true);
    } else {
        toast({title: "No Letter", description: "No letter was uploaded for this request.", variant: "default"});
    }
  };
  
  const generateApprovalLinkInternal = (token: string | undefined): string | null => {
    if (!token) return null;
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9002');
    const path = '/approve-wages';
    const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    return `${cleanBaseURL}${path}?token=${token}`;
  };

  if (authCheckLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black/70">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  const renderLeaveTable = (leaves: LeaveRequestDisplayDetails[], statusType: 'pending' | 'approved' | 'declined') => {
      if (isLoadingLeaveLists) {
          return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-white" /><p className="ml-3 text-lg text-white">Loading leaves...</p></div>;
      }
      if (leaves.length === 0) {
          return <p className="text-center text-gray-400 py-10">No {statusType} leave requests found{branchForPriyanka ? ' for Suva branch' : ''}{formData.employeeId ? ' for the selected employee' : ''}.</p>;
      }
      return (
          <div className="overflow-x-auto border border-white/20 rounded-lg">
              <Table>
                  <TableHeader className="bg-white/10">
                      <TableRow>
                          {!formData.employeeId && <TableHead className="text-white">Employee</TableHead>}
                          <TableHead className="text-white">Leave Type</TableHead>
                          <TableHead className="text-white">Date From</TableHead>
                          <TableHead className="text-white">Date To</TableHead>
                          <TableHead className="text-white">Days</TableHead>
                          <TableHead className="text-white">Notes</TableHead>
                          <TableHead className="text-white">Initiated By</TableHead>
                          <TableHead className="text-white text-center">Letter</TableHead>
                          <TableHead className="text-white text-center">Actions</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {leaves.map(leave => {
                        const fromDate = parseISO(leave.dateFrom);
                        const toDate = parseISO(leave.dateTo);
                        const duration = isValid(fromDate) && isValid(toDate) ? differenceInDays(toDate, fromDate) + 1 : 'N/A';
                        const canPriyankaDelete = isPriyanka && leave.branch === 'suva' && statusType === 'pending';
                        const canAdminDelete = currentUser === 'ADMIN';
                        const showDeleteButton = (statusType === 'pending' && (canAdminDelete || canPriyankaDelete)) || (statusType !== 'pending' && canAdminDelete);

                        return (
                          <TableRow key={leave.approval_id} className="hover:bg-white/5">
                              {!formData.employeeId && <TableCell className="text-white">{leave.employeeName}</TableCell>}
                              <TableCell className="text-white capitalize">{leave.leave_type.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="text-white">{format(fromDate, 'MMM dd, yyyy')}</TableCell>
                              <TableCell className="text-white">{format(toDate, 'MMM dd, yyyy')}</TableCell>
                              <TableCell className="text-white text-center">{duration}</TableCell>
                              <TableCell className="text-white max-w-xs truncate" title={leave.notes || ''}>{leave.notes || 'N/A'}</TableCell>
                              <TableCell className="text-white">{leave.initiated_by || 'N/A'}</TableCell>
                              <TableCell className="text-white text-center">
                                  {leave.letterImageDataUri ? (
                                      <Button variant="ghost" size="icon" onClick={() => handleViewLetter(leave)} className="text-blue-300 hover:text-blue-100 hover:bg-white/20 h-7 w-7">
                                          <Eye className="h-4 w-4" />
                                      </Button>
                                  ) : 'No'}
                              </TableCell>
                              <TableCell className="text-white text-center">
                                  {statusType === 'pending' && leave.approvalToken && (
                                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(generateApprovalLinkInternal(leave.approvalToken))} className="text-white hover:bg-white/10 mr-2 h-7 px-2">
                                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy Link
                                    </Button>
                                  )}
                                  {showDeleteButton && (
                                    <Button variant="destructive" size="sm" onClick={() => openDeleteActionDialog(leave.approval_id)} disabled={isDeleting && itemToDeleteApprovalId === leave.approval_id} className="h-7 px-2">
                                        {isDeleting && itemToDeleteApprovalId === leave.approval_id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                                    </Button>
                                  )}
                              </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
              </Table>
          </div>
      );
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
        <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
          <Link href={isPriyanka ? "/dashboard" : "/employees"} passHref className="ml-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
            Employee Leave Management
          </h1>
          <Link href="/dashboard" passHref className="mr-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Home className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Button>
          </Link>
        </header>

        <main className="flex flex-col items-center flex-grow w-full pb-16 pt-2">
          <Card className="w-full max-w-2xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-6 mb-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-center text-white mb-2 text-xl">Submit New Leave Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-0">
              {isLoadingEmployees ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                  <p className="ml-3 text-lg text-white">Loading employees...</p>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="employee-select-main" className="text-white font-semibold">Select Employee {isPriyanka ? '(Suva Branch Only)' : ''}</Label>
                    <Select onValueChange={handleEmployeeSelect} value={formData.employeeId || ''} disabled={isSubmitting || activeEmployees.length === 0}>
                      <SelectTrigger id="employee-select-main" className="mt-1 bg-white/10 text-white placeholder-gray-400 border-white/20">
                        <SelectValue placeholder={activeEmployees.length === 0 ? 'No active employees available' : 'Choose an employee'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Active Employees</SelectLabel>
                          {activeEmployees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.name} ({emp.branch})
                            </SelectItem>
                          ))}
                          {activeEmployees.length === 0 && (
                            <SelectItem value="no-employees" disabled>No active employees</SelectItem>
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.employeeId && (
                    <Card className="bg-black/30 border-white/15 p-4 mt-4">
                      <CardHeader className="p-0 pb-2">
                        <CardTitle className="text-lg text-purple-300 flex items-center">
                          <BarChartHorizontalBig className="mr-2 h-5 w-5"/>
                          Leave Balances for {activeEmployees.find(e => e.id === formData.employeeId)?.name} ({new Date().getFullYear()})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {isLoadingBalances ? (
                          <div className="text-center text-gray-300 py-3"><Loader2 className="h-5 w-5 animate-spin inline mr-2"/>Loading balances...</div>
                        ) : leaveBalances.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-b-white/20">
                                  <TableHead className="text-white/80 text-left whitespace-nowrap max-w-[100px] sm:max-w-[120px] pr-2">Type</TableHead>
                                  <TableHead className="text-white/80 text-right px-1">Allotment</TableHead>
                                  <TableHead className="text-white/80 text-right px-1">Entitled</TableHead>
                                  <TableHead className="text-white/80 text-right px-1">Used</TableHead>
                                  <TableHead className="text-white/80 text-right pl-1">Remaining</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {leaveBalances.map(bal => (
                                  <TableRow key={bal.leaveType} className="border-b-transparent hover:bg-white/5">
                                    <TableCell className="text-white text-left whitespace-normal max-w-[100px] sm:max-w-[120px] pr-2">{bal.label}</TableCell>
                                    <TableCell className="text-white text-right px-1">{bal.baseAllotment === Infinity ? 'N/A' : bal.baseAllotment}</TableCell>
                                    <TableCell className="text-white text-right px-1">{bal.totalEntitlement === Infinity ? 'N/A' : bal.totalEntitlement}</TableCell>
                                    <TableCell className="text-white text-right px-1">{bal.usedThisYear}</TableCell>
                                    <TableCell className="text-white text-right font-semibold pl-1">{bal.remainingBalance === Infinity ? 'N/A' : bal.remainingBalance}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No balance data to display for the selected employee.</p>
                        )}
                      </CardContent>
                    </Card>
                  )}


                  <div>
                    <Label htmlFor="leave-type-select" className="text-white font-semibold">Leave Type</Label>
                    <Select onValueChange={handleLeaveTypeSelect} value={formData.leaveType || ''} disabled={isSubmitting || !formData.employeeId}>
                      <SelectTrigger id="leave-type-select" className="mt-1 bg-white/10 text-white placeholder-gray-400 border-white/20">
                        <SelectValue placeholder="Select type of leave" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Leave Types</SelectLabel>
                          {leaveTypes.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="leave-dates" className="text-white font-semibold">Leave Dates</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="leave-dates"
                          variant={'outline'}
                          className={cn(
                            'w-full justify-start text-left font-normal mt-1 text-gray-900 bg-white hover:bg-gray-100',
                            !formData.dateRange?.from && 'text-muted-foreground'
                          )}
                          disabled={isSubmitting || !formData.employeeId}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.dateRange?.from && isValid(formData.dateRange.from) ? (
                            formData.dateRange.to && isValid(formData.dateRange.to) ? (
                              <>
                                {format(formData.dateRange.from, 'LLL dd, y')} - {format(formData.dateRange.to, 'LLL dd, y')}
                              </>
                            ) : (
                              format(formData.dateRange.from, 'LLL dd, y')
                            )
                          ) : (
                            <span>Pick leave start and end dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white text-black" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={formData.dateRange?.from}
                          selected={formData.dateRange}
                          onSelect={handleDateRangeSelect}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label htmlFor="letter-upload" className="text-white font-semibold">Upload Leave Letter (Image or PDF, Max 5MB)</Label>
                    <Input
                      id="letter-upload"
                      type="file"
                      accept="image/jpeg, image/png, image/gif, application/pdf"
                      onChange={handleLetterUpload}
                      className="mt-1 file:text-white file:bg-white/20 file:border-white/20 hover:file:bg-white/30 bg-white/10 text-white placeholder-gray-400 border-white/20"
                      disabled={isSubmitting || !formData.employeeId}
                    />
                    {formData.letterPreviewUri && (
                      <div className="mt-2 border border-gray-600 rounded p-2 max-w-xs">
                        {formData.isPdf ? (
                          <div className="flex items-center text-white">
                            <FileText className="h-10 w-10 mr-2 text-red-400" />
                            <div>
                              <p className="text-sm font-medium">PDF Uploaded:</p>
                              <p className="text-xs text-gray-300 truncate max-w-[200px]">{formData.letterFile?.name}</p>
                            </div>
                          </div>
                        ) : (
                          <Image src={formData.letterPreviewUri} alt="Leave letter preview" width={160} height={160} className="max-h-40 w-auto rounded" />
                        )}
                         {!formData.isPdf && <p className="text-xs text-gray-400 mt-1">Image Preview</p>}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="notes" className="text-white font-semibold">Additional Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Enter any additional details or reasons..."
                      value={formData.notes}
                      onChange={handleNotesChange}
                      className="mt-1 bg-white/10 text-white placeholder-gray-400 border-white/20"
                      rows={3}
                      disabled={isSubmitting || !formData.employeeId}
                    />
                  </div>

                  <div className="flex justify-center mt-8">
                    <Button
                      variant="gradient"
                      size="lg"
                      onClick={handleSubmitLeaveRequest}
                      disabled={isSubmitting || isLoadingEmployees || !formData.employeeId}
                      className="min-w-[280px]"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting Request...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Submit Leave Request for Approval
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {generatedApprovalLink && (
                <div className="mt-6 p-4 border border-green-600 rounded-xl bg-green-900/40 text-white">
                  <p className="text-md font-semibold mb-2 text-green-300">Leave Request Submitted! Approval link:</p>
                  <div className="flex items-center gap-3">
                    <Input type="text" value={generatedApprovalLink} readOnly className="flex-grow bg-gray-700 border-gray-600 text-white h-10 text-sm"/>
                    <Button size="md" onClick={() => copyToClipboard(generatedApprovalLink)} variant="secondary" className="text-white hover:bg-green-600 bg-green-700/80 border-green-500 transition-colors">
                      <Copy className="mr-2 h-4 w-4"/> Copy Link
                    </Button>
                  </div>
                  <p className="text-sm mt-3 text-gray-400">Please copy this link and send it to the administrator for approval.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="w-full max-w-5xl mt-12">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6 bg-gray-800/60 border border-white/15 text-gray-300">
                  <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-600/80 data-[state=active]:text-white">
                      <AlertTriangle className="mr-2 h-4 w-4" /> Pending Leaves
                  </TabsTrigger>
                  <TabsTrigger value="approved" className="data-[state=active]:bg-green-700/80 data-[state=active]:text-white">
                      <CheckCircle className="mr-2 h-4 w-4" /> Approved Leaves
                  </TabsTrigger>
                  <TabsTrigger value="declined" className="data-[state=active]:bg-red-700/80 data-[state=active]:text-white">
                      <XCircle className="mr-2 h-4 w-4" /> Declined Leaves
                  </TabsTrigger>
              </TabsList>
              <TabsContent value="pending">{renderLeaveTable(pendingLeaves, 'pending')}</TabsContent>
              <TabsContent value="approved">{renderLeaveTable(approvedLeaves, 'approved')}</TabsContent>
              <TabsContent value="declined">{renderLeaveTable(declinedLeaves, 'declined')}</TabsContent>
            </Tabs>
          </div>

        </main>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-300">
                        Are you sure you want to delete this leave request? This action cannot be undone.
                        Please enter the admin password to confirm.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="delete-password-leave">Admin Password</Label>
                    <Input
                        id="delete-password-leave"
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="bg-gray-800 border-white/20 text-white"
                        onKeyPress={(e) => { if (e.key === 'Enter') confirmDeleteRequest(); }}
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowDeleteDialog(false)} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteRequest} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Delete'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showLetterModal} onOpenChange={setShowLetterModal}>
            <AlertDialogContent className="bg-gray-900 border-white/20 text-white max-w-2xl">
                 <AlertDialogHeader>
                    <AlertDialogTitle>View Leave Letter</AlertDialogTitle>
                </AlertDialogHeader>
                <div className="my-4 max-h-[70vh] overflow-auto">
                    {letterToViewUri && (
                        isViewingPdf ? (
                            <iframe src={letterToViewUri} style={{ width: '100%', height: '60vh' }} title="Leave Letter PDF"></iframe>
                        ) : (
                            <Image src={letterToViewUri} alt="Leave Letter" width={800} height={1000} style={{ maxWidth: '100%', height: 'auto' }} />
                        )
                    )}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowLetterModal(false)} className="border-white/20 text-white hover:bg-white/10">Close</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
};

export default EmployeeLeavesPage;

