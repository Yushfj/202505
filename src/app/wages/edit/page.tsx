
'use client';

import {useState, useEffect, useMemo, useCallback} from 'react';
import Image from 'next/image';
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {cn} from '@/lib/utils';
import {format, isValid, parseISO} from 'date-fns';
import {CalendarIcon, ArrowLeft, Home, Save, Loader2, Edit2, AlertTriangle} from 'lucide-react';
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
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getEmployees, getPayPeriodSummaries, getWageRecords, updateWageRecordsInApproval, type Employee, type WageRecord, type PayPeriodSummary, type UpdatedWageRecordData } from '@/services/employee-service';

const STANDARD_NORMAL_HOURS_THRESHOLD = 45;
const SPECIAL_EMPLOYEE_NAME = "Bimlesh Shashi Prakash";
const SPECIAL_NORMAL_HOURS_THRESHOLD = 48;
const OVERTIME_RATE = 1.5;
const ADMIN_PASSWORD = 'admin01';

interface EditableWageInputDetails {
    id: string; // wage_record id
    totalHours: string;
    mealAllowance: string;
    otherDeductions: string;
    // Calculated fields for display during edit
    hoursWorked?: string;
    overtimeHours?: string;
    fnpfDeduction?: number;
    grossPay?: number;
    netPay?: number;
}

