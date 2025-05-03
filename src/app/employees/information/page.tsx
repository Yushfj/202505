'use client';

import Image from 'next/image';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {useEffect, useState, useCallback} from 'react';
import {Trash2, Edit, Home, ArrowLeft, Loader2, UserX} from 'lucide-react'; // Replaced UserSlash with UserX
import {Button} from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter, // Ensure AlertDialogFooter is imported
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// Import service functions including setEmployeeActiveStatus
import { getEmployees, deleteEmployee, setEmployeeActiveStatus } from '@/services/employee-service';
import { cn } from '@/lib/utils'; // Import cn utility

// Matches the structure defined in employee-service.ts
interface Employee {
  id: string; // Keep ID as it's from the database
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
  isActive: boolean; // Added isActive
}

const EmployeeInformationPage = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const [isProcessing, setIsProcessing] = useState(false); // Generic processing state (delete/inactive)
  const {toast} = useToast(); // Initialize useToast
  const [actionPassword, setActionPassword] = useState(''); // Password for delete/inactive
  const [employeeToAction, setEmployeeToAction] = useState<string | null>(null); // ID of employee for action
  const [actionType, setActionType] = useState<'delete' | 'inactive' | null>(null); // Type of action
  const ADMIN_PASSWORD = 'admin01'; // Store this securely in a real application
  const router = useRouter();

  // Function to fetch and set employees using useCallback
  const fetchAndSetEmployees = useCallback(async () => {
    setIsLoading(true); // Start loading
      try {
        // Fetch only active employees by default
        const fetchedEmployees = await getEmployees(false);
        setEmployees(fetchedEmployees);
      } catch (error: any) {
        console.error("Error fetching employees:", error);
        toast({ // Use toast for error
          title: 'Error',
          description: error.message || 'Failed to load employee data.',
          variant: 'destructive',
        });
        setEmployees([]); // Set to empty array on error
      } finally {
        setIsLoading(false); // Stop loading
      }
    }, [toast]); // Add toast to dependencies

  // Fetch employees on initial mount and when fetchAndSetEmployees changes (which it won't unless dependencies change)
  useEffect(() => {
    fetchAndSetEmployees();
  }, [fetchAndSetEmployees]); // Depend on the memoized function


  const handleActionConfirm = async () => {
    if (!employeeToAction || !actionType) return;
    if (isProcessing) return;

    if (actionPassword !== ADMIN_PASSWORD) {
      toast({
        title: 'Error',
        description: 'Incorrect password. Please try again.',
        variant: 'destructive',
      });
      console.error('Incorrect password. Please try again.');
      // Optionally clear password: setActionPassword('');
      return;
    }

    setIsProcessing(true);

    try {
      if (actionType === 'delete') {
        await deleteEmployee(employeeToAction);
        toast({ title: 'Success', description: 'Employee deleted successfully!' });
        console.log('Employee deleted successfully!');
      } else if (actionType === 'inactive') {
        await setEmployeeActiveStatus(employeeToAction, false); // Set isActive to false
        toast({ title: 'Success', description: 'Employee marked as inactive successfully!' });
        console.log('Employee marked as inactive successfully!');
      }

      // Refetch employees to update the list
      await fetchAndSetEmployees();
      closeDialog(); // Close the dialog after action

    } catch (error: any) {
      console.error(`Error performing action '${actionType}':`, error);
      toast({
        title: 'Error',
        description: error.message || `Failed to ${actionType} employee.`,
        variant: 'destructive',
      });
    } finally {
       setIsProcessing(false);
       // Dialog closing and state reset handled by closeDialog()
    }
  };

  // Function to open the dialog and set state
  const openDialog = (employeeId: string, type: 'delete' | 'inactive') => {
      setEmployeeToAction(employeeId);
      setActionType(type);
      setActionPassword(''); // Clear password on open
  };

  // Function to close the dialog and reset state
  const closeDialog = () => {
      setEmployeeToAction(null);
      setActionType(null);
      setActionPassword('');
  };

  // Filter employees by branch (only active employees are fetched by default)
  const labasaEmployees = employees.filter(employee => employee.branch === 'labasa');
  const suvaEmployees = employees.filter(employee => employee.branch === 'suva');

  // Render loading state
  if (isLoading) {
      return (
           <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-center min-h-screen text-white font-sans">
                <div className="text-xl flex items-center">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading employee data...
                </div>
           </div>
      );
  }

  // Render main content
  return (
       <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center min-h-screen text-white font-sans">

         <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-8 sm:mb-10 bg-black/60 backdrop-blur-md">
            <Link href="/employees" passHref className="ml-4">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                    <ArrowLeft className="h-5 w-5" />
                    <span className="sr-only">Back to Employee Management</span>
                </Button>
            </Link>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
                Employee Information
            </h1>
            <Link href="/dashboard" passHref className="mr-4">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                    <Home className="h-5 w-5" />
                    <span className="sr-only">Dashboard</span>
                </Button>
            </Link>
        </header>

        <main className="w-full flex-grow overflow-y-auto pb-16 pt-6">
            {employees.length === 0 ? (
                <Card className="w-full max-w-md mx-auto mt-10 bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40">
                     <CardContent className="p-6">
                        <p className="text-white text-center">No active employee information available. Please add employees first.</p>
                         <div className="mt-4 text-center">
                            <Button asChild variant="gradient">
                                <Link href="/employees/create">Add New Employee</Link>
                            </Button>
                         </div>
                    </CardContent>
                </Card>
            ) : (
                 <div className="space-y-8">
                    {labasaEmployees.length > 0 && (
                        <section>
                            <h2 className="text-xl font-semibold text-white mb-4 text-center bg-black/30 backdrop-blur-sm py-2 rounded-md border border-white/15">Labasa Branch Employees</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {labasaEmployees.map((employee) => (
                                    <Card key={employee.id} className="bg-secondary/30 backdrop-blur-sm border border-white/10 rounded-lg text-white shadow-md relative overflow-hidden">
                                         <CardHeader className="pt-4 pb-2 px-4 flex flex-row justify-end items-center space-x-1 absolute top-1 right-1 z-10">
                                              {/* Edit Button */}
                                              <Link href={`/employees/change?id=${employee.id}`} passHref className="mr-1">
                                                 <Button
                                                     variant="ghost"
                                                     size="icon"
                                                     className="text-blue-300 hover:text-blue-100 hover:bg-white/20 h-7 w-7"
                                                     aria-label={`Edit ${employee.name}`}
                                                 >
                                                     <Edit className="h-4 w-4" />
                                                 </Button>
                                             </Link>
                                              {/* Inactivate Button */}
                                              <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => openDialog(employee.id, 'inactive')}
                                                  className="text-yellow-400 hover:text-yellow-200 hover:bg-white/20 h-7 w-7"
                                                  aria-label={`Mark ${employee.name} as inactive`}
                                              >
                                                  <UserX className="h-4 w-4" /> {/* Replaced UserSlash with UserX */}
                                              </Button>
                                             {/* Delete Button */}
                                              <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => openDialog(employee.id, 'delete')}
                                                  className="text-red-400 hover:text-red-200 hover:bg-white/20 h-7 w-7"
                                                  aria-label={`Delete ${employee.name}`}
                                              >
                                                  <Trash2 className="h-4 w-4" />
                                              </Button>
                                         </CardHeader>
                                        <CardContent className="p-4 pt-10 space-y-1 text-sm">
                                            <h3 className="text-lg font-semibold truncate mb-2">{employee.name}</h3>
                                            <p><span className="font-medium text-gray-300">Position:</span> {employee.position}</p>
                                            <p><span className="font-medium text-gray-300">Hourly Wage:</span> ${employee.hourlyWage}</p>
                                            <p><span className="font-medium text-gray-300">TIN No:</span> {employee.tinNo || 'N/A'}</p>
                                            <p><span className="font-medium text-gray-300">FNPF Eligible:</span> {employee.fnpfEligible ? 'Yes' : 'No'}</p>
                                            {employee.fnpfEligible && <p><span className="font-medium text-gray-300">FNPF No:</span> {employee.fnpfNo || 'N/A'}</p>}
                                            {employee.paymentMethod === 'online' ? (
                                                <>
                                                    <p><span className="font-medium text-gray-300">Bank Code:</span> {employee.bankCode || 'N/A'}</p>
                                                    <p><span className="font-medium text-gray-300">Account No:</span> {employee.bankAccountNumber || 'N/A'}</p>
                                                    <p><span className="font-medium text-gray-300">Payment:</span> Online</p>
                                                </>
                                            ) : (
                                                <p><span className="font-medium text-gray-300">Payment:</span> Cash Wages</p>
                                            )}
                                            <p><span className="font-medium text-gray-300">Branch:</span> Labasa</p>
                                            <p><span className="font-medium text-gray-300">Status:</span> {employee.isActive ? 'Active' : 'Inactive'}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}

                    {suvaEmployees.length > 0 && (
                         <section>
                            <h2 className="text-xl font-semibold text-white mb-4 text-center bg-black/30 backdrop-blur-sm py-2 rounded-md border border-white/15">Suva Branch Employees</h2>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {suvaEmployees.map((employee) => (
                                     <Card key={employee.id} className="bg-secondary/30 backdrop-blur-sm border border-white/10 rounded-lg text-white shadow-md relative overflow-hidden">
                                         <CardHeader className="pt-4 pb-2 px-4 flex flex-row justify-end items-center space-x-1 absolute top-1 right-1 z-10">
                                               {/* Edit Button */}
                                              <Link href={`/employees/change?id=${employee.id}`} passHref className="mr-1">
                                                 <Button
                                                     variant="ghost"
                                                     size="icon"
                                                     className="text-blue-300 hover:text-blue-100 hover:bg-white/20 h-7 w-7"
                                                     aria-label={`Edit ${employee.name}`}
                                                 >
                                                     <Edit className="h-4 w-4" />
                                                 </Button>
                                             </Link>
                                              {/* Inactivate Button */}
                                              <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => openDialog(employee.id, 'inactive')}
                                                  className="text-yellow-400 hover:text-yellow-200 hover:bg-white/20 h-7 w-7"
                                                  aria-label={`Mark ${employee.name} as inactive`}
                                              >
                                                  <UserX className="h-4 w-4" /> {/* Replaced UserSlash with UserX */}
                                              </Button>
                                             {/* Delete Button */}
                                              <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => openDialog(employee.id, 'delete')}
                                                  className="text-red-400 hover:text-red-200 hover:bg-white/20 h-7 w-7"
                                                  aria-label={`Delete ${employee.name}`}
                                              >
                                                  <Trash2 className="h-4 w-4" />
                                              </Button>
                                          </CardHeader>
                                         <CardContent className="p-4 pt-10 space-y-1 text-sm">
                                             <h3 className="text-lg font-semibold truncate mb-2">{employee.name}</h3>
                                             <p><span className="font-medium text-gray-300">Position:</span> {employee.position}</p>
                                             <p><span className="font-medium text-gray-300">Hourly Wage:</span> ${employee.hourlyWage}</p>
                                            <p><span className="font-medium text-gray-300">TIN No:</span> {employee.tinNo || 'N/A'}</p>
                                             <p><span className="font-medium text-gray-300">FNPF Eligible:</span> {employee.fnpfEligible ? 'Yes' : 'No'}</p>
                                             {employee.fnpfEligible && <p><span className="font-medium text-gray-300">FNPF No:</span> {employee.fnpfNo || 'N/A'}</p>}
                                             {employee.paymentMethod === 'online' ? (
                                                 <>
                                                     <p><span className="font-medium text-gray-300">Bank Code:</span> {employee.bankCode || 'N/A'}</p>
                                                     <p><span className="font-medium text-gray-300">Account No:</span> {employee.bankAccountNumber || 'N/A'}</p>
                                                     <p><span className="font-medium text-gray-300">Payment:</span> Online</p>
                                                 </>
                                             ) : (
                                                 <p><span className="font-medium text-gray-300">Payment:</span> Cash Wages</p>
                                             )}
                                              <p><span className="font-medium text-gray-300">Branch:</span> Suva</p>
                                              <p><span className="font-medium text-gray-300">Status:</span> {employee.isActive ? 'Active' : 'Inactive'}</p>
                                         </CardContent>
                                     </Card>
                                ))}
                            </div>
                        </section>
                    )}
                 </div>
            )}
         </main>

          {/* Generic Action Confirmation Dialog */}
          <AlertDialog open={!!actionType} onOpenChange={(open) => !open && closeDialog()}>
            <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Action</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-300">
                  Are you sure you want to {actionType === 'delete' ? 'delete' : 'mark as inactive'} employee {employees.find(e => e.id === employeeToAction)?.name}?
                  {actionType === 'delete' && " This action cannot be undone."}
                  Please enter the admin password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="action-password">Admin Password</Label>
                <Input
                  id="action-password"
                  type="password"
                  value={actionPassword}
                  onChange={(e) => setActionPassword(e.target.value)}
                  className="bg-gray-800 border-white/20 text-white"
                  onKeyPress={(e) => { if (e.key === 'Enter') handleActionConfirm(); }}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={closeDialog} className="border-white/20 text-white hover:bg-white/10">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleActionConfirm}
                  className={cn(
                    actionType === 'delete' ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700"
                  )}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Confirm ${actionType === 'delete' ? 'Deletion' : 'Inactivation'}`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
    </div>
  );
};

export default EmployeeInformationPage;
