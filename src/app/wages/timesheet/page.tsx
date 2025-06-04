
'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
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
  const dayOfWeek = getDay(d);
  const diffToThursday = dayOfWeek >= 4 ? dayOfWeek - 4 : dayOfWeek + 3;
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

const DAILY_NORMAL_HOURS_THRESHOLD = 8;

const TimesheetFormContent = () => {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [formData, setFormData] = useState<DailyEntryFormData>(initialFormData);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [processedUrlEditParams, setProcessedUrlEditParams] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);

  const isPriyanka = currentUser === 'Priyanka Sharma';

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
      const fetchedEmployees = await getEmployees(false);
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

  const resetFormFieldsForNewEntry = useCallback((keepSelections = false) => {
    setFormData(prev => ({
      ...initialFormData,
      branch: keepSelections ? prev.branch : (isPriyanka ? 'suva' : null),
      employeeId: keepSelections ? prev.employeeId : null,
      date: keepSelections ? prev.date : undefined,
    }));
    setExistingEntryId(null);
  }, [isPriyanka]);

  useEffect(() => {
    const { editMode, employeeIdParam, entryDateParam, recordIdParam, branchParam,
            isPresentParam, isAbsentParam, timeInParam, lunchInParam, lunchOutParam,
            timeOutParam, mealAllowanceParam, overtimeReasonParam } = stableSearchParams;

    if (authCheckLoading || isLoadingEmployees || !allEmployees.length) return;

    const loadEntry = async () => {
      if (editMode && employeeIdParam && entryDateParam && recordIdParam && !processedUrlEditParams) {
        const parsedDate = parseISO(entryDateParam);
        if (isValid(parsedDate)) {
          const employeeExists = allEmployees.some(emp => emp.id === employeeIdParam);
          if (employeeExists) {
            setIsLoadingEntry(true);
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
            setIsLoadingEntry(false);
          } else {
            toast({ title: 'Error', description: 'Employee from URL not found.', variant: 'destructive' });
            router.replace('/wages/timesheet');
          }
        } else {
          toast({ title: 'Error', description: 'Invalid date in URL.', variant: 'destructive' });
          router.replace('/wages/timesheet');
        }
        return;
      }

      if (formData.employeeId && formData.date && isValid(formData.date)) {
        const selectedDateStr = format(formData.date, 'yyyy-MM-dd');
        setIsLoadingEntry(true);
        try {
          const entry = await getDailyTimesheetEntry(formData.employeeId, selectedDateStr);
          if (entry) {
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
            if (existingEntryId !== null) { 
                resetFormFieldsForNewEntry(true);
            }
          }
        } catch (error: any) {
          toast({ title: 'Error loading entry', description: error.message, variant: 'destructive' });
          resetFormFieldsForNewEntry(true);
        } finally {
          setIsLoadingEntry(false);
        }
      } else {
        if (existingEntryId !== null || formData.isPresent || formData.isAbsent || formData.timeIn ) { 
            resetFormFieldsForNewEntry(true); 
        }
      }
    };
    
    loadEntry();

  }, [
    formData.employeeId, 
    formData.date, 
    authCheckLoading, 
    isLoadingEmployees,
    allEmployees, 
    stableSearchParams, 
    processedUrlEditParams, 
    isPriyanka, 
    toast, 
    router, 
    resetFormFieldsForNewEntry,
    existingEntryId 
  ]);

  const employeesInSelectedBranch = useMemo(() => {
    if (!formData.branch) return [];
    return allEmployees.filter(emp => emp.branch === formData.branch && emp.isActive);
  }, [allEmployees, formData.branch]);

  const handleBranchChange = (value: 'labasa' | 'suva') => {
    setFormData(prev => ({
      ...initialFormData,
      branch: value,
      date: prev.date,
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
        timeIn: null,
        lunchIn: null,
        lunchOut: null,
        timeOut: null,
        mealAllowance: '',
        overtimeReason: '',
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
    let timeInDateObj: Date | null = null;
    let timeOutDateObj: Date | null = null;
    let lunchInDateObj: Date | null = null;
    let lunchOutDateObj: Date | null = null;

    if (formData.isPresent) {
      if (!formData.timeIn) {
        toast({ title: 'Validation Error', description: 'Time In is required if employee is present.', variant: 'destructive' }); return;
      }
      timeInDateObj = parseTimeToDate(formData.timeIn, formData.date);
      if (!timeInDateObj) {
          toast({ title: 'Validation Error', description: 'Invalid Time In format (HH:MM).', variant: 'destructive' }); return;
      }

      if (formData.timeOut) {
        timeOutDateObj = parseTimeToDate(formData.timeOut, formData.date);
        if (!timeOutDateObj) {
            toast({ title: 'Validation Error', description: 'Invalid Time Out format (HH:MM).', variant: 'destructive' }); return;
        }
        if (!formData.lunchIn || !formData.lunchOut) {
          toast({ title: 'Validation Error', description: 'Lunch In and Lunch Out are required if Time Out is entered.', variant: 'destructive' }); return;
        }
        lunchInDateObj = parseTimeToDate(formData.lunchIn, formData.date);
        lunchOutDateObj = parseTimeToDate(formData.lunchOut, formData.date);

        if (!lunchInDateObj || !lunchOutDateObj) {
          toast({ title: 'Validation Error', description: 'Invalid Lunch In or Lunch Out format (HH:MM).', variant: 'destructive' }); return;
        }
        if (timeOutDateObj <= timeInDateObj) {
          toast({ title: 'Validation Error', description: 'Time Out must be after Time In.', variant: 'destructive' }); return;
        }
        if (lunchOutDateObj <= lunchInDateObj) {
          toast({ title: 'Validation Error', description: 'Lunch Out must be after Lunch In.', variant: 'destructive' }); return;
        }
        if (lunchInDateObj < timeInDateObj || lunchOutDateObj > timeOutDateObj) {
          toast({ title: 'Validation Error', description: 'Lunch period must be within work hours.', variant: 'destructive' }); return;
        }
        
        const lunchDurationMinutes = (lunchOutDateObj.getTime() - lunchInDateObj.getTime()) / (1000 * 60);
        const grossWorkDurationMinutes = (timeOutDateObj.getTime() - timeInDateObj.getTime()) / (1000 * 60);

        if (grossWorkDurationMinutes < lunchDurationMinutes) {
            toast({ title: 'Validation Error', description: 'Lunch duration cannot exceed work duration.', variant: 'destructive' }); return;
        }
        const netWorkDurationMinutes = grossWorkDurationMinutes - lunchDurationMinutes;
        const netWorkHours = Math.max(0, netWorkDurationMinutes / 60);

        calculatedNormalHours = Math.min(netWorkHours, DAILY_NORMAL_HOURS_THRESHOLD);
        calculatedOvertimeHours = Math.max(0, netWorkHours - DAILY_NORMAL_HOURS_THRESHOLD);

      } else {
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
      await saveDailyTimesheetEntry(entryToSave);
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
        if(formData.employeeId && formData.date) {
          setIsLoadingEntry(true);
          const updatedEntry = await getDailyTimesheetEntry(formData.employeeId, format(formData.date, 'yyyy-MM-dd'));
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
          setIsLoadingEntry(false);
        }
      }
      
      if (stableSearchParams.editMode && stableSearchParams.recordIdParam) {
        router.replace('/wages/timesheet', undefined);
        setProcessedUrlEditParams(false); 
      }

    } catch (error: any) {
        console.error(`Error ${existingEntryId ? 'updating' : 'saving'} daily timesheet entry:`, error.stack);
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
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
      </div>
    );
  }

  let pageTitleText = isPriyanka ? 'Suva Branch Daily Timesheet Entry' : 'Daily Time Sheet Entry';
  if (existingEntryId && stableSearchParams.editMode) {
    pageTitleText = `Edit ${isPriyanka ? 'Suva Branch ' : ''}Daily Timesheet Entry`;
  }
  const backLinkPath = isPriyanka ? '/dashboard' : (stableSearchParams.editMode ? '/wages/timesheet-records' : '/wages');
  const saveButtonText = existingEntryId ? 'Update Daily Entry' : 'Save Daily Entry';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow min-h-screen text-white font-sans">
        <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
          <Link href={backLinkPath} passHref className="ml-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
            {pageTitleText}
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
                  <div className="space-y-2">
                      <Label className="text-white font-semibold">Select Branch</Label>
                      <RadioGroup
                          onValueChange={handleBranchChange}
                          value={formData.branch || ''}
                          className="grid grid-cols-2 gap-4"
                          disabled={isSaving || isPriyanka || isLoadingEntry}
                      >
                          <div className="flex items-center space-x-2">
                              <RadioGroupItem value="labasa" id="r-branch-labasa" className="border-white text-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" />
                              <Label htmlFor="r-branch-labasa" className="text-white cursor-pointer">Labasa Branch</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                              <RadioGroupItem value="suva" id="r-branch-suva" className="border-white text-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" />
                              <Label htmlFor="r-branch-suva" className="text-white cursor-pointer">Suva Branch</Label>
                          </div>
                      </RadioGroup>
                  </div>

                  {formData.branch && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                      <div>
                          <Label htmlFor="employee-select" className="text-white">Select Employee</Label>
                          <Select onValueChange={handleEmployeeSelect} value={formData.employeeId || ''} disabled={isSaving || isLoadingEmployees || employeesInSelectedBranch.length === 0 || isLoadingEntry}>
                              <SelectTrigger id="employee-select" className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1">
                                  <SelectValue placeholder={employeesInSelectedBranch.length === 0 ? 'No employees in branch' : 'Choose an employee'} />
                              </SelectTrigger>
                              <SelectContent className="bg-gray-800 border-gray-700 text-white">
                                  <SelectGroup>
                                      <SelectLabel className="text-gray-300">Employees ({formData.branch})</SelectLabel>
                                      {employeesInSelectedBranch.map(emp => (
                                          <SelectItem key={emp.id} value={emp.id} className="hover:bg-gray-700 focus:bg-gray-700">
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
                                  'w-full justify-start text-left font-normal text-white bg-white/10 border-white/20 hover:bg-white/20 mt-1',
                                  !formData.date && 'text-gray-400'
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
                              <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700 text-white" align="start">
                              <Calendar
                                  initialFocus
                                  mode="single"
                                  selected={formData.date}
                                  onSelect={handleDateSelect}
                                  numberOfMonths={1}
                                  disabled={(date) => date > new Date() || date < addDays(new Date(), -90)}
                                  className="[&_button]:text-white [&_button:hover]:bg-gray-700 [&_button[aria-selected]]:bg-primary [&_button[aria-selected]:hover]:bg-primary/90 [&_div[role=rowgroup]]:text-white [&_div[role=gridcell][aria-selected]]:text-primary-foreground"
                              />
                              </PopoverContent>
                          </Popover>
                      </div>
                  </div>
                  )}

                  {isLoadingEntry && formData.employeeId && formData.date && (
                      <div className="text-center text-white py-4 flex items-center justify-center">
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading entry details...
                      </div>
                  )}

                  {formData.branch && formData.employeeId && formData.date && !isLoadingEntry && (
                      <div className="space-y-4 pt-4 border-t border-white/20">
                          <div className="flex items-center space-x-6">
                             <div className="flex items-center space-x-2">
                                 <Checkbox
                                     id="isPresent"
                                     checked={formData.isPresent}
                                     onCheckedChange={(checked) => handleCheckboxChange('isPresent', checked)}
                                     className="border-white data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                     disabled={isSaving}
                                 />
                                 <Label htmlFor="isPresent" className="text-white cursor-pointer">Present</Label>
                             </div>
                             <div className="flex items-center space-x-2">
                                 <Checkbox
                                     id="isAbsent"
                                     checked={formData.isAbsent}
                                     onCheckedChange={(checked) => handleCheckboxChange('isAbsent', checked)}
                                     className="border-white data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
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
                                  <Input id="lunchOut" type="time" value={formData.lunchOut || ''} onChange={e => handleTimeInputChange('lunchOut', e.target.value)} className="bg-white/10 text-white placeholder-gray-400 border-white/20 mt-1" disabled={isSaving || !formData.isPresent || !formData.timeIn || !formData.lunchIn } />
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
                              <Label htmlFor="overtime-reason" className="text-white">Reason for Overtime (if any)</Label>
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
                                  disabled={isSaving || isLoadingEmployees || isLoadingEntry || !formData.branch || !formData.employeeId || !formData.date || (!formData.isPresent && !formData.isAbsent)}
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
      </div>
    </div>
  );
};

const LoadingFallback = () => (
  <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
    <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
    <p className="ml-4 text-white text-lg">Loading Timesheet...</p>
  </div>
);

const TimeSheetPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TimesheetFormContent />
    </Suspense>
  );
};

export default TimeSheetPage;
