'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast'; // Re-introduced useToast
import { useRouter } from 'next/navigation';
import { addEmployee, checkExistingFNPFNo } from '@/services/employee-service'; // Import service functions including the checker
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, Home, Loader2 } from "lucide-react"; // Added Loader2 icon
import Link from "next/link";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox"

// Employee data type (excluding ID for creation)
// Matches the type used in the service
type EmployeeData = {
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
};

const CreateEmployeePage = () => {
  const [formData, setFormData] = useState<EmployeeData>({
    name: '',
    position: '',
    hourlyWage: '',
    fnpfNo: '', // Initialize as empty string, will be set to null if not eligible
    tinNo: '', // Initialize as empty string, will be set to null if needed
    bankCode: '', // Default to empty, required only if paymentMethod is 'online'
    bankAccountNumber: '', // Default to empty, required only if paymentMethod is 'online'
    paymentMethod: 'cash',
    branch: 'labasa',
    fnpfEligible: true, // Default to true
  });
  const [isLoading, setIsLoading] = useState(false); // State for loading indicator
  const { toast } = useToast(); // Initialize useToast
  const router = useRouter();

  // Generic handler for most input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  // Handler for Select components (Bank Code)
  const handleBankCodeChange = (value: string) => {
    setFormData(prev => ({ ...prev, bankCode: value || null })); // Store null if empty
  };

  // Handler for RadioGroup changes (Branch, Payment Method)
  const handleRadioChange = (field: keyof EmployeeData, value: 'labasa' | 'suva' | 'cash' | 'online') => {
    setFormData(prev => ({ ...prev, [field]: value }));
     // Reset bank details if switching to cash
     if (field === 'paymentMethod' && value === 'cash') {
        setFormData(prev => ({ ...prev, bankCode: '', bankAccountNumber: '' }));
    }
  };

  // Handler for Checkbox change (FNPF Eligibility)
  const handleCheckboxChange = (checked: boolean | string) => {
      const isEligible = Boolean(checked); // Ensure boolean value
      setFormData(prev => ({ ...prev, fnpfEligible: isEligible }));
      // Clear FNPF No if not eligible
      if (!isEligible) {
          setFormData(prev => ({ ...prev, fnpfNo: '' }));
      }
  };

  // Form validation logic
  const validateForm = (): boolean => {
    const { name, position, hourlyWage, fnpfNo, bankCode, bankAccountNumber, paymentMethod, fnpfEligible } = formData;
    let isValid = true;
    const errors: string[] = [];

    if (!name.trim()) errors.push('Employee Name is required.');
    if (!position.trim()) errors.push('Employee Position is required.');
    if (!hourlyWage.trim()) {
        errors.push('Hourly Wage is required.');
    } else {
        const wageAsNumber = parseFloat(hourlyWage);
        if (isNaN(wageAsNumber) || wageAsNumber < 0) {
            errors.push('Hourly Wage must be a valid non-negative number.');
        }
    }

    // Check FNPF number validity ONLY IF eligible and the input is not empty
    if (fnpfEligible && !fnpfNo?.trim()) {
        errors.push('FNPF Number is required when employee is FNPF eligible.');
    } else if (fnpfEligible && fnpfNo && fnpfNo.trim().length > 0 && !/^\d+$/.test(fnpfNo.trim())) {
        // Optional: Add regex check if FNPF needs to be numeric
        // errors.push('FNPF Number must contain only digits.');
    }


    if (paymentMethod === 'online') {
      if (!bankCode) errors.push('Bank Code is required for online transfer.');
      if (!bankAccountNumber?.trim()) { // Check bankAccountNumber?.trim()
        errors.push('Bank Account Number is required for online transfer.');
      }
    }

    if (errors.length > 0) {
      toast({ // Use toast for validation errors
        title: 'Validation Error',
        description: errors.join(' '),
        variant: 'destructive',
      });
      console.error('Validation Error:', errors.join(' ')); // Log error to console as well
      isValid = false;
    }

    return isValid;
  };

  // Form submission handler
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    console.log("Form submitted. Validating...");
    if (!validateForm()) {
        console.log("Validation failed.");
        return;
    }
    if (isLoading) {
        console.log("Submission blocked: Already processing.");
        return; // Prevent multiple submissions
    }

    console.log("Validation passed. Starting submission process...");
    setIsLoading(true); // Start loading indicator

    // Prepare data for saving (ensure correct types and nulls)
    const employeeDataToSave: EmployeeData = {
        ...formData,
        fnpfNo: formData.fnpfEligible ? (formData.fnpfNo?.trim() || null) : null, // Ensure null if empty or ineligible
        tinNo: formData.tinNo?.trim() ? formData.tinNo : null, // Set to null if empty
        bankCode: formData.paymentMethod === 'online' ? (formData.bankCode || null) : null,
        bankAccountNumber: formData.paymentMethod === 'online' ? (formData.bankAccountNumber?.trim() || null) : null, // Trim and ensure null
    };

    console.log('Data prepared for saving:', employeeDataToSave);

    try {
        // --- Check for existing FNPF Number before attempting to add ---
        if (employeeDataToSave.fnpfEligible && employeeDataToSave.fnpfNo) {
            console.log(`Checking if FNPF No ${employeeDataToSave.fnpfNo} already exists...`);
            const existingEmployee = await checkExistingFNPFNo(employeeDataToSave.fnpfNo);
            if (existingEmployee) {
                toast({ // Use toast for duplicate FNPF error
                    title: 'Duplicate FNPF Number',
                    description: `An employee with FNPF Number ${employeeDataToSave.fnpfNo} already exists.`,
                    variant: 'destructive',
                });
                console.error(`Duplicate FNPF Number detected: ${employeeDataToSave.fnpfNo}`);
                setIsLoading(false); // Stop loading
                return; // Stop the submission
            }
             console.log(`FNPF No ${employeeDataToSave.fnpfNo} is unique. Proceeding...`);
        }
        // --- End FNPF Check ---

      console.log('Attempting to call addEmployee service...');
      await addEmployee(employeeDataToSave); // Call the service function
      console.log('addEmployee service call successful.');

      toast({ // Use toast for success message
        title: 'Success',
        description: 'Employee created successfully!',
      });
      console.log('Employee created successfully!'); // Log success to console

      console.log('Redirecting to /employees/information');
      // Redirect to the employee information page after success
      router.push('/employees/information');

    } catch (error: any) {
      console.error('Error during employee creation process:', error); // Log the full error object
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      toast({ // Use toast for general creation errors
        title: 'Error Creating Employee',
        description: error.message || 'Failed to save employee data. Check console for details.',
        variant: 'destructive',
      });
    } finally {
      console.log("Finishing submission process.");
      setIsLoading(false); // Stop loading indicator regardless of outcome
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen font-sans text-white">
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
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-center">

            <Card className="w-full max-w-md bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 z-10">
            <CardHeader className="relative">
            <Link href="/employees" className="absolute top-4 left-4" aria-label="Back to Employees">
                <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5 text-white" />
                </Button>
            </Link>
            <CardTitle className="text-2xl text-white text-center pt-2">
                New Employee
            </CardTitle>
            <Link href="/dashboard" className="absolute top-4 right-4" aria-label="Dashboard">
                <Button variant="ghost" size="icon">
                    <Home className="h-5 w-5 text-white" />
                </Button>
            </Link>
            </CardHeader>
            <CardContent className="grid gap-4">
            <form onSubmit={handleSubmit}>

                {/* Branch Selection */}
                <div className="grid gap-2">
                  <Label className="text-white font-semibold">Select Branch</Label>
                  <RadioGroup
                      onValueChange={(value) => handleRadioChange('branch', value as 'labasa' | 'suva')}
                      value={formData.branch}
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
                      value={formData.name}
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
                      value={formData.position}
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
                      value={formData.hourlyWage}
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
                        value={formData.tinNo || ''} // Handle null/undefined for display
                        onChange={handleChange}
                        className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                    />
                  </div>

                 {/* FNPF Eligibility */}
                <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                        id="fnpfEligible"
                        checked={formData.fnpfEligible}
                        onCheckedChange={handleCheckboxChange}
                        className="border-white text-primary"
                    />
                    <Label htmlFor="fnpfEligible" className="text-white cursor-pointer">Eligible for FNPF Deduction</Label>
                </div>

                {/* FNPF No (Conditional) */}
                {formData.fnpfEligible && (
                    <div className="grid gap-2 mt-2"> {/* Adjusted margin */}
                        <Label htmlFor="fnpfNo" className="text-white">
                            FNPF No <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="fnpfNo"
                            type="text"
                            placeholder="Enter FNPF Number"
                            value={formData.fnpfNo || ''} // Handle null/undefined for display
                            onChange={handleChange}
                            required={formData.fnpfEligible}
                            className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                        />
                    </div>
                )}

                {/* Payment Method */}
                <div className="grid gap-2 mt-4">
                  <Label className="text-white font-semibold">Payment Method</Label>
                  <RadioGroup
                      onValueChange={(value) => handleRadioChange('paymentMethod', value as 'cash' | 'online')}
                      value={formData.paymentMethod}
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
                {formData.paymentMethod === 'online' && (
                <>
                    {/* Bank Code */}
                    <div className="grid gap-2 mt-4">
                        <Label htmlFor="bankCode" className="text-white">Bank Code <span className="text-red-500">*</span></Label>
                        <Select
                            onValueChange={handleBankCodeChange}
                            value={formData.bankCode || ''} // Handle null for Select
                            required={formData.paymentMethod === 'online'}
                        >
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
                          value={formData.bankAccountNumber || ''} // Handle null
                          onChange={handleChange}
                          required={formData.paymentMethod === 'online'}
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
                  disabled={isLoading} // Disable button when loading
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Employee'
                  )}
                </Button>
            </form>
            </CardContent>
            </Card>

        </div>
          {/* Footer is handled by RootLayout */}
    </div>
  );
};

export default CreateEmployeePage;