'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getWagesForApproval, updateWageApprovalStatus, type WageRecord, type WageApproval, type Employee, getEmployees } from '@/services/employee-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle, XCircle, AlertTriangle, LogIn } from 'lucide-react'; // Added LogIn
import { useToast } from '@/hooks/use-toast';
import { format, isValid, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input'; // Added Input
import { Label } from '@/components/ui/label'; // Added Label
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Added Alert

const ADMIN_PASSWORD = 'admin01'; // Define admin password (store securely in real app)

// Wrap the component that uses useSearchParams with Suspense
const ApproveWagesClientWrapper = () => {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <ApproveWagesClient />
        </Suspense>
    );
};

const ApproveWagesClient = () => {
    const searchParams = useSearchParams();
    const token = searchParams ? searchParams.get('token') : null; // Safely access searchParams
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true); // Overall loading state
    const [isProcessing, setIsProcessing] = useState(false); // Processing approval/decline
    const [approvalData, setApprovalData] = useState<{ approval: WageApproval; records: WageRecord[] } | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);

    // --- Login State ---
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false); // Processing login

    const fetchAllData = useCallback(async () => {
        console.log("[ApproveWagesClient] fetchAllData called. Token:", token, "isLoggedIn:", isLoggedIn); // Debug log

        if (!token) {
            setError('Invalid approval link: Missing token.');
            setIsLoading(false);
            console.log("[ApproveWagesClient] fetchAllData aborted: Missing token.");
            return;
        }
        // Only fetch if logged in
        if (!isLoggedIn) {
            setIsLoading(false); // Stop initial loading indicator if not logged in
            console.log("[ApproveWagesClient] fetchAllData aborted: Not logged in.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setApprovalData(null); // Reset data before fetching
        setDecision(null);     // Reset decision
        console.log(`[ApproveWagesClient] Fetching data for token: ${token}`); // Log token being used

        try {
            // Fetch both approval data and employee details
            console.log("[ApproveWagesClient] Calling getWagesForApproval...");
            const data = await getWagesForApproval(token);
            console.log("[ApproveWagesClient] getWagesForApproval response received:", data ? `Approval ID: ${data.approval.id}, ${data.records.length} records` : 'No data');

             if (!data) {
                 console.error("[ApproveWagesClient] No data returned from getWagesForApproval for token:", token);
                 setError('Approval request not found or link is invalid.'); // More specific error
             } else {
                // Check status *after* successfully fetching data
                 if (data.approval.status !== 'pending') {
                     console.log(`[ApproveWagesClient] Approval ${data.approval.id} already processed with status: ${data.approval.status}`);
                     setError(`This request has already been ${data.approval.status}.`);
                     setDecision(data.approval.status); // Show final status
                 }
                 setApprovalData(data); // Set data even if already processed to show details
                 console.log("[ApproveWagesClient] Approval data set.");

                 // Fetch employees only if approval data was found
                 console.log("[ApproveWagesClient] Calling getEmployees...");
                 // Fetch all employees (active/inactive) to ensure we can get payment method for all records
                 const fetchedEmployees = await getEmployees(true);
                 console.log("[ApproveWagesClient] getEmployees response received:", fetchedEmployees ? `${fetchedEmployees.length} employees` : 'No employees');
                 setEmployees(fetchedEmployees || []); // Store employee data
                 console.log("[ApproveWagesClient] Employee data set.");
             }

        } catch (err: any) {
            console.error("[ApproveWagesClient] Error in fetchAllData:", err); // Log the full error object
            console.error("[ApproveWagesClient] Error stack trace:", err.stack); // Log the stack trace
            // Provide a more user-friendly error based on common DB issues or service errors
            let userErrorMessage = 'Failed to load approval details.';
            if (err.message?.includes('password authentication failed')) {
                userErrorMessage = 'Database connection failed. Please check server logs.';
            } else if (err.message?.includes('table not found')) {
                userErrorMessage = 'Database error: Required table missing. Please check server logs.';
            } else if (err.message?.includes('Approval request not found') || err.message?.includes('Invalid approval link')) {
                userErrorMessage = err.message; // Use the specific message from the service
            } else if (err.message?.includes('Failed to fetch wages for approval')) {
                userErrorMessage = err.message; // Use the specific message from the service
            } else if (err.message){ // Use the caught error message if available
                 userErrorMessage = `Error: ${err.message}`;
            }
            setError(userErrorMessage); // Set the specific error message
        } finally {
            setIsLoading(false);
            console.log("[ApproveWagesClient] Finished fetchAllData process.");
        }
    }, [token, isLoggedIn, toast]); // Add toast as dependency

    // Trigger data fetching once logged in and token is available
    useEffect(() => {
        console.log("[ApproveWagesClient] useEffect triggered. isLoggedIn:", isLoggedIn, "Token available:", !!token, "isLoading:", isLoading);
        if (isLoggedIn && token) {
            fetchAllData();
        } else if (!token && !isLoading) { // Handle case where token is missing initially
             console.log("[ApproveWagesClient] useEffect: Setting error for missing token.");
             setError('Invalid approval link: Missing token.');
             setIsLoading(false);
        } else if (isLoggedIn && !token) {
             console.log("[ApproveWagesClient] useEffect: Logged in but token missing.");
             setError('Invalid approval link: Missing token.');
             setIsLoading(false);
        } else if (!isLoggedIn) {
             console.log("[ApproveWagesClient] useEffect: Not logged in, waiting for login.");
             // Optionally reset loading if it was stuck true without login
             if (isLoading) setIsLoading(false);
        }
    }, [isLoggedIn, token, fetchAllData, isLoading]); // Add isLoading to prevent redundant calls

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoggingIn) return;

        setIsLoggingIn(true);
        setLoginError(null);
        console.log("[ApproveWagesClient] Attempting login...");

        // Simulate async check if needed, or just compare directly
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate small delay

        if (adminPassword === ADMIN_PASSWORD) {
            console.log("[ApproveWagesClient] Login successful.");
            setIsLoggedIn(true); // Set loggedIn state
            // Data fetching will be triggered by the useEffect above
        } else {
            console.log("[ApproveWagesClient] Login failed: Incorrect password.");
            setLoginError('Incorrect admin password.');
            setIsLoggedIn(false); // Ensure logged out state
        }
        setIsLoggingIn(false);
    };

    const handleDecision = async (newStatus: 'approved' | 'declined') => {
        if (!token || !approvalData || isProcessing || decision) return;

        setIsProcessing(true);
        console.log(`[ApproveWagesClient] Attempting to ${newStatus} wages for token: ${token}`);
        try {
            // Pass admin password for potential server-side verification if needed, or just use approverName
            const updatedApproval = await updateWageApprovalStatus(token, newStatus, 'Admin'); // Use 'Admin' or logged-in user
            if (updatedApproval) {
                console.log(`[ApproveWagesClient] Wages ${newStatus} successfully. Updated approval:`, updatedApproval);
                setDecision(newStatus);
                setApprovalData(prev => prev ? { ...prev, approval: updatedApproval } : null);
                toast({
                    title: `Wages ${newStatus}`,
                    description: `The wage records for this period have been ${newStatus}.`,
                });
            } else {
                // Error handled inside updateWageApprovalStatus or token became invalid
                console.error(`[ApproveWagesClient] Failed to update status to ${newStatus}. updateWageApprovalStatus returned null.`);
                setError('Failed to update status. The request might have been processed already or the link is invalid.');
                toast({ title: 'Error', description: 'Failed to update status. Please refresh.', variant: 'destructive' });
                // Optionally try refetching, but the token might be gone if status changed
                await fetchAllData(); // Attempt refetch to get latest state
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

    // --- Render Functions ---

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
                     {error && !loginError && ( // Show general error if not a login-specific one
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
                                className="text-black" // Ensure text is visible
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
        console.log("[ApproveWagesClient] Rendering approval content. isLoading:", isLoading, "error:", error, "approvalData:", !!approvalData); // Debug log

        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-lg">Loading approval details...</p>
                </div>
            );
        }

        // Render error state *before* checking approvalData
        if (error) {
            return (
                <div className="text-center py-10 text-red-600">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-3" />
                    <p className="text-xl font-semibold">Error Loading Approval</p>
                    <p className="text-base">{error}</p>
                     <p className="text-sm mt-4 text-muted-foreground">If the problem persists, please contact support or check the server logs.</p>
                </div>
            );
        }

        if (!approvalData) {
             // This should ideally be caught by the error state now, but as a fallback:
             console.log("[ApproveWagesClient] Render Approval Fallback: No approval data available.");
             return <div className="text-center py-10">Approval data not available. This might happen if the link is invalid, already processed, or there was an error during loading.</div>;
         }

        const { approval, records } = approvalData;
         console.log("[ApproveWagesClient] Rendering with approval status:", approval.status, "and", records.length, "records.");

        // Calculate Totals
        let totalNetPay = 0;
        let totalNetOnline = 0;
        let totalNetCash = 0;

        records.forEach(record => {
            totalNetPay += record.netPay;
            const employee = employees.find(emp => emp.id === record.employeeId);
            if (employee?.paymentMethod === 'online') {
                totalNetOnline += record.netPay;
            } else { // Assume cash if not online or employee not found
                totalNetCash += record.netPay;
            }
        });

        const isFinalState = approval.status === 'approved' || approval.status === 'declined';
         console.log("[ApproveWagesClient] Is final state:", isFinalState);

        // Format dates safely
        const dateFromObj = approval.dateFrom ? parseISO(approval.dateFrom) : null;
        const dateToObj = approval.dateTo ? parseISO(approval.dateTo) : null;
        const formattedDateFrom = dateFromObj && isValid(dateFromObj) ? format(dateFromObj, 'MMM dd, yyyy') : 'Invalid Date';
        const formattedDateTo = dateToObj && isValid(dateToObj) ? format(dateToObj, 'MMM dd, yyyy') : 'Invalid Date';
        const decisionTimestamp = approval.approved_at || approval.declined_at;
        // Ensure timestamp is treated as string if it comes from DB
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

    // Main render logic: Choose between login form and approval content
    console.log("[ApproveWagesClient] Final Render. isLoggedIn:", isLoggedIn);
    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            {/* Show login form or approval content based on login state */}
            {!isLoggedIn ? renderLoginForm() : renderApprovalContent()}
        </div>
    );
};


// Simple loading component to show while Suspense is waiting
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

export default ApproveWagesClientWrapper; // Export the wrapper
