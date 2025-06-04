
// approve-wages/ApproveWagesClient.tsx
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getWagesForApproval, updateWageApprovalStatus, type WageRecord, type WageApproval, type Employee, getEmployees, type TimesheetEntrySummary, type LeaveRequestRecord } from '@/services/employee-service'; // Added updateWageApprovalStatus
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle, XCircle, AlertTriangle, LogIn, FileText, Image as ImageIconLucide, UserX, UserCheck, Info } from 'lucide-react'; // Renamed ImageIcon to avoid conflict
import { useToast } from '@/hooks/use-toast';
import { format, isValid, parseISO, differenceInDays } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Image from 'next/image'; // For Next/Image component
import { cn } from '@/lib/utils';

const ADMIN_PASSWORD = 'admin01';

const ApproveWagesClientWrapper = () => {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <ApproveWagesClient />
        </Suspense>
    );
};

const ApproveWagesClient = () => {
    const searchParams = useSearchParams();
    const token = searchParams ? searchParams.get('token') : null;
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [approvalData, setApprovalData] = useState<{ approval: WageApproval; records: (WageRecord[] | TimesheetEntrySummary[] | LeaveRequestRecord[]) } | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const fetchAllData = useCallback(async () => {
        if (!token) {
            setError('Invalid approval link: Missing token.');
            setIsLoading(false);
            return;
        }
        if (!isLoggedIn) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        setApprovalData(null);
        setDecision(null);

        try {
            const data = await getWagesForApproval(token);
            if (!data) {
                setError('Approval request not found or link is invalid.');
            } else {
                if (data.approval.status !== 'pending') {
                    setError(`This request has already been ${data.approval.status}.`);
                    setDecision(data.approval.status);
                }
                setApprovalData(data as { approval: WageApproval; records: (WageRecord[] | TimesheetEntrySummary[] | LeaveRequestRecord[]) });

                if (data.approval.approval_type === 'final_wage') {
                    const fetchedEmployees = await getEmployees(true); // Fetch all for context
                    setEmployees(fetchedEmployees || []);
                }
            }
        } catch (err: any) {
            let userErrorMessage = 'Failed to load approval details.';
            if (err.message?.includes('password authentication failed')) {
                userErrorMessage = 'Database connection failed. Please check server logs.';
            } else if (err.message?.includes('table not found')) {
                userErrorMessage = 'Database error: Required table missing. Please check server logs.';
            } else if (err.message?.includes('Approval request not found') || err.message?.includes('Invalid approval link')) {
                userErrorMessage = err.message;
            } else if (err.message?.includes('Failed to fetch')) {
                userErrorMessage = err.message;
            } else if (err.message) {
                userErrorMessage = `Error: ${err.message}`;
            }
            setError(userErrorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [token, isLoggedIn]);

    useEffect(() => {
        if (isLoggedIn && token) {
            fetchAllData();
        } else {
            if (searchParams && !token) {
                setError('Invalid approval link: Missing token.');
            }
            setIsLoading(false);
        }
    }, [isLoggedIn, token, fetchAllData, searchParams]);

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoggingIn) return;
        setIsLoggingIn(true);
        setLoginError(null);
        setError(null);
        await new Promise(resolve => setTimeout(resolve, 300));
        if (adminPassword === ADMIN_PASSWORD) {
            setIsLoggedIn(true);
        } else {
            setLoginError('Incorrect admin password.');
            setIsLoggedIn(false);
        }
        setIsLoggingIn(false);
    };

    const handleDecision = async (newStatus: 'approved' | 'declined') => {
        if (!token || !approvalData || isProcessing || decision) return;

        setIsProcessing(true);
        const initiatedBy = approvalData.approval.initiated_by || "Admin"; 
        const approvalType = approvalData.approval.approval_type;
        let toastTitle = '';
        let toastDescription = '';

        switch (approvalType) {
            case 'timesheet_review':
                toastTitle = `Timesheet Period ${newStatus}`;
                toastDescription = `The timesheet period has been ${newStatus}.`;
                break;
            case 'final_wage':
                toastTitle = `Wages ${newStatus}`;
                toastDescription = `The wage records have been ${newStatus}.`;
                break;
            case 'leave_request':
                toastTitle = `Leave Request ${newStatus}`;
                toastDescription = `The leave request has been ${newStatus}.`;
                break;
            default:
                toastTitle = `Request ${newStatus}`;
                toastDescription = `The request has been ${newStatus}.`;
        }

        try {
            const updatedApproval = await updateWageApprovalStatus(token, newStatus, initiatedBy);
            if (updatedApproval) {
                setDecision(newStatus);
                setApprovalData(prev => prev ? { ...prev, approval: updatedApproval } : null);
                toast({ title: toastTitle, description: toastDescription });
            } else {
                setError('Failed to update status. The request might have been processed already or the link is invalid.');
                toast({ title: 'Error', description: 'Failed to update status. Please refresh.', variant: 'destructive' });
                await fetchAllData();
            }
        } catch (err: any) {
            setError(err.message || `Failed to ${newStatus} data.`);
            toast({ title: 'Error', description: `Failed to ${newStatus} data. ${err.message}`, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };

    const renderLoginForm = () => { 
        return (
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">Admin Login Required</CardTitle>
                    <CardDescription className="text-center">
                        Please enter the admin password to view and approve/decline requests.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loginError && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Login Failed</AlertTitle>
                            <AlertDescription>{loginError}</AlertDescription>
                        </Alert>
                    )}
                    {error && !loginError && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <Label htmlFor="admin-password">Admin Password</Label>
                            <Input
                                id="admin-password"
                                type="password"
                                value={adminPassword}
                                onChange={(e) => setAdminPassword(e.target.value)}
                                required
                                className="text-black" 
                                disabled={isLoggingIn}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoggingIn}>
                            {isLoggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                            Login
                        </Button>
                    </form>
                </CardContent>
            </Card>
        );
    };

    const renderWageApprovalContent = (approval: WageApproval, wageRecords: WageRecord[]) => {
        let totalNetPay = 0;
        let totalNetOnline = 0;
        let totalNetCash = 0;

        wageRecords.forEach(record => {
            totalNetPay += record.netPay;
            const employee = employees.find(emp => emp.id === record.employeeId);
            if (employee?.paymentMethod === 'online') {
                totalNetOnline += record.netPay;
            } else {
                totalNetCash += record.netPay;
            }
        });
        
        return (
            <>
                <div className="overflow-x-auto mb-6 border rounded-lg">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Payment Method</TableHead>
                                <TableHead className="text-right">Wage</TableHead>
                                <TableHead className="text-right">Total Hrs</TableHead>
                                <TableHead className="text-right">Normal Hrs</TableHead>
                                <TableHead className="text-right">O/T Hrs</TableHead>
                                <TableHead className="text-right">Meal</TableHead>
                                <TableHead className="text-right">FNPF</TableHead>
                                <TableHead className="text-right">Deduct</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Net Pay</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {wageRecords.map(record => {
                                const employee = employees.find(emp => emp.id === record.employeeId);
                                const paymentMethodDisplay = employee ? (employee.paymentMethod === 'online' ? 'Online' : 'Cash') : 'N/A';
                                return (
                                    <TableRow key={record.id}>
                                        <TableCell>{record.employeeName}</TableCell>
                                        <TableCell>{paymentMethodDisplay}</TableCell>
                                        <TableCell className="text-right">${record.hourlyWage.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">{record.totalHours.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">{record.hoursWorked.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">{record.overtimeHours.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${record.mealAllowance.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${record.fnpfDeduction.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${record.otherDeductions.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${record.grossPay.toFixed(2)}</TableCell>
                                        <TableCell className="text-right font-medium">${record.netPay.toFixed(2)}</TableCell>
                                    </TableRow>
                                );
                            })}
                            <TableRow className="font-bold bg-muted/50">
                                <TableCell colSpan={10} className="text-right">Total Net Pay:</TableCell>
                                <TableCell className="text-right">${totalNetPay.toFixed(2)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
                <CardFooter className="flex justify-around pt-6 border-t">
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">Total Net (Online)</p>
                        <p className="text-lg font-semibold">${totalNetOnline.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">Total Net (Cash)</p>
                        <p className="text-lg font-semibold">${totalNetCash.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">Overall Total Net</p>
                        <p className="text-lg font-semibold">${totalNetPay.toFixed(2)}</p>
                    </div>
                </CardFooter>
            </>
        );
    };

    const renderTimesheetReviewContent = (approval: WageApproval, timesheetSummaries: TimesheetEntrySummary[]) => {
        const totalAggregatedHours = timesheetSummaries.reduce((sum, s) => {
            if (s.attendanceStatus === 'Present' || s.attendanceStatus === 'Mixed') {
                return sum + s.totalHours;
            }
            return sum;
        }, 0);

        const getStatusIcon = (status: TimesheetEntrySummary['attendanceStatus']) => {
            switch(status) {
                case 'Present': return <UserCheck className="h-4 w-4 text-green-500 mr-1 inline-block" />;
                case 'Absent': return <UserX className="h-4 w-4 text-red-500 mr-1 inline-block" />;
                case 'Mixed': return <Info className="h-4 w-4 text-yellow-500 mr-1 inline-block" />; // Or another icon for mixed
                case 'No Record': return <Info className="h-4 w-4 text-gray-400 mr-1 inline-block" />;
                default: return null;
            }
        };

        return (
            <>
                <div className="overflow-x-auto mb-6 border rounded-lg">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Attendance Status</TableHead>
                                <TableHead className="text-right">Total Normal Hrs</TableHead>
                                <TableHead className="text-right">Total O/T Hrs</TableHead>
                                <TableHead className="text-right">Total Hours</TableHead>
                                <TableHead className="text-right">Total Meal Allowance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {timesheetSummaries.map(summary => (
                                <TableRow key={summary.employeeId} className={cn(
                                    summary.attendanceStatus === 'Absent' && 'bg-red-100/50 dark:bg-red-900/10',
                                    summary.attendanceStatus === 'No Record' && 'bg-gray-100/50 dark:bg-gray-800/10'
                                )}>
                                    <TableCell>{summary.employeeName || 'Unknown Employee'}</TableCell>
                                    <TableCell className="flex items-center">
                                        {getStatusIcon(summary.attendanceStatus)}
                                        {summary.attendanceStatus}
                                    </TableCell>
                                    <TableCell className="text-right">{summary.totalNormalHours.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{summary.totalOvertimeHours.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">{summary.totalHours.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">${summary.totalMealAllowance.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                             <TableRow className="font-bold bg-muted/50">
                                <TableCell colSpan={4} className="text-right">Total Aggregated Hours for Period (Present/Mixed):</TableCell>
                                <TableCell className="text-right">{totalAggregatedHours.toFixed(2)}</TableCell>
                                <TableCell className="text-right"></TableCell> 
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </>
        );
    };

    const renderLeaveRequestApprovalContent = (approval: WageApproval, leaveRequests: LeaveRequestRecord[]) => {
        if (leaveRequests.length === 0) {
            return <div className="text-center py-4">No leave request details found for this approval.</div>;
        }
        const leaveRequest = leaveRequests[0]; 
        const fromDate = parseISO(leaveRequest.dateFrom);
        const toDate = parseISO(leaveRequest.dateTo);
        const duration = isValid(fromDate) && isValid(toDate) ? differenceInDays(toDate, fromDate) + 1 : 'N/A';
        const isPdf = leaveRequest.letterImageDataUri?.startsWith('data:application/pdf');

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                    <div>
                        <p className="text-sm text-muted-foreground">Employee Name</p>
                        <p className="font-semibold">{leaveRequest.employeeName}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Branch</p>
                        <p className="font-semibold capitalize">{leaveRequest.branch}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Leave Type</p>
                        <p className="font-semibold capitalize">{leaveRequest.leave_type.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Leave Period</p>
                        <p className="font-semibold">
                            {isValid(fromDate) ? format(fromDate, 'MMM dd, yyyy') : 'Invalid Start Date'} - 
                            {isValid(toDate) ? format(toDate, 'MMM dd, yyyy') : 'Invalid End Date'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Duration</p>
                        <p className="font-semibold">{duration} day(s)</p>
                    </div>
                    {leaveRequest.notes && (
                         <div className="md:col-span-2">
                            <p className="text-sm text-muted-foreground">Notes</p>
                            <p className="font-semibold whitespace-pre-wrap">{leaveRequest.notes}</p>
                        </div>
                    )}
                </div>

                {leaveRequest.letterImageDataUri && (
                    <div className="pt-4 border-t">
                        <h4 className="text-md font-semibold mb-2">Leave Letter</h4>
                        {isPdf ? (
                             <div className="flex items-center p-3 border rounded-md bg-muted/30">
                                <FileText className="h-8 w-8 mr-3 text-red-500 flex-shrink-0" />
                                <div>
                                    <p className="font-medium">Leave Letter (PDF)</p>
                                    <p className="text-sm text-muted-foreground">
                                        PDF document uploaded. 
                                        <a href={leaveRequest.letterImageDataUri} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-500 hover:underline">
                                            View PDF
                                        </a>
                                    </p>
                                </div>
                            </div>
                        ) : (
                             <Image
                                src={leaveRequest.letterImageDataUri}
                                alt="Leave Letter"
                                width={600}
                                height={800}
                                className="rounded-md border object-contain max-h-[70vh]"
                                style={{ width: '100%', height: 'auto' }}
                            />
                        )}
                    </div>
                )}
                {!leaveRequest.letterImageDataUri && (
                    <p className="text-sm text-muted-foreground pt-4 border-t">No leave letter was uploaded for this request.</p>
                )}
            </div>
        );
    };


    const renderApprovalCard = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-lg">Loading approval details...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="text-center py-10">
                     <Alert variant="destructive" className="max-w-lg mx-auto">
                        <AlertTriangle className="h-5 w-5" />
                        <AlertTitle>Error Loading Approval</AlertTitle>
                        <AlertDescription>
                            {error}
                            <p className="text-sm mt-2 text-muted-foreground">If the problem persists, please contact support or check the server logs.</p>
                        </AlertDescription>
                    </Alert>
                </div>
            );
        }
        
        if (!approvalData) {
            return <div className="text-center py-10">No approval data available.</div>;
        }

        const { approval, records } = approvalData;
        const isFinalState = approval.status === 'approved' || approval.status === 'declined';
        const dateFromObj = approval.dateFrom ? parseISO(approval.dateFrom) : null;
        const dateToObj = approval.dateTo ? parseISO(approval.dateTo) : null;
        const formattedDateFrom = dateFromObj && isValid(dateFromObj) ? format(dateFromObj, 'MMM dd, yyyy') : 'N/A';
        const formattedDateTo = dateToObj && isValid(dateToObj) ? format(dateToObj, 'MMM dd, yyyy') : 'N/A';
        const decisionTimestamp = approval.approved_at || approval.declined_at;
        const decisionDateObj = decisionTimestamp ? parseISO(String(decisionTimestamp)) : null;
        const formattedDecisionDate = decisionDateObj && isValid(decisionDateObj) ? format(decisionDateObj, 'MMM dd, yyyy') : '';

        let cardTitleText = '';
        let periodText = '';

        switch (approval.approval_type) {
            case 'timesheet_review':
                cardTitleText = 'Timesheet Period Review';
                periodText = `Period: ${formattedDateFrom} - ${formattedDateTo}`;
                if (approval.branch) periodText += ` (Branch: ${approval.branch.charAt(0).toUpperCase() + approval.branch.slice(1)})`;
                break;
            case 'final_wage':
                cardTitleText = 'Wage Approval Request';
                periodText = `Period: ${formattedDateFrom} - ${formattedDateTo}`;
                if (approval.branch) periodText += ` (Branch: ${approval.branch.charAt(0).toUpperCase() + approval.branch.slice(1)})`;
                break;
            case 'leave_request':
                cardTitleText = 'Leave Request Approval';
                // Period for leave request is part of its specific content, branch also shown there
                break;
            default:
                cardTitleText = 'Approval Request';
        }


        return (
            <Card className="w-full max-w-6xl shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">
                        {cardTitleText}
                    </CardTitle>
                    <CardDescription className="text-center">
                        {periodText} <br />
                        Current Status: <span className={`font-semibold ${approval.status === 'pending' ? 'text-orange-500' : approval.status === 'approved' ? 'text-green-500' : 'text-red-500'}`}>{approval.status.toUpperCase()}</span>
                        {approval.initiated_by && <span className="text-xs text-muted-foreground"> (Initiated by: {approval.initiated_by})</span>}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {approval.approval_type === 'final_wage' && renderWageApprovalContent(approval, records as WageRecord[])}
                    {approval.approval_type === 'timesheet_review' && renderTimesheetReviewContent(approval, records as TimesheetEntrySummary[])}
                    {approval.approval_type === 'leave_request' && renderLeaveRequestApprovalContent(approval, records as LeaveRequestRecord[])}

                    {approval.status === 'pending' && !decision && (
                        <div className="flex justify-center gap-4 mt-6 pt-6 border-t">
                            <Button variant="destructive" size="lg" onClick={() => handleDecision('declined')} disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Decline
                            </Button>
                            <Button variant="default" size="lg" onClick={() => handleDecision('approved')} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Approve
                            </Button>
                        </div>
                    )}
                    {isFinalState && (
                        <div className={`mt-6 pt-6 border-t text-center ${approval.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                            {approval.status === 'approved' ? <CheckCircle className="h-8 w-8 mx-auto mb-2" /> : <XCircle className="h-8 w-8 mx-auto mb-2" />}
                            <p className="font-semibold">
                                {approval.approval_type === 'timesheet_review' ? 'Timesheet Period' : approval.approval_type === 'final_wage' ? 'Wages' : 'Leave Request'} {approval.status === 'approved' ? 'Approved' : 'Declined'}
                            </p>
                             <p className="text-sm text-muted-foreground">
                                This request was {approval.status} {formattedDecisionDate ? `on ${formattedDecisionDate}` : ''}
                                {approval.approved_by ? ` by ${approval.approved_by}` : ''}.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            {!isLoggedIn ? renderLoginForm() : renderApprovalCard()}
        </div>
    );
};

const LoadingFallback = () => { 
    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            <div className="flex items-center text-lg text-primary">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                Loading Approval Page...
            </div>
        </div>
    );
};

export default ApproveWagesClientWrapper;


