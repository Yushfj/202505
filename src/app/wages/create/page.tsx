
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { ArrowLeft, Home, Loader2, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getEmployees, requestWageApproval, getTimesheetHoursForPeriod, type TimesheetEntrySummary, type Employee, type WageRecord, type PayPeriodSummary, getPayPeriodSummaries } from '@/services/employee-service';
import { useRouter } from 'next/navigation';

// --- Constants ---
const OVERTIME_RATE = 1.5;
const STANDARD_NORMAL_HOURS_THRESHOLD = 45;
const SPECIAL_EMPLOYEE_NAME = "Bimlesh Shashi Prakash";
const SPECIAL_NORMAL_HOURS_THRESHOLD = 48;

// --- Interfaces ---
interface WageInputDetails {
  otherDeductions: string;
  totalHours: number;
  hoursWorked: number;
  overtimeHours: number;
  mealAllowance: number;
}

interface CombinedWageInfo {
  employeeId: string;
  employeeName: string;
  bankCode: string | null;
  bankAccountNumber: string | null;
  hourlyWage: number;
  totalHours: number;
  hoursWorked: number;
  overtimeHours: number;
  mealAllowance: number;
  otherDeductions: number;
  grossPay: number;
  fnpfDeduction: number;
  netPay: number;
  fnpfEligible: boolean;
  paymentMethod: 'cash' | 'online';
  branch: 'labasa' | 'suva';
}

interface DropdownPeriodOption {
  value: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  branch: 'labasa' | 'suva' | null;
  type: 'individual' | 'merged';
}

