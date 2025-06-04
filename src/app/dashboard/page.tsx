
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image'; // Added import for Next/Image
import { Power, Loader2, User, Briefcase, Cog, TrendingUp, DollarSign, Users, Calendar, Activity, BarChart3, Eye, EyeOff, BarChartHorizontalBig, UserPlus } from 'lucide-react';
import { getEmployees, getWageRecords, type Employee, type WageRecord } from '@/services/employee-service';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, startOfYear, endOfYear, subMonths } from 'date-fns';

const DashboardPage = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [wageRecords, setWageRecords] = useState<WageRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadingNav, setLoadingNav] = useState<{ [key: string]: boolean }>({});
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authCheckLoading, setAuthCheckLoading] = useState(true);
  const [showSalaryDetails, setShowSalaryDetails] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    if (!storedUser) {
      router.replace('/');
    } else {
      setCurrentUser(storedUser);
      setAuthCheckLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authCheckLoading || !currentUser) return;

    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        // Fetch approved wage records from the start of the last 6 months until now
        const sixMonthsAgo = subMonths(new Date(), 6);
        const startDate = format(startOfYear(sixMonthsAgo), 'yyyy-MM-dd'); // Start of that month's year for broader data
        const endDate = format(new Date(), 'yyyy-MM-dd');
        
        const [fetchedWageRecords, fetchedEmployees] = await Promise.all([
          getWageRecords(startDate, endDate, 'approved', null),
          getEmployees(false) // Fetch only active employees
        ]);

        // Sort wage records by dateFrom ascending for chart
        const sortedWageRecords = fetchedWageRecords.sort((a, b) =>
          parseISO(a.dateFrom).getTime() - parseISO(b.dateFrom).getTime()
        );
        setWageRecords(sortedWageRecords);
        setEmployees(fetchedEmployees);

      } catch (error: any) {
        console.error("Failed to fetch dashboard data:", error);
        let description = error.message || "Could not load dashboard data.";
        if (typeof error.message === 'string' && error.message.includes("An error occurred in the Server Components render")) {
          description = "An unexpected error occurred while fetching data from the server. Please check server logs for more details or contact support. (Digest available in logs)";
        }
        toast({
          title: "Error Fetching Data",
          description: description,
          variant: "destructive",
        });
      } finally {
        setIsLoadingData(false);
      }
    };

    if (currentUser !== 'Priyanka Sharma') { // Priyanka doesn't need this data
        fetchData();
    } else {
        setIsLoadingData(false); // No data to load for Priyanka's specific view
    }
  }, [currentUser, authCheckLoading, toast]);


  const handleNavigation = (path: string) => {
    setLoadingNav(prev => ({ ...prev, [path]: true }));
    router.push(path);
    // setLoading will be implicitly false on page change, or you might want to reset if staying on page (not the case here)
  };

  const handleLogout = () => {
    setLoadingNav(prev => ({ ...prev, logout: true }));
    localStorage.removeItem('username');
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
    router.push('/');
  };

  const isPriyanka = currentUser === 'Priyanka Sharma';

  const dashboardStats = useMemo(() => {
    if (isPriyanka || wageRecords.length === 0) {
        return { totalNetPay: 0, totalGrossPay: 0, avgNetPay: 0, activeEmployees: employees.length, totalPayPeriods: 0, growth: 0 };
    }
    const totalNetPay = wageRecords.reduce((sum, record) => sum + (record.netPay || 0), 0);
    const totalGrossPay = wageRecords.reduce((sum, record) => sum + (record.grossPay || 0), 0);
    const uniquePayPeriods = new Set(wageRecords.map(r => `${r.dateFrom}-${r.dateTo}`)).size;
    const avgNetPay = uniquePayPeriods > 0 ? totalNetPay / uniquePayPeriods : 0;
    
    return {
      totalNetPay,
      totalGrossPay,
      avgNetPay,
      activeEmployees: employees.filter(emp => emp.isActive).length,
      totalPayPeriods: uniquePayPeriods,
      growth: 12.5 // Placeholder: Growth calculation logic needs to be defined
    };
  }, [wageRecords, employees, isPriyanka]);

  const chartData = useMemo(() => {
    if (isPriyanka || wageRecords.length === 0) return [];
    // Group by pay period (dateFrom-dateTo) and sum netPay
    const periodDataMap = new Map<string, { netPay: number; grossPay: number; dateFrom: string }>();
    wageRecords.forEach(record => {
        const periodKey = `${record.dateFrom}_${record.dateTo}`;
        const existing = periodDataMap.get(periodKey) || { netPay: 0, grossPay: 0, dateFrom: record.dateFrom };
        existing.netPay += (record.netPay || 0);
        existing.grossPay += (record.grossPay || 0);
        periodDataMap.set(periodKey, existing);
    });

    return Array.from(periodDataMap.entries())
        .map(([key, value], index) => ({
            period: `Period ${index + 1} (${format(parseISO(value.dateFrom), 'MMM dd')})`,
            netPay: value.netPay,
            grossPay: value.grossPay,
            date: value.dateFrom
        }))
        .sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()) // Ensure chronological for chart
        .slice(-6); // Show last 6 periods
  }, [wageRecords, isPriyanka]);

  if (authCheckLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <Loader2 className="h-16 w-16 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-white text-lg">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-40 left-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-4000"></div>
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-screen">
        <header className="sticky top-0 z-50 w-full py-6 mb-8">
          <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <Image
                  src="/logo.png"
                  alt="Lal's Motor Winders Logo"
                  width={48}
                  height={48}
                  className="rounded-xl"
                />
                <div>
                  <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                    Lal&apos;s Motor Winders (FIJI) PTE Limited
                  </h1>
                  <p className="text-gray-400 text-sm">
                    {isPriyanka ? 'Suva Branch Timesheet Access' : 'Payroll Management Dashboard'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-white font-medium">Welcome, {currentUser}</p>
                  <p className="text-gray-400 text-sm">{new Date().toLocaleDateString()}</p>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loadingNav['logout']}
                  className="p-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl transition-all duration-300 group"
                  aria-label="Logout"
                >
                  {loadingNav['logout'] ? 
                    <Loader2 className="h-5 w-5 text-red-300 animate-spin" /> :
                    <Power className="h-5 w-5 text-red-400 group-hover:text-red-300" />
                  }
                </button>
              </div>
            </div>
          </div>
        </header>

        <nav className="mb-8">
          <div className="flex flex-wrap justify-center gap-4">
            {isPriyanka ? (
              <>
                <button
                  onClick={() => handleNavigation('/wages/timesheet')}
                  disabled={loadingNav['/wages/timesheet']}
                  className="group relative overflow-hidden bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl backdrop-blur-sm flex items-center space-x-3"
                >
                  {loadingNav['/wages/timesheet'] ? 
                    <Loader2 className="h-6 w-6 animate-spin text-blue-400" /> : 
                    <User className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
                  }
                  <span className="text-white font-medium">Timesheet Entry</span>
                </button>
                <button
                  onClick={() => handleNavigation('/wages/timesheet-records')}
                  disabled={loadingNav['/wages/timesheet-records']}
                  className="group relative overflow-hidden bg-gradient-to-r from-green-500/20 to-blue-500/20 hover:from-green-500/30 hover:to-blue-500/30 border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl backdrop-blur-sm flex items-center space-x-3"
                >
                  {loadingNav['/wages/timesheet-records'] ? 
                    <Loader2 className="h-6 w-6 animate-spin text-green-400" /> : 
                    <Briefcase className="h-6 w-6 text-green-400 group-hover:scale-110 transition-transform" />
                  }
                  <span className="text-white font-medium">Records & Review</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleNavigation('/employees')}
                  disabled={loadingNav['/employees']}
                  className="group relative overflow-hidden bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl backdrop-blur-sm flex items-center space-x-3"
                >
                  {loadingNav['/employees'] ? 
                    <Loader2 className="h-6 w-6 animate-spin text-blue-400" /> : 
                    <Users className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
                  }
                  <span className="text-white font-medium">Employee Management</span>
                </button>
                <button
                  onClick={() => handleNavigation('/wages')}
                  disabled={loadingNav['/wages']}
                  className="group relative overflow-hidden bg-gradient-to-r from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl backdrop-blur-sm flex items-center space-x-3"
                >
                  {loadingNav['/wages'] ? 
                    <Loader2 className="h-6 w-6 animate-spin text-green-400" /> : 
                    <Briefcase className="h-6 w-6 text-green-400 group-hover:scale-110 transition-transform" />
                  }
                  <span className="text-white font-medium">Wages Management</span>
                </button>
                {currentUser === 'ADMIN' && (
                  <button
                    onClick={() => handleNavigation('/admin')}
                    disabled={loadingNav['/admin']}
                    className="group relative overflow-hidden bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl backdrop-blur-sm flex items-center space-x-3"
                  >
                    {loadingNav['/admin'] ? 
                      <Loader2 className="h-6 w-6 animate-spin text-purple-400" /> : 
                      <Cog className="h-6 w-6 text-purple-400 group-hover:scale-110 transition-transform" />
                    }
                    <span className="text-white font-medium">Administrator</span>
                  </button>
                )}
              </>
            )}
          </div>
        </nav>

        <main className="pb-8">
          {isLoadingData && !isPriyanka ? (
             <div className="flex justify-center items-center min-h-[40vh] bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-12">
                <div className="text-center">
                    <Loader2 className="h-16 w-16 animate-spin text-blue-400 mx-auto mb-4" />
                    <p className="text-white text-lg">Loading dashboard data...</p>
                </div>
            </div>
          ) : !isPriyanka ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl">
                      <DollarSign className="h-6 w-6 text-blue-400" />
                    </div>
                    <button
                      onClick={() => setShowSalaryDetails(!showSalaryDetails)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      aria-label={showSalaryDetails ? "Hide salary details" : "Show salary details"}
                    >
                      {showSalaryDetails ? 
                        <EyeOff className="h-4 w-4 text-gray-400" /> : 
                        <Eye className="h-4 w-4 text-gray-400" />
                      }
                    </button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-gray-400 text-sm">Total Net Pay (Last 6m)</p>
                    <p className="text-3xl font-bold text-white">
                      {showSalaryDetails ? `$${dashboardStats.totalNetPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '****'}
                    </p>
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      <span className="text-green-400 text-sm">+{dashboardStats.growth}% (mock)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-500/20 rounded-xl">
                      <Users className="h-6 w-6 text-green-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-gray-400 text-sm">Active Employees</p>
                    <p className="text-3xl font-bold text-white">{dashboardStats.activeEmployees}</p>
                    <p className="text-green-400 text-sm">Currently Active</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-purple-500/20 rounded-xl">
                      <Calendar className="h-6 w-6 text-purple-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-gray-400 text-sm">Processed Pay Periods (Last 6m)</p>
                    <p className="text-3xl font-bold text-white">{dashboardStats.totalPayPeriods}</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-orange-500/20 rounded-xl">
                      <Activity className="h-6 w-6 text-orange-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-gray-400 text-sm">Avg. Net Pay (Per Period)</p>
                    <p className="text-3xl font-bold text-white">
                      {showSalaryDetails ? `$${Math.round(dashboardStats.avgNetPay).toLocaleString()}` : '****'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Pay Trend Analysis (Last 6 Periods)</h2>
                    <p className="text-gray-400">Net pay distribution over recent pay periods</p>
                  </div>
                  <div className="p-3 bg-blue-500/20 rounded-xl">
                    <BarChart3 className="h-6 w-6 text-blue-400" />
                  </div>
                </div>
                
                {chartData.length === 0 && !isLoadingData ? (
                    <p className="text-center text-gray-400 py-10">No pay data available for chart.</p>
                ) : (
                  <div className="space-y-4">
                    {chartData.map((item, index) => (
                      <div key={index} className="flex items-center space-x-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                        <div className="w-32 text-sm text-gray-400">{item.period}</div>
                        <div className="flex-1">
                          <div className="h-8 bg-gray-700 rounded-lg overflow-hidden relative">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg transition-all duration-1000 ease-out"
                              style={{ width: `${(item.netPay / Math.max(...chartData.map(d => d.netPay), 1)) * 100}%` }}
                            ></div>
                            <div className="absolute inset-0 flex items-center px-3">
                              <span className="text-white text-sm font-medium">
                                {showSalaryDetails ? `$${item.netPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '****'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="w-20 text-right">
                          <div className="text-xs text-gray-400">Net Pay</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <h2 className="text-2xl font-bold text-white mb-6">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button 
                    onClick={() => handleNavigation('/employees/create')}
                    disabled={loadingNav['/employees/create']}
                    className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-xl hover:from-blue-500/20 hover:to-blue-600/20 transition-all duration-300 text-left group flex flex-col items-start"
                  >
                    <div className="flex items-center mb-3">
                        {loadingNav['/employees/create'] ? <Loader2 className="h-8 w-8 text-blue-400 animate-spin"/> : <UserPlus className="h-8 w-8 text-blue-400 group-hover:scale-110 transition-transform" />}
                    </div>
                    <h3 className="text-white font-medium mb-1">Add New Employee</h3>
                    <p className="text-gray-400 text-sm">Quickly register a new team member</p>
                  </button>
                  <button 
                    onClick={() => handleNavigation('/wages/create')}
                    disabled={loadingNav['/wages/create']}
                    className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/10 border border-green-500/20 rounded-xl hover:from-green-500/20 hover:to-green-600/20 transition-all duration-300 text-left group flex flex-col items-start"
                  >
                     <div className="flex items-center mb-3">
                        {loadingNav['/wages/create'] ? <Loader2 className="h-8 w-8 text-green-400 animate-spin"/> : <DollarSign className="h-8 w-8 text-green-400 group-hover:scale-110 transition-transform" />}
                    </div>
                    <h3 className="text-white font-medium mb-1">Process Payroll</h3>
                    <p className="text-gray-400 text-sm">Calculate and approve wages</p>
                  </button>
                  <button 
                    onClick={() => handleNavigation('/wages/records')}
                    disabled={loadingNav['/wages/records']}
                    className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20 rounded-xl hover:from-purple-500/20 hover:to-purple-600/20 transition-all duration-300 text-left group flex flex-col items-start"
                  >
                     <div className="flex items-center mb-3">
                        {loadingNav['/wages/records'] ? <Loader2 className="h-8 w-8 text-purple-400 animate-spin"/> :  <BarChartHorizontalBig className="h-8 w-8 text-purple-400 group-hover:scale-110 transition-transform" />}
                    </div>
                    <h3 className="text-white font-medium mb-1">View Wage Records</h3>
                    <p className="text-gray-400 text-sm">Review historical wage data</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl p-12 max-w-2xl mx-auto">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <User className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Welcome, Priyanka!</h2>
                <p className="text-gray-400 text-lg mb-8">Manage Suva branch timesheets and related records using the navigation menu above.</p>
                <div className="flex justify-center space-x-4">
                  <div className="px-4 py-2 bg-blue-500/20 rounded-full">
                    <span className="text-blue-400 text-sm">Timesheet Manager</span>
                  </div>
                  <div className="px-4 py-2 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-sm">Suva Branch Access</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;

    
