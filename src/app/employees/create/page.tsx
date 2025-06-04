
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { addEmployee, checkExistingFNPFNo } from '@/services/employee-service';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, Home, Loader2 } from "lucide-react";
import Link from "next/link";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toTitleCase } from '@/lib/utils'; // Import the new utility

type EmployeeData = {
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
};

const CreateEmployeePage = () => {
  const [formData, setFormData] = useState<EmployeeData>({
    name: '',
    position: '',
    hourlyWage: '',
    fnpfNo: '',
    tinNo: '',
    bankCode: '',
    bankAccountNumber: '',
    paymentMethod: 'cash',
    branch: 'labasa',
    fnpfEligible: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
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


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    let formattedValue = value;
    if (id === 'name' || id === 'position') {
      formattedValue = toTitleCase(value);
    }
    setFormData(prev => ({ ...prev, [id]: formattedValue }));
  };

  const handleBankCodeChange = (value: string) => {
    setFormData(prev => ({ ...prev, bankCode: value || null }));
  };

  const handleRadioChange = (field: keyof EmployeeData, value: 'labasa' | 'suva' | 'cash' | 'online') => {
    setFormData(prev => ({ ...prev, [field]: value }));
     if (field === 'paymentMethod' && value === 'cash') {
        setFormData(prev => ({ ...prev, bankCode: '', bankAccountNumber: '' }));
    }
  };

  const handleCheckboxChange = (checked: boolean | string) => {
      const isEligible = Boolean(checked);
      setFormData(prev => ({ ...prev, fnpfEligible: isEligible }));
      if (!isEligible) {
          setFormData(prev => ({ ...prev, fnpfNo: '' }));
      }
  };

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
    if (fnpfEligible && !fnpfNo?.trim()) {
        errors.push('FNPF Number is required when employee is FNPF eligible.');
    }
    if (paymentMethod === 'online') {
      if (!bankCode) errors.push('Bank Code is required for online transfer.');
      if (!bankAccountNumber?.trim()) {
        errors.push('Bank Account Number is required for online transfer.');
      }
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm() || isLoading) return;
    setIsLoading(true);

    const employeeDataToSave: EmployeeData = {
        ...formData,
        name: toTitleCase(formData.name.trim()), // Ensure final trim and format
        position: toTitleCase(formData.position.trim()), // Ensure final trim and format
        fnpfNo: formData.fnpfEligible ? (formData.fnpfNo?.trim() || null) : null,
        tinNo: formData.tinNo?.trim() ? formData.tinNo : null,
        bankCode: formData.paymentMethod === 'online' ? (formData.bankCode || null) : null,
        bankAccountNumber: formData.paymentMethod === 'online' ? (formData.bankAccountNumber?.trim() || null) : null,
    };

    try {
        if (employeeDataToSave.fnpfEligible && employeeDataToSave.fnpfNo) {
            const existingEmployee = await checkExistingFNPFNo(employeeDataToSave.fnpfNo);
            if (existingEmployee) {
                toast({
                    title: 'Duplicate FNPF Number',
                    description: `An employee with FNPF Number ${employeeDataToSave.fnpfNo} already exists (${existingEmployee.name}). Please use a different number.`,
                    variant: 'destructive',
                });
                console.error(`Duplicate FNPF Number detected: ${employeeDataToSave.fnpfNo}`);
                setIsLoading(false);
                return;
            }
        }
      await addEmployee(employeeDataToSave);
      toast({
        title: 'Success',
        description: 'Employee created successfully!',
      });
      router.push('/employees/information');
    } catch (error: any) {
      toast({
        title: 'Error Creating Employee',
        description: error.message || 'Failed to save employee data. Check console for details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authCheckLoading) {
    return (
        <div className="flex justify-center items-center min-h-screen bg-black/70">
            <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
     <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-start min-h-screen text-white font-sans">
         <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-10 bg-black/60 backdrop-blur-md">
             <Link href="/employees" className="ml-4" aria-label="Back to Employees">
                 <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                     <ArrowLeft className="h-5 w-5" />
                 </Button>
             </Link>
             <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex-grow">
                 New Employee
             </h1>
             <Link href="/dashboard" className="mr-4" aria-label="Dashboard">
                 <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                     <Home className="h-5 w-5" />
                 </Button>
             </Link>
         </header>

         <main className="flex flex-col items-center flex-grow w-full pb-16 pt-6">
             <Card className="w-full max-w-md bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40 z-10">
                <CardContent className="p-6">
                    <form onSubmit={handleSubmit}>
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
                         <div className="grid gap-2">
                            <Label htmlFor="tinNo" className="text-white">
                                TIN No
                            </Label>
                            <Input
                                id="tinNo"
                                type="text"
                                placeholder="Enter Tax ID Number (Optional)"
                                value={formData.tinNo || ''}
                                onChange={handleChange}
                                className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                            />
                          </div>
                        <div className="flex items-center space-x-2 mt-4">
                            <Checkbox
                                id="fnpfEligible"
                                checked={formData.fnpfEligible}
                                onCheckedChange={handleCheckboxChange}
                                className="border-white text-primary"
                            />
                            <Label htmlFor="fnpfEligible" className="text-white cursor-pointer">Eligible for FNPF Deduction</Label>
                        </div>
                        {formData.fnpfEligible && (
                            <div className="grid gap-2 mt-2">
                                <Label htmlFor="fnpfNo" className="text-white">
                                    FNPF No <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="fnpfNo"
                                    type="text"
                                    placeholder="Enter FNPF Number"
                                    value={formData.fnpfNo || ''}
                                    onChange={handleChange}
                                    required={formData.fnpfEligible}
                                    className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                                />
                            </div>
                        )}
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
                        {formData.paymentMethod === 'online' && (
                        <>
                            <div className="grid gap-2 mt-4">
                                <Label htmlFor="bankCode" className="text-white">Bank Code <span className="text-red-500">*</span></Label>
                                <Select
                                    onValueChange={handleBankCodeChange}
                                    value={formData.bankCode || ''}
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
                            <div className="grid gap-2">
                              <Label htmlFor="bankAccountNumber" className="text-white">
                                  Bank Account Number <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                  id="bankAccountNumber"
                                  type="text"
                                  placeholder="Enter account number"
                                  value={formData.bankAccountNumber || ''}
                                  onChange={handleChange}
                                  required={formData.paymentMethod === 'online'}
                                  className="bg-white/10 text-white placeholder-gray-400 border-white/20"
                              />
                            </div>
                        </>
                        )}
                        <Button
                          className="w-full mt-6"
                          type="submit"
                          variant="gradient"
                          disabled={isLoading}
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
         </main>
     </div>
    </div>
  );
};

export default CreateEmployeePage;
