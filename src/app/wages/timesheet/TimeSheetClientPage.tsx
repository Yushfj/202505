
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, CalendarIcon, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format, isValid, getDay, addDays, startOfWeek, endOfWeek, parseISO, parse } from 'date-fns';
import { getEmployees, saveDailyTimesheetEntry, getDailyTimesheetEntry, type Employee, type DailyTimesheetEntryData, type DailyTimesheetRecord } from '@/services/employee-service';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';

interface DailyEntryFormData {
  branch: 'labasa' | 'suva' | null;
  employeeId: string | null;
  date: Date | undefined;
  isPresent: boolean;
  isAbsent: boolean;
  timeIn: string | null;
  lunchIn: string | null;
  lunchOut: string | null;
  timeOut: string | null;
  mealAllowance: string;
  overtimeReason: string;
}

const initialFormData: DailyEntryFormData = {
  branch: null,
  employeeId: null,
  date: undefined,
  isPresent: false,
  isAbsent: false,
  timeIn: null,
  lunchIn: null,
  lunchOut: null,
  timeOut: null,
  mealAllowance: '',
  overtimeReason: '',
};

const getThursdayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = getDay(d); // Sunday is 0, Thursday is 4
  const diffToThursday = dayOfWeek >= 4 ? dayOfWeek - 4 : dayOfWeek + 3; // Sunday (0) + 3 = Wed, Mon(1)+3=Thu, Tue(2)+3=Fri, Wed(3)+3=Sat
  return addDays(d, -diffToThursday);
};


