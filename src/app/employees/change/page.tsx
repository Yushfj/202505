
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import Image from 'next/image';
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {useRouter} from 'next/navigation';
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group';
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link";
import {ArrowLeft, Home, Loader2} from "lucide-react";
import { getEmployees, getEmployeeById, updateEmployee } from '@/services/employee-service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toTitleCase } from '@/lib/utils'; // Import the new utility

interface Employee {
  id: string;
  name: string;
  position: string;
  hourlyWage: string;
  fnpfNo: string | null;
  tinNo: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  paymentMethod: 'cash' | 'online';
  branch: 'labasa' | 'suva';
  fnpfEligible: boolean;
}

const ChangeEmployeeInfoPage = () => {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [updatePassword, setUpdatePassword] = useState('');
  const {toast} = useToast();
  const router = useRouter();
  const ADMIN_PASSWORD = 'admin01';
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
        router.replace('/');
    } else if (storedUser === 'Priyanka Sharma') {
        router.replace('/dashboard'); // Priyanka should not access this page
    } else {
        setCurrentUser(storedUser);
        setAuthCheckLoading(false);
    }
  }, [router]);


  const fetchAllEmployees = useCallback(async () => {
    setIsLoadingEmployees(true);
    try {
        const fetchedEmployees = await getEmployees();
        setAllEmployees(fetchedEmployees);
    } catch (error: any) {
        toast({
            title: 'Error Fetching Employees',
            description: error.message || 'Failed to load employee list.',
            variant: 'destructive',
        });
        setAllEmployees([]);
    } finally {
        setIsLoadingEmployees(false);
    }
  }, [toast]);

  useEffect(() => {
      if(!authCheckLoading) fetchAllEmployees();
  }, [fetchAllEmployees, authCheckLoading]);

  const fetchEmployeeDetails = useCallback(async (employeeId: string) => {
    if (!employeeId) return;
    setIsLoadingDetails(true);
    setEmployee(null);
    try {
        const foundEmployee = await getEmployeeById(employeeId);
        if (foundEmployee) {
            setEmployee({
                ...foundEmployee,
                name: toTitleCase(foundEmployee.name), // Format on load
                position: toTitleCase(foundEmployee.position), // Format on load
                hourlyWage: String(foundEmployee.hourlyWage || '0'),
                fnpfNo: foundEmployee.fnpfNo || '',
                tinNo: foundEmployee.tinNo || '',
                bankCode: foundEmployee.bankCode || '',
                bankAccountNumber: foundEmployee.bankAccountNumber || '',
            });
        } else {
            toast({ title: 'Error', description: 'Selected employee not found.', variant: 'destructive' });
            setSelectedEmployeeId(null);
        }
    } catch (error: any) {
        toast({
            title: 'Error Fetching Details',
            description: error.message || 'Failed to load employee details.',
            variant: 'destructive',
        });
         setSelectedEmployeeId(null);
    } finally {
        setIsLoadingDetails(false);
    }
  }, [toast]);

  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    fetchEmployeeDetails(employeeId);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    let formattedValue = value;
    if (id === 'name' || id === 'position') {
      formattedValue = toTitleCase(value);
    }
    setEmployee(prev => prev ? { ...prev, [id]: formattedValue } : null);
  };

  const handleSelectChange = (field: keyof Employee, value: string) => {
    setEmployee(prev => prev ? { ...prev, [field]: value as any } : null);
     if (field === 'paymentMethod' && value === 'cash') {
        setEmployee(prev => prev ? { ...prev, bankCode: null, bankAccountNumber: null } : null);
    }
  };

   const handleBankCodeSelectChange = (value: string) => {
     setEmployee(prev => prev ? { ...prev, bankCode: value || null } : null);
   };

  const handleCheckboxChange = (checked: boolean | string) => {
      const isEligible = Boolean(checked);
      setEmployee(prev => prev ? { ...prev, fnpfEligible: isEligible } : null);
      if (!isEligible) {
          setEmployee(prev => prev ? { ...prev, fnpfNo: null } : null);
      }
  };

  const validateForm = (): boolean => {
      if (!employee) return false;
      const { name, position, hourlyWage, fnpfNo, bankCode, bankAccountNumber, paymentMethod, fnpfEligible } = employee;
      let isValid = true;
      const errors: string[] = [];
      if (!name.trim()) errors.push('Employee Name is required.');
      if (!position.trim()) errors.push('Employee Position is required.');
      if (!String(hourlyWage).trim()) {
          errors.push('Hourly Wage is required.');
      } else {
          const wageAsNumber = parseFloat(String(hourlyWage));
          if (isNaN(wageAsNumber) || wageAsNumber < 0) {
              errors.push('Hourly Wage must be a valid non-negative number.');
          }
      }
      if (fnpfEligible && !fnpfNo?.trim()) {
        errors.push('FNPF Number is required when employee is FNPF eligible.');
      }
      if (paymentMethod === 'online') {
        if (!bankCode) errors.push('Bank Code is required for online transfer.');
        if (!bankAccountNumber?.trim()) errors.push('Bank Account Number is required for online transfer.');
      }
      if (errors.length > 0) {
        toast({
          title: 'Validation Error',
          description: errors.join(' '),
          variant: 'destructive',
        });
        isValid = false;
      }
      return isValid;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!employee || !validateForm() || isUpdating) return;
    setShowPasswordDialog(true);
  };

  const confirmUpdate = async () => {
    if (updatePassword !== ADMIN_PASSWORD) {
        toast({
            title: 'Error',
            description: 'Incorrect admin password.',
            variant: 'destructive',
        });
        return;
    }
    setShowPasswordDialog(false);
    setUpdatePassword('');
    if (!employee) return;
    setIsUpdating(true);

    const updatedEmployeeData: Employee = {
        ...employee,
        name: toTitleCase(employee.name.trim()), // Ensure final trim and format
        position: toTitleCase(employee.position.trim()), // Ensure final trim and format
        hourlyWage: String(employee.hourlyWage),
        fnpfNo: employee.fnpfEligible ? (employee.fnpfNo?.trim() || null) : null,
        tinNo: employee.tinNo?.trim() ? employee.tinNo : null,
        bankCode: employee.paymentMethod === 'online' ? (employee.bankCode || null) : null,
        bankAccountNumber: employee.paymentMethod === 'online' ? (employee.bankAccountNumber?.trim() || null) : null,
    };

    try {
      await updateEmployee(updatedEmployeeData);
      toast({
        title: 'Success',
        description: 'Employee information updated successfully!',
      });
      setSelectedEmployeeId(null);
      setEmployee(null);
      fetchAllEmployees(); // Re-fetch employees to update dropdown
    } catch (error: any) {
      toast({
        title: 'Error Updating Employee',
        description: error.message || 'Failed to update employee information.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (authCheckLoading || isLoadingEmployees) {
    return (
         <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-center min-h-screen text-white font-sans">
             <div className="text-xl flex items-center">
                 <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                 {authCheckLoading ? 'Authenticating...' : 'Loading employees...'}
             </div>
         </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
     <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-start min-h-screen text-white font-sans">
         <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
             <Link href="/employees" className="ml-4">
                 <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                     <ArrowLeft className="h-5 w-5" />
                     <span className="sr-only">Back to Employee Management</span>
                 </Button>
             </Link>
             <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
                 Change Employee Information
             </h1>
             <Link href="/dashboard" className="mr-4">
                 <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                     <Home className="h-5 w-5" />
                     <span className="sr-only">Home</span>
                 </Button>
             </Link>
         </header>

         <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6">
             <Card className="w-full max-w-md bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40">
                 <CardContent className="p-6">
                      <div className="grid gap-2 mb-6">
                         <Label htmlFor="employee-select" className="text-white">Select Employee</Label>
                         <Select onValueChange={handleEmployeeSelect} value={selectedEmployeeId || ''}>
                             <SelectTrigger id="employee-select" className="bg-white/10 text-white placeholder-gray-400 border-white/20">
                                 <SelectValue placeholder="Choose an employee to edit" />
                             </SelectTrigger>
                             <SelectContent>
                                 <SelectGroup>
                                     <SelectLabel>Employees</SelectLabel>
                                     {allEmployees.length > 0 ? (
                                         allEmployees.map(emp => (
                                             <SelectItem key={emp.id} value={emp.id}>
                                                 {emp.name} ({emp.branch})
                                             </SelectItem>
                                         ))
                                     ) : (
                                         <SelectItem value="no-employees" disabled>
                                             No employees found
                                         </SelectItem>
                                     )}
                                 </SelectGroup>
                             </SelectContent>
                         </Select>
                       </div>

                     {isLoadingDetails && (
                         <div className="flex items-center justify-center py-4">
                             <Loader2 className="mr-2 h-5 w-5 animate-spin text-white" />
                             <span className="text-white">Loading employee details...</span>
                         </div>
                     )}

                     {employee && !isLoadingDetails && (
                         <form onSubmit={handleSubmit}>
                              <div className="grid gap-2 mb-4">
                                 <Label className="text-white font-semibold">Select Branch</Label>
                                 <RadioGroup
                                     onValueChange={(value) => handleSelectChange('branch', value)}
                                     value={employee.branch}
                                     className="grid grid-cols-2 gap-4"
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
                             <div className="grid gap-2 mb-4">
                                 <Label htmlFor="name" className="text-white">
                                     Employee Name <span className="text-red-500">*</span>
                                 </Label>
                                 <Input
                                     id="name"
                                     type="text"
                                     placeholder="Enter full name"
                                     value={employee.name}
                                     onChange={handleChange}
                                     required
                                     className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                 />
                             </div>
                             <div className="grid gap-2 mb-4">
                                 <Label htmlFor="position" className="text-white">
                                     Employee Position <span className="text-red-500">*</span>
                                 </Label>
                                 <Input
                                     id="position"
                                     type="text"
                                     placeholder="e.g., Sales Assistant"
                                     value={employee.position}
                                     onChange={handleChange}
                                     required
                                     className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                 />
                             </div>
                             <div className="grid gap-2 mb-4">
                                 <Label htmlFor="hourlyWage" className="text-white">
                                     Hourly Wage ($) <span className="text-red-500">*</span>
                                 </Label>
                                 <Input
                                     id="hourlyWage"
                                     type="number"
                                     step="0.01"
                                     min="0"
                                     placeholder="e.g., 15.50"
                                     value={employee.hourlyWage || ""}
                                     onChange={handleChange}
                                     required
                                     className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                 />
                             </div>
                              <div className="grid gap-2 mb-4">
                                <Label htmlFor="tinNo" className="text-white">
                                    TIN No
                                </Label>
                                <Input
                                    id="tinNo"
                                    type="text"
                                    placeholder="Enter Tax ID Number (Optional)"
                                    value={employee.tinNo || ''}
                                    onChange={handleChange}
                                    className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                />
                              </div>
                              <div className="flex items-center space-x-2 mb-2">
                                  <Checkbox
                                      id="fnpfEligible"
                                      checked={employee.fnpfEligible}
                                      onCheckedChange={handleCheckboxChange}
                                      className="border-white data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                  />
                                  <Label htmlFor="fnpfEligible" className="text-white cursor-pointer">Eligible for FNPF Deduction</Label>
                              </div>
                              {employee.fnpfEligible && (
                                <div className="grid gap-2 mb-4">
                                    <Label htmlFor="fnpfNo" className="text-white">
                                        FNPF No <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="fnpfNo"
                                        type="text"
                                        placeholder="Enter FNPF Number"
                                        value={employee.fnpfNo || ''}
                                        onChange={handleChange}
                                        required={employee.fnpfEligible}
                                        className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                    />
                                </div>
                              )}
                              <div className="grid gap-2 mb-4">
                                <Label className="text-white font-semibold">Payment Method</Label>
                                <RadioGroup
                                    onValueChange={(value) => handleSelectChange('paymentMethod', value)}
                                    value={employee.paymentMethod}
                                    className="grid grid-cols-2 gap-4"
                                >
                                    <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="cash" id="r-payment-cash" className="border-white text-primary" />
                                    <Label htmlFor="r-payment-cash" className="text-white cursor-pointer">Cash Wages</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="online" id="r-payment-online" className="border-white text-primary" />
                                    <Label htmlFor="r-payment-online" className="text-white cursor-pointer">Online Transfer</Label>
                                    </div>
                                </RadioGroup>
                              </div>
                              {employee.paymentMethod === 'online' && (
                              <>
                                  <div className="grid gap-2 mb-4">
                                  <Label htmlFor="bankCode" className="text-white">Bank Code <span className="text-red-500">*</span></Label>
                                       <Select onValueChange={handleBankCodeSelectChange} value={employee.bankCode || ''} required={employee.paymentMethod === 'online'}>
                                          <SelectTrigger className="bg-white/10 text-white placeholder-gray-400 border-white/20">
                                              <SelectValue placeholder="Select Bank Code" />
                                          </SelectTrigger>
                                          <SelectContent>
                                               <SelectItem value="ANZ">ANZ</SelectItem>
                                               <SelectItem value="BSP">BSP</SelectItem>
                                               <SelectItem value="BOB">BOB</SelectItem>
                                               <SelectItem value="HFC">HFC</SelectItem>
                                               <SelectItem value="BRED">BRED</SelectItem>
                                          </SelectContent>
                                      </Select>
                                  </div>
                                  <div className="grid gap-2 mb-4">
                                    <Label htmlFor="bankAccountNumber" className="text-white">
                                        Bank Account Number <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="bankAccountNumber"
                                        type="text"
                                        placeholder="Enter account number"
                                        value={employee.bankAccountNumber || ''}
                                        onChange={handleChange}
                                        required={employee.paymentMethod === 'online'}
                                        className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                    />
                                  </div>
                              </>
                              )}
                           <Button
                             className="w-full mt-6"
                             type="submit"
                             variant="gradient"
                             disabled={isUpdating}
                           >
                             {isUpdating ? (
                               <>
                                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                 Updating...
                               </>
                              ) : (
                               'Update Employee Information'
                              )}
                           </Button>
                         </form>
                     )}
                     {!selectedEmployeeId && !isLoadingEmployees && allEmployees.length > 0 && (
                         <p className="text-center text-gray-400 mt-4">Please select an employee from the dropdown above to edit their information.</p>
                     )}
                     {!isLoadingEmployees && allEmployees.length === 0 && (
                         <p className="text-center text-red-500 mt-4">No employees found. Please add employees first.</p>
                     )}
                 </CardContent>
             </Card>
         </main>

           <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
               <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
                   <AlertDialogHeader>
                       <AlertDialogTitle>Confirm Update</AlertDialogTitle>
                       <AlertDialogDescription className="text-gray-300">
                           Please enter the admin password to confirm updating employee information.
                       </AlertDialogDescription>
                   </AlertDialogHeader>
                   <div className="grid gap-2">
                       <Label htmlFor="update-password">Admin Password</Label>
                       <Input
                           id="update-password"
                           type="password"
                           value={updatePassword}
                           onChange={(e) => setUpdatePassword(e.target.value)}
                           className="bg-gray-800 border-white/20 text-white"
                           onKeyPress={(e) => { if (e.key === 'Enter') confirmUpdate(); }}
                       />
                   </div>
                   <AlertDialogFooter>
                       <AlertDialogCancel onClick={() => {setShowPasswordDialog(false); setUpdatePassword('');}} className="border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                       <AlertDialogAction
                           onClick={confirmUpdate}
                           disabled={isUpdating}
                           className="bg-blue-600 hover:bg-blue-700"
                       >
                           {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Update'}
                       </AlertDialogAction>
                   </AlertDialogFooter>
               </AlertDialogContent>
           </AlertDialog>
    </div>
   </div>
  );
};

export default ChangeEmployeeInfoPage;
