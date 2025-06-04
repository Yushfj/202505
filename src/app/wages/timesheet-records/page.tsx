
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Loader2, CalendarIcon, Filter, Send, Edit2, Trash2, CheckCircle, XCircle, AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback, Suspense } from 'react'; // Added Suspense
import { useRouter, useSearchParams } from 'next/navigation'; // Added useSearchParams
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, isValid, parseISO, addDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { getTimesheetRecords, type DailyTimesheetRecord, getEligibleTimesheetPeriodsForReview, requestTimesheetPeriodReview, deleteDailyTimesheetEntry, getEmployees, type Employee, getPayPeriodSummaries, type PayPeriodSummary, deleteWageRecordsByApprovalId } from '@/services/employee-service';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ADMIN_PASSWORD = 'admin01';

const TimesheetRecordsPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams(); // Keep for potential future use if filters are added via URL
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);
  const [timesheetRecords, setTimesheetRecords] = useState<DailyTimesheetRecord[]>([]);
  
  const [eligiblePeriods, setEligiblePeriods] = useState<{dateFrom: string, dateTo: string, branch: 'labasa' | 'suva' | null}[]>([]);
  const [selectedPeriodForReview, setSelectedPeriodForReview] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isResubmittingPeriod, setIsResubmittingPeriod] = useState(false); 

  const [pendingReviewPeriods, setPendingReviewPeriods] = useState<PayPeriodSummary[]>([]);
  const [approvedReviewPeriods, setApprovedReviewPeriods] = useState<PayPeriodSummary[]>([]);
  const [declinedReviewPeriods, setDeclinedReviewPeriods] = useState<PayPeriodSummary[]>([]);
  const [activeTab, setActiveTab] = useState<string>("eligible");

  const isPriyanka = currentUser === 'Priyanka Sharma';
  const branchForPriyanka = isPriyanka ? 'suva' : null;

  const [allEmployeesList, setAllEmployeesList] = useState<Employee[]>([]);
  const [selectedEmployeeIdFilter, setSelectedEmployeeIdFilter] = useState<string>('all');

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [recordToDeleteId, setRecordToDeleteId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [showDeletePeriodDialog, setShowDeletePeriodDialog] = useState(false);
  const [periodToDeleteApprovalId, setPeriodToDeleteApprovalId] = useState<string | null>(null);
  const [deletePeriodPassword, setDeletePeriodPassword] = useState('');
  const [isDeletingPeriod, setIsDeletingPeriod] = useState(false);


  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return { from: today, to: today };
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
      router.replace('/');
    } else {
      setCurrentUser(storedUser);
      setAuthCheckLoading(false);
    }
  }, [router]);

  const fetchInitialPageData = useCallback(async () => {
    if (authCheckLoading) return;
    setIsLoadingPeriods(true);
    try {
      const [
        fetchedEmployees, 
        fetchedEligiblePeriods,
        fetchedPendingReviews,
        fetchedApprovedReviews,
        fetchedDeclinedReviews
      ] = await Promise.all([
        getEmployees(false), 
        getEligibleTimesheetPeriodsForReview(branchForPriyanka),
        getPayPeriodSummaries('pending', 'timesheet_review', branchForPriyanka),
        getPayPeriodSummaries('approved', 'timesheet_review', branchForPriyanka),
        getPayPeriodSummaries('declined', 'timesheet_review', branchForPriyanka),
      ]);
      setAllEmployeesList(fetchedEmployees || []);
      setEligiblePeriods(fetchedEligiblePeriods || []);
      setPendingReviewPeriods(fetchedPendingReviews || []);
      setApprovedReviewPeriods(fetchedApprovedReviews || []);
      setDeclinedReviewPeriods(fetchedDeclinedReviews || []);
    } catch (error: any) {
      console.error('Error fetching initial page data:', error);
      toast({ title: 'Error', description: `Failed to load page data: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsLoadingPeriods(false);
    }
  }, [authCheckLoading, branchForPriyanka, toast]);

  const fetchTimesheetData = useCallback(async () => {
    if (authCheckLoading || !filterDateRange?.from || !isValid(filterDateRange.from)) {
      setTimesheetRecords([]);
      return;
    }
    setIsLoadingRecords(true);
    try {
      const fromDate = format(filterDateRange.from, 'yyyy-MM-dd');
      const toDate = (filterDateRange.to && isValid(filterDateRange.to) && format(filterDateRange.from, 'yyyy-MM-dd') !== format(filterDateRange.to, 'yyyy-MM-dd'))
        ? format(filterDateRange.to, 'yyyy-MM-dd')
        : fromDate;
      
      const employeeIdToFilter = selectedEmployeeIdFilter === 'all' ? null : selectedEmployeeIdFilter;
      const records = await getTimesheetRecords(fromDate, toDate, branchForPriyanka, employeeIdToFilter);
      setTimesheetRecords(records || []);

      if (records.length === 0) {
        let message = `No timesheet records found for ${format(filterDateRange.from, 'MMM dd, yyyy')}`;
        if (fromDate !== toDate) message += ` to ${format(parseISO(toDate), 'MMM dd, yyyy')}`;
        if (employeeIdToFilter && allEmployeesList.length > 0) {
            const empName = allEmployeesList.find(e => e.id === employeeIdToFilter)?.name || 'selected employee';
            message += ` for ${empName}`;
        }
        if (branchForPriyanka) message += ` in ${branchForPriyanka} branch`;
        message += ".";
        toast({ title: 'No Records', description: message, variant: 'default', duration: 5000 });
      }
    } catch (error: any) {
      console.error('Error fetching timesheet records:', error);
      toast({ title: 'Error', description: `Failed to load timesheet records: ${error.message}`, variant: 'destructive' });
      setTimesheetRecords([]);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [authCheckLoading, filterDateRange, branchForPriyanka, selectedEmployeeIdFilter, toast, allEmployeesList]);

  useEffect(() => {
    fetchInitialPageData();
  }, [fetchInitialPageData]); 

  useEffect(() => {
    if (!authCheckLoading && (allEmployeesList.length > 0 || selectedEmployeeIdFilter === 'all')) {
        fetchTimesheetData();
    }
  }, [fetchTimesheetData, authCheckLoading, allEmployeesList, selectedEmployeeIdFilter]); 


  const handleSubmitForReview = async () => {
    if (!selectedPeriodForReview) {
      toast({ title: 'Error', description: 'Please select a timesheet period to submit for review.', variant: 'destructive' });
      return;
    }
    setIsSubmittingReview(true);
    try {
      const [dateFrom, dateTo, branchKey] = selectedPeriodForReview.split('_');
      const periodBranchForReview = branchKey === 'none' ? null : branchKey as 'labasa' | 'suva';
      const finalBranchForReview = isPriyanka ? 'suva' : periodBranchForReview;

      const initiatedBy = currentUser || 'System';
      
      const { approvalLink } = await requestTimesheetPeriodReview(dateFrom, dateTo, initiatedBy, finalBranchForReview);

      toast({
        title: 'Timesheet Submitted for Review',
        description: 'Approval link generated. Please copy and share with the administrator.',
        duration: 10000,
      });
      if (approvalLink) {
        handleCopyApprovalLink(approvalLink); 
      }
      setSelectedPeriodForReview('');
      fetchInitialPageData(); 
    } catch (error: any) {
      console.error('Error submitting timesheet for review:', error);
      toast({ title: 'Submission Error', description: error.message || 'Failed to submit timesheet for review.', variant: 'destructive' });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleResubmitDeclinedPeriod = async (period: PayPeriodSummary) => {
    if (!currentUser) {
        toast({ title: 'Error', description: 'User information not found.', variant: 'destructive' });
        return;
    }
    setIsResubmittingPeriod(true);
    try {
        const { approvalLink } = await requestTimesheetPeriodReview(
            period.dateFrom,
            period.dateTo,
            currentUser,
            period.branch 
        );
        toast({
            title: 'Timesheet Resubmitted for Review',
            description: 'Approval link for the previously declined period has been regenerated. Please copy and share.',
            duration: 10000,
        });
        if (approvalLink) {
            handleCopyApprovalLink(approvalLink);
        }
        fetchInitialPageData(); 
    } catch (error: any) {
        console.error('Error resubmitting declined timesheet period:', error);
        toast({ title: 'Resubmission Error', description: error.message || 'Failed to resubmit timesheet period.', variant: 'destructive' });
    } finally {
        setIsResubmittingPeriod(false);
    }
  };


  const handleEditRecord = (record: DailyTimesheetRecord) => {
    const queryParams = new URLSearchParams({
        recordId: record.id,
        employeeId: record.employeeId,
        entryDate: record.entryDate, 
        branch: record.branch,
        isPresent: String(record.isPresent),
        isAbsent: String(record.isAbsent),
        timeIn: record.timeIn || '',
        lunchIn: record.lunchIn || '',
        lunchOut: record.lunchOut || '',
        timeOut: record.timeOut || '',
        mealAllowance: String(record.mealAllowance ?? ''),
        overtimeReason: record.overtimeReason ?? '',
        editMode: 'true'
    });
    router.push(`/wages/timesheet?${queryParams.toString()}`);
  };

  const openDeleteDialog = (recordId: string) => {
    setRecordToDeleteId(recordId);
    setShowDeleteDialog(true);
    setDeletePassword('');
  };

  const confirmDeleteRecord = async () => {
    if (!recordToDeleteId) return;
    if (deletePassword !== ADMIN_PASSWORD) {
      toast({ title: 'Error', description: 'Incorrect admin password.', variant: 'destructive' });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDailyTimesheetEntry(recordToDeleteId);
      toast({ title: 'Success', description: 'Timesheet entry deleted successfully.' });
      setShowDeleteDialog(false);
      setRecordToDeleteId(null);
      fetchTimesheetData(); 
      fetchInitialPageData(); 
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to delete entry: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const openDeletePeriodDialog = (approvalId: string) => {
    setPeriodToDeleteApprovalId(approvalId);
    setShowDeletePeriodDialog(true);
    setDeletePeriodPassword('');
  };

  const confirmDeletePeriod = async () => {
    if (!periodToDeleteApprovalId) return;
    if (deletePeriodPassword !== ADMIN_PASSWORD) {
      toast({ title: 'Error', description: 'Incorrect admin password.', variant: 'destructive' });
      return;
    }
    setIsDeletingPeriod(true);
    try {
      await deleteWageRecordsByApprovalId(periodToDeleteApprovalId);
      toast({ title: 'Success', description: 'Timesheet review period and related approval deleted successfully.' });
      setShowDeletePeriodDialog(false);
      setPeriodToDeleteApprovalId(null);
      fetchInitialPageData(); 
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to delete period: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeletingPeriod(false);
    }
  };


  const generateApprovalLink = (token: string | undefined): string | null => {
    if (!token) return null;
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9002');
    const path = '/approve-wages';
    const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    return `${cleanBaseURL}${path}?token=${token}`;
  };

  const handleCopyApprovalLink = async (linkOrToken: string | undefined) => {
    if (!linkOrToken) {
        toast({ title: 'Error', description: 'Approval token/link is missing for this period.', variant: 'destructive' });
        return;
    }
    const linkToCopy = linkOrToken.startsWith('http') ? linkOrToken : generateApprovalLink(linkOrToken);

    if (!linkToCopy) {
         toast({ title: 'Error', description: 'Could not generate approval link. Check configuration.', variant: 'destructive' });
         return;
    }
    try {
        await navigator.clipboard.writeText(linkToCopy);
        toast({ title: 'Success', description: 'Approval link copied to clipboard!' });
    } catch (err) {
        console.error('Could not copy text: ', err);
        toast({ title: 'Error', description: 'Failed to copy approval link.', variant: 'destructive' });
    }
  };

  if (authCheckLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black/70">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  const pageTitle = isPriyanka ? 'Suva Branch Timesheet Records & Review' : 'Time Sheet Records & Review Submission';
  const backLink = isPriyanka ? '/dashboard' : '/wages';

  const employeesForFilter = isPriyanka 
    ? allEmployeesList.filter(emp => emp.branch === 'suva' && emp.isActive)
    : allEmployeesList.filter(emp => emp.isActive);

  const renderPeriodsTable = (periods: PayPeriodSummary[], statusName: 'Pending' | 'Approved' | 'Declined', loggedInUser: string | null) => {
    if (isLoadingPeriods) {
      return <div className="text-center text-gray-400 py-5"><Loader2 className="h-5 w-5 animate-spin inline mr-2"/>Loading {statusName.toLowerCase()} periods...</div>;
    }
    if (periods.length === 0) {
      return <p className="text-center text-gray-400 py-5">No timesheet periods currently {statusName.toLowerCase()}.</p>;
    }
    return (
      <div className="overflow-x-auto border border-white/20 rounded-lg">
        <Table>
          <TableHeader className="bg-white/10">
            <TableRow>
              <TableHead className="text-white border-r border-white/20">Pay Period (Thu - Wed)</TableHead>
              <TableHead className="text-white border-r border-white/20">Branch</TableHead>
              <TableHead className="text-white border-r border-white/20">Initiated By</TableHead>
              <TableHead className="text-white border-r border-white/20 text-center">Status</TableHead>
              <TableHead className="text-white text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map(period => (
              <TableRow key={period.approvalId} className="hover:bg-white/5">
                <TableCell className="text-white border-r border-white/20">
                  {isValid(parseISO(period.dateFrom)) && isValid(parseISO(period.dateTo)) ? 
                    `${format(parseISO(period.dateFrom), 'MMM dd, yyyy')} - ${format(parseISO(period.dateTo), 'MMM dd, yyyy')}`
                    : 'Invalid Date Range'}
                </TableCell>
                <TableCell className="text-white border-r border-white/20 capitalize">{period.branch || 'All Branches'}</TableCell>
                <TableCell className="text-white border-r border-white/20">{period.initiated_by || 'N/A'}</TableCell>
                <TableCell className="text-white border-r border-white/20 text-center capitalize">{period.status}</TableCell>
                <TableCell className="text-white text-center">
                  {statusName === 'Pending' && period.token && (
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCopyApprovalLink(period.token);
                        }}
                        className="h-7 px-2 text-white hover:bg-white/10 mr-2"
                        title="Copy Approval Link"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        <span className="sr-only">Copy Approval Link</span>
                    </Button>
                  )}
                  {statusName === 'Declined' && ( 
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleResubmitDeclinedPeriod(period);
                        }}
                        className="h-7 px-2 text-white hover:bg-white/10 mr-2 border-yellow-500/50 hover:border-yellow-400"
                        title="Resubmit for Review"
                        disabled={isResubmittingPeriod}
                    >
                        {isResubmittingPeriod ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5" />}
                        <span className="sr-only">Resubmit for Review</span>
                    </Button>
                  )}
                  {(statusName === 'Approved' || statusName === 'Declined') && loggedInUser === 'ADMIN' && (
                     <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDeletePeriodDialog(period.approvalId);
                        }}
                        className="h-7 px-2"
                        title={`Delete ${statusName} Review Period`}
                        disabled={isDeletingPeriod && periodToDeleteApprovalId === period.approvalId}
                    >
                        {isDeletingPeriod && periodToDeleteApprovalId === period.approvalId ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5" />}
                        <span className="sr-only">Delete Period</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
        <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
          <Link href={backLink} passHref className="ml-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
            {pageTitle}
          </h1>
          <Link href="/dashboard" passHref className="mr-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Home className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Button>
          </Link>
        </header>

        <main className="flex flex-col items-center flex-grow w-full pb-16 pt-2">
          <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full max-w-6xl">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6 bg-gray-800/60 border border-white/15 text-gray-300">
                  <TabsTrigger value="eligible" className="data-[state=active]:bg-sky-700/80 data-[state=active]:text-white">
                      <Send className="mr-2 h-4 w-4" /> Eligible for Submission
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-600/80 data-[state=active]:text-white">
                      <AlertTriangle className="mr-2 h-4 w-4" /> Pending Review
                  </TabsTrigger>
                  <TabsTrigger value="approved" className="data-[state=active]:bg-green-700/80 data-[state=active]:text-white">
                      <CheckCircle className="mr-2 h-4 w-4" /> Approved Reviews
                  </TabsTrigger>
                  <TabsTrigger value="declined" className="data-[state=active]:bg-red-700/80 data-[state=active]:text-white">
                      <XCircle className="mr-2 h-4 w-4" /> Declined Reviews
                  </TabsTrigger>
              </TabsList>

              <TabsContent value="eligible">
                   <Card className="w-full bg-transparent backdrop-blur-sm border border-white/20 shadow-xl p-6 mb-8">
                      <CardHeader className="p-0 pb-4">
                          <CardTitle className="text-center text-white text-xl">Submit Timesheet Period for Admin Review</CardTitle>
                          <CardDescription className="text-center text-gray-300 text-sm">
                          Select a completed pay period (Thursday - Wednesday) for {isPriyanka ? 'Suva branch ' : ''}to submit.
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                          {isLoadingPeriods ? (
                               <div className="text-center text-gray-400 py-5"><Loader2 className="h-5 w-5 animate-spin inline mr-2"/>Loading eligible periods...</div>
                          ) : eligiblePeriods.length === 0 ? (
                              <p className="text-center text-gray-400 py-5">No periods currently eligible for review submission.</p>
                          ) : (
                          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                          <Select
                              value={selectedPeriodForReview}
                              onValueChange={setSelectedPeriodForReview}
                              disabled={isSubmittingReview || eligiblePeriods.length === 0}
                          >
                              <SelectTrigger className="w-full sm:w-[350px] bg-white/10 text-white placeholder-gray-400 border-white/20">
                              <SelectValue placeholder="Select an eligible period..." />
                              </SelectTrigger>
                              <SelectContent>
                              <SelectGroup>
                                  <SelectLabel>Eligible Pay Periods (Thu - Wed)</SelectLabel>
                                  {eligiblePeriods.map(period => (
                                  <SelectItem 
                                      key={`${period.dateFrom}_${period.dateTo}_${period.branch || 'none'}`} 
                                      value={`${period.dateFrom}_${period.dateTo}_${period.branch || 'none'}`}
                                  >
                                      {isValid(parseISO(period.dateFrom)) && isValid(parseISO(period.dateTo)) ? 
                                          `${format(parseISO(period.dateFrom), 'MMM dd, yyyy')} - ${format(parseISO(period.dateTo), 'MMM dd, yyyy')}`
                                          : 'Invalid Date Range'}
                                      {period.branch && ` (${period.branch.charAt(0).toUpperCase() + period.branch.slice(1)})`}
                                  </SelectItem>
                                  ))}
                              </SelectGroup>
                              </SelectContent>
                          </Select>
                          <Button
                              onClick={handleSubmitForReview}
                              variant="secondary"
                              disabled={isSubmittingReview || !selectedPeriodForReview}
                              className="bg-green-600 hover:bg-green-700 text-white min-w-[180px]"
                          >
                              {isSubmittingReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                              Submit for Review
                          </Button>
                          </div>
                          )}
                      </CardContent>
                   </Card>
              </TabsContent>
              <TabsContent value="pending">{renderPeriodsTable(pendingReviewPeriods, "Pending", currentUser)}</TabsContent>
              <TabsContent value="approved">{renderPeriodsTable(approvedReviewPeriods, "Approved", currentUser)}</TabsContent>
              <TabsContent value="declined">{renderPeriodsTable(declinedReviewPeriods, "Declined", currentUser)}</TabsContent>
          </Tabs>

          <Card className="w-full max-w-6xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-6 mt-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-center text-white text-xl">View Recorded Timesheets {isPriyanka ? '(Suva Branch)' : ''}</CardTitle>
              <CardDescription className="text-center text-gray-300 text-sm">
                Select a date or date range and employee to view individual timesheet entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-6">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={'outline'}
                      className={cn(
                        'w-full sm:w-[300px] justify-start text-left font-normal text-gray-900 bg-white hover:bg-gray-100',
                        !filterDateRange?.from && 'text-muted-foreground'
                      )}
                      disabled={isLoadingRecords}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterDateRange?.from && isValid(filterDateRange.from) ? (
                        filterDateRange.to && isValid(filterDateRange.to) && format(filterDateRange.from, 'yyyy-MM-dd') !== format(filterDateRange.to, 'yyyy-MM-dd') ? (
                          `${format(filterDateRange.from, 'LLL dd, yyyy')} - ${format(filterDateRange.to, 'LLL dd, yyyy')}`
                        ) : (
                          format(filterDateRange.from, 'LLL dd, yyyy') 
                        )
                      ) : (
                        <span>Pick a date or range...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white text-black" align="center">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={filterDateRange?.from}
                      selected={filterDateRange}
                      onSelect={setFilterDateRange}
                      numberOfMonths={1}
                      disabled={(date) => date > new Date() || date < addDays(new Date(), -180)}
                    />
                  </PopoverContent>
                </Popover>

                <Select
                  value={selectedEmployeeIdFilter}
                  onValueChange={setSelectedEmployeeIdFilter}
                  disabled={isLoadingRecords || isLoadingPeriods || employeesForFilter.length === 0}
                >
                  <SelectTrigger className="w-full sm:w-[250px] bg-white/10 text-white placeholder-gray-400 border-white/20">
                    <SelectValue placeholder="Select Employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Employee</SelectLabel>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employeesForFilter.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Button onClick={fetchTimesheetData} variant="secondary" disabled={isLoadingRecords} className="bg-white/10 hover:bg-white/20 text-white min-w-[150px]">
                  {isLoadingRecords ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                  Filter Records
                </Button>
              </div>

              {isLoadingRecords ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                  <p className="ml-3 text-lg text-white">Loading records...</p>
                </div>
              ) : timesheetRecords.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No timesheet records found for the selected criteria.</p>
              ) : (
                <div className="overflow-x-auto border border-white/20 rounded-lg">
                  <Table>
                    <TableHeader className="bg-white/10">
                      <TableRow>
                        <TableHead className="text-white border-r border-white/20">Date</TableHead>
                        <TableHead className="text-white border-r border-white/20">Employee</TableHead>
                        {!isPriyanka && <TableHead className="text-white border-r border-white/20">Branch</TableHead>}
                        <TableHead className="text-white border-r border-white/20 text-center">Present</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-center">Absent</TableHead>
                        <TableHead className="text-white border-r border-white/20">Time In</TableHead>
                        <TableHead className="text-white border-r border-white/20">Lunch In</TableHead>
                        <TableHead className="text-white border-r border-white/20">Lunch Out</TableHead>
                        <TableHead className="text-white border-r border-white/20">Time Out</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Normal Hrs</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Meal ($)</TableHead>
                        <TableHead className="text-white border-r border-white/20">O/T Reason / Leave Type</TableHead>
                        <TableHead className="text-white text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timesheetRecords.map(record => {
                        const isOnLeave = record.overtimeReason && record.overtimeReason.startsWith('Approved: ');
                        const leaveType = isOnLeave ? record.overtimeReason!.substring('Approved: '.length) : null;

                        return (
                          <TableRow key={record.id} className={cn("hover:bg-white/5", isOnLeave && "bg-green-900/30")}>
                            <TableCell className="text-white border-r border-white/20">{isValid(parseISO(record.entryDate)) ? format(parseISO(record.entryDate), 'MMM dd, yyyy') : 'Invalid Date'}</TableCell>
                            <TableCell className="text-white border-r border-white/20">{record.employeeName}</TableCell>
                            {!isPriyanka && <TableCell className="text-white border-r border-white/20 capitalize">{record.branch}</TableCell>}
                            <TableCell className="text-white border-r border-white/20 text-center">{record.isPresent ? 'Yes' : 'No'}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-center">{record.isAbsent ? 'Yes' : 'No'}</TableCell>
                            <TableCell className="text-white border-r border-white/20">{isOnLeave ? '-' : (record.timeIn || '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20">{isOnLeave ? '-' : (record.lunchIn || '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20">{isOnLeave ? '-' : (record.lunchOut || '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20">{isOnLeave ? '-' : (record.timeOut || '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">{isOnLeave ? (record.normalHours?.toFixed(2) ?? '-') : (record.normalHours?.toFixed(2) ?? '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">{isOnLeave ? '0.00' : (record.overtimeHours?.toFixed(2) ?? '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">{isOnLeave ? '0.00' : (record.mealAllowance?.toFixed(2) ?? '-')}</TableCell>
                            <TableCell className="text-white border-r border-white/20 min-w-[150px] max-w-[300px] truncate" title={isOnLeave ? leaveType! : record.overtimeReason || ''}>
                              {isOnLeave ? `On Leave (${leaveType})` : (record.overtimeReason || '-')}
                            </TableCell>
                            <TableCell className="text-white text-center">
                              <Button variant="ghost" size="icon" onClick={() => handleEditRecord(record)} className="text-blue-300 hover:text-blue-100 hover:bg-white/20 h-7 w-7">
                                <Edit2 className="h-4 w-4" />
                                <span className="sr-only">Edit Record</span>
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(record.id)} className="text-red-400 hover:text-red-200 hover:bg-white/20 h-7 w-7 ml-1">
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete Record</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-300">
                Are you sure you want to delete this timesheet entry? This action cannot be undone.
                Please enter the admin password to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="delete-password-timesheet">Admin Password</Label>
              <Input
                id="delete-password-timesheet"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="bg-gray-800 border-white/20 text-white"
                onKeyPress={(e) => { if (e.key === 'Enter') confirmDeleteRecord(); }}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDeleteDialog(false)} className="border-white/20 text-white hover:bg-white/10">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteRecord} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeletePeriodDialog} onOpenChange={setShowDeletePeriodDialog}>
          <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Delete Period Review</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-300">
                Are you sure you want to delete this entire approved timesheet review period? This action cannot be undone.
                Please enter the admin password to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="delete-period-password">Admin Password</Label>
              <Input
                id="delete-period-password"
                type="password"
                value={deletePeriodPassword}
                onChange={(e) => setDeletePeriodPassword(e.target.value)}
                className="bg-gray-800 border-white/20 text-white"
                onKeyPress={(e) => { if (e.key === 'Enter') confirmDeletePeriod(); }}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDeletePeriodDialog(false)} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeletePeriod} disabled={isDeletingPeriod} className="bg-red-600 hover:bg-red-700">
                {isDeletingPeriod ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Delete Period'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};


const LoadingFallback = () => (
  <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
    <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
    <p className="ml-4 text-white text-lg">Loading Timesheet Records...</p>
  </div>
);

const TimeSheetRecordsPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TimesheetRecordsPageContent />
    </Suspense>
  );
};
export default TimeSheetRecordsPage;
