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
    // Use state for the token to avoid potential hydration issues with reading directly
    const [token, setToken] = useState<string | null>(null);
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

    // Get token on client side after mount
    useEffect(() => {
        const tokenFromParams = searchParams.get('token');
        setToken(tokenFromParams);
        if (!tokenFromParams) {
            setError('Invalid approval link: Missing token.');
            setIsLoading(false); // Stop loading if no token
        }
    }, [searchParams]);

    const fetchAllData = useCallback(async () => {
        if (!token) {
            // Error is already set in useEffect if token is missing initially
            setIsLoading(false);
            return;
        }
        // Only fetch if logged in
        if (!isLoggedIn) {
            setIsLoading(false); // Stop initial loading indicator if not logged in
            return;
        }

        console.log("Fetching data for token:", token);
        setIsLoading(true);
        setError(null); // Clear previous errors
        try {
            // Fetch both approval data and employee details
            const [data, fetchedEmployees] = await Promise.all([
                getWagesForApproval(token),
                getEmployees(true) // Fetch all employees (active/inactive) to get payment method
            ]);

             console.log("Fetched approval data:", data);
             console.log("Fetched employees:", fetchedEmployees);


            if (!data) {
                setError('Approval request not found or already processed.');
                setApprovalData(null); // Clear data if not found
                setDecision(null);
            } else if (data.approval.status !== 'pending') {
                 setError(`This request has already been ${data.approval.status}.`);
                 setApprovalData(data); // Still show the data
                 setDecision(data.approval.status); // Show final status
            } else {
                setApprovalData(data);
                setDecision(null); // Ensure decision is null for pending
            }
            setEmployees(fetchedEmployees || []); // Store employee data

        } catch (err: any) {
            console.error("Error fetching approval or employee data:", err);
            // Provide a more user-friendly error based on common DB issues
            let userErrorMessage = 'Failed to load approval details.';
             if (err.message?.includes('password authentication failed')) {
                 userErrorMessage = 'Database connection failed. Please contact support.';
             } else if (err.message?.includes('table not found')) {
                userErrorMessage = 'Database error: Required table missing. Please contact support.';
             } else if (err.message?.includes('Failed to fetch wages for approval')) {
                userErrorMessage = err.message; // Show the specific message from the service
             } else {
                userErrorMessage = err.message || userErrorMessage; // Use specific error if available
             }
             setError(userErrorMessage);
             setApprovalData(null); // Clear data on error
             setDecision(null);
        } finally {
            setIsLoading(false);
        }
    }, [token, isLoggedIn]); // Add isLoggedIn dependency

    // Trigger data fetching once logged in and token is available
    useEffect(() => {
        if (isLoggedIn && token) {
            fetchAllData();
        } else if (!token && !error) {
             // If token is still null/empty after initial effect and no error set yet
             // setError('Invalid approval link: Missing token.');
             setIsLoading(false); // Ensure loading stops
        }
    }, [isLoggedIn, token, fetchAllData, error]); // Depend on token as well


    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoggingIn) return;

        setIsLoggingIn(true);
        setLoginError(null);

        // Simulate async check if needed, or just compare directly
        await new Promise(resolve => setTimeout(resolve, 300)); // Shorter delay

        if (adminPassword === ADMIN_PASSWORD) {
            setIsLoggedIn(true);
            // Data fetching will be triggered by the useEffect above
        } else {
            setLoginError('Incorrect admin password.');
            setIsLoggedIn(false); // Ensure logged out state
        }
        setIsLoggingIn(false);
    };

    const handleDecision = async (newStatus: 'approved' | 'declined') => {
        // Ensure token and data are present, not already processing, and not already decided
        if (!token || !approvalData || approvalData.approval.status !== 'pending' || isProcessing || decision) {
            console.warn("Decision handling blocked:", { token, approvalData, isProcessing, decision });
            if (decision) {
                toast({ title: 'Info', description: `Request already ${decision}.`, variant: 'default' });
            } else if (isProcessing) {
                 toast({ title: 'Info', description: 'Processing previous request...', variant: 'default' });
            } else if (!approvalData || approvalData.approval.status !== 'pending'){
                 toast({ title: 'Info', description: 'Cannot process request. Status is not pending.', variant: 'default' });
            } else {
                 toast({ title: 'Error', description: 'Cannot process request. Missing required data.', variant: 'destructive' });
            }
            return;
        }

        setIsProcessing(true);
        setError(null); // Clear previous errors before attempting update

        try {
             console.log(`Attempting to set status to ${newStatus} for token: ${token}`);
             // Pass admin password for potential server-side verification if needed, or just use approverName
            const updatedApproval = await updateWageApprovalStatus(token, newStatus, 'Admin'); // Use 'Admin' or logged-in user

             console.log("Update result:", updatedApproval);

            if (updatedApproval) {
                setDecision(newStatus); // Update the decision state
                setApprovalData(prev => prev ? { ...prev, approval: updatedApproval } : null); // Update the displayed data
                toast({
                    title: `Wages ${newStatus}`,
                    description: `The wage records for this period have been ${newStatus}.`,
                });
            } else {
                 // This case might happen if the status changed between fetch and update attempt
                 setError('Failed to update status. The request might have been processed already or an unknown error occurred.');
                 toast({ title: 'Error', description: 'Failed to update status. Please refresh.', variant: 'destructive' });
                 // Attempt to refetch to show the most current state
                 await fetchAllData();
            }
        } catch (err: any) {
            console.error(`Error ${newStatus} wages:`, err);
            const specificMessage = err.message || `Failed to ${newStatus} wages.`;
            setError(specificMessage);
            toast({ title: 'Error', description: specificMessage, variant: 'destructive' });
            // Don't refetch here automatically, let the user decide or refresh
            // await fetchAllData(); // Avoid potential loop if fetch also fails
        } finally {
            setIsProcessing(false); // Ensure processing state is reset
        }
    };

    // --- Render Functions ---

    const renderLoginForm = () => {
        return (
             <Card className="w-full max-w-md shadow-lg bg-white text-gray-900">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">Admin Login Required</CardTitle>
                    <CardDescription className="text-center text-gray-600">
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
                                className="text-black border-gray-300 focus:ring-primary focus:border-primary" // Ensure text is visible and standard input styling
                                disabled={isLoggingIn}
                            />
                        </div>
                        <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoggingIn}>
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
                <div className="flex justify-center items-center py-10 text-white">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-lg">Loading approval details...</p>
                </div>
            );
        }

        // Show general errors first
        if (error) {
            return (
                <Alert variant="destructive" className="w-full max-w-xl mx-auto bg-red-100 dark:bg-red-900/30 border-red-500">
                    <AlertTriangle className="h-5 w-5 text-red-700 dark:text-red-500" />
                    <AlertTitle className="text-red-800 dark:text-red-300">Error Loading Approval</AlertTitle>
                    <AlertDescription className="text-red-700 dark:text-red-400">
                        {error}
                        <p className="text-sm mt-2">If the problem persists, please contact support or try refreshing the page.</p>
                    </AlertDescription>
                </Alert>
            );
        }

        if (!approvalData) {
             // This case should ideally be covered by the error state if fetching failed
             return <div className="text-center py-10 text-gray-400">Approval data not available or token is invalid.</div>;
         }

        const { approval, records } = approvalData;

        // Calculate Totals
        let totalNetPay = 0;
        let totalNetOnline = 0;
        let totalNetCash = 0;

        records.forEach(record => {
            totalNetPay += record.netPay;
            const employee = employees.find(emp => emp.id === record.employeeId);
            // Ensure employee exists and paymentMethod is checked
            if (employee?.paymentMethod === 'online') {
                totalNetOnline += record.netPay;
            } else if (employee?.paymentMethod === 'cash') { // Explicitly check for cash
                 totalNetCash += record.netPay;
            } else {
                // Handle cases where employee might not be found or has unexpected paymentMethod
                 console.warn(`Could not determine payment method for record ID ${record.id}, employee ID ${record.employeeId}. Assuming cash.`);
                 totalNetCash += record.netPay; // Default assumption or handle as needed
            }
        });

        const isFinalState = approval.status === 'approved' || approval.status === 'declined';

        // Format dates safely
        const dateFromObj = approval.dateFrom ? parseISO(approval.dateFrom) : null;
        const dateToObj = approval.dateTo ? parseISO(approval.dateTo) : null;
        const formattedDateFrom = dateFromObj && isValid(dateFromObj) ? format(dateFromObj, 'MMM dd, yyyy') : 'Invalid Date';
        const formattedDateTo = dateToObj && isValid(dateToObj) ? format(dateToObj, 'MMM dd, yyyy') : 'Invalid Date';
        const decisionTimestamp = approval.approved_at || approval.declined_at;
         // Ensure timestamp is treated as string for parseISO if it's a Date object from DB
         const decisionTimestampStr = typeof decisionTimestamp === 'string' ? decisionTimestamp : decisionTimestamp?.toISOString();
         const decisionDateObj = decisionTimestampStr ? parseISO(decisionTimestampStr) : null;
        const formattedDecisionDate = decisionDateObj && isValid(decisionDateObj) ? format(decisionDateObj, 'MMM dd, yyyy, h:mm a') : ''; // Add time


        return (
            <Card className="w-full max-w-6xl shadow-lg bg-black/60 backdrop-blur-sm border border-white/20 text-white">
                 <CardHeader>
                    <CardTitle className="text-2xl text-center">Wage Approval Request</CardTitle>
                    <CardDescription className="text-center text-gray-300">
                        Period: {formattedDateFrom} - {formattedDateTo} <br />
                        Overall Total Net Pay: ${totalNetPay.toFixed(2)} <br />
                        Current Status: <span className={`font-semibold ${approval.status === 'pending' ? 'text-yellow-400' : approval.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>{approval.status.toUpperCase()}</span>
                         {isFinalState && formattedDecisionDate && (
                           <span className="text-xs block mt-1">
                               (Decided on {formattedDecisionDate} {approval.approved_by ? `by ${approval.approved_by}` : ''})
                           </span>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto mb-6 border border-white/20 rounded-lg">
                        <Table>
                             <TableHeader className="bg-white/10">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-white border-r border-white/20">Employee</TableHead>
                                    <TableHead className="text-white border-r border-white/20">Payment Method</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">Wage</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">Total Hrs</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">Normal Hrs</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">Meal</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">FNPF</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">Deduct</TableHead>
                                    <TableHead className="text-white border-r border-white/20 text-right">Gross</TableHead>
                                    <TableHead className="text-white text-right">Net Pay</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {records.map(record => {
                                     const employee = employees.find(emp => emp.id === record.employeeId);
                                     const paymentMethodDisplay = employee ? (employee.paymentMethod === 'online' ? 'Online' : 'Cash') : 'N/A';
                                    return (
                                        <TableRow key={record.id} className="hover:bg-white/5">
                                            <TableCell className="border-r border-white/10">{record.employeeName}</TableCell>
                                            <TableCell className="border-r border-white/10">{paymentMethodDisplay}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">${record.hourlyWage.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">{record.totalHours.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">{record.hoursWorked.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">{record.overtimeHours.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">${record.mealAllowance.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">${record.fnpfDeduction.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">${record.otherDeductions.toFixed(2)}</TableCell>
                                            <TableCell className="text-right border-r border-white/10">${record.grossPay.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-medium">${record.netPay.toFixed(2)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                                     <TableCell colSpan={10} className="text-right pr-4 border-r border-white/10">Total Net Pay:</TableCell>
                                     <TableCell className="text-right font-semibold">${totalNetPay.toFixed(2)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {approval.status === 'pending' && ( // Show buttons only if status is pending
                        <div className="flex justify-center gap-4 mt-6">
                            <Button
                                variant="destructive"
                                size="lg"
                                onClick={() => handleDecision('declined')}
                                disabled={isProcessing} // Disable both if processing
                            >
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                Decline
                            </Button>
                            <Button
                                variant="default"
                                size="lg"
                                onClick={() => handleDecision('approved')}
                                disabled={isProcessing} // Disable both if processing
                                className="bg-green-600 hover:bg-green-700 text-white" // Explicitly style approve button
                            >
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Approve
                            </Button>
                        </div>
                    )}

                    {isFinalState && ( // Show final status message if approved or declined
                        <div className={`mt-6 text-center ${approval.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
                            {approval.status === 'approved' ? <CheckCircle className="h-8 w-8 mx-auto mb-2" /> : <XCircle className="h-8 w-8 mx-auto mb-2" />}
                            <p className="font-semibold text-xl">Wages {approval.status === 'approved' ? 'Approved' : 'Declined'}</p>
                             {/* Decision details moved to header */}
                        </div>
                    )}
                </CardContent>
                 <CardFooter className="flex flex-col sm:flex-row justify-around pt-6 border-t border-white/10 mt-6 space-y-4 sm:space-y-0">
                     <div className="text-center">
                         <p className="text-sm text-gray-400">Total Net (Online)</p>
                         <p className="text-lg font-semibold">${totalNetOnline.toFixed(2)}</p>
                     </div>
                     <div className="text-center">
                         <p className="text-sm text-gray-400">Total Net (Cash)</p>
                         <p className="text-lg font-semibold">${totalNetCash.toFixed(2)}</p>
                     </div>
                     <div className="text-center">
                         <p className="text-sm text-gray-400">Overall Total Net</p>
                         <p className="text-lg font-semibold">${totalNetPay.toFixed(2)}</p>
                     </div>
                 </CardFooter>
            </Card>
        );
    };

    return (
         <div className="flex justify-center items-start min-h-screen bg-muted p-4 pt-10 sm:pt-16">
             {/* Apply background globally */}
             <div className="absolute inset-0 -z-10">
                 <Image
                     src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg"
                     alt="Background"
                     fill
                     style={{ objectFit: 'cover' }}
                     priority
                 />
                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
             </div>

            {/* Content Area */}
             <div className="relative z-10 w-full flex justify-center">
                 {/* Show login form or approval content based on login state */}
                 {!isLoggedIn ? renderLoginForm() : renderApprovalContent()}
             </div>
         </div>
    );
};

export default ApproveWagesClient;