const CreateWagesPage = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [wageInputMap, setWageInputMap] = useState<Record<string, WageInputDetails>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const [generatedApprovalLink, setGeneratedApprovalLink] = useState<string | null>(null);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  
  const [dropdownPeriodOptions, setDropdownPeriodOptionsInternal] = useState<DropdownPeriodOption[]>([]);
  const [selectedApprovedPeriodKey, setSelectedApprovedPeriodKey] = useState<string>("");

  // State for totals
  const [totalTotalHoursState, setTotalTotalHoursState] = useState<number>(0);
  const [totalHoursWorkedState, setTotalHoursWorkedState] = useState<number>(0);
  const [totalOvertimeHoursState, setTotalOvertimeHoursState] = useState<number>(0);
  const [totalMealAllowanceState, setTotalMealAllowanceState] = useState<number>(0);
  const [totalOtherDeductionsState, setTotalOtherDeductionsState] = useState<number>(0);
  const [totalFnpfDeductionState, setTotalFnpfDeductionState] = useState<number>(0);
  const [totalGrossPayState, setTotalGrossPayState] = useState<number>(0);
  const [totalNetPayState, setTotalNetPayState] = useState<number>(0);
  const [totalSuvaWagesState, setTotalSuvaWagesState] = useState<number>(0);
  const [totalLabasaWagesState, setTotalLabasaWagesState] = useState<number>(0);
  const [totalCashWagesState, setTotalCashWagesState] = useState<number>(0);
  const [totalOnlineWagesState, setTotalOnlineWagesState] = useState<number>(0);

  const setDropdownPeriodOptions = useCallback((newOptions: DropdownPeriodOption[]) => {
    setDropdownPeriodOptionsInternal(prevOptions => {
        if (JSON.stringify(prevOptions) !== JSON.stringify(newOptions)) {
            return newOptions;
        }
        return prevOptions;
    });
  }, []);

  const setWageInputMapState = useCallback((updater: Record<string, WageInputDetails> | ((current: Record<string, WageInputDetails>) => Record<string, WageInputDetails>)) => {
    setWageInputMap(currentMap => {
        const newMap = typeof updater === 'function' ? updater(currentMap) : updater;
        if (JSON.stringify(currentMap) !== JSON.stringify(newMap)) {
            return newMap;
        }
        return currentMap;
    });
  }, []);


  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
      router.replace('/');
    } else if (storedUser === 'Priyanka Sharma') {
      router.replace('/dashboard');
    } else {
      setCurrentUser(storedUser);
      setAuthCheckLoading(false);
    }
  }, [router]);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setGeneratedApprovalLink(null);
    try {
      const [fetchedEmployees, allApprovedTimesheetReviews, finalWagesPending, finalWagesApproved] = await Promise.all([
        getEmployees(false),
        getPayPeriodSummaries('approved', 'timesheet_review'),
        getPayPeriodSummaries('pending', 'final_wage'),
        getPayPeriodSummaries('approved', 'final_wage')
      ]);

      const currentEmployees = Array.isArray(fetchedEmployees) ? fetchedEmployees : [];
      setEmployees(prevEmployees => {
          if (JSON.stringify(prevEmployees) !== JSON.stringify(currentEmployees)) return currentEmployees;
          return prevEmployees;
      });
      
      const initialWageInputs: Record<string, WageInputDetails> = {};
      currentEmployees.forEach((emp: Employee) => {
        initialWageInputs[emp.id] = {
          otherDeductions: '', 
          totalHours: 0, 
          hoursWorked: 0, 
          overtimeHours: 0, 
          mealAllowance: 0,
        };
      });
      setWageInputMapState(initialWageInputs);

      // Create processed final wage keys set
      const processedFinalWageKeys = new Set(
        [...finalWagesPending, ...finalWagesApproved].map(fw => 
          `${fw.dateFrom}_${fw.dateTo}_${fw.branch || 'merged'}`
        )
      );

      // Group approved timesheet reviews by date range
      const timesheetsByDateRange: Record<string, { labasa?: PayPeriodSummary; suva?: PayPeriodSummary }> = {};
      allApprovedTimesheetReviews.forEach(tsr => {
        const key = `${tsr.dateFrom}_${tsr.dateTo}`;
        if (!timesheetsByDateRange[key]) {
          timesheetsByDateRange[key] = {}; // Initialize if not exists
        }
        if (tsr.branch === 'labasa') {
          timesheetsByDateRange[key].labasa = tsr;
        } else if (tsr.branch === 'suva') {
          timesheetsByDateRange[key].suva = tsr;
        } else if (tsr.branch === null) {
          timesheetsByDateRange[key].labasa = tsr; 
          timesheetsByDateRange[key].suva = tsr;   
        }
      });

      const newOptions: DropdownPeriodOption[] = [];
      
      Object.entries(timesheetsByDateRange).forEach(([dateRangeKey, periodData]) => {
        const [dateFrom, dateTo] = dateRangeKey.split('_');
        
        const hasLabasaTS = !!periodData.labasa;
        const hasSuvaTS = !!periodData.suva;
        const isMergedOptionPossible = hasLabasaTS && hasSuvaTS;

        const mergedKey = `${dateFrom}_${dateTo}_merged`;
        const labasaKey = `${dateFrom}_${dateTo}_labasa`;
        const suvaKey = `${dateFrom}_${dateTo}_suva`;

        const mergedFinalWageProcessed = processedFinalWageKeys.has(mergedKey);
        const labasaFinalWageProcessedForThisPeriod = processedFinalWageKeys.has(labasaKey);
        const suvaFinalWageProcessedForThisPeriod = processedFinalWageKeys.has(suvaKey);

        let mergedOptionAddedForThisPeriod = false;

        const canOfferMerged = isMergedOptionPossible && 
                               !mergedFinalWageProcessed && 
                               !labasaFinalWageProcessedForThisPeriod && 
                               !suvaFinalWageProcessedForThisPeriod;

        if (canOfferMerged) {
          newOptions.push({
            value: mergedKey,
            label: `${format(parseISO(dateFrom), "MMM dd, yyyy")} - ${format(parseISO(dateTo), "MMM dd, yyyy")} (All Branches)`,
            dateFrom,
            dateTo,
            branch: null,
            type: 'merged'
          });
          mergedOptionAddedForThisPeriod = true;
        }

        if (!mergedOptionAddedForThisPeriod) {
          if (hasLabasaTS && !labasaFinalWageProcessedForThisPeriod && !mergedFinalWageProcessed) {
            newOptions.push({
              value: labasaKey,
              label: `${format(parseISO(dateFrom), "MMM dd, yyyy")} - ${format(parseISO(dateTo), "MMM dd, yyyy")} (Labasa Branch)`,
              dateFrom,
              dateTo,
              branch: 'labasa',
              type: 'individual'
            });
          }
          if (hasSuvaTS && !suvaFinalWageProcessedForThisPeriod && !mergedFinalWageProcessed) {
            newOptions.push({
              value: suvaKey,
              label: `${format(parseISO(dateFrom), "MMM dd, yyyy")} - ${format(parseISO(dateTo), "MMM dd, yyyy")} (Suva Branch)`,
              dateFrom,
              dateTo,
              branch: 'suva',
              type: 'individual'
            });
          }
        }
      });
      
      newOptions.sort((a, b) => {
        const dateCompare = parseISO(b.dateFrom).getTime() - parseISO(a.dateFrom).getTime();
        if (dateCompare !== 0) return dateCompare;
        if (a.type === 'merged' && b.type === 'individual') return -1;
        if (a.type === 'individual' && b.type === 'merged') return 1;
        return 0;
      });

      setDropdownPeriodOptions(newOptions);

    } catch (error: unknown) {
      console.error("Error in fetchInitialData:", error);
      toast({
        title: 'Error Loading Data',
        description: error instanceof Error ? error.message : 'Failed to load initial data.',
        variant: 'destructive',
      });
      setEmployees([]);
      setWageInputMapState({});
      setDropdownPeriodOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast, setDropdownPeriodOptions, setWageInputMapState]);

  useEffect(() => {
    if (!authCheckLoading) {
      fetchInitialData();
    }
  }, [authCheckLoading, fetchInitialData]);

  useEffect(() => {
    const fetchTimesheetData = async () => {
      if (!selectedApprovedPeriodKey || (employees || []).length === 0) {
        setWageInputMapState(currentMap => {
            const resetMap: Record<string, WageInputDetails> = {};
            (employees || []).forEach(emp => {
                resetMap[emp.id] = {
                    otherDeductions: currentMap[emp.id]?.otherDeductions || '',
                    totalHours: 0, hoursWorked: 0, overtimeHours: 0, mealAllowance: 0,
                };
            });
            if (JSON.stringify(currentMap) !== JSON.stringify(resetMap)) {
                return resetMap;
            }
            return currentMap;
        });
        return;
      }

      const parts = selectedApprovedPeriodKey.split('_');
      const dateFrom = parts[0];
      const dateTo = parts[1];
      const typeOrBranch = parts[2];
      const branchFilter = typeOrBranch === 'merged' ? null : typeOrBranch as 'labasa' | 'suva';

      if (!isValid(parseISO(dateFrom)) || !isValid(parseISO(dateTo))) {
        toast({ title: 'Error', description: 'Invalid period selected. Dates are not valid.', variant: 'destructive' });
        return;
      }

      setIsLoading(true); 
      try {
        const summaries = await getTimesheetHoursForPeriod(dateFrom, dateTo, branchFilter);
        
        setWageInputMapState(currentWageInputMap => {
          const newMapForPeriod: Record<string, WageInputDetails> = {};
          (employees || []).forEach(emp => {
            const existingInputs = currentWageInputMap[emp.id];
            if (branchFilter === null || emp.branch === branchFilter) {
              const summary = summaries.find(s => s.employeeId === emp.id);
              newMapForPeriod[emp.id] = {
                otherDeductions: existingInputs?.otherDeductions || '',
                totalHours: summary?.totalHours ?? 0,
                hoursWorked: summary?.totalNormalHours ?? 0,
                overtimeHours: summary?.totalOvertimeHours ?? 0,
                mealAllowance: summary?.totalMealAllowance ?? 0,
              };
            } else {
               newMapForPeriod[emp.id] = {
                  otherDeductions: existingInputs?.otherDeductions || '',
                  totalHours: 0, hoursWorked: 0, overtimeHours: 0, mealAllowance: 0,
               };
            }
          });
          if (JSON.stringify(currentWageInputMap) !== JSON.stringify(newMapForPeriod)) {
            return newMapForPeriod;
          }
          return currentWageInputMap;
        });

      } catch (error: unknown) {
        toast({
          title: 'Error Fetching Timesheet Data',
          description: error instanceof Error ? error.message : 'Could not load timesheet details for the selected period.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (!authCheckLoading) {
        fetchTimesheetData();
    }
  }, [selectedApprovedPeriodKey, employees, authCheckLoading, toast, setWageInputMapState]);

  const validateNumericInput = useCallback((value: string): string => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
    if (parts[1] && parts[1].length > 2) return parts[0] + '.' + parts[1].substring(0, 2);
    return sanitized;
  }, []);

  const handleOtherDeductionsChange = useCallback((employeeId: string, value: string) => {
    const validatedValue = validateNumericInput(value);
    setWageInputMapState(prev => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || { otherDeductions: '', totalHours: 0, hoursWorked: 0, overtimeHours: 0, mealAllowance: 0 }),
        otherDeductions: validatedValue
      },
    }));
  }, [validateNumericInput, setWageInputMapState]);

  const calculatedWageMap = useMemo(() => {
    const newCalculatedMap: Record<string, CombinedWageInfo> = {};
    (employees || []).forEach(employee => {
      const inputs = wageInputMap[employee.id];
      const currentInputs = inputs || { otherDeductions: '', totalHours: 0, hoursWorked: 0, overtimeHours: 0, mealAllowance: 0 };
      
      const hourlyWageNum = parseFloat(employee.hourlyWage || '0');
      const otherDeductionsNum = parseFloat(currentInputs.otherDeductions || '0') || 0;
      const { totalHours, hoursWorked, overtimeHours, mealAllowance } = currentInputs;
      
      const weeklyNormalHoursThreshold = employee.name === SPECIAL_EMPLOYEE_NAME 
                               ? SPECIAL_NORMAL_HOURS_THRESHOLD 
                               : STANDARD_NORMAL_HOURS_THRESHOLD;

      const normalHoursForPay = Math.min(hoursWorked, weeklyNormalHoursThreshold);
      const overtimeHoursForPay = overtimeHours + Math.max(0, hoursWorked - weeklyNormalHoursThreshold);

      const normalPay = hourlyWageNum * normalHoursForPay;
      const overtimePay = overtimeHoursForPay * hourlyWageNum * OVERTIME_RATE;
      const grossPay = normalPay + overtimePay + mealAllowance;
      let fnpfDeduction = 0;
      if (employee.fnpfEligible && normalPay > 0) {
        fnpfDeduction = normalPay * 0.08;
      }
      const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductionsNum);

      newCalculatedMap[employee.id] = {
        employeeId: employee.id, employeeName: employee.name, bankCode: employee.bankCode,
        bankAccountNumber: employee.bankAccountNumber, hourlyWage: hourlyWageNum, totalHours,
        hoursWorked, overtimeHours, mealAllowance, otherDeductions: otherDeductionsNum,
        grossPay, fnpfDeduction, netPay, fnpfEligible: employee.fnpfEligible,
        paymentMethod: employee.paymentMethod, branch: employee.branch,
      };
    });
    return newCalculatedMap;
  }, [employees, wageInputMap]);

  useEffect(() => {
    let runningTotalTotalHrs = 0;
    let runningTotalNormalHrs = 0;
    let runningTotalOvertime = 0;
    let runningTotalMeal = 0;
    let runningTotalOtherDed = 0;
    let runningTotalFnpf = 0;
    let runningTotalGross = 0;
    let runningTotalNet = 0;
    let runningTotalSuva = 0;
    let runningTotalLabasa = 0;
    let runningTotalCash = 0;
    let runningTotalOnline = 0;

    const parts = selectedApprovedPeriodKey.split('_');
    const typeOrBranchFilter = parts.length > 2 ? parts[2] : null;

    Object.values(calculatedWageMap).forEach(details => {
      if (!details) return;

      const shouldInclude = 
        typeOrBranchFilter === 'merged' || 
        (typeOrBranchFilter && details.branch === typeOrBranchFilter) ||
        (!typeOrBranchFilter && selectedApprovedPeriodKey === "");

      if (shouldInclude) {
        runningTotalTotalHrs += details.totalHours;
        runningTotalNormalHrs += details.hoursWorked;
        runningTotalOvertime += details.overtimeHours;
        runningTotalMeal += details.mealAllowance;
        runningTotalOtherDed += details.otherDeductions;
        runningTotalFnpf += details.fnpfDeduction;
        runningTotalGross += details.grossPay;
        runningTotalNet += details.netPay;

        if (details.branch === 'suva') runningTotalSuva += details.netPay;
        if (details.branch === 'labasa') runningTotalLabasa += details.netPay;

        if (details.paymentMethod === 'cash') runningTotalCash += details.netPay;
        else runningTotalOnline += details.netPay;
      }
    });

    setTotalTotalHoursState(runningTotalTotalHrs);
    setTotalHoursWorkedState(runningTotalNormalHrs);
    setTotalOvertimeHoursState(runningTotalOvertime);
    setTotalMealAllowanceState(runningTotalMeal);
    setTotalOtherDeductionsState(runningTotalOtherDed);
    setTotalFnpfDeductionState(runningTotalFnpf);
    setTotalGrossPayState(runningTotalGross);
    setTotalNetPayState(runningTotalNet);
    setTotalSuvaWagesState(runningTotalSuva);
    setTotalLabasaWagesState(runningTotalLabasa);
    setTotalCashWagesState(runningTotalCash);
    setTotalOnlineWagesState(runningTotalOnline);
  }, [calculatedWageMap, selectedApprovedPeriodKey]);

  const getCurrentWageRecordsForRequest = useCallback((): Omit<WageRecord, 'id' | 'created_at' | 'approvalStatus' | 'approvalId'>[] => {
    if (!selectedApprovedPeriodKey) {
      toast({ title: "Error", description: "Please select an approved timesheet period first.", variant: "destructive" });
      return [];
    }
    const parts = selectedApprovedPeriodKey.split('_');
    const dateFrom = parts[0];
    const dateTo = parts[1];
    const typeOrBranch = parts[2];
    const branchFilter = typeOrBranch === 'merged' ? null : typeOrBranch as 'labasa' | 'suva';

    if (!dateFrom || !dateTo || !isValid(parseISO(dateFrom)) || !isValid(parseISO(dateTo))) {
      toast({ title: 'Error', description: 'Date range for the pay period is invalid. Please re-select.', variant: 'destructive' });
      return [];
    }
    const records: Omit<WageRecord, 'id' | 'created_at' | 'approvalStatus' | 'approvalId'>[] = [];
    (employees || []).forEach(employee => {
      if (branchFilter === null || employee.branch === branchFilter) {
        const calculatedDetails = calculatedWageMap[employee.id];
        if (calculatedDetails && (calculatedDetails.totalHours > 0 || calculatedDetails.mealAllowance > 0 || calculatedDetails.otherDeductions >= 0 )) {
          records.push({
            employeeId: calculatedDetails.employeeId, 
            employeeName: calculatedDetails.employeeName,
            hourlyWage: calculatedDetails.hourlyWage, 
            totalHours: calculatedDetails.totalHours,
            hoursWorked: calculatedDetails.hoursWorked, 
            overtimeHours: calculatedDetails.overtimeHours,
            mealAllowance: calculatedDetails.mealAllowance, 
            otherDeductions: calculatedDetails.otherDeductions,
            grossPay: calculatedDetails.grossPay, 
            fnpfDeduction: calculatedDetails.fnpfDeduction,
            netPay: calculatedDetails.netPay, 
            dateFrom: dateFrom, 
            dateTo: dateTo,
          });
        }
      }
    });
    return records;
  }, [selectedApprovedPeriodKey, employees, calculatedWageMap, toast]);

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

  const handleRequestFinalWageApproval = useCallback(async () => {
    if (!selectedApprovedPeriodKey) {
      toast({ title: "Error", description: "Please select an approved timesheet period first.", variant: "destructive" });
      return;
    }
    const recordsToRequest = getCurrentWageRecordsForRequest();
    if (recordsToRequest.length === 0) {
      toast({ title: "Info", description: "No wage data to submit for approval. Ensure timesheet data is loaded and/or deductions are entered for the selected scope.", variant: "default" });
      return;
    }
    
    const parts = selectedApprovedPeriodKey.split('_');
    const typeOrBranch = parts[2];
    const branchForApproval = typeOrBranch === 'merged' ? null : typeOrBranch as 'labasa' | 'suva';

    setIsProcessing(true);
    try {
      const initiatedBy = currentUser || "System";
      const result = await requestWageApproval(recordsToRequest, initiatedBy, branchForApproval);
      if (result?.approvalLink) {
        setGeneratedApprovalLink(result.approvalLink);
        toast({
          title: 'Final Wage Approval Request Created',
          description: `Approval ID: ${result.approvalId}. Link generated.`,
          duration: 10000,
        });
        copyToClipboard(result.approvalLink);
      } else {
        toast({ title: "Error", description: "Failed to generate approval link. Please try again.", variant: "destructive" });
        setGeneratedApprovalLink(null);
      }
      await fetchInitialData();
      setSelectedApprovedPeriodKey("");
    } catch (error: unknown) {
      console.error("Error during final wage approval request:", error);
      let errorMessage = 'Failed to request approval.';
      if (error instanceof Error) {
        if (error.message.includes('already exists or is approved')) {
           errorMessage = `A final wage approval for this period ${branchForApproval ? `(${branchForApproval} branch)`: '(Merged/All Branches)'} already exists or is approved.`;
        } else {
          errorMessage = `Failed to request approval: ${error.message}`;
        }
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setGeneratedApprovalLink(null);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedApprovedPeriodKey, getCurrentWageRecordsForRequest, currentUser, toast, fetchInitialData, copyToClipboard]);

  if (authCheckLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col min-h-screen text-white font-sans">
        <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 bg-black/60 backdrop-blur-md">
          <Link href="/wages" passHref className="ml-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Wages Management</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
            Calculate Final Wages
          </h1>
          <Link href="/dashboard" passHref className="mr-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 transition-colors">
              <Home className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Button>
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto py-6">
          <div className="container mx-auto px-4">
            <Card className="bg-black/40 backdrop-blur-md shadow-2xl rounded-xl border border-white/20">
              <CardHeader className="pb-4">
                  <CardTitle className="text-center text-white mb-3 text-2xl font-bold">Select Approved Timesheet Period</CardTitle>
                  <CardDescription className="text-center text-gray-300 mb-6 text-lg">
                      Choose a timesheet period that has been reviewed and approved by an administrator.
                  </CardDescription>
                  <div className="flex justify-center mb-6">
                      <Select
                          value={selectedApprovedPeriodKey}
                          onValueChange={setSelectedApprovedPeriodKey}
                          disabled={isLoading || isProcessing || dropdownPeriodOptions.length === 0}
                      >
                          <SelectTrigger className="w-full sm:w-[500px] bg-white/10 text-white placeholder-gray-400 border-white/30 hover:border-white/50 transition-colors h-12 text-base">
                              <SelectValue placeholder={dropdownPeriodOptions.length === 0 ? "No approved timesheets available" : "Select an approved period..."} />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                              <SelectGroup>
                                  <SelectLabel className="text-gray-300 font-semibold">Approved Timesheet Periods</SelectLabel>
                                  {dropdownPeriodOptions.map(option => (
                                      <SelectItem 
                                          key={option.value} 
                                          value={option.value}
                                          className="text-white hover:bg-gray-800 focus:bg-gray-800"
                                      >
                                          {option.label}
                                      </SelectItem>
                                  ))}
                                  {dropdownPeriodOptions.length === 0 && (
                                    <SelectItem value="no-periods" disabled className="text-gray-500">
                                      No approved timesheets available
                                    </SelectItem>
                                  )}
                              </SelectGroup>
                          </SelectContent>
                      </Select>
                  </div>
              </CardHeader>
              <CardContent className="pb-6">
                  {isLoading && (employees || []).length === 0 && !selectedApprovedPeriodKey && (
                      <div className="text-center text-white py-10 flex items-center justify-center">
                         <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading initial data...
                      </div>
                  )}
                  {isLoading && selectedApprovedPeriodKey && Object.values(wageInputMap).every(val => val.totalHours === 0 && val.mealAllowance === 0) && (
                       <div className="text-center text-white py-10 flex items-center justify-center">
                         <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading timesheet details for selected period...
                      </div>
                  )}
                  {(employees || []).length === 0 && !isLoading && (
                      <div className="text-center text-gray-400 py-10">No active employees found. Please add employees first.</div>
                  )}
                  {!selectedApprovedPeriodKey && (employees || []).length > 0 && !isLoading && (
                      <div className="text-center text-gray-400 py-10">Please select an approved timesheet period to proceed.</div>
                  )}
                  {selectedApprovedPeriodKey && (employees || []).length > 0 && !isLoading && (
                      <div className="overflow-x-auto mb-6 border border-white/20 rounded-lg">
                      <Table>
                          <TableHeader className="bg-white/10">
                              <TableRow>
                                  <TableHead className="text-white border-r border-white/20 min-w-[150px]">Employee</TableHead>
                                  <TableHead className="text-white border-r border-white/20 min-w-[100px]">Bank Code</TableHead>
                                  <TableHead className="text-white border-r border-white/20 min-w-[120px]">Account #</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[80px]">Wage</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[90px]">Total Hours</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[90px]">Normal Hours</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[90px]">O/T Hrs</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[100px]">Meal Allow.</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[100px]">Other Deduct.</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[80px]">FNPF</TableHead>
                                  <TableHead className="text-white border-r border-white/20 text-right min-w-[90px]">Gross Pay</TableHead>
                                  <TableHead className="text-white text-right min-w-[90px]">Net Pay</TableHead>
                              </TableRow>
                          </TableHeader>
                           <TableBody>
                             {(employees || []).map(employee => {
                                  const inputs = wageInputMap[employee.id];
                                  const calcDetails = calculatedWageMap[employee.id];
  
                                  if (!calcDetails || !inputs) {
                                      return (
                                          <TableRow key={employee.id} className="hover:bg-white/10">
                                              <TableCell colSpan={12} className="text-center text-gray-400">Loading data...</TableCell>
                                          </TableRow>
                                      );
                                  }
  
                                  const displayWage = calcDetails.hourlyWage.toFixed(2);
                                  const displayFNPFDeduct = employee.fnpfEligible ? `$${calcDetails.fnpfDeduction.toFixed(2)}` : 'N/A';
                                  const displayGrossPay = `$${calcDetails.grossPay.toFixed(2)}`;
                                  const displayNetPay = `$${calcDetails.netPay.toFixed(2)}`;
                                  const displayBankCode = employee.paymentMethod === 'online' ? (employee.bankCode || 'N/A') : 'Cash';
                                  const displayAccountNum = employee.paymentMethod === 'online' ? (employee.bankAccountNumber || 'N/A') : 'N/A';
  
                                  const displayTotalHours = inputs.totalHours.toFixed(2);
                                  const displayNormalHours = inputs.hoursWorked.toFixed(2);
                                  const displayOvertimeHours = inputs.overtimeHours.toFixed(2);
                                  const displayMealAllowance = `$${inputs.mealAllowance.toFixed(2)}`;
                                  
                                  const parts = selectedApprovedPeriodKey.split('_');
                                  const branchFilter = parts.length > 2 ? parts[2] : null; // 'merged', 'labasa', or 'suva'
  
                                  if (branchFilter && branchFilter !== 'merged' && employee.branch !== branchFilter) {
                                      return null; // Skip rendering if employee not in selected branch (unless merged)
                                  }
                                   // Only render if there are hours, or meal allowance, or other deductions (even if zero)
                                  if (inputs.totalHours === 0 && inputs.mealAllowance === 0 && (inputs.otherDeductions === '' || parseFloat(inputs.otherDeductions) === 0)) {
                                    return null;
                                  }
  
                                  return (
                                      <TableRow key={employee.id} className="hover:bg-white/10">
                                          <TableCell className="text-white border-r border-white/20">{employee.name}</TableCell>
                                          <TableCell className="text-white border-r border-white/20">{displayBankCode}</TableCell>
                                          <TableCell className="text-white border-r border-white/20">{displayAccountNum}</TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">${displayWage}</TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">
                                             <Input type="text" value={displayTotalHours} readOnly className="w-20 p-1 text-sm border rounded text-gray-900 bg-gray-300 text-right cursor-not-allowed" />
                                          </TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">
                                            <Input type="text" value={displayNormalHours} readOnly className="w-20 p-1 text-sm border rounded text-gray-900 bg-gray-300 text-right cursor-not-allowed" />
                                          </TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">
                                            <Input type="text" value={displayOvertimeHours} readOnly className="w-20 p-1 text-sm border rounded text-gray-900 bg-gray-300 text-right cursor-not-allowed" />
                                          </TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">
                                            <Input type="text" value={displayMealAllowance.replace('$', '')} readOnly className="w-20 p-1 text-sm border rounded text-gray-900 bg-gray-300 text-right cursor-not-allowed" />
                                          </TableCell>
                                          <TableCell className="border-r border-white/20">
                                              <Input
                                                   type="text"
                                                   placeholder="Amt"
                                                   value={inputs.otherDeductions || ''}
                                                   onChange={e => handleOtherDeductionsChange(employee.id, e.target.value)}
                                                   className="w-20 p-1 text-sm border rounded text-gray-900 bg-white/90 text-right"
                                                   inputMode="decimal"
                                                   disabled={isProcessing}
                                              />
                                          </TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">{displayFNPFDeduct}</TableCell>
                                          <TableCell className="text-white border-r border-white/20 text-right">{displayGrossPay}</TableCell>
                                          <TableCell className="text-white font-medium text-right">{displayNetPay}</TableCell>
                                      </TableRow>
                                  );
                              }).filter(Boolean)}
                             <TableRow className="font-bold bg-white/15 border-t-2 border-white/30">
                               <TableCell colSpan={4} className="text-right text-white pr-4 border-r border-white/20">Totals:</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">{totalTotalHoursState.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">{totalHoursWorkedState.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">{totalOvertimeHoursState.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${totalMealAllowanceState.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${totalOtherDeductionsState.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${totalFnpfDeductionState.toFixed(2)}</TableCell>
                               <TableCell className="text-white border-r border-white/20 text-right">${totalGrossPayState.toFixed(2)}</TableCell>
                               <TableCell className="text-white text-right">${totalNetPayState.toFixed(2)}</TableCell>
                             </TableRow>
                          </TableBody>
                      </Table>
                      </div>
                  )}
  
                  {generatedApprovalLink && (
                      <div className="mt-6 p-4 border border-green-600 rounded-xl bg-green-900/40 text-white">
                          <p className="text-md font-semibold mb-2 text-green-300">Final Wage Approval link generated successfully:</p>
                          <div className="flex items-center gap-3">
                               <Input type="text" value={generatedApprovalLink} readOnly className="flex-grow bg-gray-700 border-gray-600 text-white h-10 text-sm"/>
                               <Button size="md" onClick={() => copyToClipboard(generatedApprovalLink)} variant="secondary" className="text-white hover:bg-green-600 bg-green-700/80 border-green-500 transition-colors">
                                   <Send className="mr-2 h-4 w-4"/> Copy Link
                               </Button>
                           </div>
                          <p className="text-sm mt-3 text-gray-400">Please copy this link and send it to the administrator for final approval.</p>
                      </div>
                  )}
  
                  <div className="flex flex-wrap justify-center gap-4 mt-8">
                    <Button
                        variant="gradient" size="lg" onClick={handleRequestFinalWageApproval}
                        disabled={isProcessing || !selectedApprovedPeriodKey || isLoading}
                        className="min-w-[250px] text-base py-3"
                     >
                      {isProcessing ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Requesting Final Approval...</> : <><Send className="mr-2 h-5 w-5" /> Request Final Wage Approval</>}
                    </Button>
                  </div>
  
                   <div className="mt-8 pt-6 border-t border-white/20 text-center space-y-2">
                     <div className="text-lg text-gray-300">Total Suva Branch Wages: <span className="font-semibold text-white">${totalSuvaWagesState.toFixed(2)}</span></div>
                     <div className="text-lg text-gray-300">Total Labasa Branch Wages: <span className="font-semibold text-white">${totalLabasaWagesState.toFixed(2)}</span></div>
                     <div className="text-lg text-gray-300">Total Online Wages: <span className="font-semibold text-white">${totalOnlineWagesState.toFixed(2)}</span></div>
                     <div className="text-lg text-gray-300">Total Cash Wages: <span className="font-semibold text-white">${totalCashWagesState.toFixed(2)}</span></div>
                   </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default CreateWagesPage;

    