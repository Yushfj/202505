
'use server';

import { Pool, PoolClient } from 'pg';
import { query, getDbPool } from '@/lib/db';
import { format, isValid as isDateValid, parseISO, addDays, differenceInDays, startOfYear, endOfYear } from 'date-fns';
import { randomBytes } from 'crypto';

// --- Constants for wage calculation ---
const STANDARD_NORMAL_HOURS_THRESHOLD = 45; // Weekly normal hours
const SPECIAL_EMPLOYEE_NAME = "Bimlesh Shashi Prakash";
const SPECIAL_NORMAL_HOURS_THRESHOLD = 48; // Weekly normal hours for Bimlesh
const DAILY_NORMAL_HOURS_THRESHOLD = 8; // Used for splitting daily hours into normal/OT if needed in timesheet entry
const OVERTIME_RATE = 1.5;
const STANDARD_LEAVE_DAY_HOURS = 8; // Standard hours for a paid leave day


// --- Interfaces ---
export interface Employee {
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
  isActive: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface WageRecord {
  id?: string;
  employeeId: string;
  employeeName: string;
  hourlyWage: number;
  totalHours: number;
  hoursWorked: number;
  overtimeHours: number;
  mealAllowance: number;
  fnpfDeduction: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  approvalId?: string;
  approvalStatus?: 'pending' | 'approved' | 'declined';
  created_at?: Date;
}

export interface WageApproval {
    id: string;
    token: string;
    dateFrom: string; // YYYY-MM-DD
    dateTo: string; // YYYY-MM-DD
    status: 'pending' | 'approved' | 'declined';
    approval_type: 'timesheet_review' | 'final_wage' | 'leave_request'; // Added 'leave_request'
    initiated_by: string | null;
    created_at?: Date;
    approved_at?: Date | null;
    declined_at?: Date | null;
    approved_by?: string | null;
    branch?: 'labasa' | 'suva' | null;
}

export interface PayPeriodSummary {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  approvalId: string;
  totalWages: number;
  totalCashWages: number;
  totalOnlineWages: number;
  status: 'pending' | 'approved' | 'declined';
  approval_type: 'timesheet_review' | 'final_wage' | 'leave_request'; // Added 'leave_request'
  initiated_by: string | null;
  token?: string;
  branch?: 'labasa' | 'suva' | null;
}

export interface UpdatedWageRecordData {
    id: string;
    totalHours?: number;
    mealAllowance?: number;
    otherDeductions?: number;
}

export interface TimesheetEntrySummary {
  employeeId: string;
  employeeName?: string;
  totalHours: number;
  totalNormalHours: number;
  totalOvertimeHours: number;
  totalMealAllowance: number;
  attendanceStatus: 'Present' | 'Absent' | 'Mixed' | 'No Record'; // Added field
}

export interface DailyTimesheetEntryData {
  id?: string; // Optional: used for updates
  branch: "labasa" | "suva";
  employeeId: string;
  date: string; // YYYY-MM-DD
  isPresent: boolean;
  isAbsent: boolean;
  timeIn: string | null;
  lunchIn: string | null;
  lunchOut: string | null;
  timeOut: string | null;
  normalHours: number;
  overtimeHours: number;
  mealAllowance: number;
  overtimeReason: string | null;
}

export interface DailyTimesheetRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  branch: 'labasa' | 'suva';
  entryDate: string; // YYYY-MM-DD
  isPresent: boolean;
  isAbsent: boolean;
  timeIn: string | null;
  lunchIn: string | null;
  lunchOut: string | null;
  timeOut: string | null;
  normalHours: number | null;
  overtimeHours: number | null;
  mealAllowance: number | null;
  overtimeReason: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LeaveRequestData {
  employeeId: string;
  leaveType: string; // e.g., 'annual', 'sick', 'bereavement', 'maternity_paternity', 'unpaid', 'other'
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  letterImageDataUri: string | null; // Base64 data URI for the image
  notes: string | null;
  branch: 'labasa' | 'suva'; // Employee's branch
}

export interface LeaveRequestRecord {
    id: string; // leave_requests.id
    approval_id: string;
    employeeId: string;
    leave_type: string;
    dateFrom: string;
    dateTo: string;
    letterImageDataUri: string | null;
    notes: string | null;
    employeeName: string;
    branch: 'labasa' | 'suva';
    created_at: Date;
    updated_at: Date;
}

export interface LeaveRequestDisplayDetails extends LeaveRequestRecord {
  status: 'pending' | 'approved' | 'declined';
  initiated_by: string | null;
  approvalToken?: string;
}


export const getEmployees = async (includeInactive = false): Promise<Employee[]> => {
  console.log("[EmployeeService] getEmployees called. includeInactive:", includeInactive);
  let queryString = `
    SELECT
      id,
      employee_name,
      position,
      hourly_wage,
      fnpf_no,
      tin_no,
      bank_code,
      bank_account_number,
      payment_method,
      branch,
      fnpf_eligible,
      is_active,
      created_at,
      updated_at
    FROM employees1
  `;

  if (!includeInactive) {
      queryString += ' WHERE is_active = TRUE';
  }

  queryString += ' ORDER BY branch, employee_name;';

  try {
    const result = await query(queryString);
     return result.rows.map(row => ({
        id: row.id,
        name: row.employee_name,
        position: row.position,
        hourlyWage: String(row.hourly_wage || '0'),
        fnpfNo: row.fnpf_no,
        tinNo: row.tin_no,
        bankCode: row.bank_code,
        bankAccountNumber: row.bank_account_number,
        paymentMethod: row.payment_method,
        branch: row.branch,
        fnpfEligible: Boolean(row.fnpf_eligible),
        isActive: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at,
    })) as Employee[];
  } catch (error: any) {
    console.error('[EmployeeService] Detailed error fetching employees from database:', error.stack);
    let errorMessage = `Failed to fetch employees. DB Error: ${error.message || 'Unknown database error'}`;
    if (error.message?.includes('relation "employees1" does not exist')) {
        errorMessage = 'Failed to fetch employees. The "employees1" table does not seem to exist in the database. Please check the schema.';
    } else if (error.message?.includes('password authentication failed')) {
        errorMessage = 'Failed to fetch employees. Database password authentication failed.';
    } else if (error.message?.includes('Database connection is not available')) {
        if (error.message.includes('Original error:')) {
            errorMessage = error.message;
        } else {
            errorMessage = `Failed to fetch employees. Database connection is not available. Original error: ${error.message}`;
        }
    }
     throw new Error(errorMessage);
  }
};

export const addEmployee = async (employeeData: Omit<Employee, 'id' | 'created_at' | 'updated_at' | 'isActive'>): Promise<string> => {
  const {
    name,
    position,
    hourlyWage,
    fnpfNo,
    tinNo,
    bankCode,
    bankAccountNumber,
    paymentMethod,
    branch,
    fnpfEligible,
  } = employeeData;

  if (!name || !position || !hourlyWage) {
      throw new Error('Missing required employee fields (name, position, hourlyWage).');
  }

   const hourlyWageNumeric = parseFloat(hourlyWage);
   if (isNaN(hourlyWageNumeric) || hourlyWageNumeric < 0) {
     throw new Error('Invalid Hourly Wage value.');
   }

  const finalFnpfNo = fnpfEligible ? (fnpfNo?.trim() || null) : null;
  const finalTinNo = tinNo?.trim() || null;
  const finalBankCode = paymentMethod === 'online' ? (bankCode || null) : null;
  const finalBankAccountNumber = paymentMethod === 'online' ? (bankAccountNumber?.trim() || null) : null;

  let client;
  try {
    const pool = await getDbPool();
    client = await pool.connect();
    await client.query('BEGIN');

    if (finalFnpfNo) {
        const existingFnpfResult = await client.query(
           `SELECT id, employee_name FROM employees1 WHERE fnpf_no = $1 AND is_active = TRUE LIMIT 1;`,
           [finalFnpfNo]
        );
        if (existingFnpfResult.rows.length > 0) {
             const errorMessage = `Duplicate FNPF Number: An employee with FNPF Number ${finalFnpfNo} already exists (${existingFnpfResult.rows[0].employee_name}). Please use a different number.`;
             console.error(errorMessage);
             await client.query('ROLLBACK'); 
             throw new Error(errorMessage);
        }
    }

    const result = await client.query(
      `INSERT INTO employees1 (employee_name, position, hourly_wage, fnpf_no, tin_no, bank_code, bank_account_number, payment_method, branch, fnpf_eligible, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id;`,
      [
        name,
        position,
        hourlyWageNumeric,
        finalFnpfNo,
        finalTinNo,
        finalBankCode,
        finalBankAccountNumber,
        paymentMethod,
        branch,
        fnpfEligible,
      ]
    );
    await client.query('COMMIT');

    if (result.rows.length === 0) {
        console.error('Insert query did not return an ID.');
        throw new Error('Failed to create employee, no ID returned.');
    }
    return result.rows[0].id;
  } catch (error: any) {
    if (client && !error.message?.includes('Duplicate FNPF Number:')) { 
      await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
    }
    console.error('Detailed error adding employee to database:', error.stack);
    let errorMessage = `Failed to add employee. DB Error: ${error.message || 'Unknown database error'}`;

    if (error.message?.includes(`Duplicate FNPF Number:`)) { 
        errorMessage = error.message;
    } else if (error.code === '23505' && error.constraint === 'employees1_fnpf_no_key') { 
        errorMessage = `Failed to add employee. The FNPF Number '${finalFnpfNo}' already exists.`;
    } else if (error.message?.includes('relation "employees1" does not exist')) {
        errorMessage = 'Failed to add employee. The "employees1" table does not seem to exist in the database. Please check the schema.';
    } else if (error.message?.includes('password authentication failed')) {
        errorMessage = 'Failed to add employee. Database password authentication failed.';
    } else if (error.message?.includes('Database connection is not available')) {
        if (error.message.includes('Original error:')) {
            errorMessage = error.message;
        } else {
            errorMessage = `Failed to add employee. Database connection is not available. Original error: ${error.message}`;
        }
    }
    throw new Error(errorMessage);
  } finally {
    if (client) {
        client.release();
    }
  }
};


export const checkExistingFNPFNo = async (fnpfNo: string | null): Promise<{ id: string, name: string } | null> => {
    if (!fnpfNo || fnpfNo.trim() === '') {
        return null;
    }
    const trimmedFnpfNo = fnpfNo.trim();
    try {
        const result = await query(
            `SELECT id, employee_name FROM employees1 WHERE fnpf_no = $1 AND is_active = TRUE LIMIT 1;`,
            [trimmedFnpfNo]
        );
        if (result.rows.length > 0) {
            return { id: result.rows[0].id, name: result.rows[0].employee_name };
        }
        return null;
    } catch (error: any) {
        console.error("Error checking existing FNPF number:", error.stack);
        throw new Error(`Failed to check existing FNPF number. DB Error: ${error.message || 'Unknown database error'}`);
    }
};

export const updateEmployee = async (updatedEmployee: Omit<Employee, 'created_at' | 'updated_at'>): Promise<void> => {
  const {
    id,
    name,
    position,
    hourlyWage,
    fnpfNo,
    tinNo,
    bankCode,
    bankAccountNumber,
    paymentMethod,
    branch,
    fnpfEligible,
    isActive,
  } = updatedEmployee;

   if (!id || !name || !position || !hourlyWage || typeof isActive !== 'boolean') {
     throw new Error('Missing required employee fields for update (id, name, position, hourlyWage, isActive).');
   }

   const hourlyWageNumeric = parseFloat(hourlyWage);
   if (isNaN(hourlyWageNumeric) || hourlyWageNumeric < 0) {
     throw new Error('Invalid Hourly Wage value for update.');
   }

   const finalFnpfNo = fnpfEligible ? (fnpfNo?.trim() || null) : null;
   const finalTinNo = tinNo?.trim() || null;
   const finalBankCode = paymentMethod === 'online' ? (bankCode || null) : null;
   const finalBankAccountNumber = paymentMethod === 'online' ? (bankAccountNumber?.trim() || null) : null;

   let client;
   try {
       const pool = await getDbPool();
       client = await pool.connect();
       await client.query('BEGIN');

       if (finalFnpfNo) {
           const existingFnpfResult = await client.query(
               `SELECT id, employee_name FROM employees1 WHERE fnpf_no = $1 AND id != $2::uuid AND is_active = TRUE LIMIT 1;`,
               [finalFnpfNo, id]
           );
           if (existingFnpfResult.rows.length > 0) {
               throw new Error(`Failed to update employee. The FNPF Number '${finalFnpfNo}' already exists for another employee (${existingFnpfResult.rows[0].employee_name}, ID: ${existingFnpfResult.rows[0].id}).`);
           }
       }

       const updateResult = await client.query(
           `UPDATE employees1
            SET
              employee_name = $1, position = $2, hourly_wage = $3, fnpf_no = $4,
              tin_no = $5, bank_code = $6, bank_account_number = $7,
              payment_method = $8, branch = $9, fnpf_eligible = $10, is_active = $11,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $12::uuid;`,
           [
               name, position, hourlyWageNumeric, finalFnpfNo, finalTinNo,
               finalBankCode, finalBankAccountNumber, paymentMethod, branch,
               fnpfEligible, isActive, id,
           ]
       );

       if (updateResult.rowCount === 0) {
           throw new Error(`Employee with ID ${id} not found for update.`);
       }

       const updateWageRecordsResult = await client.query(
           `UPDATE wage_records SET employee_name = $1 WHERE employee_id = $2::uuid;`,
           [name, id]
       );
       console.log(`Updated employee name in ${updateWageRecordsResult.rowCount} wage records for employee ID ${id}.`);

       await client.query('COMMIT');
   } catch (error: any) {
       if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
       console.error(`Detailed error updating employee with ID ${id}:`, error.stack);
       let errorMessage = `Failed to update employee. DB Error: ${error.message || 'Unknown database error'}`;
        if (error.message?.includes('FNPF Number already exists')) {
             errorMessage = error.message;
        } else if (error.code === '23505' && error.constraint === 'employees1_fnpf_no_key') {
           errorMessage = `Failed to update employee. The FNPF Number '${finalFnpfNo}' already exists for another employee.`;
       }
       throw new Error(errorMessage);
   } finally {
       if (client) client.release();
   }
};

export const setEmployeeActiveStatus = async (employeeId: string, isActive: boolean): Promise<void> => {
    if (!employeeId) {
        throw new Error('Employee ID is required to update active status.');
    }
    try {
        const result = await query(
            `UPDATE employees1 SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid;`,
            [isActive, employeeId]
        );
        if (result.rowCount === 0) {
            throw new Error(`Employee with ID ${employeeId} not found to update active status.`);
        }
        console.log(`Employee with ID ${employeeId} active status set to ${isActive}.`);
    } catch (error: any) {
        console.error(`Detailed error setting active status for employee ${employeeId}:`, error.stack);
        throw new Error(`Failed to update employee active status. DB Error: ${error.message || 'Unknown database error'}`);
    }
};

export const deleteEmployee = async (employeeId: string): Promise<void> => {
   if (!employeeId) {
       throw new Error('Employee ID is required for deletion.');
   }
   let client;
   try {
       const pool = await getDbPool();
       client = await pool.connect();
       await client.query('BEGIN');

       const deleteTimesheetsResult = await client.query(
           'DELETE FROM daily_timesheet_entries WHERE employee_id = $1::uuid;',
           [employeeId]
       );
       console.log(`Deleted ${deleteTimesheetsResult.rowCount} timesheet entries for employee ID ${employeeId}.`);
       
       const deleteLeaveRequestsResult = await client.query(
           'DELETE FROM leave_requests WHERE employee_id = $1::uuid;',
           [employeeId]
       );
       console.log(`Deleted ${deleteLeaveRequestsResult.rowCount} leave requests for employee ID ${employeeId}.`);


       const deleteWagesResult = await client.query(
           'DELETE FROM wage_records WHERE employee_id = $1::uuid;',
           [employeeId]
       );
       console.log(`Deleted ${deleteWagesResult.rowCount} wage records for employee ID ${employeeId}.`);

       const deleteEmployeeResult = await client.query(
           'DELETE FROM employees1 WHERE id = $1::uuid;',
           [employeeId]
       );

       if (deleteEmployeeResult.rowCount === 0) {
           console.warn(`Employee with ID ${employeeId} not found during deletion.`);
       } else {
           console.log(`Employee with ID ${employeeId} deleted successfully.`);
       }

       await client.query('COMMIT');
   } catch (error: any) {
       if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
       console.error(`Detailed error deleting employee with ID ${employeeId}:`, error.stack);
       let errorMessage = `Failed to delete employee. DB Error: ${error.message || 'Unknown database error'}`;
       if (error.code === '23503') {
           errorMessage = `Cannot delete employee ${employeeId} due to existing related records in other tables. Please ensure all related data is handled.`;
       }
       throw new Error(errorMessage);
   } finally {
       if (client) client.release();
   }
};

export const getEmployeeById = async (employeeId: string): Promise<Employee | null> => {
  if (!employeeId) {
    return null;
  }
  try {
    const result = await query(`
      SELECT id, employee_name, position, hourly_wage, fnpf_no, tin_no,
             bank_code, bank_account_number, payment_method, branch,
             fnpf_eligible, is_active, created_at, updated_at
      FROM employees1 WHERE id = $1::uuid;`, [employeeId]);

    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
     return {
        id: row.id,
        name: row.employee_name,
        position: row.position,
        hourlyWage: String(row.hourly_wage || '0'),
        fnpfNo: row.fnpf_no,
        tinNo: row.tin_no,
        bankCode: row.bank_code,
        bankAccountNumber: row.bank_account_number,
        paymentMethod: row.payment_method,
        branch: row.branch,
        fnpfEligible: Boolean(row.fnpf_eligible),
        isActive: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at,
    } as Employee;
  } catch (error: any) {
    console.error(`Detailed error fetching employee with ID ${employeeId}:`, error.stack);
    throw error;
  }
};

const generateToken = (): string => {
    return randomBytes(32).toString('hex');
};

const saveWageRecordsForApproval = async (
    wageRecords: Omit<WageRecord, 'id' | 'approvalId' | 'approvalStatus' | 'created_at'>[],
    approvalId: string,
    client: Pool | PoolClient
): Promise<void> => {
    if (!wageRecords || wageRecords.length === 0) {
        console.warn("No wage records provided for saving within approval.");
        return;
    }

    const insertValues = wageRecords.map(r => [
        r.employeeId, approvalId, r.employeeName, r.hourlyWage,
        r.totalHours, r.hoursWorked, r.overtimeHours,
        r.mealAllowance, r.fnpfDeduction, r.otherDeductions, r.grossPay, r.netPay,
        r.dateFrom, r.dateTo
    ]);

    let placeholderIndex = 1;
    const placeholders = insertValues.map(() =>
        `($${placeholderIndex++}::uuid, $${placeholderIndex++}::uuid, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}::date, $${placeholderIndex++}::date, CURRENT_TIMESTAMP)`
    ).join(', ');

    await client.query(
        `INSERT INTO wage_records (
             employee_id, approval_id, employee_name, hourly_wage,
             total_hours, hours_worked, overtime_hours, meal_allowance,
             fnpf_deduction, other_deductions, gross_pay, net_pay,
             date_from, date_to, created_at
         ) VALUES ${placeholders};`,
        insertValues.flat()
    );
};


export const requestWageApproval = async (
    wageRecords: Omit<WageRecord, 'id' | 'approvalId' | 'approvalStatus' | 'created_at'>[],
    initiatedBy: string | null,
    branch: 'labasa' | 'suva' | null = null,
    existingApprovalIdToUpdate?: string
): Promise<{approvalId: string, approvalLink: string}> => {
    if (!wageRecords || wageRecords.length === 0) {
        throw new Error("No wage records provided for final wage approval request.");
    }

    const { dateFrom, dateTo } = wageRecords[0];
    if (!dateFrom || !dateTo || !isDateValid(parseISO(dateFrom)) || !isDateValid(parseISO(dateTo))) {
        throw new Error("Invalid date range in wage records batch for final approval.");
    }

    const token = generateToken();
    let client;
    let approvalId: string;

    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        if (existingApprovalIdToUpdate) {
            const existingResult = await client.query(
                `SELECT id, status, approval_type, branch FROM wage_approvals WHERE id = $1::uuid AND approval_type = 'final_wage' FOR UPDATE;`,
                [existingApprovalIdToUpdate]
            );
            if (existingResult.rowCount === 0) {
                throw new Error(`Approval ID ${existingApprovalIdToUpdate} not found or is not a final wage approval.`);
            }
            if (existingResult.rows[0].status !== 'pending') {
                throw new Error(`Cannot update approval ID ${existingApprovalIdToUpdate} because its status is not 'pending'.`);
            }
            if (existingResult.rows[0].branch !== branch && !(existingResult.rows[0].branch === null && branch === null) ) {
                throw new Error(`Branch mismatch: Cannot update approval for branch ${existingResult.rows[0].branch || 'All'} with data for branch ${branch || 'All'}.`);
            }
            const updateApprovalResult = await client.query(
                `UPDATE wage_approvals
                 SET token = $1, initiated_by = $2, created_at = CURRENT_TIMESTAMP,
                     approved_at = NULL, declined_at = NULL, approved_by = NULL, status = 'pending'
                 WHERE id = $3::uuid RETURNING id;`,
                [token, initiatedBy, existingApprovalIdToUpdate]
            );
            approvalId = updateApprovalResult.rows[0].id;
            await client.query('DELETE FROM wage_records WHERE approval_id = $1::uuid;', [approvalId]);
        } else {
            const checkExistingQuery = `
                SELECT id FROM wage_approvals
                WHERE date_from = $1::date AND date_to = $2::date
                  AND approval_type = 'final_wage'
                  AND status IN ('pending', 'approved')
                  AND (branch = $3 OR ($3 IS NULL AND branch IS NULL)) 
                LIMIT 1;`;
            const existingFinalWageApproval = await client.query(checkExistingQuery, [dateFrom, dateTo, branch]);

            if (existingFinalWageApproval.rowCount > 0) {
                const existingId = existingFinalWageApproval.rows[0].id;
                console.warn(`Attempted to create a new final_wage approval for ${dateFrom}-${dateTo} (Branch: ${branch || 'None'}), but one already exists with ID ${existingId} (status pending/approved).`);
                throw new Error(`A final wage approval for this period and branch is already pending or approved.`);
            }
            
            const approvalResult = await client.query(
                `INSERT INTO wage_approvals (token, date_from, date_to, status, approval_type, initiated_by, branch, created_at)
                 VALUES ($1, $2::date, $3::date, 'pending', 'final_wage', $4, $5, CURRENT_TIMESTAMP) RETURNING id;`,
                [token, dateFrom, dateTo, initiatedBy, branch]
            );
            if (approvalResult.rows.length === 0) {
                throw new Error('Failed to create final wage approval record.');
            }
            approvalId = approvalResult.rows[0].id;
        }

        await saveWageRecordsForApproval(wageRecords, approvalId, client);

        await client.query('COMMIT');

        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9002');
        const approvalLink = `${baseURL.replace(/\/$/, '')}/approve-wages?token=${token}`;
        console.log(`Final wage approval link ${existingApprovalIdToUpdate ? 'regenerated' : 'generated'}: ${approvalLink}`);
        return { approvalId, approvalLink };

    } catch (error: any) {
        if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
        console.error('Detailed error requesting final wage approval:', error.stack);
        throw new Error(`Failed to request final wage approval. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
        if (client) client.release();
    }
};

export const requestTimesheetPeriodReview = async (
    dateFrom: string,
    dateTo: string,
    initiatedBy: string | null,
    branch: 'labasa' | 'suva' | null = null
): Promise<{approvalId: string, approvalLink: string}> => {
    if (!dateFrom || !dateTo || !isDateValid(parseISO(dateFrom)) || !isDateValid(parseISO(dateTo))) {
        throw new Error("Invalid date range for timesheet period review.");
    }

    let timesheetCheckQuery = `
        SELECT 1 FROM daily_timesheet_entries dts
        JOIN employees1 e ON dts.employee_id = e.id
        WHERE dts.entry_date >= $1::date AND dts.entry_date <= $2::date AND e.is_active = TRUE `;
    const timesheetCheckParams: any[] = [dateFrom, dateTo];
    if (branch) {
        timesheetCheckQuery += ` AND dts.branch = $3`;
        timesheetCheckParams.push(branch);
    }
    timesheetCheckQuery += ` LIMIT 1;`;

    console.log(`[EmployeeService] Checking for timesheet entries for period ${dateFrom}-${dateTo}, branch: ${branch || 'all'}`);
    const timesheetCheck = await query(timesheetCheckQuery, timesheetCheckParams);

    if (timesheetCheck.rowCount === 0) {
        throw new Error(`No timesheet entries found for active employees for period ${dateFrom} to ${dateTo}${branch ? ` in ${branch} branch` : ''}. Cannot submit for review.`);
    }
    console.log(`[EmployeeService] Timesheet entries found. Proceeding to check existing approvals.`);

    let client: PoolClient | undefined;
    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        let token = generateToken(); // Generate a new token by default
        let approvalId: string;
        let newLinkGenerated = false;

        const insertQuery = `
            INSERT INTO wage_approvals (token, date_from, date_to, status, approval_type, initiated_by, branch, created_at)
            VALUES ($1, $2::date, $3::date, 'pending', 'timesheet_review', $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (date_from, date_to, approval_type, branch) WHERE branch IS NOT NULL DO NOTHING
            RETURNING id, token;`;
        
        const insertQueryNullBranch = `
            INSERT INTO wage_approvals (token, date_from, date_to, status, approval_type, initiated_by, branch, created_at)
            VALUES ($1, $2::date, $3::date, 'pending', 'timesheet_review', $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (date_from, date_to, approval_type) WHERE branch IS NULL DO NOTHING
            RETURNING id, token;`;

        const finalInsertQuery = branch ? insertQuery : insertQueryNullBranch;
        
        const approvalResult = await client.query(finalInsertQuery, [token, dateFrom, dateTo, initiatedBy, branch]);

        if (approvalResult.rowCount > 0) {
            approvalId = approvalResult.rows[0].id;
            newLinkGenerated = true;
            console.log(`[EmployeeService] New timesheet review created (ID: ${approvalId}, Branch: ${branch || 'None'}).`);
        } else {
            console.warn(`[EmployeeService] INSERT for timesheet review resulted in ON CONFLICT for ${dateFrom}-${dateTo} (Branch: ${branch || 'None'}). Checking existing record.`);
            
            let existingApprovalQuery = `
                SELECT id, status, token FROM wage_approvals
                WHERE date_from = $1::date AND date_to = $2::date
                  AND approval_type = 'timesheet_review' `;
            const existingApprovalParams: any[] = [dateFrom, dateTo];
            if (branch) {
                existingApprovalQuery += ` AND branch = $3 `;
                existingApprovalParams.push(branch);
            } else {
                existingApprovalQuery += ` AND branch IS NULL `;
            }
            existingApprovalQuery += ` LIMIT 1;`;

            const existingApproval = await client.query(existingApprovalQuery, existingApprovalParams);

            if (existingApproval.rowCount === 0) {
                await client.query('ROLLBACK');
                throw new Error('Failed to process timesheet review: conflict occurred but no existing record found for update.');
            }

            const existingRecord = existingApproval.rows[0];
            approvalId = existingRecord.id;

            if (existingRecord.status === 'declined') {
                console.log(`[EmployeeService] Found existing 'declined' timesheet review (ID: ${approvalId}, Branch: ${branch || 'None'}). Reactivating.`);
                const newTokenForUpdate = generateToken();
                const updateResult = await client.query(
                    `UPDATE wage_approvals
                     SET status = 'pending', token = $1, initiated_by = $2, created_at = CURRENT_TIMESTAMP,
                         approved_at = NULL, declined_at = NULL, approved_by = NULL
                     WHERE id = $3::uuid RETURNING token;`,
                    [newTokenForUpdate, initiatedBy, approvalId]
                );
                if (updateResult.rowCount > 0 && updateResult.rows[0].token) {
                    token = updateResult.rows[0].token; 
                    newLinkGenerated = true;
                } else {
                    await client.query('ROLLBACK');
                    throw new Error('Failed to reactivate declined timesheet review. Record may have changed or update failed.');
                }
            } else if (existingRecord.status === 'pending' || existingRecord.status === 'approved') {
                await client.query('ROLLBACK');
                console.warn(`[EmployeeService] Timesheet review for ${dateFrom}-${dateTo} (Branch: ${branch || 'None'}) already exists with status ${existingRecord.status} (ID: ${approvalId}).`);
                throw new Error(`A timesheet review for this period and branch already exists and is ${existingRecord.status}.`);
            } else {
                await client.query('ROLLBACK');
                throw new Error(`Timesheet review for this period and branch has an unexpected status: ${existingRecord.status}.`);
            }
        }

        await client.query('COMMIT');
        
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9002');
        const approvalLink = `${baseURL.replace(/\/$/, '')}/approve-wages?token=${token}`;
        
        console.log(`[EmployeeService] Timesheet review approval link ${newLinkGenerated ? 'generated/updated' : 'retrieved (should not happen often here)'}: ${approvalLink}`);
        return { approvalId, approvalLink };

    } catch (error: any) {
        if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
        console.error('Detailed error requesting timesheet period review:', error.stack);
        if (error.message?.includes("duplicate key value violates unique constraint")) {
            throw error;
        }
        throw new Error(`Failed to request timesheet review. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
        if (client) client.release();
    }
};


export const getWagesForApproval = async (token: string | null): Promise<{approval: WageApproval, records: WageRecord[] | TimesheetEntrySummary[] | LeaveRequestRecord[]} | null> => {
    const cleanToken = token ? String(token).trim() : null;
    if (!cleanToken) {
        console.error("[EmployeeService] getWagesForApproval called with null or empty token.");
        throw new Error("Invalid approval link: Token is missing or invalid.");
    }
    console.log(`[EmployeeService] Attempting to fetch data for approval token: ${cleanToken}`);
    try {
        const approvalResult = await query(
            `SELECT id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo",
             status, approval_type, initiated_by, branch, created_at, approved_at, declined_at, approved_by
             FROM wage_approvals WHERE token = $1;`,
            [cleanToken]
        );

        if (approvalResult.rows.length === 0) {
            console.warn(`[EmployeeService] No approval found for token: ${cleanToken}`);
            throw new Error("Approval request not found or link is invalid.");
        }
        const approval = approvalResult.rows[0] as WageApproval;
        console.log(`[EmployeeService] Found approval ID: ${approval.id}, Type: ${approval.approval_type}, Status: ${approval.status}, Branch: ${approval.branch}`);

        let recordsData: WageRecord[] | TimesheetEntrySummary[] | LeaveRequestRecord[];

        if (approval.approval_type === 'final_wage') {
            console.log(`[EmployeeService] Fetching final_wage records for approval ID: ${approval.id}`);
            const recordsResult = await query(
                `SELECT wr.id, wr.employee_id AS "employeeId", e.employee_name, wr.hourly_wage,
                   wr.total_hours, wr.hours_worked, wr.overtime_hours, wr.meal_allowance,
                   wr.fnpf_deduction, wr.other_deductions, wr.gross_pay, wr.net_pay,
                   TO_CHAR(wr.date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(wr.date_to, 'YYYY-MM-DD') AS "dateTo",
                   wr.created_at, wr.approval_id, e.payment_method, e.fnpf_eligible
                 FROM wage_records wr
                 JOIN employees1 e ON wr.employee_id = e.id
                 WHERE wr.approval_id = $1::uuid ORDER BY e.employee_name;`,
                [approval.id]
            );
            recordsData = recordsResult.rows.map(row => ({
                 ...row,
                 employeeName: row.employee_name, 
                 hourlyWage: Number(row.hourly_wage) || 0,
                 totalHours: Number(row.total_hours) || 0,
                 hoursWorked: Number(row.hours_worked) || 0,
                 overtimeHours: Number(row.overtime_hours) || 0,
                 mealAllowance: Number(row.meal_allowance) || 0,
                 fnpfDeduction: Number(row.fnpf_deduction) || 0,
                 otherDeductions: Number(row.other_deductions) || 0,
                 grossPay: Number(row.gross_pay) || 0,
                 netPay: Number(row.net_pay) || 0,
                 fnpfEligible: Boolean(row.fnpf_eligible)
            })) as WageRecord[];
            console.log(`[EmployeeService] Fetched ${recordsData.length} final_wage records for approval ID: ${approval.id}`);
        } else if (approval.approval_type === 'timesheet_review') {
            console.log(`[EmployeeService] Fetching timesheet_review summary for period: ${approval.dateFrom} to ${approval.dateTo}, Branch: ${approval.branch || 'All'}`);
            
            let employeesInScopeQuery = `SELECT id, employee_name FROM employees1 WHERE is_active = TRUE`;
            const employeesInScopeParams: any[] = [];
            if (approval.branch) {
                employeesInScopeQuery += ` AND branch = $1`;
                employeesInScopeParams.push(approval.branch);
            }
            employeesInScopeQuery += ` ORDER BY employee_name;`;
            const employeesInScopeResult = await query(employeesInScopeQuery, employeesInScopeParams);
            const activeEmployeesForPeriod = employeesInScopeResult.rows.map(r => ({ id: r.id, name: r.employee_name }));

            let dailyEntriesData: Partial<DailyTimesheetRecord>[] = [];
            if (activeEmployeesForPeriod.length > 0) {
                const employeeIds = activeEmployeesForPeriod.map(e => e.id);
                const dailyEntriesQueryParts = [
                    `SELECT
                        dts.employee_id AS "employeeId",
                        dts.is_present,
                        dts.is_absent,
                        COALESCE(dts.normal_hours, 0) AS "normalHours",
                        COALESCE(dts.overtime_hours, 0) AS "overtimeHours",
                        COALESCE(dts.meal_allowance, 0) AS "mealAllowance"
                    FROM daily_timesheet_entries dts
                    WHERE dts.employee_id = ANY($1::uuid[])
                      AND dts.entry_date >= $2::date
                      AND dts.entry_date <= $3::date`
                ];
                const dailyEntriesParams = [employeeIds, approval.dateFrom, approval.dateTo];
                if (approval.branch) {
                    dailyEntriesQueryParts.push(`AND dts.branch = $${dailyEntriesParams.push(approval.branch)}`);
                }
                dailyEntriesQueryParts.push(`;`);
                const dailyEntriesResult = await query(dailyEntriesQueryParts.join(' '), dailyEntriesParams);
                dailyEntriesData = dailyEntriesResult.rows.map(r => ({
                    employeeId: r.employeeId,
                    isPresent: r.isPresent,
                    isAbsent: r.isAbsent,
                    normalHours: parseFloat(r.normalHours),
                    overtimeHours: parseFloat(r.overtimeHours),
                    mealAllowance: parseFloat(r.mealAllowance),
                })) as Partial<DailyTimesheetRecord>[];
            }

            recordsData = activeEmployeesForPeriod.map(emp => {
                const empEntries = dailyEntriesData.filter(entry => entry.employeeId === emp.id);
                let totalNormalHours = 0;
                let totalOvertimeHours = 0;
                let totalMealAllowance = 0;
                let attendanceStatus: 'Present' | 'Absent' | 'Mixed' | 'No Record' = 'No Record';
                let presentDays = 0;
                let absentDays = 0;

                if (empEntries.length > 0) {
                    empEntries.forEach(entry => {
                        if (entry.isPresent) {
                            presentDays++;
                            totalNormalHours += entry.normalHours || 0;
                            totalOvertimeHours += entry.overtimeHours || 0;
                            totalMealAllowance += entry.mealAllowance || 0;
                        }
                        if (entry.isAbsent) {
                            absentDays++;
                        }
                    });

                    if (presentDays > 0 && absentDays > 0) {
                        attendanceStatus = 'Mixed';
                    } else if (presentDays > 0) {
                        attendanceStatus = 'Present';
                    } else if (absentDays > 0) {
                        attendanceStatus = 'Absent';
                    }
                }

                return {
                    employeeId: emp.id,
                    employeeName: emp.name,
                    totalNormalHours,
                    totalOvertimeHours,
                    totalMealAllowance,
                    totalHours: totalNormalHours + totalOvertimeHours,
                    attendanceStatus,
                };
            }) as TimesheetEntrySummary[];
            console.log(`[EmployeeService] Fetched ${recordsData.length} timesheet_review summaries (including absent/no record).`);
        } else if (approval.approval_type === 'leave_request') {
             console.log(`[EmployeeService] Fetching leave_request details for approval ID: ${approval.id}`);
             const leaveResult = await query(
                 `SELECT lr.id, lr.employee_id, e.employee_name, e.branch AS "employeeBranch", lr.leave_type,
                    TO_CHAR(lr.date_from, 'YYYY-MM-DD') AS "date_from", 
                    TO_CHAR(lr.date_to, 'YYYY-MM-DD') AS "date_to",
                    lr.letter_image_data_uri, lr.notes, lr.created_at, lr.updated_at
                  FROM leave_requests lr
                  JOIN employees1 e ON lr.employee_id = e.id
                  WHERE lr.approval_id = $1::uuid;`,
                 [approval.id]
             );
             if (leaveResult.rows.length === 0) {
                 throw new Error("Leave request details not found for this approval.");
             }
             const row = leaveResult.rows[0];
             recordsData = [{ 
                 id: row.id,
                 approval_id: approval.id,
                 employeeId: row.employee_id,
                 employeeName: row.employee_name, 
                 leave_type: row.leave_type,
                 dateFrom: row.date_from,
                 dateTo: row.date_to,
                 letterImageDataUri: row.letter_image_data_uri,
                 notes: row.notes,
                 branch: row.employeeBranch, 
                 created_at: row.created_at,
                 updated_at: row.updated_at,
             }] as LeaveRequestRecord[];
             console.log(`[EmployeeService] Fetched leave_request details for approval ID: ${approval.id}`);
        }
         else {
            console.error(`[EmployeeService] Unknown approval type: ${approval.approval_type} for token ${cleanToken}`);
            throw new Error(`Unknown approval type: ${approval.approval_type}`);
        }
        console.log(`[EmployeeService] Successfully fetched data for token ${cleanToken}.`);
        return { approval, records: recordsData };
    } catch (error: any) {
        console.error(`[EmployeeService] Error fetching for token ${cleanToken}:`, error.stack);
        let errorMessage = `Failed to fetch wages for approval.`;
         if (error instanceof Error && (error.message.includes("Approval request not found") || error.message.includes("Unknown approval type"))) {
            errorMessage = error.message;
        } else if (error instanceof Error) {
            errorMessage += ` DB Error: ${error.message || 'Unknown error'}`;
        } else {
            errorMessage += ` An unknown error occurred.`;
        }
        console.error(`[EmployeeService] Throwing error for token ${cleanToken}: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

export const updateWageApprovalStatus = async (
    token: string,
    newStatus: 'approved' | 'declined',
    approverName: string | null = null
): Promise<WageApproval | null> => {
    if (!token) {
        console.error("[EmployeeService] updateWageApprovalStatus called with null or empty token.");
        return null;
    }
    let client;
    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        const currentApprovalResult = await client.query(
            `SELECT id, status, approval_type FROM wage_approvals WHERE token = $1 FOR UPDATE;`,
            [token]
        );

        if (currentApprovalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.warn(`[EmployeeService] No approval found for token ${token} during update attempt.`);
            return null;
        }

        const currentApproval = currentApprovalResult.rows[0];
        if (currentApproval.status !== 'pending') {
            await client.query('ROLLBACK');
            console.warn(`[EmployeeService] Approval for token ${token} is not in 'pending' state (current: ${currentApproval.status}). No update performed.`);
            const existing = await client.query(
                 `SELECT id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo",
                  status, approval_type, initiated_by, branch, created_at, approved_at, declined_at, approved_by
                  FROM wage_approvals WHERE token = $1;`, [token]);
            return existing.rows.length > 0 ? (existing.rows[0] as WageApproval) : null;
        }

        const timestampField = newStatus === 'approved' ? 'approved_at' : 'declined_at';
        const updateResult = await client.query(
            `UPDATE wage_approvals
             SET status = $1, ${timestampField} = CURRENT_TIMESTAMP, approved_by = $2
             WHERE token = $3 AND status = 'pending'
             RETURNING id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo",
             status, approval_type, initiated_by, branch, created_at, approved_at, declined_at, approved_by;`,
            [newStatus, approverName, token]
        );

        if (updateResult.rowCount === 0) {
            await client.query('ROLLBACK');
            console.warn(`[EmployeeService] Update for token ${token} did not affect any rows, possibly due to a race condition or status change.`);
            return null;
        }
        
        const updatedApproval = updateResult.rows[0] as WageApproval;

        if (updatedApproval && updatedApproval.approval_type === 'leave_request' && newStatus === 'approved') {
          const leaveRequestDetailsResult = await client.query(
            `SELECT lr.employee_id, TO_CHAR(lr.date_from, 'YYYY-MM-DD') AS "leaveDateFromStr", 
                    TO_CHAR(lr.date_to, 'YYYY-MM-DD') AS "leaveDateToStr", e.branch AS "employeeBranch",
                    lr.leave_type
             FROM leave_requests lr
             JOIN employees1 e ON lr.employee_id = e.id
             WHERE lr.approval_id = $1::uuid;`,
            [updatedApproval.id]
          );
        
          if (leaveRequestDetailsResult.rows.length > 0) {
            const { employee_id, leaveDateFromStr, leaveDateToStr, employeeBranch, leave_type } = leaveRequestDetailsResult.rows[0];
            const leaveStartDate = parseISO(leaveDateFromStr);
            const leaveEndDate = parseISO(leaveDateToStr);
            const overtimeReasonText = `Approved: ${leave_type ? leave_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 'Leave'}`;
        
            let currentDateIterator = leaveStartDate;
            while (currentDateIterator <= leaveEndDate) {
              const formattedCurrentDate = format(currentDateIterator, 'yyyy-MM-dd');
              
              await client.query(
                `INSERT INTO daily_timesheet_entries (
                    employee_id, entry_date, branch, is_present, is_absent,
                    normal_hours, overtime_hours, meal_allowance,
                    time_in, lunch_in, lunch_out, time_out, overtime_reason,
                    created_at, updated_at
                ) VALUES (
                    $1::uuid, $2::date, $3, TRUE, FALSE,
                    $4, 0, 0, 
                    NULL, NULL, NULL, NULL, $5, 
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (employee_id, entry_date) DO UPDATE SET
                    is_present = TRUE,
                    is_absent = FALSE,
                    normal_hours = $4, 
                    overtime_hours = 0,
                    meal_allowance = 0,
                    time_in = NULL,
                    lunch_in = NULL,
                    lunch_out = NULL,
                    time_out = NULL,
                    overtime_reason = $5,
                    branch = EXCLUDED.branch, 
                    updated_at = CURRENT_TIMESTAMP;
                `,
                [employee_id, formattedCurrentDate, employeeBranch, STANDARD_LEAVE_DAY_HOURS, overtimeReasonText]
              );
              currentDateIterator = addDays(currentDateIterator, 1);
            }
            console.log(`[EmployeeService] Updated/created timesheet entries for approved leave (Approval ID: ${updatedApproval.id})`);
          } else {
            console.warn(`[EmployeeService] Could not find leave request details for approval ID ${updatedApproval.id} to update timesheet entries. This might be okay if it's not a leave request.`);
          }
        }


        await client.query('COMMIT');
        console.log(`[EmployeeService] Wage approval ${updatedApproval.id} (type: ${updatedApproval.approval_type}) status updated to ${newStatus}.`);
        return updatedApproval;

    } catch (error: any) {
        if (client) await client.query('ROLLBACK').catch(rbErr => console.error('[EmployeeService] Rollback failed:', rbErr));
        console.error(`[EmployeeService] Error updating wage approval status for token ${token}:`, error.stack);
        throw new Error(`Failed to update approval status. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
         if (client) client.release();
    }
};

export const deleteWageRecordsByApprovalId = async (approvalId: string): Promise<void> => {
   if (!approvalId) {
       throw new Error("Approval ID is required for deletion.");
   }
   let client;
   try {
       const pool = await getDbPool();
       client = await pool.connect();
       await client.query('BEGIN');

       const approvalTypeResult = await client.query('SELECT approval_type FROM wage_approvals WHERE id = $1::uuid;', [approvalId]);

       if (approvalTypeResult.rowCount > 0) {
           const type = approvalTypeResult.rows[0].approval_type;
           if (type === 'final_wage') {
               const deleteRecordsResult = await client.query(
                   'DELETE FROM wage_records WHERE approval_id = $1::uuid;',
                   [approvalId]
               );
               console.log(`Deleted ${deleteRecordsResult.rowCount} wage records for approval ID ${approvalId}`);
           } else if (type === 'leave_request') {
               const deleteLeaveResult = await client.query(
                   'DELETE FROM leave_requests WHERE approval_id = $1::uuid;',
                   [approvalId]
               );
               console.log(`Deleted ${deleteLeaveResult.rowCount} leave requests for approval ID ${approvalId}`);
           }
       }
       
       const deleteApprovalResult = await client.query(
           'DELETE FROM wage_approvals WHERE id = $1::uuid;',
           [approvalId]
       );

       if (deleteApprovalResult.rowCount === 0) {
           console.warn(`Approval record ${approvalId} not found for deletion.`);
       } else {
           console.log(`Deleted wage approval record ${approvalId} (type: ${approvalTypeResult.rows[0]?.approval_type || 'unknown'}).`);
       }

       await client.query('COMMIT');
   } catch (error: any) {
       if (client) await client.query('ROLLBACK');
       console.error(`Error deleting data for approval ID ${approvalId}:`, error.stack);
       throw new Error(`Failed to delete data. DB Error: ${error.message || 'Unknown error'}`);
   } finally {
       if (client) client.release();
   }
};

export const getPayPeriodSummaries = async (
    status: 'pending' | 'approved' | 'declined',
    approvalType: 'timesheet_review' | 'final_wage' | 'leave_request',
    branch: 'labasa' | 'suva' | null = null
): Promise<PayPeriodSummary[]> => {
  console.log(`[EmployeeService] getPayPeriodSummaries called with status: ${status}, type: ${approvalType}, branch: ${branch || 'all'}`);

  let queryString = `
    SELECT
      TO_CHAR(wa.date_from, 'YYYY-MM-DD') AS "dateFrom",
      TO_CHAR(wa.date_to, 'YYYY-MM-DD') AS "dateTo",
      wa.id AS "approvalId", wa.status, wa.approval_type, wa.token, wa.initiated_by, wa.branch,
      COALESCE(SUM(wr.net_pay), 0) AS "totalWages", 
      COALESCE(SUM(CASE WHEN e.payment_method = 'cash' THEN wr.net_pay ELSE 0 END), 0) AS "totalCashWages", 
      COALESCE(SUM(CASE WHEN e.payment_method = 'online' THEN wr.net_pay ELSE 0 END), 0) AS "totalOnlineWages" 
    FROM wage_approvals wa
    LEFT JOIN wage_records wr ON wa.id = wr.approval_id AND wa.approval_type = 'final_wage' 
    LEFT JOIN employees1 e ON wr.employee_id = e.id 
    WHERE wa.status = $1::approval_status_enum AND wa.approval_type = $2::approval_type_enum `;

  const queryParams: any[] = [status, approvalType];

  if (branch) {
    queryString += ` AND wa.branch = $${queryParams.push(branch)}::branch_enum `;
  }
  
  queryString += `
    GROUP BY wa.id, wa.date_from, wa.date_to, wa.status, wa.approval_type, wa.token, wa.initiated_by, wa.branch
    ORDER BY wa.date_from DESC;`;

  try {
    const result = await query(queryString, queryParams);
    return result.rows.map(row => ({
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
        approvalId: row.approvalId,
        totalWages: Number(row.totalWages) || 0,
        totalCashWages: Number(row.totalCashWages) || 0,
        totalOnlineWages: Number(row.totalOnlineWages) || 0,
        status: row.status,
        approval_type: row.approval_type,
        initiated_by: row.initiated_by,
        token: row.token,
        branch: row.branch,
    })) as PayPeriodSummary[];
  } catch (error: any) {
    console.error(`[EmployeeService] Error fetching pay period summaries (status: ${status}, type: ${approvalType}, branch: ${branch || 'all'}):`, error.stack);
    if (error.message && (error.message.includes("Database query failed") || error.message.includes("DB Error"))) {
        throw error;
    }
    throw new Error(`Failed to fetch pay period summaries. DB Error: ${error.message || 'Unknown database error'}`);
  }
};


export const getWageRecords = async (
    _filterDateFrom: Date | string | null = null,
    _filterDateTo: Date | string | null = null,
    approvalStatus: 'pending' | 'approved' | 'declined' | null = null,
    approvalId: string | null = null
): Promise<WageRecord[]> => {
  let queryString = `
    SELECT wr.id, wr.employee_id AS "employeeId", wr.employee_name AS "employeeName", wr.hourly_wage AS "hourlyWage",
           wr.total_hours AS "totalHours", wr.hours_worked AS "hoursWorked", wr.overtime_hours AS "overtimeHours",
           wr.meal_allowance AS "mealAllowance", wr.fnpf_deduction AS "fnpfDeduction",
           wr.other_deductions AS "otherDeductions", wr.gross_pay AS "grossPay", wr.net_pay AS "netPay",
           TO_CHAR(wr.date_from, 'YYYY-MM-DD') AS "dateFrom",
           TO_CHAR(wr.date_to, 'YYYY-MM-DD') AS "dateTo",
           wr.created_at, wr.approval_id AS "approvalId", e.payment_method AS "paymentMethod", e.fnpf_eligible AS "fnpfEligible"
    FROM wage_records wr
    JOIN employees1 e ON wr.employee_id = e.id
    LEFT JOIN wage_approvals wa ON wr.approval_id = wa.id `;

  const queryParams: any[] = [];
  const conditions: string[] = [];

  const formatDateFn = (date: Date | string | null): string | null => { 
       if (!date) return null;
       try {
           const parsedDate = typeof date === 'string' ? parseISO(date) : date;
           return isDateValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
       } catch (e) {
           console.warn("Invalid date passed to formatDateFn:", date, e);
           return null;
       }
  };

  const formattedDateFrom = formatDateFn(_filterDateFrom);
  const formattedDateTo = formatDateFn(_filterDateTo);

  if (approvalId) {
      conditions.push(`wr.approval_id = $${queryParams.push(approvalId)}::uuid`);
  } else {
      if (formattedDateFrom) {
          conditions.push(`wr.date_from >= $${queryParams.push(formattedDateFrom)}::date`);
      }
      if (formattedDateTo) {
          conditions.push(`wr.date_to <= $${queryParams.push(formattedDateTo)}::date`);
      }
      if (approvalStatus) {
          conditions.push(`wa.status = $${queryParams.push(approvalStatus)}::approval_status_enum`);
      }
      conditions.push(`wa.approval_type = 'final_wage'::approval_type_enum`); 
  }

  if (conditions.length > 0) {
      queryString += ' WHERE ' + conditions.join(' AND ');
  }
  queryString += ' ORDER BY wr.date_from DESC, wr.employee_name ASC;';

  try {
    const result = await query(queryString, queryParams);
    return result.rows.map(row => ({
        ...row,
        hourlyWage: Number(row.hourlyWage) || 0,
        totalHours: Number(row.totalHours) || 0,
        hoursWorked: Number(row.hoursWorked) || 0,
        overtimeHours: Number(row.overtimeHours) || 0,
        mealAllowance: Number(row.mealAllowance) || 0,
        fnpfDeduction: Number(row.fnpfDeduction) || 0,
        otherDeductions: Number(row.otherDeductions) || 0,
        grossPay: Number(row.grossPay) || 0,
        netPay: Number(row.netPay) || 0,
        fnpfEligible: Boolean(row.fnpfEligible)
    })) as WageRecord[];
  } catch (error: any) {
    console.error('Error fetching wage records:', error.stack);
    throw error;
  }
};

export const updateWageRecordsInApproval = async (
    approvalId: string,
    updatedRecords: UpdatedWageRecordData[]
): Promise<void> => {
    if (!approvalId) {
        throw new Error("Approval ID is required for updating wage records.");
    }
    if (!updatedRecords || updatedRecords.length === 0) {
        console.warn("No records provided for update.");
        return;
    }

    let client;
    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        const approvalCheckResult = await client.query(
            "SELECT approval_type FROM wage_approvals WHERE id = $1::uuid FOR UPDATE;",
            [approvalId]
        );

        if (approvalCheckResult.rowCount === 0) {
            throw new Error(`Approval with ID ${approvalId} not found.`);
        }
        if (approvalCheckResult.rows[0].approval_type !== 'final_wage') {
            throw new Error(`Cannot edit records: Approval ID ${approvalId} is not for 'final_wage'.`);
        }

        for (const record of updatedRecords) {
            if (!record.id) {
                console.warn("Skipping record update due to missing record ID:", record);
                continue;
            }

            const originalRecordResult = await client.query(
                `SELECT wr.hourly_wage, e.employee_name, e.fnpf_eligible
                 FROM wage_records wr JOIN employees1 e ON wr.employee_id = e.id
                 WHERE wr.id = $1::uuid AND wr.approval_id = $2::uuid;`,
                [record.id, approvalId]
            );

            if (originalRecordResult.rows.length === 0) {
                console.warn(`Wage record with ID ${record.id} not found under approval ${approvalId}. Skipping.`);
                continue;
            }

            const { hourly_wage, employee_name, fnpf_eligible } = originalRecordResult.rows[0];
            const originalHourlyWage = parseFloat(hourly_wage);

            const totalHours = record.totalHours ?? 0;
            const mealAllowance = record.mealAllowance ?? 0;
            const otherDeductions = record.otherDeductions ?? 0;

            const normalHoursThreshold = employee_name === SPECIAL_EMPLOYEE_NAME
                ? SPECIAL_NORMAL_HOURS_THRESHOLD
                : STANDARD_NORMAL_HOURS_THRESHOLD;

            const hoursWorked = Math.min(totalHours, normalHoursThreshold);
            const overtimeHours = Math.max(0, totalHours - normalHoursThreshold);

            const regularPay = originalHourlyWage * hoursWorked;
            const overtimePay = overtimeHours * originalHourlyWage * OVERTIME_RATE;
            const grossPay = regularPay + overtimePay + mealAllowance;
            const fnpfDeduction = fnpf_eligible ? (regularPay * 0.08) : 0;
            const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductions);

            await client.query(
                `UPDATE wage_records SET total_hours = $1, hours_worked = $2, overtime_hours = $3,
                   meal_allowance = $4, other_deductions = $5, fnpf_deduction = $6,
                   gross_pay = $7, net_pay = $8, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9::uuid AND approval_id = $10::uuid;`,
                [totalHours, hoursWorked, overtimeHours, mealAllowance, otherDeductions,
                 fnpfDeduction, grossPay, netPay, record.id, approvalId]
            );
        }

        await client.query(
            `UPDATE wage_approvals SET status = 'pending'::approval_status_enum, approved_at = NULL, declined_at = NULL,
             approved_by = NULL, created_at = CURRENT_TIMESTAMP 
             WHERE id = $1::uuid;`,
            [approvalId]
        );

        await client.query('COMMIT');
        console.log(`Wage records for approval ID ${approvalId} updated successfully. Approval reset to pending.`);

    } catch (error: any) {
        if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed during wage record update:', rbErr));
        console.error(`Error updating wage records for approval ID ${approvalId}:`, error.stack);
        throw new Error(`Failed to update wage records. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
        if (client) client.release();
    }
};

export const getTimesheetHoursForPeriod = async (dateFrom: string, dateTo: string, branch: 'labasa' | 'suva' | null = null): Promise<TimesheetEntrySummary[]> => {
    console.log(`[EmployeeService] Fetching timesheet hours for period: ${dateFrom} to ${dateTo}${branch ? `, Branch: ${branch}` : ', All Branches'}`);

    const queryParams: any[] = [dateFrom, dateTo];
    let queryString = `
        SELECT
            dts.employee_id AS "employeeId",
            e.employee_name AS "employeeName",
            SUM(COALESCE(dts.normal_hours, 0) + COALESCE(dts.overtime_hours, 0)) AS "totalHours",
            SUM(COALESCE(dts.normal_hours, 0)) AS "totalNormalHours",
            SUM(COALESCE(dts.overtime_hours, 0)) AS "totalOvertimeHours",
            SUM(COALESCE(dts.meal_allowance, 0)) AS "totalMealAllowance"
         FROM daily_timesheet_entries dts
         JOIN employees1 e ON dts.employee_id = e.id
         WHERE dts.entry_date >= $1::date AND dts.entry_date <= $2::date AND dts.is_present = TRUE AND e.is_active = TRUE `;

    if (branch) {
        queryString += ` AND dts.branch = $${queryParams.push(branch)}::branch_enum`;
    }

    queryString += ` GROUP BY dts.employee_id, e.employee_name ORDER BY e.employee_name;`;

    try {
        const result = await query(queryString, queryParams);
        return result.rows.map(row => ({
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            totalHours: parseFloat(row.totalHours) || 0,
            totalNormalHours: parseFloat(row.totalNormalHours) || 0,
            totalOvertimeHours: parseFloat(row.totalOvertimeHours) || 0,
            totalMealAllowance: parseFloat(row.totalMealAllowance) || 0,
            attendanceStatus: 'Present', // Default for this specific function, getWagesForApproval will override
        })) as TimesheetEntrySummary[];
    } catch (error: any) {
        console.error('Error fetching timesheet hours:', error.stack);
        throw new Error(`Failed to fetch timesheet hours. DB Error: ${error.message || 'Unknown error'}`);
    }
};

export const saveDailyTimesheetEntry = async (entryData: DailyTimesheetEntryData): Promise<string> => {
    const {
        id,
        branch,
        employeeId,
        date, 
        isPresent,
        isAbsent,
        timeIn,
        lunchIn,
        lunchOut,
        timeOut,
        normalHours,
        overtimeHours,
        mealAllowance,
        overtimeReason
    } = entryData;

    if (!employeeId || !date) {
        throw new Error("Employee ID and date are required to save timesheet entry.");
    }

    const queryText = `
        INSERT INTO daily_timesheet_entries (
            id, employee_id, entry_date, branch, is_present, is_absent,
            time_in, lunch_in, lunch_out, time_out,
            normal_hours, overtime_hours, meal_allowance, overtime_reason,
            created_at, updated_at
        ) VALUES (
            COALESCE($1::uuid, uuid_generate_v4()),
            $2::uuid, $3::date, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14,
            COALESCE((SELECT created_at FROM daily_timesheet_entries WHERE id = $1::uuid), CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (employee_id, entry_date)
        DO UPDATE SET
            branch = EXCLUDED.branch,
            is_present = EXCLUDED.is_present,
            is_absent = EXCLUDED.is_absent,
            time_in = EXCLUDED.time_in,
            lunch_in = EXCLUDED.lunch_in,
            lunch_out = EXCLUDED.lunch_out,
            time_out = EXCLUDED.time_out,
            normal_hours = EXCLUDED.normal_hours,
            overtime_hours = EXCLUDED.overtime_hours,
            meal_allowance = EXCLUDED.meal_allowance,
            overtime_reason = EXCLUDED.overtime_reason,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id;`;

    const queryParams = [
        id || null,
        employeeId,
        date, 
        branch,
        isPresent,
        isAbsent,
        timeIn,
        lunchIn,
        lunchOut,
        timeOut,
        isPresent ? normalHours : null,
        isPresent ? overtimeHours : null,
        isPresent ? mealAllowance : null,
        overtimeReason || null
    ];

    try {
        const result = await query(queryText, queryParams);
        if (result.rowCount === 0) {
            throw new Error("Failed to save/update timesheet entry. No rows affected.");
        }
        const savedId = result.rows[0].id;
        console.log(`Timesheet entry for employee ${employeeId} on ${date} ${id ? 'updated' : 'saved'}. ID: ${savedId}`);
        return savedId;
    } catch (error: any) {
        console.error(`Error saving daily timesheet for emp ${employeeId} on ${date}:`, error.stack);
        throw new Error(`Failed to save timesheet entry. DB Error: ${error.message || 'Unknown error'}`);
    }
};


export const getTimesheetRecords = async (
    dateFrom: string,
    dateTo: string,
    branch: 'labasa' | 'suva' | null = null,
    employeeId: string | null = null
): Promise<DailyTimesheetRecord[]> => {

    const queryParams: any[] = [dateFrom, dateTo];
    let queryString = `
        SELECT
            dts.id,
            dts.employee_id AS "employeeId",
            e.employee_name AS "employeeName",
            dts.branch,
            TO_CHAR(dts.entry_date, 'YYYY-MM-DD') AS "entryDate",
            dts.is_present,
            dts.is_absent,
            dts.time_in,
            dts.lunch_in,
            dts.lunch_out,
            dts.time_out,
            dts.normal_hours,
            dts.overtime_hours,
            dts.meal_allowance,
            dts.overtime_reason,
            dts.created_at,
            dts.updated_at
         FROM daily_timesheet_entries dts
         JOIN employees1 e ON dts.employee_id = e.id
         WHERE dts.entry_date >= $1::date AND dts.entry_date <= $2::date `;

    if (branch) {
        queryString += ` AND dts.branch = $${queryParams.push(branch)}::branch_enum`;
    }
    if (employeeId && employeeId !== 'all') {
        queryString += ` AND dts.employee_id = $${queryParams.push(employeeId)}::uuid`;
    }

    queryString += ` ORDER BY dts.entry_date DESC, e.employee_name ASC;`;

    try {
        const result = await query(queryString, queryParams);
        return result.rows.map(row => ({
            ...row,
            isPresent: Boolean(row.is_present),
            isAbsent: Boolean(row.is_absent),
            normalHours: row.normal_hours !== null ? parseFloat(row.normal_hours) : null,
            overtimeHours: row.overtime_hours !== null ? parseFloat(row.overtime_hours) : null,
            mealAllowance: row.meal_allowance !== null ? parseFloat(row.meal_allowance) : null,
        })) as DailyTimesheetRecord[];
    } catch (error: any) {
        console.error('Error fetching timesheet records:', error.stack);
        throw new Error(`Failed to fetch timesheet records. DB Error: ${error.message || 'Unknown error'}`);
    }
};

export const getEligibleTimesheetPeriodsForReview = async (
    branch: 'labasa' | 'suva' | null = null
): Promise<{ dateFrom: string; dateTo: string; branch: 'labasa' | 'suva' | null }[]> => {
    console.log(`[EmployeeService] Fetching eligible timesheet periods for review (Branch: ${branch || 'All'}).`);

    const queryParams: any[] = [branch];
     const queryString = `
        SELECT
            TO_CHAR(candidate_periods."period_start", 'YYYY-MM-DD') AS "dateFrom",
            TO_CHAR(candidate_periods."period_end", 'YYYY-MM-DD') AS "dateTo",
            candidate_periods.branch
        FROM (
            SELECT DISTINCT
                (DATE_TRUNC('week', dts.entry_date - INTERVAL '3 day') + INTERVAL '3 day')::date AS "period_start",
                (DATE_TRUNC('week', dts.entry_date - INTERVAL '3 day') + INTERVAL '3 day' + INTERVAL '6 day')::date AS "period_end",
                dts.branch
            FROM daily_timesheet_entries dts
            JOIN employees1 e ON dts.employee_id = e.id -- Join with employees1
            WHERE e.is_active = TRUE -- Filter for active employees
              AND ($1::text IS NULL OR dts.branch = $1::branch_enum)
        ) AS candidate_periods
        WHERE NOT EXISTS (
            SELECT 1
            FROM wage_approvals wa
            WHERE wa.approval_type = 'timesheet_review'::approval_type_enum
              AND wa.status IN ('pending', 'approved')
              AND wa.date_from = candidate_periods."period_start"
              AND wa.date_to = candidate_periods."period_end"
              AND (wa.branch = candidate_periods.branch OR (wa.branch IS NULL AND candidate_periods.branch IS NULL))
        )
        ORDER BY "dateFrom" DESC;
    `;
    try {
        const result = await query(queryString, queryParams);
        console.log(`[EmployeeService] Found ${result.rows.length} eligible periods (Branch: ${branch || 'All'}).`);
        return result.rows.map(row => ({
            dateFrom: row.dateFrom,
            dateTo: row.dateTo,
            branch: row.branch,
        }));
    } catch (error: any) {
        console.error('Error fetching eligible timesheet periods for review:', error.stack);
        throw new Error(`Failed to fetch eligible timesheet periods. DB Error: ${error.message || 'Unknown error'}`);
    }
};


export const deleteDailyTimesheetEntry = async (recordId: string): Promise<void> => {
    if (!recordId) {
        throw new Error('Record ID is required for deletion.');
    }
    try {
        const result = await query(`DELETE FROM daily_timesheet_entries WHERE id = $1::uuid;`, [recordId]);
        if (result.rowCount === 0) {
            console.warn(`Timesheet entry ID ${recordId} not found for deletion.`);
        } else {
            console.log(`Timesheet entry ID ${recordId} deleted.`);
        }
    } catch (error: any) {
        console.error(`Detailed error deleting timesheet entry ID ${recordId}:`, error.stack);
        throw new Error(`Failed to delete timesheet entry. DB Error: ${error.message || 'Unknown error'}`);
    }
};

export const getDailyTimesheetEntry = async (employeeId: string, entryDate: string): Promise<DailyTimesheetRecord | null> => {
    if (!employeeId || !entryDate) {
        return null;
    }
    try {
        const result = await query(
            `SELECT
                dts.id,
                dts.employee_id AS "employeeId",
                e.employee_name AS "employeeName",
                dts.branch,
                TO_CHAR(dts.entry_date, 'YYYY-MM-DD') AS "entryDate",
                dts.is_present,
                dts.is_absent,
                dts.time_in,
                dts.lunch_in,
                dts.lunch_out,
                dts.time_out,
                dts.normal_hours,
                dts.overtime_hours,
                dts.meal_allowance,
                dts.overtime_reason,
                dts.created_at,
                dts.updated_at
             FROM daily_timesheet_entries dts
             JOIN employees1 e ON dts.employee_id = e.id
             WHERE dts.employee_id = $1::uuid AND dts.entry_date = $2::date;`,
            [employeeId, entryDate]
        );

        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            ...row,
            isPresent: Boolean(row.is_present),
            isAbsent: Boolean(row.is_absent),
            normalHours: row.normal_hours !== null ? parseFloat(row.normal_hours) : null,
            overtimeHours: row.overtime_hours !== null ? parseFloat(row.overtime_hours) : null,
            mealAllowance: row.meal_allowance !== null ? parseFloat(row.meal_allowance) : null,
        } as DailyTimesheetRecord;
    } catch (error: any) {
        console.error(`Error fetching daily timesheet entry for emp ${employeeId} on ${entryDate}:`, error.stack);
        throw new Error(`Failed to fetch daily timesheet entry. DB Error: ${error.message || 'Unknown error'}`);
    }
};

export const checkWageRecordsExistByDateRange = async (dateFrom: string, dateTo: string, branch: 'labasa' | 'suva' | null = null): Promise<boolean> => {
    if (!dateFrom || !dateTo) {
        throw new Error("Date range (dateFrom and dateTo) is required to check wage records.");
    }
    
    let queryString = `
        SELECT 1 FROM wage_approvals wa
        WHERE wa.date_from = $1::date AND wa.date_to = $2::date
        AND wa.approval_type = 'final_wage'::approval_type_enum
        AND wa.status IN ('pending', 'approved') `;
    
    const queryParams: any[] = [dateFrom, dateTo];

    if (branch) {
        queryString += ` AND wa.branch = $3::branch_enum `;
        queryParams.push(branch);
    } else {
        queryString += ` AND wa.branch IS NULL `;
    }
    queryString += ` LIMIT 1;`;

    try {
        const result = await query(queryString, queryParams);
        return result.rowCount > 0;
    } catch (error: any) {
        console.error(`Error checking if final wage approval exists for period ${dateFrom}-${dateTo}${branch ? ` branch ${branch}` : ' all branches'}:`, error);
        throw new Error(`Failed to check existing final wage approvals. DB Error: ${error.message || 'Unknown error'}`);
    }
};

export const requestLeaveApproval = async (
  leaveData: LeaveRequestData,
  initiatedBy: string
): Promise<{ approvalId: string; approvalLink: string }> => {
  const { employeeId, leaveType, dateFrom, dateTo, letterImageDataUri, notes, branch } = leaveData;

  if (!employeeId || !leaveType || !dateFrom || !dateTo) {
    throw new Error("Missing required fields for leave request (employee, type, dates).");
  }
  if (!isDateValid(parseISO(dateFrom)) || !isDateValid(parseISO(dateTo))) {
    throw new Error("Invalid date format for leave request.");
  }

  const token = generateToken();
  let client;

  try {
    const pool = await getDbPool();
    client = await pool.connect();
    await client.query('BEGIN');

    const employeeCheckResult = await client.query(
      `SELECT is_active, employee_name FROM employees1 WHERE id = $1::uuid;`,
      [employeeId]
    );

    if (employeeCheckResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error(`Employee with ID ${employeeId} not found. Cannot submit leave request.`);
    }
    if (!employeeCheckResult.rows[0].is_active) {
      await client.query('ROLLBACK');
      throw new Error(`Employee ${employeeCheckResult.rows[0].employee_name} (ID: ${employeeId}) is currently inactive. Cannot submit leave request.`);
    }

    const approvalResult = await client.query(
      `INSERT INTO wage_approvals (token, date_from, date_to, status, approval_type, initiated_by, branch, created_at)
       VALUES ($1, $2::date, $3::date, 'pending'::approval_status_enum, 'leave_request'::approval_type_enum, $4, $5::branch_enum, CURRENT_TIMESTAMP) RETURNING id;`,
      [token, dateFrom, dateTo, initiatedBy, branch]
    );

    if (approvalResult.rows.length === 0) {
      throw new Error('Failed to create leave approval record.');
    }
    const approvalId = approvalResult.rows[0].id;

    await client.query(
      `INSERT INTO leave_requests (approval_id, employee_id, leave_type, date_from, date_to, letter_image_data_uri, notes, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::date, $5::date, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [approvalId, employeeId, leaveType, dateFrom, dateTo, letterImageDataUri, notes]
    );

    await client.query('COMMIT');

    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9002');
    const approvalLink = `${baseURL.replace(/\/$/, '')}/approve-wages?token=${token}`; 
    
    console.log(`Leave request approval link generated: ${approvalLink}`);
    return { approvalId, approvalLink };

  } catch (error: any) {
    if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed for leave request:', rbErr));
    console.error('Detailed error requesting leave approval:', error.stack);
    throw new Error(`Failed to request leave approval. DB Error: ${error.message || 'Unknown error'}`);
  } finally {
    if (client) client.release();
  }
};

export const getLeaveRequestsWithDetails = async (
    status: 'pending' | 'approved' | 'declined',
    branchFilter: 'labasa' | 'suva' | null = null,
    employeeIdFilter: string | null = null // New parameter
): Promise<LeaveRequestDisplayDetails[]> => {
    console.log(`[EmployeeService] getLeaveRequestsWithDetails called for status: ${status}, branch: ${branchFilter || 'all'}, employee: ${employeeIdFilter || 'all'}`);

    let queryString = `
        SELECT
            lr.id AS "id", 
            lr.approval_id AS "approval_id",
            lr.employee_id AS "employeeId",
            e.employee_name AS "employeeName",
            e.branch AS "branch",
            lr.leave_type AS "leave_type",
            TO_CHAR(lr.date_from, 'YYYY-MM-DD') AS "dateFrom",
            TO_CHAR(lr.date_to, 'YYYY-MM-DD') AS "dateTo",
            lr.letter_image_data_uri AS "letterImageDataUri",
            lr.notes AS "notes",
            lr.created_at AS "created_at",
            lr.updated_at AS "updated_at",
            wa.status AS "status",
            wa.initiated_by AS "initiated_by",
            wa.token AS "approvalToken"
        FROM leave_requests lr
        JOIN wage_approvals wa ON lr.approval_id = wa.id
        JOIN employees1 e ON lr.employee_id = e.id
        WHERE wa.status = $1::approval_status_enum AND wa.approval_type = 'leave_request'::approval_type_enum
    `;
    const queryParams: any[] = [status];

    if (branchFilter) {
        queryString += ` AND wa.branch = $${queryParams.push(branchFilter)}::branch_enum`;
    }
    if (employeeIdFilter) {
        queryString += ` AND lr.employee_id = $${queryParams.push(employeeIdFilter)}::uuid`;
    }
    queryString += ` ORDER BY lr.created_at DESC;`;

    try {
        const result = await query(queryString, queryParams);
        return result.rows.map(row => ({
            ...row,
        })) as LeaveRequestDisplayDetails[];
    } catch (error: any) {
        console.error(`[EmployeeService] Error fetching leave requests (status: ${status}, branch: ${branchFilter || 'all'}, employee: ${employeeIdFilter || 'all'}):`, error.stack);
        throw new Error(`Failed to fetch leave requests. DB Error: ${error.message || 'Unknown database error'}`);
    }
};

export const getLeaveCarryOverForYear = async (
  employeeId: string,
  leaveType: string,
  yearFor: number
): Promise<number> => {
  if (!employeeId || !leaveType || !yearFor) {
    console.warn("[EmployeeService] getLeaveCarryOverForYear called with missing parameters.");
    return 0;
  }
  try {
    const result = await query(
      `SELECT carried_over_days
       FROM employee_leave_carry_overs
       WHERE employee_id = $1::uuid AND leave_type = $2 AND year_for = $3;`,
      [employeeId, leaveType, yearFor]
    );
    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].carried_over_days) || 0;
    }
    return 0;
  } catch (error: any) {
    console.error(`[EmployeeService] Error fetching leave carry-over for employee ${employeeId}, type ${leaveType}, year ${yearFor}:`, error.stack);
    // Do not throw error, just return 0, as it's okay if no carry-over record exists.
    return 0;
  }
};

