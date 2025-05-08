'use client';

import { useEffect, useState, useCallback } from 'react';
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

const ApproveWagesClient = () => {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true); // Overall loading
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
        if (!token) {
            setError('Invalid approval link: Missing token.');
            setIsLoading(false);
            return;
        }
        // Only fetch if logged in
        if (!isLoggedIn) {
            setIsLoading(false); // Stop initial loading indicator if not logged in
            return;
        }

        setIsLoading(true);
        setError(null);
        console.log(`Fetching data for token: ${token}`); // Log token being used

        try {
            // Fetch both approval data and employee details
             console.log("Calling getWagesForApproval...");
            const data = await getWagesForApproval(token);
            console.log("getWagesForApproval response:", data);

            console.log("Calling getEmployees...");
            const fetchedEmployees = await getEmployees(true); // Fetch all employees (active/inactive) to get payment method
            console.log("getEmployees response:", fetchedEmployees);


            if (!data) {
                console.error("No data returned from getWagesForApproval for token:", token);
                setError('Approval request not found or link is invalid.'); // More specific error
            } else if (data.approval.status !== 'pending') {
                 console.log(`Approval ${data.approval.id} already processed with status: ${data.approval.status}`);
                 setError(`This request has already been ${data.approval.status}.`);
                 setDecision(data.approval.status); // Show final status
            } else {
                setApprovalData(data);
                console.log("Approval data set successfully.");
            }
            setEmployees(fetchedEmployees || []); // Store employee data
            console.log("Employee data set.");

        } catch (err: any) {
            console.error("Error fetching approval or employee data:", err.stack); // Log the full stack trace
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
             }
             setError(userErrorMessage);
        } finally {
            setIsLoading(false);
            console.log("Finished fetchAllData process.");
        }
    }, [token, isLoggedIn]); // Add isLoggedIn dependency

    // Trigger data fetching once logged in
    useEffect(() => {
        if (isLoggedIn) {
            fetchAllData();
        }
    }, [isLoggedIn, fetchAllData]); // Depend on isLoggedIn and the fetch function


    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoggingIn) return;

        setIsLoggingIn(true);
        setLoginError(null);

        // Simulate async check if needed, or just compare directly
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

        if (adminPassword === ADMIN_PASSWORD) {
            setIsLoggedIn(true);
            // Data fetching will be triggered by the useEffect above
        } else {
            setLoginError('Incorrect admin password.');
        }
        setIsLoggingIn(false);
    };

    const handleDecision = async (newStatus: 'approved' | 'declined') => {
        if (!token || !approvalData || isProcessing || decision) return;

        setIsProcessing(true);
        try {
            // Pass admin password for potential server-side verification if needed, or just use approverName
            const updatedApproval = await updateWageApprovalStatus(token, newStatus, 'Admin'); // Use 'Admin' or logged-in user
            if (updatedApproval) {
                setDecision(newStatus);
                setApprovalData(prev => prev ? { ...prev, approval: updatedApproval } : null);
                toast({
                    title: `Wages ${newStatus}`,
                    description: `The wage records for this period have been ${newStatus}.`,
                });
            } else {
                // Error handled inside updateWageApprovalStatus or token became invalid
                 setError('Failed to update status. The request might have been processed already or the link is invalid.');
                 toast({ title: 'Error', description: 'Failed to update status. Please refresh.', variant: 'destructive' });
                 // Optionally try refetching, but the token might be gone if status changed
                 await fetchAllData(); // Attempt refetch to get latest state
            }
        } catch (err: any) {
            console.error(`Error ${newStatus} wages:`, err);
            setError(err.message || `Failed to ${newStatus} wages.`);
            toast({ title: 'Error', description: `Failed to ${newStatus} wages. ${err.message}`, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
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
             return <div className="text-center py-10">Approval data not available. This might happen if the link is invalid or already processed.</div>;
         }

        const { approval, records } = approvalData;

        // Calculate Totals
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

    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            {/* Show login form or approval content based on login state */}
            {!isLoggedIn ? renderLoginForm() : renderApprovalContent()}
        </div>
    );
};

export default ApproveWagesClient;