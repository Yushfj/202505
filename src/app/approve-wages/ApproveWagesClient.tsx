'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getWagesForApproval, updateWageApprovalStatus, type WageRecord, type WageApproval, type Employee, getEmployees } from '@/services/employee-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, isValid, parseISO } from 'date-fns';


const ApproveWagesClient = () => {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [approvalData, setApprovalData] = useState<{ approval: WageApproval; records: WageRecord[] } | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]); // State to hold employee details for payment method
    const [error, setError] = useState<string | null>(null);
    const [decision, setDecision] = useState<'approved' | 'declined' | null>(null); // Track final decision

    useEffect(() => {
        const fetchAllData = async () => {
            if (!token) {
                setError('Invalid approval link: Missing token.');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);
            try {
                // Fetch both approval data and employee details
                const [data, fetchedEmployees] = await Promise.all([
                    getWagesForApproval(token),
                    getEmployees(true) // Fetch all employees (active/inactive) to get payment method
                ]);

                if (!data) {
                    setError('Approval request not found or already processed.');
                } else if (data.approval.status !== 'pending') {
                     setError(`This request has already been ${data.approval.status}.`);
                     setDecision(data.approval.status); // Show final status
                } else {
                    setApprovalData(data);
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
                 }
                 setError(userErrorMessage);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllData();
    }, [token]);

    const handleDecision = async (newStatus: 'approved' | 'declined') => {
        if (!token || !approvalData || isProcessing || decision) return; // Prevent action if already decided or processing

        setIsProcessing(true);
        try {
            const updatedApproval = await updateWageApprovalStatus(token, newStatus, 'Admin'); // Replace 'Admin' with actual user if available
            if (updatedApproval) {
                setDecision(newStatus); // Set the final decision
                setApprovalData(prev => prev ? { ...prev, approval: updatedApproval } : null); // Update local state
                toast({
                    title: `Wages ${newStatus}`,
                    description: `The wage records for this period have been ${newStatus}.`,
                });
            } else {
                // This might happen if the status was changed by someone else concurrently
                setError('Failed to update status. The request might have been processed already.');
                toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
                // Refetch to get the latest status
                 const latestData = await getWagesForApproval(token);
                 if (latestData) {
                    setApprovalData(latestData);
                    setDecision(latestData.approval.status);
                 }
            }
        } catch (err: any) {
            console.error(`Error ${newStatus} wages:`, err);
            setError(err.message || `Failed to ${newStatus} wages.`);
            toast({ title: 'Error', description: `Failed to ${newStatus} wages. ${err.message}`, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };

    const renderContent = () => {
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
                <div className="text-center py-10 text-red-600">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-3" />
                    <p className="text-xl font-semibold">Error Loading Approval</p>
                    <p className="text-base">{error}</p>
                     {/* Optionally add a link back or instructions */}
                     <p className="text-sm mt-4 text-muted-foreground">If the problem persists, please contact support.</p>
                </div>
            );
        }

        if (!approvalData) {
             // Should be covered by error state, but as a fallback
             return <div className="text-center py-10">Approval data not available.</div>;
         }

        const { approval, records } = approvalData;

        // Calculate Totals including Online and Cash
        let totalNetPay = 0;
        let totalNetOnline = 0;
        let totalNetCash = 0;

        records.forEach(record => {
            totalNetPay += record.netPay;
            const employee = employees.find(emp => emp.id === record.employeeId);
            if (employee?.paymentMethod === 'online') {
                totalNetOnline += record.netPay;
            } else { // Assume cash if not online or employee not found (shouldn't happen ideally)
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
        const decisionDateObj = decisionTimestamp ? parseISO(decisionTimestamp as unknown as string) : null; // Handle potential non-string type initially
        const formattedDecisionDate = decisionDateObj && isValid(decisionDateObj) ? format(decisionDateObj, 'MMM dd, yyyy') : '';


        return (
            <>
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
                                    <TableHead>Payment Method</TableHead> {/* Added Column */}
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
                                            <TableCell>{paymentMethodDisplay}</TableCell> {/* Display Payment Method */}
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

                    {/* Show buttons only if status is pending and no final decision made locally */}
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

                     {/* Show final status message if already processed or decision made */}
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
            </>
        );
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            <Card className="w-full max-w-6xl shadow-lg"> {/* Increased max-width */}
                {renderContent()}
            </Card>
        </div>
    );
};

export default ApproveWagesClient;