const parseTimeToDate = (timeString: string | null, referenceDate: Date): Date | null => {
    if (!timeString) return null;
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    const date = new Date(referenceDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
};

const TimeSheetClientPage = () => {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams(); // This is safe here
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [formData, setFormData] = useState<DailyEntryFormData>(initialFormData);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [processedUrlEditParams, setProcessedUrlEditParams] = useState(false);

  const isPriyanka = currentUser === 'Priyanka Sharma';

  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
      router.replace('/');
    } else {
      setCurrentUser(storedUser);
      setAuthCheckLoading(false);
      if (storedUser === 'Priyanka Sharma' && formData.branch !== 'suva') {
        setFormData(prev => ({ ...prev, branch: 'suva', employeeId: null }));
      }
    }
  }, [router, formData.branch]);


  const fetchEmployeesCallback = useCallback(async () => {
    if (authCheckLoading) return;
    setIsLoadingEmployees(true);
    try {
      const fetchedEmployees = await getEmployees(false); // Fetch only active
      setAllEmployees(fetchedEmployees);
    } catch (error: any) {
      toast({
        title: 'Error Loading Employees',
        description: error.message || 'Failed to load employee data.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [toast, authCheckLoading]);

  useEffect(() => {
    fetchEmployeesCallback();
  }, [fetchEmployeesCallback]);
  
  const stableSearchParams = useMemo(() => {
    return {
      editMode: searchParams.get('editMode') === 'true',
      employeeIdParam: searchParams.get('employeeId'),
      entryDateParam: searchParams.get('entryDate'),
      recordIdParam: searchParams.get('recordId'),
      branchParam: searchParams.get('branch') as 'labasa' | 'suva' | null,
      isPresentParam: searchParams.get('isPresent') === 'true',
      isAbsentParam: searchParams.get('isAbsent') === 'true',
      timeInParam: searchParams.get('timeIn') || null,
      lunchInParam: searchParams.get('lunchIn') || null,
      lunchOutParam: searchParams.get('lunchOut') || null,
      timeOutParam: searchParams.get('timeOut') || null,
      mealAllowanceParam: searchParams.get('mealAllowance') || '',
      overtimeReasonParam: searchParams.get('overtimeReason') || '',
    };
  }, [searchParams]);

  const selectedEmployeeId = formData.employeeId;
  const selectedDateStr = formData.date && isValid(formData.date) ? format(formData.date, 'yyyy-MM-dd') : undefined;

  const resetFormFieldsForNewEntry = useCallback((keepSelections = false) => {
    setFormData(prev => ({
      ...initialFormData,
      branch: keepSelections ? prev.branch : (isPriyanka ? 'suva' : null),
      employeeId: keepSelections ? prev.employeeId : null,
      date: keepSelections ? prev.date : undefined,
    }));
    setExistingEntryId(null);
  }, [isPriyanka]);


  // Effect for processing URL parameters for edit mode
  useEffect(() => {
    if (authCheckLoading || isLoadingEmployees || !allEmployees.length || processedUrlEditParams) {
      return;
    }
    const {
      editMode, employeeIdParam, entryDateParam, recordIdParam, branchParam,
      isPresentParam, isAbsentParam, timeInParam, lunchInParam, lunchOutParam,
      timeOutParam, mealAllowanceParam, overtimeReasonParam
    } = stableSearchParams;

    if (editMode && employeeIdParam && entryDateParam && recordIdParam) {
      const parsedDate = parseISO(entryDateParam);
      if (isValid(parsedDate)) {
        const employeeExists = allEmployees.some(emp => emp.id === employeeIdParam);
        if (employeeExists) {
          setFormData({
            branch: isPriyanka ? 'suva' : (branchParam || null),
            employeeId: employeeIdParam,
            date: parsedDate,
            isPresent: isPresentParam,
            isAbsent: isAbsentParam,
            timeIn: timeInParam,
            lunchIn: lunchInParam,
            lunchOut: lunchOutParam,
            timeOut: timeOutParam,
            mealAllowance: mealAllowanceParam,
            overtimeReason: overtimeReasonParam,
          });
          setExistingEntryId(recordIdParam);
          setProcessedUrlEditParams(true);
        } else {
          toast({ title: 'Error', description: 'Employee from URL not found.', variant: 'destructive' });
          router.replace('/wages/timesheet');
        }
      } else {
        toast({ title: 'Error', description: 'Invalid date in URL.', variant: 'destructive' });
        router.replace('/wages/timesheet');
      }
    }
  }, [
    authCheckLoading, isLoadingEmployees, allEmployees, stableSearchParams, 
    processedUrlEditParams, isPriyanka, toast, router
  ]);


  // Effect for loading entry from DB or resetting form based on selections
  useEffect(() => {
    let isMounted = true;
    if (authCheckLoading || isLoadingEmployees) return;

    // If we are in edit mode and haven't processed URL params yet, wait.
    if (stableSearchParams.editMode && !processedUrlEditParams) {
      return;
    }

    const loadEntry = async () => {
      if (!selectedEmployeeId || !selectedDateStr) {
        // Only reset if there was an existing entry context or if it's not the initial load after URL processing
        if (existingEntryId || (!stableSearchParams.editMode && !processedUrlEditParams)) { 
            resetFormFieldsForNewEntry(true);
        }
        return;
      }
      
      if (!isMounted) return;
      setIsLoadingEntry(true);
      
      try {
        const entry = await getDailyTimesheetEntry(selectedEmployeeId, selectedDateStr);
        if (!isMounted) return;

        if (entry) {
          // Only update if fetched data is different
          const newFormState = {
            branch: entry.branch,
            employeeId: entry.employeeId,
            date: parseISO(entry.entryDate),
            isPresent: entry.isPresent,
            isAbsent: entry.isAbsent,
            timeIn: entry.timeIn || null,
            lunchIn: entry.lunchIn || null,
            lunchOut: entry.lunchOut || null,
            timeOut: entry.timeOut || null,
            mealAllowance: entry.mealAllowance?.toString() || '',
            overtimeReason: entry.overtimeReason || '',
          };

          if (JSON.stringify(newFormState) !== JSON.stringify(formData) || existingEntryId !== entry.id) {
            setFormData(newFormState);
            setExistingEntryId(entry.id);
          }
        } else {
          if (existingEntryId || formData.timeIn || formData.isPresent || formData.isAbsent) { // Only reset if there was something to clear
            resetFormFieldsForNewEntry(true);
          }
        }
      } catch (error: any) {
        if (!isMounted) return;
        toast({ title: 'Error loading entry', description: error.message, variant: 'destructive' });
        resetFormFieldsForNewEntry(true);
      } finally {
        if (isMounted) setIsLoadingEntry(false);
      }
    };

    loadEntry();
    
    return () => { isMounted = false; };

  }, [
    selectedEmployeeId, selectedDateStr, authCheckLoading, isLoadingEmployees,
    stableSearchParams.editMode, processedUrlEditParams, // Ensure effect reacts to these flags
    resetFormFieldsForNewEntry, toast // stable dependencies from useCallback
    // DO NOT add formData or existingEntryId here to prevent loops
  ]);


  const employeesInSelectedBranch = useMemo(() => {
    if (!formData.branch) return [];
    return allEmployees.filter(emp => emp.branch === formData.branch && emp.isActive);
  }, [allEmployees, formData.branch]);

  const handleBranchChange = (value: 'labasa' | 'suva') => {
    setFormData(prev => ({
      ...initialFormData, 
      branch: value,
      date: prev.date, // Keep date if already selected
    }));
    setExistingEntryId(null);
    setProcessedUrlEditParams(false); 
    if (stableSearchParams.editMode) router.replace('/wages/timesheet', undefined); 
  };

  const handleInputChange = (field: 'mealAllowance' | 'overtimeReason', value: string) => {
    let validatedValue = value;
    if (field === 'mealAllowance') {
      validatedValue = value.replace(/[^0-9.]/g, '');
      const parts = validatedValue.split('.');
      if (parts.length > 2) {
        validatedValue = parts[0] + '.' + parts.slice(1).join('');
      }
      if (parts[1] && parts[1].length > 2) {
        validatedValue = parts[0] + '.' + parts[1].substring(0, 2);
      }
    }
    setFormData(prev => ({ ...prev, [field]: validatedValue }));
  };

  const handleTimeInputChange = (field: 'timeIn' | 'lunchIn' | 'lunchOut' | 'timeOut', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value === '' ? null : value }));
  };
  
  const handleCheckboxChange = (field: 'isPresent' | 'isAbsent', checked: boolean | string) => {
    const isChecked = Boolean(checked);
    if (field === 'isPresent' && isChecked) {
      setFormData(prev => ({ ...prev, isPresent: true, isAbsent: false }));
    } else if (field === 'isAbsent' && isChecked) {
      setFormData(prev => ({
        ...prev,
        isPresent: false,
        isAbsent: true,
        timeIn: null, lunchIn: null, lunchOut: null, timeOut: null, // Clear time fields
        mealAllowance: '', overtimeReason: '', // Clear other fields
      }));
    } else { 
      setFormData(prev => ({ ...prev, [field]: isChecked }));
    }
  };

  const handleEmployeeSelect = (employeeIdValue: string) => {
    setFormData(prev => ({ 
        ...initialFormData, 
        branch: prev.branch, 
        date: prev.date, 
        employeeId: employeeIdValue 
    }));
    setExistingEntryId(null);
    setProcessedUrlEditParams(false);
    if (stableSearchParams.editMode) router.replace('/wages/timesheet', undefined);
  };

  const handleDateSelect = (dateValue: Date | undefined) => {
     setFormData(prev => ({ 
         ...initialFormData, 
         branch: prev.branch, 
         employeeId: prev.employeeId, 
         date: dateValue 
    }));
    setExistingEntryId(null);
    setProcessedUrlEditParams(false);
    if (stableSearchParams.editMode) router.replace('/wages/timesheet', undefined);
  };

  const handleSaveDailyEntry = async () => {
    if (!formData.branch || !formData.employeeId || !formData.date || !isValid(formData.date)) {
      toast({ title: 'Error', description: 'Branch, Employee, and a valid Date are required.', variant: 'destructive' }); return;
    }
    if (!formData.isPresent && !formData.isAbsent) {
      toast({ title: 'Validation Error', description: 'Mark employee as Present or Absent.', variant: 'destructive' }); return;
    }

    let calculatedNormalHours = 0;
    let calculatedOvertimeHours = 0;

    if (formData.isPresent) {
      if (!formData.timeIn) {
        toast({ title: 'Validation Error', description: 'Time In is required if employee is present.', variant: 'destructive' }); return;
      }
      const timeInDateObj = parseTimeToDate(formData.timeIn, formData.date);
      if (!timeInDateObj) {
          toast({ title: 'Validation Error', description: 'Invalid Time In format (HH:MM).', variant: 'destructive' }); return;
      }

      if (formData.timeOut) { // If time out is present, lunch in/out are also mandatory
        if (!formData.lunchIn || !formData.lunchOut) {
          toast({ title: 'Validation Error', description: 'Lunch In and Lunch Out are required if Time Out is entered.', variant: 'destructive' }); return;
        }
        const timeOutDateObj = parseTimeToDate(formData.timeOut, formData.date);
        const lunchInDateObj = parseTimeToDate(formData.lunchIn, formData.date);
        const lunchOutDateObj = parseTimeToDate(formData.lunchOut, formData.date);

        if (!timeOutDateObj || !lunchInDateObj || !lunchOutDateObj) {
          toast({ title: 'Validation Error', description: 'Invalid Time Out, Lunch In, or Lunch Out format (HH:MM).', variant: 'destructive' }); return;
        }
        if (timeOutDateObj <= timeInDateObj) {
          toast({ title: 'Validation Error', description: 'Time Out must be after Time In.', variant: 'destructive' }); return;
        }
        if (lunchOutDateObj <= lunchInDateObj) {
          toast({ title: 'Validation Error', description: 'Lunch Out must be after Lunch In.', variant: 'destructive' }); return;
        }
        if (lunchInDateObj < timeInDateObj || lunchOutDateObj > timeOutDateObj || lunchInDateObj >= lunchOutDateObj) {
          toast({ title: 'Validation Error', description: 'Lunch period must be valid and within work hours.', variant: 'destructive' }); return;
        }
        
        const lunchDurationMinutes = (lunchOutDateObj.getTime() - lunchInDateObj.getTime()) / (1000 * 60);
        const grossWorkDurationMinutes = (timeOutDateObj.getTime() - timeInDateObj.getTime()) / (1000 * 60);

        if (grossWorkDurationMinutes < lunchDurationMinutes) {
            toast({ title: 'Validation Error', description: 'Lunch duration cannot exceed work duration.', variant: 'destructive' }); return;
        }
        const netWorkDurationHours = Math.max(0, (grossWorkDurationMinutes - lunchDurationMinutes) / 60);
        
        calculatedNormalHours = Math.min(netWorkDurationHours, 8);
        calculatedOvertimeHours = Math.max(0, netWorkDurationHours - 8);

      } else { 
        // If only Time In is present, or Time In + partial lunch, no hours are calculated yet
        calculatedNormalHours = 0;
        calculatedOvertimeHours = 0;
      }
      const mealAllowanceNum = parseFloat(formData.mealAllowance || '0');
      if (formData.mealAllowance.trim() && (isNaN(mealAllowanceNum) || mealAllowanceNum < 0)) {
         toast({ title: 'Validation Error', description: 'Meal allowance must be a non-negative number if entered.', variant: 'destructive' }); return;
      }
    }

    setIsSaving(true);
    const entryToSave: DailyTimesheetEntryData = {
      id: existingEntryId || undefined,
      branch: formData.branch!,
      employeeId: formData.employeeId!,
      date: format(formData.date!, 'yyyy-MM-dd'),
      isPresent: formData.isPresent,
      isAbsent: formData.isAbsent,
      timeIn: formData.isPresent ? formData.timeIn : null,
      lunchIn: formData.isPresent && formData.timeIn ? formData.lunchIn : null,
      lunchOut: formData.isPresent && formData.timeIn ? formData.lunchOut : null,
      timeOut: formData.isPresent && formData.timeIn ? formData.timeOut : null,
      normalHours: formData.isPresent ? calculatedNormalHours : 0,
      overtimeHours: formData.isPresent ? calculatedOvertimeHours : 0, 
      mealAllowance: formData.isPresent ? parseFloat(formData.mealAllowance || '0') : 0,
      overtimeReason: formData.isPresent ? (formData.overtimeReason.trim() || null) : null,
    };

    try {
      const savedEntryId = await saveDailyTimesheetEntry(entryToSave);
      toast({ title: `Timesheet Entry ${existingEntryId ? 'Updated' : 'Saved'}`, description: `Daily entry ${existingEntryId ? 'updated' : 'saved'} successfully.` });
      
      const currentEmployeeIndex = employeesInSelectedBranch.findIndex(emp => emp.id === formData.employeeId);
      if (!existingEntryId && currentEmployeeIndex !== -1 && currentEmployeeIndex < employeesInSelectedBranch.length - 1) {
          const nextEmployeeId = employeesInSelectedBranch[currentEmployeeIndex + 1].id;
          setFormData(prev => ({
              ...initialFormData,
              branch: prev.branch,
              date: prev.date,
              employeeId: nextEmployeeId,
          }));
          setExistingEntryId(null);
          setProcessedUrlEditParams(false); 
      } else {
          // Re-fetch current entry to reflect DB state, or reset if it was a new entry for the last employee
          const updatedEntry = await getDailyTimesheetEntry(formData.employeeId!, format(formData.date!, 'yyyy-MM-dd'));
          if (updatedEntry) {
              setFormData({
                branch: updatedEntry.branch,
                employeeId: updatedEntry.employeeId,
                date: parseISO(updatedEntry.entryDate),
                isPresent: updatedEntry.isPresent,
                isAbsent: updatedEntry.isAbsent,
                timeIn: updatedEntry.timeIn || null,
                lunchIn: updatedEntry.lunchIn || null,
                lunchOut: updatedEntry.lunchOut || null,
                timeOut: updatedEntry.timeOut || null,
                mealAllowance: updatedEntry.mealAllowance?.toString() || '',
                overtimeReason: updatedEntry.overtimeReason || '',
              });
              setExistingEntryId(updatedEntry.id);
          } else {
              resetFormFieldsForNewEntry(true);
          }
      }
      
      if (stableSearchParams.editMode && stableSearchParams.recordIdParam) {
        router.replace('/wages/timesheet', undefined); // Remove query params from URL
        setProcessedUrlEditParams(false); // Allow URL processing again if needed
      }

    } catch (error: any) {
        console.error(`Error ${existingEntryId ? 'updating' : 'saving'} daily timesheet entry:`, error);
        toast({
            title: `${existingEntryId ? 'Update' : 'Save'} Error`,
            description: error.message || `Failed to ${existingEntryId ? 'update' : 'save'} timesheet entry.`,
            variant: 'destructive'
        });
    } finally {
        setIsSaving(false);
    }
  };

  const selectedWeekStart = formData.date ? getThursdayOfWeek(formData.date) : null;
  const selectedWeekEnd = selectedWeekStart ? addDays(selectedWeekStart, 6) : null;

  if (authCheckLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black/70">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  const pageTitle = isPriyanka ? 'Suva Branch Daily Timesheet Entry' : 'Daily Time Sheet Entry';
  const backLinkPath = isPriyanka ? '/dashboard' : (stableSearchParams.editMode ? '/wages/timesheet-records' : '/wages');
  const saveButtonText = existingEntryId ? 'Update Daily Entry' : 'Save Daily Entry';

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
      <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
        <Link href={backLinkPath} passHref className="ml-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back</span>
          </Button>
        </Link>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
          {existingEntryId && stableSearchParams.editMode ? 'Edit ' : ''}{pageTitle}
        </h1>
        <Link href="/dashboard" passHref className="mr-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <Home className="h-5 w-5" />
            <span className="sr-only">Dashboard</span>
          </Button>
        </Link>
      </header>

      <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6">
        <Card className="w-full max-w-xl bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 p-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-center text-white mb-1">
              {existingEntryId && stableSearchParams.editMode ? 'Update Daily Work Details' : 'Enter Daily Work Details'}
            </CardTitle>
            {formData.date && isValid(formData.date) && selectedWeekStart && selectedWeekEnd && (
                <CardDescription className="text-center text-gray-300">
                    Selected Date: {format(formData.date, 'EEE, MMM dd, yyyy')} <br/>
                    (Timesheet Week: {format(selectedWeekStart, 'MMM dd')} - {format(selectedWeekEnd, 'MMM dd, yyyy')})
                </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingEmployees ? (
              <div className="text-center text-white py-10 flex items-center justify-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading employees...
              </div>
            ) : allEmployees.length === 0 ? (
              <div className="text-center text-gray-400 py-10">No active employees found.</div>
            ) : (
              <>
                {!isPriyanka && (
                  <div className="space-y-2">
                      <Label className="text-white font-semibold">Select Branch</Label>
                      <RadioGroup
                          onValueChange={handleBranchChange}
                          value={formData.branch || ''}
                          className="grid grid-cols-2 gap-4"
                          disabled={isSaving || isLoadingEntry}
                      >
                          <div className="flex items-center space-x-2">
                              <RadioGroupItem value="labasa" id="r-branch-labasa" className="border-white text-primary" />
                              <Label htmlFor="r-branch-labasa" className="text-white cursor-pointer">Labasa Branch</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                              <RadioGroupItem value="suva" id="r-branch-suva" className="border-white text-primary" />
                              <Label htmlFor="r-branch-suva" className="text-white cursor-pointer">Suva Branch</Label>
                          </div>
                      </RadioGroup>
                  </div>
                )}

                {formData.branch && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div>
                        <Label htmlFor="employee-select" className="text-white">Select Employee</Label>
                        <Select onValueChange={handleEmployeeSelect} value={formData.employeeId || ''} disabled={isSaving || isLoadingEntry || isLoadingEmployees || employeesInSelectedBranch.length === 0}>
                            <SelectTrigger id="employee-select" className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1">
                                <SelectValue placeholder={employeesInSelectedBranch.length === 0 ? 'No employees in branch' : 'Choose an employee'} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Employees ({formData.branch})</SelectLabel>
                                    {employeesInSelectedBranch.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            {emp.name}
                                        </SelectItem>
                                    ))}
                                    {employeesInSelectedBranch.length === 0 && (
                                        <SelectItem value="no-employees" disabled>No employees in this branch</SelectItem>
                                    )}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="entry-date" className="text-white">Select Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                            <Button
                                id="entry-date"
                                variant={'outline'}
                                className={cn(
                                'w-full justify-start text-left font-normal text-gray-900 bg-white hover:bg-gray-100 mt-1',
                                !formData.date && 'text-muted-foreground'
                                )}
                                disabled={isSaving || isLoadingEntry}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.date && isValid(formData.date) ? (
                                    format(formData.date, 'LLL dd, yyyy')
                                ) : (
                                <span>Pick a date</span>
                                )}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-white text-black" align="start">
                            <Calendar
                                initialFocus
                                mode="single"
                                selected={formData.date}
                                onSelect={handleDateSelect}
                                numberOfMonths={1}
                                disabled={(date) => date > new Date() || date < addDays(new Date(), -90)}
                            />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                )}
                
                {isLoadingEntry && formData.branch && formData.employeeId && formData.date && (
                     <div className="text-center text-white py-6 flex items-center justify-center">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading entry details...
                     </div>
                )}

                {!isLoadingEntry && formData.branch && formData.employeeId && formData.date && (
                    <div className="space-y-4 pt-4 border-t border-white/20">
                        <div className="flex items-center space-x-6">
                           <div className="flex items-center space-x-2">
                               <Checkbox
                                   id="isPresent"
                                   checked={formData.isPresent}
                                   onCheckedChange={(checked) => handleCheckboxChange('isPresent', checked)}
                                   className="border-white text-primary data-[state=checked]:bg-primary"
                                   disabled={isSaving}
                               />
                               <Label htmlFor="isPresent" className="text-white cursor-pointer">Present</Label>
                           </div>
                           <div className="flex items-center space-x-2">
                               <Checkbox
                                   id="isAbsent"
                                   checked={formData.isAbsent}
                                   onCheckedChange={(checked) => handleCheckboxChange('isAbsent', checked)}
                                   className="border-white text-primary data-[state=checked]:bg-primary"
                                   disabled={isSaving}
                               />
                               <Label htmlFor="isAbsent" className="text-white cursor-pointer">Absent</Label>
                           </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="timeIn" className="text-white">Time In</Label>
                                <Input id="timeIn" type="time" value={formData.timeIn || ''} onChange={e => handleTimeInputChange('timeIn', e.target.value)} className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1" disabled={isSaving || !formData.isPresent} />
                            </div>
                            <div>
                                <Label htmlFor="lunchIn" className="text-white">Lunch In</Label>
                                <Input id="lunchIn" type="time" value={formData.lunchIn || ''} onChange={e => handleTimeInputChange('lunchIn', e.target.value)} className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1" disabled={isSaving || !formData.isPresent || !formData.timeIn} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <Label htmlFor="lunchOut" className="text-white">Lunch Out</Label>
                                <Input id="lunchOut" type="time" value={formData.lunchOut || ''} onChange={e => handleTimeInputChange('lunchOut', e.target.value)} className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1" disabled={isSaving || !formData.isPresent || !formData.timeIn || !formData.lunchIn} />
                            </div>
                            <div>
                                <Label htmlFor="timeOut" className="text-white">Time Out</Label>
                                <Input id="timeOut" type="time" value={formData.timeOut || ''} onChange={e => handleTimeInputChange('timeOut', e.target.value)} className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1" disabled={isSaving || !formData.isPresent || !formData.timeIn || !formData.lunchIn || !formData.lunchOut} />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="meal-allowance" className="text-white">Meal Allowance ($)</Label>
                            <Input
                            id="meal-allowance"
                            type="text"
                            placeholder="e.g., 5.50"
                            value={formData.mealAllowance}
                            onChange={e => handleInputChange('mealAllowance', e.target.value)}
                            className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1"
                            inputMode="decimal"
                            disabled={isSaving || !formData.isPresent}
                            />
                        </div>
                        <div>
                            <Label htmlFor="overtime-reason" className="text-white">Reason for Overtime/Extra Work (if any)</Label>
                            <Textarea
                            id="overtime-reason"
                            placeholder="Describe reason..."
                            value={formData.overtimeReason}
                            onChange={e => handleInputChange('overtimeReason', e.target.value)}
                            className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1"
                            rows={3}
                            disabled={isSaving || !formData.isPresent}
                            />
                        </div>
                        <div className="flex justify-center mt-6">
                            <Button
                                variant="gradient"
                                size="lg"
                                onClick={handleSaveDailyEntry}
                                disabled={isSaving || isLoadingEmployees || !formData.branch || !formData.employeeId || !formData.date || (!formData.isPresent && !formData.isAbsent)}
                            >
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {saveButtonText}
                            </Button>
                        </div>
                    </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
       <footer className="w-full text-center py-4 text-xs text-white relative z-10 bg-black/30 backdrop-blur-sm mt-auto">
             © {new Date().getFullYear()} Aayush Atishay Lal 北京化工大学
       </footer>
    </div>
  );
};

export default TimeSheetClientPage;