const EditWagesPage = () => {
  const {toast} = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriodSummary[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [recordsToEdit, setRecordsToEdit] = useState<WageRecord[]>([]);
  const [editableWageData, setEditableWageData] = useState<{ [wageRecordId: string]: EditableWageInputDetails }>({});
  
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  // Totals for display
  const [totalNetPay, setTotalNetPay] = useState<number>(0);
  const [totalFnpfDeduction, setTotalFnpfDeduction] = useState<number>(0);
  const [totalGrossPay, setTotalGrossPay] = useState<number>(0);
  const [totalHoursWorked, setTotalHoursWorked] = useState<number>(0);
  const [totalOvertimeHours, setTotalOvertimeHours] = useState<number>(0);
  const [totalMealAllowance, setTotalMealAllowance] = useState<number>(0);
  const [totalOtherDeductions, setTotalOtherDeductions] = useState<number>(0);


  const fetchAllEmployeesAndPeriods = useCallback(async () => {
    setIsLoadingPeriods(true);
    try {
      const [fetchedEmployees, pendingPeriods, approvedPeriods] = await Promise.all([
        getEmployees(true), // Fetch all employees to ensure data consistency
        getPayPeriodSummaries('pending'),
        getPayPeriodSummaries('approved')
      ]);
      setEmployees(fetchedEmployees);
      setPayPeriods([...pendingPeriods, ...approvedPeriods].sort((a, b) => parseISO(b.dateFrom).getTime() - parseISO(a.dateFrom).getTime()));
    } catch (error: any) {
      console.error("Error fetching initial data for edit page:", error);
      toast({ title: "Error", description: `Failed to load data: ${error.message}`, variant: "destructive" });
    } finally {
      setIsLoadingPeriods(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllEmployeesAndPeriods();
  }, [fetchAllEmployeesAndPeriods]);

  const handlePeriodSelect = async (approvalId: string) => {
    if (!approvalId) {
        setSelectedApprovalId(null);
        setRecordsToEdit([]);
        setEditableWageData({});
        return;
    }
    setSelectedApprovalId(approvalId);
    setIsLoadingRecords(true);
    try {
        const selectedPeriod = payPeriods.find(p => p.approvalId === approvalId);
        if (!selectedPeriod) throw new Error("Selected period details not found.");
        const fetchedRecords = await getWageRecords(null, null, selectedPeriod.status, approvalId);
        setRecordsToEdit(fetchedRecords);

        const initialEditableData: { [wageRecordId: string]: EditableWageInputDetails } = {};
        fetchedRecords.forEach(record => {
            if (record.id) {
                 const employee = employees.find(emp => emp.id === record.employeeId);
                 const hourlyWage = employee ? parseFloat(employee.hourlyWage) : 0;
                 const normalHoursThreshold = employee?.name === SPECIAL_EMPLOYEE_NAME ? SPECIAL_NORMAL_HOURS_THRESHOLD : STANDARD_NORMAL_HOURS_THRESHOLD;

                 const normalHours = Math.min(record.totalHours, normalHoursThreshold);
                 const overtimeHours = Math.max(0, record.totalHours - normalHoursThreshold);
                 const regularPay = hourlyWage * normalHours;
                 const overtimePay = overtimeHours * hourlyWage * OVERTIME_RATE;
                 const grossPay = regularPay + overtimePay + record.mealAllowance;
                 const fnpfDeduction = employee?.fnpfEligible ? regularPay * 0.08 : 0;
                 const netPay = grossPay - fnpfDeduction - record.otherDeductions;

                initialEditableData[record.id] = {
                    id: record.id,
                    totalHours: String(record.totalHours),
                    mealAllowance: String(record.mealAllowance),
                    otherDeductions: String(record.otherDeductions),
                    hoursWorked: normalHours.toFixed(2),
                    overtimeHours: overtimeHours.toFixed(2),
                    fnpfDeduction: fnpfDeduction,
                    grossPay: grossPay,
                    netPay: netPay
                };
            }
        });
        setEditableWageData(initialEditableData);

    } catch (error: any) {
      console.error("Error fetching records for selected period:", error);
      toast({ title: "Error", description: `Failed to load records: ${error.message}`, variant: "destructive" });
      setRecordsToEdit([]);
      setEditableWageData({});
    } finally {
      setIsLoadingRecords(false);
    }
  };
  
  const validateNumericInput = (value: string): string => {
      const sanitized = value.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
      if (parts[1] && parts[1].length > 2) return parts[0] + '.' + parts[1].substring(0, 2);
      return sanitized;
  };

  const handleInputChange = (recordId: string, field: 'totalHours' | 'mealAllowance' | 'otherDeductions', value: string) => {
    const validatedValue = validateNumericInput(value);
    setEditableWageData(prev => {
        const currentRecordInputs = prev[recordId];
        if (!currentRecordInputs) return prev;

        const updatedInputs = { ...currentRecordInputs, [field]: validatedValue };
        
        // Recalculate derived fields
        const recordToEdit = recordsToEdit.find(r => r.id === recordId);
        const employee = employees.find(emp => emp.id === recordToEdit?.employeeId);
        if (!employee || !recordToEdit) return prev;

        const hourlyWage = parseFloat(employee.hourlyWage);
        const totalHoursNum = field === 'totalHours' ? parseFloat(validatedValue || '0') : parseFloat(updatedInputs.totalHours || '0');
        const mealAllowanceNum = field === 'mealAllowance' ? parseFloat(validatedValue || '0') : parseFloat(updatedInputs.mealAllowance || '0');
        const otherDeductionsNum = field === 'otherDeductions' ? parseFloat(validatedValue || '0') : parseFloat(updatedInputs.otherDeductions || '0');
        
        const normalHoursThreshold = employee.name === SPECIAL_EMPLOYEE_NAME ? SPECIAL_NORMAL_HOURS_THRESHOLD : STANDARD_NORMAL_HOURS_THRESHOLD;
        const normalHours = Math.min(totalHoursNum, normalHoursThreshold);
        const overtimeHours = Math.max(0, totalHoursNum - normalHoursThreshold);
        const regularPay = hourlyWage * normalHours;
        const overtimePay = overtimeHours * hourlyWage * OVERTIME_RATE;
        const grossPay = regularPay + overtimePay + mealAllowanceNum;
        const fnpfDeduction = employee.fnpfEligible ? regularPay * 0.08 : 0;
        const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductionsNum);

        return {
            ...prev,
            [recordId]: {
                ...updatedInputs,
                hoursWorked: normalHours.toFixed(2),
                overtimeHours: overtimeHours.toFixed(2),
                fnpfDeduction: fnpfDeduction,
                grossPay: grossPay,
                netPay: netPay,
            },
        };
    });
  };

  useEffect(() => {
    let runningTotalNet = 0;
    let runningTotalFnpf = 0;
    let runningTotalGross = 0;
    let runningTotalHoursWorked = 0;
    let runningTotalOvertimeHours = 0;
    let runningTotalMealAllowance = 0;
    let runningTotalOtherDeductions = 0;

    Object.values(editableWageData).forEach(details => {
        if (!details) return;
        runningTotalNet += details.netPay || 0;
        runningTotalFnpf += details.fnpfDeduction || 0;
        runningTotalGross += details.grossPay || 0;
        runningTotalHoursWorked += parseFloat(details.hoursWorked || '0');
        runningTotalOvertimeHours += parseFloat(details.overtimeHours || '0');
        runningTotalMealAllowance += parseFloat(details.mealAllowance || '0');
        runningTotalOtherDeductions += parseFloat(details.otherDeductions || '0');
    });

    setTotalNetPay(runningTotalNet);
    setTotalFnpfDeduction(runningTotalFnpf);
    setTotalGrossPay(runningTotalGross);
    setTotalHoursWorked(runningTotalHoursWorked);
    setTotalOvertimeHours(runningTotalOvertimeHours);
    setTotalMealAllowance(runningTotalMealAllowance);
    setTotalOtherDeductions(runningTotalOtherDeductions);

  }, [editableWageData]);

  const handleSaveChanges = () => {
    if (!selectedApprovalId || Object.keys(editableWageData).length === 0) {
        toast({ title: "Info", description: "No records loaded or selected for saving.", variant: "default" });
        return;
    }
    setShowPasswordDialog(true);
  };

  const confirmSaveChanges = async () => {
    if (adminPasswordInput !== ADMIN_PASSWORD) {
        toast({ title: "Error", description: "Incorrect admin password.", variant: "destructive" });
        return;
    }
    setShowPasswordDialog(false);
    setAdminPasswordInput('');
    setIsSaving(true);

    const updatedDataArray: UpdatedWageRecordData[] = Object.values(editableWageData).map(detail => ({
        id: detail.id,
        totalHours: parseFloat(detail.totalHours || '0'),
        mealAllowance: parseFloat(detail.mealAllowance || '0'),
        otherDeductions: parseFloat(detail.otherDeductions || '0'),
    }));

    try {
        await updateWageRecordsInApproval(selectedApprovalId!, updatedDataArray);
        toast({ title: "Success", description: "Wage records updated successfully. Approval status reset to pending." });
        fetchAllEmployeesAndPeriods(); // Refresh lists
        setSelectedApprovalId(null);
        setRecordsToEdit([]);
        setEditableWageData({});
    } catch (error: any) {
        console.error("Error saving wage record changes:", error);
        toast({ title: "Error", description: `Failed to save changes: ${error.message}`, variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
      <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
        <Link href="/wages" passHref className="ml-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to Wages Management</span>
          </Button>
        </Link>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
          Edit Wage Records
        </h1>
        <Link href="/dashboard" passHref className="mr-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <Home className="h-5 w-5" />
            <span className="sr-only">Dashboard</span>
          </Button>
        </Link>
      </header>

      <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6">
        <Card className="w-full max-w-7xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-center text-white mb-4">Select Pay Period to Edit</CardTitle>
            {isLoadingPeriods ? (
                <div className="flex justify-center items-center py-4"><Loader2 className="h-6 w-6 animate-spin text-white"/> <span className="ml-2 text-white">Loading pay periods...</span></div>
            ) : payPeriods.length === 0 ? (
                <p className="text-center text-gray-400">No editable (pending or approved) pay periods found.</p>
            ) : (
              <Select onValueChange={handlePeriodSelect} value={selectedApprovalId || ''} disabled={isLoadingRecords || isSaving}>
                <SelectTrigger className="w-full max-w-md mx-auto bg-white/10 text-white placeholder-gray-400 border-white/20">
                  <SelectValue placeholder="Choose a pay period..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Pay Periods (Pending/Approved)</SelectLabel>
                    {payPeriods.map(period => (
                      <SelectItem key={period.approvalId} value={period.approvalId}>
                        {format(parseISO(period.dateFrom), 'MMM dd, yyyy')} - {format(parseISO(period.dateTo), 'MMM dd, yyyy')} ({period.status})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingRecords && (
                <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-white"/> <span className="ml-3 text-lg text-white">Loading records...</span></div>
            )}

            {!isLoadingRecords && selectedApprovalId && recordsToEdit.length === 0 && (
                <p className="text-center text-gray-400 mt-6">No wage records found for the selected period or period not found.</p>
            )}

            {!isLoadingRecords && recordsToEdit.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-white mb-4 text-center">
                    Editing Wages for Period: {
                        payPeriods.find(p=>p.approvalId === selectedApprovalId) ? 
                        `${format(parseISO(payPeriods.find(p=>p.approvalId === selectedApprovalId)!.dateFrom), 'MMM dd, yyyy')} - ${format(parseISO(payPeriods.find(p=>p.approvalId === selectedApprovalId)!.dateTo), 'MMM dd, yyyy')}`
                        : 'Selected Period'
                    }
                </h3>
                <div className="overflow-x-auto mb-6 border border-white/20 rounded-lg">
                  <Table>
                    <TableHeader className="bg-white/10">
                      <TableRow>
                        <TableHead className="text-white border-r border-white/20">Employee</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Wage</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Total Hrs</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Normal Hrs</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">O/T Hrs</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Meal</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Deduct</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">FNPF</TableHead>
                        <TableHead className="text-white border-r border-white/20 text-right">Gross Pay</TableHead>
                        <TableHead className="text-white text-right">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recordsToEdit.map(record => {
                        const employee = employees.find(emp => emp.id === record.employeeId);
                        const currentInputs = editableWageData[record.id!];
                        if (!employee || !currentInputs) return null;

                        return (
                          <TableRow key={record.id} className="hover:bg-white/10">
                            <TableCell className="text-white border-r border-white/20">{employee.name}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${parseFloat(employee.hourlyWage).toFixed(2)}</TableCell>
                            <TableCell className="border-r border-white/20">
                              <Input type="text" value={currentInputs.totalHours} onChange={e => handleInputChange(record.id!, 'totalHours', e.target.value)} className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right" disabled={isSaving} />
                            </TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">{currentInputs.hoursWorked || '0.00'}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">{currentInputs.overtimeHours || '0.00'}</TableCell>
                            <TableCell className="border-r border-white/20">
                              <Input type="text" value={currentInputs.mealAllowance} onChange={e => handleInputChange(record.id!, 'mealAllowance', e.target.value)} className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right" disabled={isSaving} />
                            </TableCell>
                            <TableCell className="border-r border-white/20">
                              <Input type="text" value={currentInputs.otherDeductions} onChange={e => handleInputChange(record.id!, 'otherDeductions', e.target.value)} className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right" disabled={isSaving} />
                            </TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${(currentInputs.fnpfDeduction || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${(currentInputs.grossPay || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-white font-medium text-right">${(currentInputs.netPay || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                        <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                            <TableCell colSpan={2} className="text-right text-white pr-4 border-r border-white/20">Totals:</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right"></TableCell> {/* Spacer for total hours */}
                            <TableCell className="text-white border-r border-white/20 text-right">{totalHoursWorked.toFixed(2)}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">{totalOvertimeHours.toFixed(2)}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${totalMealAllowance.toFixed(2)}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${totalOtherDeductions.toFixed(2)}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${totalFnpfDeduction.toFixed(2)}</TableCell>
                            <TableCell className="text-white border-r border-white/20 text-right">${totalGrossPay.toFixed(2)}</TableCell>
                            <TableCell className="text-white text-right">${totalNetPay.toFixed(2)}</TableCell>
                        </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-center mt-6">
                  <Button onClick={handleSaveChanges} disabled={isSaving || Object.keys(editableWageData).length === 0} variant="gradient" size="lg">
                    {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : <><Save className="mr-2 h-4 w-4"/> Save Changes & Reset Approval</>}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Save Changes</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Please enter the admin password to save these changes. This will also reset the approval status to 'pending'.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="admin-password-edit">Admin Password</Label>
            <Input
              id="admin-password-edit"
              type="password"
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              className="bg-gray-800 border-white/20 text-white"
              onKeyPress={(e) => { if (e.key === 'Enter') confirmSaveChanges(); }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setShowPasswordDialog(false); setAdminPasswordInput('');}} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveChanges} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EditWagesPage;

      
    