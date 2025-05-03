'use client';

import Image from 'next/image';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {useEffect, useState, useCallback} from 'react';
import {Trash2, Edit, Home, ArrowLeft, Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getEmployees, deleteEmployee } from '@/services/employee-service'; // Import service functions

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
}

const EmployeeInformationPage = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const [isDeleting, setIsDeleting] = useState(false); // Deleting state
  const {toast} = useToast(); // Initialize useToast
  const [deletePassword, setDeletePassword] = useState('');
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null); // Store ID of employee to delete
  const ADMIN_PASSWORD = 'admin01'; // Store this securely in a real application
  const router = useRouter();

  // Function to fetch and set employees using useCallback
  const fetchAndSetEmployees = useCallback(async () => {
    setIsLoading(true); // Start loading
      try {
        // Fetch employees using the service which now reads from the database
        const fetchedEmployees = await getEmployees();
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


  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return; // Should not happen, but good practice
    if (isDeleting) return; // Prevent multiple delete calls

    if (deletePassword !== ADMIN_PASSWORD) {
      toast({ // Use toast for incorrect password
        title: 'Error',
        description: 'Incorrect password. Please try again.',
        variant: 'destructive',
      });
      console.error('Incorrect password. Please try again.'); // Log error
      setDeletePassword(''); // Clear password input
      return;
    }

    setIsDeleting(true); // Indicate delete process started

    try {
      // Use the service to delete the employee from the database
      await deleteEmployee(employeeToDelete);
      // Re-fetch employees from the database to update the UI
      await fetchAndSetEmployees(); // Refresh the list

      toast({ // Use toast for success
        title: 'Success',
        description: 'Employee deleted successfully!',
      });
      console.log('Employee deleted successfully!'); // Log success
       // Close the dialog manually after successful deletion
       setShowDeleteDialog(false); // Use state to control dialog

    } catch (error: any) {
      console.error('Error deleting employee:', error);
      toast({ // Use toast for deletion error
        title: 'Error',
        description: error.message || 'Failed to delete employee.',
        variant: 'destructive',
      });
    } finally {
       // Reset state after deletion attempt
       setIsDeleting(false);
       setEmployeeToDelete(null);
       setDeletePassword('');
       // Dialog closing is handled by setShowDeleteDialog(false) above
    }
  };

  // State to control delete dialog visibility
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filter employees by branch
  const labasaEmployees = employees.filter(employee => employee.branch === 'labasa');
  const suvaEmployees = employees.filter(employee => employee.branch === 'suva');

  // Render loading state
  if (isLoading) {
      return (
          // Use a div wrapper for layout control
           <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center justify-center min-h-screen text-white font-sans">
               {/* Loading Indicator */}
                <div className="text-xl flex items-center">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading employee data...
                </div>
                 {/* Footer is handled by RootLayout */}
           </div>
      );
  }

  // Render main content
  return (
    // Use a div wrapper for layout control
       <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col flex-grow items-center min-h-screen text-white font-sans">

         {/* Header - Make sticky */}
         <header className="sticky top-0 z-50 w-full py-4 flex justify-between items-center border-b border-white/20 mb-8 sm:mb-10 bg-black/60 backdrop-blur-md">
            <Link href="/employees" passHref className="ml-4"> {/* Added ml-4 */}
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                    <ArrowLeft className="h-5 w-5" />
                    <span className="sr-only">Back to Employee Management</span>
                </Button>
            </Link>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-center text-gray-100 flex-grow">
                Employee Information
            </h1>
            <Link href="/dashboard" passHref className="mr-4"> {/* Added mr-4 */}
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                    <Home className="h-5 w-5" />
                    <span className="sr-only">Dashboard</span>
                </Button>
            </Link>
        </header>

        {/* Main Content Area */}
        <main className="w-full flex-grow overflow-y-auto pb-16 pt-6"> {/* Added pt-6 */}
            {employees.length === 0 ? (
                <Card className="w-full max-w-md mx-auto mt-10 bg-transparent backdrop-blur-md shadow-lg rounded-lg border border-accent/40">
                     <CardContent className="p-6">
                        <p className="text-white text-center">No employee information available. Please add employees first.</p>
                         <div className="mt-4 text-center">
                            <Button asChild variant="gradient">
                                <Link href="/employees/create">Add New Employee</Link>
                            </Button>
                         </div>
                    </CardContent>
                </Card>
            ) : (
                 <div className="space-y-8">
                    {/* Labasa Branch Employees */}
                    {labasaEmployees.length > 0 && (
                        <section>
                            <h2 className="text-xl font-semibold text-white mb-4 text-center bg-black/30 backdrop-blur-sm py-2 rounded-md border border-white/15">Labasa Branch Employees</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {labasaEmployees.map((employee) => (
                                    <Card key={employee.id} className="bg-secondary/30 backdrop-blur-sm border border-white/10 rounded-lg text-white shadow-md relative overflow-hidden">
                                         {/* Action Buttons Header */}
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
                                             {/* Delete Button Trigger */}
                                              <AlertDialog open={showDeleteDialog && employeeToDelete === employee.id} onOpenChange={(open) => {
                                                 if (!open) { // If dialog is closing
                                                     setShowDeleteDialog(false);
                                                     setEmployeeToDelete(null);
                                                     setDeletePassword(''); // Clear password on close
                                                 }
                                                 // We control opening via the button click
                                             }}>
                                                  <AlertDialogTrigger asChild>
                                                      <Button
                                                          variant="ghost"
                                                          size="icon"
                                                          onClick={() => { setEmployeeToDelete(employee.id); setShowDeleteDialog(true); }} // Set the employee and show dialog
                                                          className="text-red-400 hover:text-red-200 hover:bg-white/20 h-7 w-7"
                                                          aria-label={`Delete ${employee.name}`}
                                                      >
                                                          <Trash2 className="h-4 w-4" />
                                                      </Button>
                                                  </AlertDialogTrigger>
                                                  {/* Delete Confirmation Dialog */}
                                                  <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
                                                      <AlertDialogHeader>
                                                          <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                                          <AlertDialogDescription className="text-gray-300">
                                                              Are you sure you want to delete {employee.name}?
                                                              This action cannot be undone.
                                                              Please enter the admin password to confirm.
                                                          </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      {/* Password Input */}
                                                      <div className="grid gap-2">
                                                          <Label htmlFor={`password-delete-${employee.id}`} className="text-gray-300">Admin Password</Label>
                                                          <Input
                                                              id={`password-delete-${employee.id}`}
                                                              type="password"
                                                              value={deletePassword}
                                                              onChange={(e) => setDeletePassword(e.target.value)}
                                                              className="bg-gray-800 border-white/20 text-white"
                                                              // Optional: Trigger delete on Enter key
                                                              onKeyPress={(e) => { if (e.key === 'Enter') handleDeleteEmployee(); }}
                                                          />
                                                      </div>
                                                      {/* Dialog Actions */}
                                                      <AlertDialogFooter>
                                                          <AlertDialogCancel
                                                              className="border-white/20 text-white hover:bg-white/10"
                                                              onClick={() => { setShowDeleteDialog(false); setEmployeeToDelete(null); setDeletePassword(''); }}> {/* Clear state on cancel */}
                                                              Cancel
                                                          </AlertDialogCancel>
                                                          <AlertDialogAction
                                                              onClick={handleDeleteEmployee} // Use the async handler
                                                              className="bg-red-600 hover:bg-red-700"
                                                              disabled={isDeleting} // Disable while deleting
                                                          >
                                                              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Delete'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                         </CardHeader>
                                         {/* Employee Details */}
                                        <CardContent className="p-4 pt-10 space-y-1 text-sm"> {/* Added padding top */}
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
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}

                     {/* Suva Branch Employees */}
                    {suvaEmployees.length > 0 && (
                         <section>
                            <h2 className="text-xl font-semibold text-white mb-4 text-center bg-black/30 backdrop-blur-sm py-2 rounded-md border border-white/15">Suva Branch Employees</h2>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {suvaEmployees.map((employee) => (
                                     <Card key={employee.id} className="bg-secondary/30 backdrop-blur-sm border border-white/10 rounded-lg text-white shadow-md relative overflow-hidden">
                                         {/* Action Buttons Header */}
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
                                             {/* Delete Button Trigger */}
                                              <AlertDialog open={showDeleteDialog && employeeToDelete === employee.id} onOpenChange={(open) => {
                                                 if (!open) {
                                                     setShowDeleteDialog(false);
                                                     setEmployeeToDelete(null);
                                                     setDeletePassword('');
                                                 }
                                              }}>
                                                 <AlertDialogTrigger asChild>
                                                     <Button
                                                         variant="ghost"
                                                         size="icon"
                                                         onClick={() => { setEmployeeToDelete(employee.id); setShowDeleteDialog(true); }} // Set employee and show dialog
                                                         className="text-red-400 hover:text-red-200 hover:bg-white/20 h-7 w-7"
                                                         aria-label={`Delete ${employee.name}`}
                                                     >
                                                         <Trash2 className="h-4 w-4" />
                                                     </Button>
                                                 </AlertDialogTrigger>
                                                   {/* Delete Confirmation Dialog */}
                                                  <AlertDialogContent className="bg-gray-900 border-white/20 text-white">
                                                      <AlertDialogHeader>
                                                          <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                                          <AlertDialogDescription className="text-gray-300">
                                                              Are you sure you want to delete {employee.name}?
                                                              This action cannot be undone.
                                                              Please enter the admin password to confirm.
                                                          </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      {/* Password Input */}
                                                      <div className="grid gap-2">
                                                          <Label htmlFor={`password-delete-${employee.id}`} className="text-gray-300">Admin Password</Label>
                                                          <Input
                                                              id={`password-delete-${employee.id}`}
                                                              type="password"
                                                              value={deletePassword}
                                                              onChange={(e) => setDeletePassword(e.target.value)}
                                                              className="bg-gray-800 border-white/20 text-white"
                                                              onKeyPress={(e) => { if (e.key === 'Enter') handleDeleteEmployee(); }}
                                                          />
                                                      </div>
                                                      {/* Dialog Actions */}
                                                      <AlertDialogFooter>
                                                          <AlertDialogCancel
                                                            className="border-white/20 text-white hover:bg-white/10"
                                                             onClick={() => { setShowDeleteDialog(false); setEmployeeToDelete(null); setDeletePassword(''); }}> {/* Clear state */}
                                                             Cancel
                                                            </AlertDialogCancel>
                                                          <AlertDialogAction
                                                             onClick={handleDeleteEmployee} // Use async handler
                                                             className="bg-red-600 hover:bg-red-700"
                                                             disabled={isDeleting}>
                                                              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Delete'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                          </CardHeader>
                                          {/* Employee Details */}
                                         <CardContent className="p-4 pt-10 space-y-1 text-sm"> {/* Added padding top */}
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
                                         </CardContent>
                                     </Card>
                                ))}
                            </div>
                        </section>
                    )}
                 </div>
            )}
         </main>
         {/* Footer is handled by RootLayout */}
    </div>
  );
};

export default EmployeeInformationPage;
