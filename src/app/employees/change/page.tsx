
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import Image from 'next/image';
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useToast} from '@/hooks/use-toast';
import {useRouter} from 'next/navigation';
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group';
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link";
import {ArrowLeft, Home, Loader2} from "lucide-react";
import { getEmployees, getEmployeeById, updateEmployee } from '@/services/employee-service'; // Import service functions
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

// Employee interface matching the service
interface Employee {
  id: string; // Keep ID for updates
  name: string;
  position: string;
  hourlyWage: string;
  fnpfNo: string | null; // Allow null
  tinNo: string | null; // Allow null
  bankCode: string | null; // Allow null
  bankAccountNumber: string | null; // Allow null
  paymentMethod: 'cash' | 'online';
  branch: 'labasa' | 'suva';
  fnpfEligible: boolean;
}

const ChangeEmployeeInfoPage = () => {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true); // State for loading all employees
  const [isLoadingDetails, setIsLoadingDetails] = useState(false); // State for loading selected employee details
  const [isUpdating, setIsUpdating] = useState(false); // State for update process
  const [showPasswordDialog, setShowPasswordDialog] = useState(false); // State for password dialog
  const [updatePassword, setUpdatePassword] = useState(''); // State for password input
  const {toast} = useToast();
  const router = useRouter();
  const ADMIN_PASSWORD = 'admin01'; // Store securely in a real application

  // Fetch all employees when the component mounts
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
      fetchAllEmployees();
  }, [fetchAllEmployees]);

  // Fetch the specific employee's data when an employee is selected
  const fetchEmployeeDetails = useCallback(async (employeeId: string) => {
    if (!employeeId) return;
    setIsLoadingDetails(true);
    setEmployee(null); // Clear previous employee data
    try {
        const foundEmployee = await getEmployeeById(employeeId);
        if (foundEmployee) {
            setEmployee({
                ...foundEmployee,
                hourlyWage: String(foundEmployee.hourlyWage || '0'),
                fnpfNo: foundEmployee.fnpfNo || '',
                tinNo: foundEmployee.tinNo || '',
                bankCode: foundEmployee.bankCode || '',
                bankAccountNumber: foundEmployee.bankAccountNumber || '',
            });
        } else {
            toast({ title: 'Error', description: 'Selected employee not found.', variant: 'destructive' });
            setSelectedEmployeeId(null); // Reset selection if not found
        }
    } catch (error: any) {
        toast({
            title: 'Error Fetching Details',
            description: error.message || 'Failed to load employee details.',
            variant: 'destructive',
        });
         setSelectedEmployeeId(null); // Reset selection on error
    } finally {
        setIsLoadingDetails(false);
    }
  }, [toast]);

  // Handle employee selection change
  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    fetchEmployeeDetails(employeeId);
  };

  // Handlers for form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setEmployee(prev => prev ? { ...prev, [id]: value } : null);
  };

  const handleSelectChange = (field: keyof Employee, value: string) => {
    setEmployee(prev => prev ? { ...prev, [field]: value as any } : null);
     // Reset bank details if switching to cash
     if (field === 'paymentMethod' && value === 'cash') {
        setEmployee(prev => prev ? { ...prev, bankCode: null, bankAccountNumber: null } : null);
    }
  };

   const handleBankCodeSelectChange = (value: string) => {
     setEmployee(prev => prev ? { ...prev, bankCode: value || null } : null); // Ensure null if value is empty
   };


  const handleCheckboxChange = (checked: boolean | string) => {
      const isEligible = Boolean(checked);
      setEmployee(prev => prev ? { ...prev, fnpfEligible: isEligible } : null);
      // Clear FNPF No if not eligible
      if (!isEligible) {
          setEmployee(prev => prev ? { ...prev, fnpfNo: null } : null);
      }
  };

  // Form validation logic
  const validateForm = (): boolean => {
      if (!employee) return false; // Should not happen if loaded correctly

      const { name, position, hourlyWage, fnpfNo, bankCode, bankAccountNumber, paymentMethod, fnpfEligible } = employee;
      let isValid = true;
      const errors: string[] = [];

      if (!name.trim()) errors.push('Employee Name is required.');
      if (!position.trim()) errors.push('Employee Position is required.');
      if (!String(hourlyWage).trim()) { // Ensure hourlyWage is treated as string for validation
          errors.push('Hourly Wage is required.');
      } else {
          const wageAsNumber = parseFloat(String(hourlyWage));
          if (isNaN(wageAsNumber) || wageAsNumber < 0) {
              errors.push('Hourly Wage must be a valid non-negative number.');
          }
      }

      if (fnpfEligible && !fnpfNo?.trim()) { // Use optional chaining and check trim
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


  // Form submission handler - now triggers the password dialog
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!employee || !validateForm() || isUpdating) {
        return; // Don't submit if no employee, invalid, or already updating
    }
    // Open the password confirmation dialog instead of directly updating
    setShowPasswordDialog(true);
  };

  // Function called when password confirmation is submitted
  const confirmUpdate = async () => {
    if (updatePassword !== ADMIN_PASSWORD) {
        toast({
            title: 'Error',
            description: 'Incorrect admin password.',
            variant: 'destructive',
        });
        // Optionally clear password field here or keep it for retry
        // setUpdatePassword('');
        return; // Stop the update process
    }

    // Close dialog first
    setShowPasswordDialog(false);
    setUpdatePassword(''); // Clear password after check

    if (!employee) return; // Should not happen

    setIsUpdating(true); // Indicate update process started

    // Prepare updated data, ensuring conditional fields are correct (set to null if needed)
    const updatedEmployeeData: Employee = {
        ...employee,
        hourlyWage: String(employee.hourlyWage), // Assuming service expects string, adjust if needed
        fnpfNo: employee.fnpfEligible ? (employee.fnpfNo?.trim() || null) : null, // Trim and set null if empty/ineligible
        tinNo: employee.tinNo?.trim() ? employee.tinNo : null, // Set to null if empty
        bankCode: employee.paymentMethod === 'online' ? (employee.bankCode || null) : null,
        bankAccountNumber: employee.paymentMethod === 'online' ? (employee.bankAccountNumber?.trim() || null) : null, // Trim and set null if empty/cash
    };

    try {
      // Call the service function to update the employee in the database
      await updateEmployee(updatedEmployeeData);

      toast({
        title: 'Success',
        description: 'Employee information updated successfully!',
      });

      // Optionally reset selection and form
      setSelectedEmployeeId(null);
      setEmployee(null);
      // Consider navigating back or allowing further edits
      // router.push('/employees/information'); // Optional: navigate back

    } catch (error: any) {
      toast({
        title: 'Error Updating Employee',
        description: error.message || 'Failed to update employee information.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false); // Indicate update process finished
    }
  };


  // Render loading state for employee list
  if (isLoadingEmployees) {
    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen font-sans text-white">
            <Image
                src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg"
                alt="Background Image" fill style={{objectFit: 'cover'}}
                className="absolute top-0 left-0 w-full h-full -z-10" priority />
            <div className="absolute top-0 left-0 w-full h-full bg-black opacity-50 -z-9" />
            <div className="relative z-10 text-xl flex items-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading employees...
            </div>
             {/* Footer is handled by RootLayout */}
        </div>
    );
  }

  // Render the main page content
  return (
     <div className="relative flex flex-col items-center min-h-screen font-sans text-white">
      {/* Background Image */}
      <Image
        src="/red-and-black-gaming-wallpapers-top-red-and-black-lightning-dark-gamer.jpg"
        alt="Background Image"
        fill
        style={{objectFit: 'cover'}}
        className="absolute top-0 left-0 w-full h-full -z-10"
        priority
      />

      {/* Overlay */}
      <div className="absolute top-0 left-0 w-full h-full bg-black opacity-50 -z-9" />

       {/* Content Area */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-center py-10">

          <Card className="w-full max-w-md bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40">
            <CardHeader className="relative">
                {/* Changed Back link to Employee Management page */}
                 <Link href="/employees" className="absolute top-4 left-4">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5 text-white" />
                        <span className="sr-only">Back to Employee Management</span>
                    </Button>
                 </Link>
              <CardTitle className="text-2xl text-white text-center pt-2">
                Change Employee Information
              </CardTitle>
                 <Link href="/dashboard" className="absolute top-4 right-4">
                    <Button variant="ghost" size="icon">
                        <Home className="h-5 w-5 text-white" />
                        <span className="sr-only">Home</span>
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="grid gap-4">

              {/* Employee Selection Dropdown */}
               <div className="grid gap-2">
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

              {/* Loading indicator for employee details */}
              {isLoadingDetails && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-white" />
                  <span className="text-white">Loading employee details...</span>
                </div>
              )}

              {/* Conditionally render form when employee is selected and loaded */}
              {employee && !isLoadingDetails && (
                <form onSubmit={handleSubmit}>
                   {/* Branch Selection */}
                   <div className="grid gap-2 mt-4">
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

                  {/* Employee Name */}
                  <div className="grid gap-2 mt-4">
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

                  {/* Employee Position */}
                  <div className="grid gap-2">
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

                  {/* Hourly Wage */}
                  <div className="grid gap-2">
                    <Label htmlFor="hourlyWage" className="text-white">
                        Hourly Wage ($) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id="hourlyWage"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g., 15.50"
                        value={employee.hourlyWage} // Already string from state setup
                        onChange={handleChange}
                        required
                        className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                    />
                  </div>

                   {/* TIN No */}
                   <div className="grid gap-2">
                     <Label htmlFor="tinNo" className="text-white">
                         TIN No
                     </Label>
                     <Input
                         id="tinNo"
                         type="text"
                         placeholder="Enter Tax ID Number (Optional)"
                         value={employee.tinNo || ''} // Use empty string for null
                         onChange={handleChange}
                         className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                     />
                   </div>

                  {/* FNPF Eligibility */}
                   <div className="flex items-center space-x-2 mt-4">
                       <Checkbox
                           id="fnpfEligible"
                           checked={employee.fnpfEligible}
                           onCheckedChange={handleCheckboxChange}
                           className="border-white data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" // Added explicit checked styles
                       />
                       <Label htmlFor="fnpfEligible" className="text-white cursor-pointer">Eligible for FNPF Deduction</Label>
                   </div>

                  {/* FNPF No (Conditional) */}
                   {employee.fnpfEligible && (
                     <div className="grid gap-2 mt-2"> {/* Adjusted margin */}
                         <Label htmlFor="fnpfNo" className="text-white">
                             FNPF No <span className="text-red-500">*</span>
                         </Label>
                         <Input
                             id="fnpfNo"
                             type="text"
                             placeholder="Enter FNPF Number"
                             value={employee.fnpfNo || ''} // Use empty string for null
                             onChange={handleChange}
                             required={employee.fnpfEligible}
                             className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                         />
                     </div>
                   )}

                  {/* Payment Method */}
                   <div className="grid gap-2 mt-4">
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

                  {/* Bank Details (Conditional) */}
                   {employee.paymentMethod === 'online' && (
                   <>
                      {/* Bank Code */}
                       <div className="grid gap-2 mt-4">
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
                       {/* Bank Account Number */}
                       <div className="grid gap-2">
                         <Label htmlFor="bankAccountNumber" className="text-white">
                             Bank Account Number <span className="text-red-500">*</span>
                         </Label>
                         <Input
                             id="bankAccountNumber"
                             type="text"
                             placeholder="Enter account number"
                             value={employee.bankAccountNumber || ''} // Use empty string for null
                             onChange={handleChange}
                             required={employee.paymentMethod === 'online'}
                             className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                         />
                       </div>
                   </>
                   )}

                {/* Submit Button */}
                <Button
                  className="w-full mt-6"
                  type="submit"
                  variant="gradient"
                  disabled={isUpdating} // Disable button while updating
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
              {/* Message when no employee is selected */}
              {!selectedEmployeeId && !isLoadingEmployees && allEmployees.length > 0 && (
                  <p className="text-center text-gray-400 mt-4">Please select an employee from the dropdown above to edit their information.</p>
              )}
              {!isLoadingEmployees && allEmployees.length === 0 && (
                  <p className="text-center text-red-500 mt-4">No employees found. Please add employees first.</p>
              )}
            </CardContent>
          </Card>
        </div>
          {/* Footer is handled by RootLayout */}

          {/* Password Confirmation Dialog */}
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
  );
};

export default ChangeEmployeeInfoPage;
