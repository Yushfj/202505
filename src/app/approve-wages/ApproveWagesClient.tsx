// approve-wages/ApproveWagesClient.tsx
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getWagesForApproval, updateWageApprovalStatus, type WageRecord, type WageApproval, type Employee, getEmployees } from '@/services/employee-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle, XCircle, AlertTriangle, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, isValid, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    const [approvalData, setApprovalData] = useState<{ approval: WageApproval; records: WageRecord[] } | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const fetchAllData = useCallback(async () => {
        console.log("[ApproveWagesClient] fetchAllData called. Token:", token, "isLoggedIn:", isLoggedIn);

        if (!token) {
            setError('Invalid approval link: Missing token.');
            setIsLoading(false);
            console.log("[ApproveWagesClient] fetchAllData aborted: Missing token.");
            return;
        }
        // This check is inside fetchAllData, but also in useEffect. Redundant but safe.
        if (!isLoggedIn) {
            setIsLoading(false);
            console.log("[ApproveWagesClient] fetchAllData aborted: Not logged in (called directly somehow?).");
            return;
        }

        setIsLoading(true);
        setError(null);
        setApprovalData(null);
        setDecision(null);
        console.log(`[ApproveWagesClient] Fetching data for token: ${token}`);

        try {
            console.log("[ApproveWagesClient] Calling getWagesForApproval...");
            const data = await getWagesForApproval(token);
            console.log("[ApproveWagesClient] getWagesForApproval response received:", data ? `Approval ID: ${data.approval.id}, ${data.records.length} records` : 'No data');

            if (!data) {
                console.error("[ApproveWagesClient] No data returned from getWagesForApproval for token:", token);
                setError('Approval request not found or link is invalid.');
            } else {
                if (data.approval.status !== 'pending') {
                    console.log(`[ApproveWagesClient] Approval ${data.approval.id} already processed with status: ${data.approval.status}`);
                    setError(`This request has already been ${data.approval.status}.`);
                    setDecision(data.approval.status);
                }
                setApprovalData(data);
                console.log("[ApproveWagesClient] Approval data set.");

                console.log("[ApproveWagesClient] Calling getEmployees...");
                const fetchedEmployees = await getEmployees(true);
                console.log("[ApproveWagesClient] getEmployees response received:", fetchedEmployees ? `${fetchedEmployees.length} employees` : 'No employees');
                setEmployees(fetchedEmployees || []);
                console.log("[ApproveWagesClient] Employee data set.");
            }
        } catch (err: any) {
            console.error("[ApproveWagesClient] Error in fetchAllData:", err);
            console.error("[ApproveWagesClient] Error stack trace:", err.stack);
            let userErrorMessage = 'Failed to load approval details.';
            if (err.message?.includes('password authentication failed')) {
                userErrorMessage = 'Database connection failed. Please check server logs.';
            } else if (err.message?.includes('table not found')) {
                userErrorMessage = 'Database error: Required table missing. Please check server logs.';
            } else if (err.message?.includes('Approval request not found') || err.message?.includes('Invalid approval link')) {
                userErrorMessage = err.message;
            } else if (err.message?.includes('Failed to fetch wages for approval')) {
                userErrorMessage = err.message;
            } else if (err.message) {
                userErrorMessage = `Error: ${err.message}`;
            }
            setError(userErrorMessage);
        } finally {
            setIsLoading(false);
            console.log("[ApproveWagesClient] Finished fetchAllData process.");
        }
    }, [token, isLoggedIn, toast]);

    useEffect(() => {
        console.log(`[ApproveWagesClient] useEffect triggered. isLoggedIn: ${isLoggedIn}, Token: ${token}, SearchParams resolved: ${!!searchParams}`);
        if (isLoggedIn && token) {
            // Token exists and user is logged in, proceed to fetch.
            fetchAllData();
        } else {
            // Handle cases where fetching should not occur or an error should be set.
            if (searchParams && !token) { // searchParams has resolved and token is confirmed missing
                console.log("[ApproveWagesClient] useEffect: Token is definitively missing from URL.");
                setError('Invalid approval link: Missing token.');
            } else if (isLoggedIn && !token) { // Logged in, but token became null (e.g. after Suspense)
                 console.log("[ApproveWagesClient] useEffect: Logged in, but token missing.");
                 setError('Invalid approval link: Missing token.');
            } else if (!isLoggedIn) {
                console.log("[ApproveWagesClient] useEffect: Not logged in.");
            }
            // If not fetching, ensure isLoading is false.
            // This is important if an earlier state set it to true.
            setIsLoading(false);
        }
    }, [isLoggedIn, token, fetchAllData, searchParams]); // Removed isLoading, added searchParams

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoggingIn) return;

        setIsLoggingIn(true);
        setLoginError(null);
        setError(null); // Clear general errors on login attempt
        console.log("[ApproveWagesClient] Attempting login...");

        await new Promise(resolve => setTimeout(resolve, 300));

        if (adminPassword === ADMIN_PASSWORD) {
            console.log("[ApproveWagesClient] Login successful.");
            setIsLoggedIn(true);
            // Data fetching will be triggered by the useEffect when isLoggedIn changes
        } else {
            console.log("[ApproveWagesClient] Login failed: Incorrect password.");
            setLoginError('Incorrect admin password.');
            setIsLoggedIn(false);
        }
        setIsLoggingIn(false);
    };

    const handleDecision = async (newStatus: 'approved' | 'declined') => {
        if (!token || !approvalData || isProcessing || decision) return;

        setIsProcessing(true);
        console.log(`[ApproveWagesClient] Attempting to ${newStatus} wages for token: ${token}`);
        try {
            const updatedApproval = await updateWageApprovalStatus(token, newStatus, 'Admin');
            if (updatedApproval) {
                console.log(`[ApproveWagesClient] Wages ${newStatus} successfully. Updated approval:`, updatedApproval);
                setDecision(newStatus);
                setApprovalData(prev => prev ? { ...prev, approval: updatedApproval } : null);
                toast({
                    title: `Wages ${newStatus}`,
                    description: `The wage records for this period have been ${newStatus}.`,
                });
            } else {
                console.error(`[ApproveWagesClient] Failed to update status to ${newStatus}. updateWageApprovalStatus returned null.`);
                setError('Failed to update status. The request might have been processed already or the link is invalid.');
                toast({ title: 'Error', description: 'Failed to update status. Please refresh.', variant: 'destructive' });
                await fetchAllData();
            }
        } catch (err: any) {
            console.error(`[ApproveWagesClient] Error ${newStatus} wages:`, err);
            setError(err.message || `Failed to ${newStatus} wages.`);
            toast({ title: 'Error', description: `Failed to ${newStatus} wages. ${err.message}`, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
            console.log(`[ApproveWagesClient] Finished processing ${newStatus} decision.`);
        }
    };

    const renderLoginForm = () => {
        return (
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">Admin Login Required</CardTitle>
                    <CardDescription className="text-center">
                        Please enter the admin password to view and approve/decline wages.
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

    const renderApprovalContent = () => {
        console.log("[ApproveWagesClient] Rendering approval content. isLoading:", isLoading, "error:", error, "approvalData:", !!approvalData);

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
            console.log("[ApproveWagesClient] Render Approval Fallback: No approval data available and no error set. This might be an initial render state or an unhandled case.");
            return <div className="text-center py-10">No approval data available. Please check the link or try logging in again.</div>;
        }

        const { approval, records } = approvalData;
        console.log("[ApproveWagesClient] Rendering with approval status:", approval.status, "and", records.length, "records.");

        let totalNetPay = 0;
        let totalNetOnline = 0;
        let totalNetCash = 0;

        records.forEach(record => {
            totalNetPay += record.netPay;
            const employee = employees.find(emp => emp.id === record.employeeId);
            if (employee?.paymentMethod === 'online') {
                totalNetOnline += record.netPay;
            } else {
                totalNetCash += record.netPay;
            }
        });

        const isFinalState = approval.status === 'approved' || approval.status === 'declined';
        console.log("[ApproveWagesClient] Is final state:", isFinalState);

        const dateFromObj = approval.dateFrom ? parseISO(approval.dateFrom) : null;
        const dateToObj = approval.dateTo ? parseISO(approval.dateTo) : null;
        const formattedDateFrom = dateFromObj && isValid(dateFromObj) ? format(dateFromObj, 'MMM dd, yyyy') : 'Invalid Date';
        const formattedDateTo = dateToObj && isValid(dateToObj) ? format(dateToObj, 'MMM dd, yyyy') : 'Invalid Date';
        const decisionTimestamp = approval.approved_at || approval.declined_at;
        const decisionDateObj = decisionTimestamp ? parseISO(String(decisionTimestamp)) : null;
        const formattedDecisionDate = decisionDateObj && isValid(decisionDateObj) ? format(decisionDateObj, 'MMM dd, yyyy') : '';

        return (
            <Card className="w-full max-w-6xl shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">Wage Approval Request</CardTitle>
                    <CardDescription className="text-center">
                        Period: {formattedDateFrom} - {formattedDateTo} <br />
                        Overall Total Net Pay: ${totalNetPay.toFixed(2)} <br />
                        Current Status: <span className={`font-semibold ${approval.status === 'pending' ? 'text-orange-500' : approval.status === 'approved' ? 'text-green-500' : 'text-red-500'}`}>{approval.status.toUpperCase()}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
                                {records.map(record => {
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

                    {approval.status === 'pending' && !decision && (
                        <div className="flex justify-center gap-4 mt-6">
                            <Button
                                variant="destructive"
                                size="lg"
                                onClick={() => handleDecision('declined')}
                                disabled={isProcessing}
                            >
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                Decline
                            </Button>
                            <Button
                                variant="default"
                                size="lg"
                                onClick={() => handleDecision('approved')}
                                disabled={isProcessing}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Approve
                            </Button>
                        </div>
                    )}

                    {isFinalState && (
                        <div className={`mt-6 text-center ${approval.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                            {approval.status === 'approved' ? <CheckCircle className="h-8 w-8 mx-auto mb-2" /> : <XCircle className="h-8 w-8 mx-auto mb-2" />}
                            <p className="font-semibold">Wages {approval.status === 'approved' ? 'Approved' : 'Declined'}</p>
                            <p className="text-sm text-muted-foreground">
                                This request was {approval.status} {formattedDecisionDate ? `on ${formattedDecisionDate}` : ''}
                                {approval.approved_by ? ` by ${approval.approved_by}` : ''}.
                            </p>
                        </div>
                    )}
                </CardContent>
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
            </Card>
        );
    };

    console.log("[ApproveWagesClient] Final Render. isLoggedIn:", isLoggedIn);
    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            {!isLoggedIn ? renderLoginForm() : renderApprovalContent()}
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
