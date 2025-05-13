

'use server';

import { Pool, PoolClient } from 'pg'; // Ensure PoolClient is imported if used in transactions
import { query, getDbPool } from '@/lib/db';
import { format, isValid as isDateValid, parseISO } from 'date-fns';
import { randomBytes } from 'crypto';

// --- Constants for wage calculation ---
const STANDARD_NORMAL_HOURS_THRESHOLD = 45;
const SPECIAL_EMPLOYEE_NAME = "Bimlesh Shashi Prakash";
const SPECIAL_NORMAL_HOURS_THRESHOLD = 48;
const OVERTIME_RATE = 1.5;


// --- Interfaces ---
// Define the structure for an Employee object
export interface Employee {
  id: string; // Unique identifier for the employee (will be UUID from DB)
  name: string; // Employee's full name - This should map to employee_name in DB
  position: string; // Employee's job position
  hourlyWage: string; // Hourly wage rate as a string (consider NUMERIC in DB)
  fnpfNo: string | null; // Fiji National Provident Fund number (nullable)
  tinNo: string | null; // Tax Identification Number (nullable)
  bankCode: string | null; // Bank code for online payments (nullable)
  bankAccountNumber: string | null; // Bank account number (nullable)
  paymentMethod: 'cash' | 'online'; // Payment method
  branch: 'labasa' | 'suva'; // Branch location
  fnpfEligible: boolean; // Eligibility for FNPF deduction
  isActive: boolean; // Added to track active status
  created_at?: Date; // Added timestamp (optional)
  updated_at?: Date; // Added timestamp (optional)
}

// Interface for wage records saved to the database
export interface WageRecord {
  id?: string; // Optional: UUID from DB if fetching existing
  employeeId: string;
  employeeName: string; // Denormalized for easier display
  hourlyWage: number;
  totalHours: number; // Total hours worked
  hoursWorked: number; // Normal hours (<= threshold)
  overtimeHours: number; // Overtime hours
  mealAllowance: number;
  fnpfDeduction: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  dateFrom: string; // YYYY-MM-DD string
  dateTo: string; // YYYY-MM-DD string
  approvalId?: string; // Optional for viewing, required for saving via approval
  approvalStatus?: 'pending' | 'approved' | 'declined'; // Optional status
  created_at?: Date;
  updated_at?: Date; // Added for edit tracking
}

// Interface for wage approval records
export interface WageApproval {
    id: string;
    token: string;
    dateFrom: string; // YYYY-MM-DD
    dateTo: string; // YYYY-MM-DD
    status: 'pending' | 'approved' | 'declined';
    created_at?: Date;
    approved_at?: Date;
    declined_at?: Date;
    approved_by?: string;
    updated_at?: Date; 
}

// Interface for Pay Period Summaries (used in Wage Records page)
export interface PayPeriodSummary {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  approvalId: string;
  totalWages: number;
  totalCashWages: number;
  totalOnlineWages: number;
  status: 'pending' | 'approved' | 'declined';
  token?: string;
  updated_at?: Date; 
}

export interface UpdatedWageRecordData {
    id: string;
    totalHours?: number;
    mealAllowance?: number;
    otherDeductions?: number;
}


// --- Employee Service Functions ---

/**
 * Fetches the list of employees from the PostgreSQL database.
 * By default, only fetches active employees.
 * @param {boolean} includeInactive - Whether to include inactive employees. Defaults to false.
 * @returns {Promise<Employee[]>} A promise that resolves with the array of employees.
 */
export const getEmployees = async (includeInactive = false): Promise<Employee[]> => {
  console.log("[EmployeeService] getEmployees called. includeInactive:", includeInactive);
  let queryString = `
    SELECT
      id,
      employee_name AS "name",
      position,
      hourly_wage AS "hourlyWage",
      fnpf_no AS "fnpfNo",
      tin_no AS "tinNo",
      bank_code AS "bankCode",
      bank_account_number AS "bankAccountNumber",
      payment_method AS "paymentMethod",
      branch,
      fnpf_eligible AS "fnpfEligible",
      is_active AS "isActive",
      created_at,
      updated_at
    FROM employees1
  `;

  if (!includeInactive) {
      queryString += ' WHERE is_active = TRUE';
  }

  queryString += ' ORDER BY branch, name;';

  try {
    console.log("[EmployeeService] Executing query to fetch employees:", queryString.substring(0, 100) + "...");
    const result = await query(queryString);
    console.log(`[EmployeeService] Fetched ${result.rowCount} employees.`);
     return result.rows.map(row => ({
        ...row,
        hourlyWage: String(row.hourlyWage || '0'),
        fnpfEligible: Boolean(row.fnpfEligible),
        isActive: Boolean(row.isActive),
        fnpfNo: row.fnpfNo,
        tinNo: row.tinNo,
        bankCode: row.bankCode,
        bankAccountNumber: row.bankAccountNumber,
    })) as Employee[];
  } catch (error: any) {
    console.error('[EmployeeService] Detailed error fetching employees from database:', error.stack);
    let errorMessage = `Failed to fetch employees. DB Error: ${error.message || 'Unknown database error'}`;
    if (error.message?.includes('relation "employees1" does not exist')) {
        errorMessage = 'Failed to fetch employees. The "employees1" table does not seem to exist in the database. Please check the schema.';
    } else if (error.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND')) {
         errorMessage = `Failed to fetch employees. Could not resolve database host. Check network and DB connection details.`;
    } else if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
         errorMessage = `Failed to fetch employees. Connection refused. Check if database is running and accessible.`;
    } else if (error.message?.includes('password authentication failed')) {
        errorMessage = 'Failed to fetch employees. Database password authentication failed.';
    } else if (error.message?.includes('Database pool is not available') || error.message?.includes('Database pool failed to initialize')) {
       errorMessage = 'Failed to fetch employees. Database connection is not available. Check server logs for initialization errors.';
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

/**
 * Adds a new employee to the PostgreSQL database. New employees are active by default.
 * @param {Omit<Employee, 'id' | 'created_at' | 'updated_at' | 'isActive'>} employeeData - The employee data without the ID, timestamps, and active status.
 * @returns {Promise<string>} A promise that resolves with the ID of the newly created employee.
 */
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
   if (isNaN(hourlyWageNumeric)) {
     throw new Error('Invalid Hourly Wage value.');
   }

  const finalFnpfNo = fnpfEligible ? (fnpfNo?.trim() || null) : null;
  const finalTinNo = tinNo?.trim() || null;
  const finalBankCode = paymentMethod === 'online' ? (bankCode || null) : null;
  const finalBankAccountNumber = paymentMethod === 'online' ? (bankAccountNumber?.trim() || null) : null;


  try {
      if (finalFnpfNo) {
        const existingEmployee = await checkExistingFNPFNo(finalFnpfNo);
        if (existingEmployee) {
             const errorMessage = `Duplicate FNPF Number: An employee with FNPF Number ${finalFnpfNo} already exists (${existingEmployee.name}, ID: ${existingEmployee.id}). Please use a different number.`;
             console.error(errorMessage);
             throw new Error(errorMessage);
        }
      }

    const result = await query(
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

    if (result.rows.length === 0) {
        console.error('Insert query did not return an ID.');
        throw new Error('Failed to create employee, no ID returned.');
    }
    return result.rows[0].id;
  } catch (error: any) {
    console.error('Detailed error adding employee to database:', error.stack);
    console.error('Error Code:', error.code);
    console.error('Error Constraint:', error.constraint);

    let errorMessage = `Failed to add employee. DB Error: ${error.message || 'Unknown database error'}`;
    if (error.message?.includes(`Duplicate FNPF Number`)) {
        errorMessage = error.message;
    } else if (error.code === '23505' && error.constraint === 'employees1_fnpf_no_key') {
        errorMessage = `Failed to add employee. The FNPF Number '${finalFnpfNo}' already exists.`;
    } else if (error.message?.includes('relation "employees1" does not exist')) {
        errorMessage = 'Failed to add employee. The "employees1" table does not seem to exist in the database. Please check the schema.';
    } else if (error.code === '23502') {
        errorMessage = `Failed to add employee. A required field is missing or null. Check ${error.column || 'a required column'}.`;
    } else if (error.message?.includes('does not exist') && error.message?.includes('column')) {
         errorMessage = `Failed to add employee. A column specified in the query does not exist in the 'employees1' table. Check column names.`;
    } else if (error.message?.includes('password authentication failed')) {
        errorMessage = 'Failed to add employee. Database password authentication failed.';
    } else if (error.message?.includes('Database pool is not available') || error.message?.includes('Database pool failed to initialize')) {
       errorMessage = 'Failed to add employee. Database connection is not available. Check server logs for initialization errors.';
    } else if (error.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND')) {
         errorMessage = `Failed to add employee. Could not resolve database host. Check network and DB connection details.`;
    } else if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
         errorMessage = `Failed to add employee. Connection refused. Check if database is running and accessible.`;
    } else if (error.message?.includes('Database connection is not available')) {
        if (error.message.includes('Original error:')) {
            errorMessage = error.message;
        } else {
            errorMessage = `Failed to add employee. Database connection is not available. Original error: ${error.message}`;
        }
    }
    throw new Error(errorMessage);
  }
};

/**
 * Checks if an employee with the given FNPF number already exists.
 * @param {string | null} fnpfNo - The FNPF number to check. Returns null if fnpfNo is empty or null.
 * @returns {Promise<{ id: string, name: string } | null>} Employee object (id, name) if exists, null otherwise.
 */
export const checkExistingFNPFNo = async (fnpfNo: string | null): Promise<{ id: string, name: string } | null> => {
    if (!fnpfNo || fnpfNo.trim() === '') {
        return null;
    }

    const trimmedFnpfNo = fnpfNo.trim();
    try {
        const result = await query(
            `SELECT id, employee_name AS "name" FROM employees1 WHERE fnpf_no = $1 LIMIT 1;`,
            [trimmedFnpfNo]
        );

        if (result.rows.length > 0) {
            return { id: result.rows[0].id, name: result.rows[0].name };
        } else {
            return null;
        }
    } catch (error: any) {
        console.error("Error checking existing FNPF number:", error.stack);
        throw new Error(`Failed to check existing FNPF number. DB Error: ${error.message || 'Unknown database error'}`);
    }
};


/**
 * Updates an existing employee's information in the PostgreSQL database.
 * Also updates the denormalized employee_name in wage_records.
 * @param {Omit<Employee, 'created_at' | 'updated_at'>} updatedEmployee - The employee object with updated information. ID and isActive must be included.
 * @returns {Promise<void>} A promise that resolves when the update is complete.
 * @throws {Error} If the employee with the specified ID is not found or update fails.
 */
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
   if (isNaN(hourlyWageNumeric)) {
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
               `SELECT id FROM employees1 WHERE fnpf_no = $1 AND id != $2 LIMIT 1;`,
               [finalFnpfNo, id]
           );
           if (existingFnpfResult.rows.length > 0) {
               throw new Error(`Failed to update employee. The FNPF Number '${finalFnpfNo}' already exists for another employee (ID: ${existingFnpfResult.rows[0].id}).`);
           }
       }

       const updateResult = await client.query(
           `UPDATE employees1
            SET
              employee_name = $1,
              position = $2,
              hourly_wage = $3,
              fnpf_no = $4,
              tin_no = $5,
              bank_code = $6,
              bank_account_number = $7,
              payment_method = $8,
              branch = $9,
              fnpf_eligible = $10,
              is_active = $11,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $12;`,
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
               isActive,
               id,
           ]
       );

       if (updateResult.rowCount === 0) {
           throw new Error(`Employee with ID ${id} not found for update.`);
       }

       const updateWageRecordsResult = await client.query(
           `UPDATE wage_records SET employee_name = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2;`,
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

/**
 * Sets the active status of an employee in the database.
 * @param {string} employeeId - The ID of the employee.
 * @param {boolean} isActive - The new active status (true for active, false for inactive).
 * @returns {Promise<void>} A promise that resolves when the status is updated.
 */
export const setEmployeeActiveStatus = async (employeeId: string, isActive: boolean): Promise<void> => {
    if (!employeeId) {
        throw new Error('Employee ID is required to update active status.');
    }

    try {
        const result = await query(
            `UPDATE employees1 SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
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


/**
 * Deletes an employee from the PostgreSQL database by their ID.
 * NOTE: Consider soft delete (setting is_active=false) instead of hard delete.
 * This function performs a HARD delete.
 * @param {string} employeeId - The ID of the employee to delete.
 * @returns {Promise<void>} A promise that resolves when the deletion is complete.
 */
export const deleteEmployee = async (employeeId: string): Promise<void> => {
   if (!employeeId) {
     throw new Error('Employee ID is required for deletion.');
   }

  let client;
  try {
    const pool = await getDbPool();
    client = await pool.connect();
    await client.query('BEGIN');

    const deleteWagesResult = await client.query('DELETE FROM wage_records WHERE employee_id = $1;', [employeeId]);
    console.log(`Deleted ${deleteWagesResult.rowCount} wage records for employee ID ${employeeId} before deleting employee.`);

    const deleteEmployeeResult = await client.query('DELETE FROM employees1 WHERE id = $1;', [employeeId]);

    if (deleteEmployeeResult.rowCount === 0) {
      console.warn(`Attempted to delete employee with ID ${employeeId}, but they were not found.`);
    } else {
       console.log(`Employee with ID ${employeeId} deleted successfully.`);
    }

    await client.query('COMMIT');

  } catch (error: any) {
    if (client) await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
    console.error(`Detailed error deleting employee with ID ${employeeId}:`, error.stack);
    let errorMessage = `Failed to delete employee. DB Error: ${error.message || 'Unknown database error'}`;
     if (error.code === '23503') {
        errorMessage = `Cannot delete employee ${employeeId}. There might be other related records. Consider marking as inactive instead.`;
     }
    throw new Error(errorMessage);
  } finally {
      if (client) client.release();
  }
};


/**
 * Fetches a single employee by their ID from the PostgreSQL database.
 * @param {string} employeeId - The ID of the employee to fetch.
 * @returns {Promise<Employee | null>} A promise that resolves with the employee object or null if not found.
 */
export const getEmployeeById = async (employeeId: string): Promise<Employee | null> => {
  if (!employeeId) {
    console.warn("getEmployeeById called with no ID.");
    return null;
  }
  try {
    const result = await query(`
      SELECT
        id,
        employee_name AS "name",
        position,
        hourly_wage AS "hourlyWage",
        fnpf_no AS "fnpfNo",
        tin_no AS "tinNo",
        bank_code AS "bankCode",
        bank_account_number AS "bankAccountNumber",
        payment_method AS "paymentMethod",
        branch,
        fnpf_eligible AS "fnpfEligible",
        is_active AS "isActive",
        created_at,
        updated_at
      FROM employees1
      WHERE id = $1;
    `, [employeeId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
     return {
        ...row,
        hourlyWage: String(row.hourlyWage || '0'),
        fnpfEligible: Boolean(row.fnpfEligible),
        isActive: Boolean(row.isActive),
        tinNo: row.tinNo,
    } as Employee;
  } catch (error: any) {
    console.error(`Detailed error fetching employee with ID ${employeeId}:`, error.stack);
    throw error;
  }
};


// --- Wage Record Service Functions ---

// --- Helper to generate a secure random token ---
const generateToken = (): string => {
    return randomBytes(32).toString('hex');
};


/**
 * Saves wage records to the database *as part of an approval request*.
 * This function should ideally be called within the requestWageApproval transaction.
 * @param {Omit<WageRecord, 'id' | 'created_at' | 'approvalStatus'>[]} wageRecords - Array of wage records to save.
 * @param {string} approvalId - The ID of the wage_approvals record they belong to.
 * @param {PoolClient} client - The database client from the transaction.
 * @returns {Promise<void>}
 */
 const saveWageRecordsForApproval = async (
    wageRecords: Omit<WageRecord, 'id' | 'approvalId' | 'approvalStatus' | 'created_at' | 'updated_at'>[],
    approvalId: string,
    client: Pool | PoolClient
): Promise<void> => {
    if (!wageRecords || wageRecords.length === 0) {
        throw new Error("No wage records provided for saving within approval.");
    }

    const insertValues = wageRecords.map(record => [
        record.employeeId, approvalId, record.employeeName, record.hourlyWage,
        record.totalHours, record.hoursWorked, record.overtimeHours,
        record.mealAllowance, record.fnpfDeduction, record.otherDeductions, record.grossPay, record.netPay, record.dateFrom, record.dateTo
    ]);

    let placeholderIndex = 1;
    const placeholders = insertValues.map(() =>
        `($${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}::date, $${placeholderIndex++}::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).join(', ');

    const flatValues = insertValues.flat();

    await client.query(
        `INSERT INTO wage_records (
             employee_id, approval_id, employee_name, hourly_wage,
             total_hours, hours_worked, overtime_hours,
             meal_allowance, fnpf_deduction, other_deductions, gross_pay, net_pay, date_from, date_to, created_at, updated_at
         ) VALUES ${placeholders};`,
        flatValues
    );
};


/**
 * Creates a wage approval request and associated wage records (initially pending).
 * Generates an approval link to be copied by the user.
 * @param {WageRecord[]} wageRecords - Array of wage records to save (without approvalId).
 * @returns {Promise<{approvalId: string, approvalLink: string}>} The ID of the new approval record and the generated approval link.
 */
export const requestWageApproval = async (wageRecords: Omit<WageRecord, 'id' | 'approvalId' | 'approvalStatus' | 'created_at'| 'updated_at'>[]): Promise<{approvalId: string, approvalLink: string}> => {
    if (!wageRecords || wageRecords.length === 0) {
        throw new Error("No wage records provided for approval request.");
    }

    const { dateFrom, dateTo } = wageRecords[0];
    if (!dateFrom || !dateTo || !isDateValid(parseISO(dateFrom)) || !isDateValid(parseISO(dateTo))) {
        throw new Error("Invalid date range in wage records batch.");
    }


    const token = generateToken();
    let client;
    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        const approvalResult = await client.query(
            `INSERT INTO wage_approvals (token, date_from, date_to, status, created_at, updated_at)
             VALUES ($1, $2::date, $3::date, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id;`,
            [token, dateFrom, dateTo]
        );

        if (approvalResult.rows.length === 0) {
            throw new Error('Failed to create wage approval record.');
        }
        const approvalId = approvalResult.rows[0].id;

        await saveWageRecordsForApproval(wageRecords, approvalId, client);

        await client.query('COMMIT');

        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';

         if (!baseURL) {
            console.error("CRITICAL: NEXT_PUBLIC_BASE_URL environment variable is not set. Approval links will not work correctly in deployment. Please set it in your .env.local file (for local development) and in your Railway environment variables (for deployment) to your deployed application's public URL (e.g., https://your-app-name.railway.app). Using fallback: http://localhost:9002");
         } else if (baseURL.includes('localhost') && process.env.NODE_ENV === 'production') {
             console.warn("WARNING: NEXT_PUBLIC_BASE_URL is set to a localhost address in a production environment. Approval links will likely not work for external users. Ensure NEXT_PUBLIC_BASE_URL is set to the public URL of your deployed application in your hosting environment (e.g., Railway).");
         } else if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
             console.warn(`WARNING: NEXT_PUBLIC_BASE_URL "${baseURL}" does not seem to be a valid URL. Approval links may not work. Please check the value in your environment variables.`);
         } else if (baseURL.startsWith('postgresql://')) {
              console.warn(`WARNING: NEXT_PUBLIC_BASE_URL "${baseURL}" looks like a database connection string, not a public URL for the application. Approval links will not work. Please set it to your application's public address.`);
         }

        const path = '/approve-wages';
        const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        const approvalLink = `${cleanBaseURL}${path}?token=${token}`;

        console.log(`Approval link generated: ${approvalLink}`);

        return { approvalId, approvalLink };

    } catch (error: any) {
        if (client) {
            await client.query('ROLLBACK');
            console.log('Transaction rolled back due to error.');
        }
        console.error('Detailed error requesting wage approval:', error.stack);
        throw new Error(`Failed to request wage approval. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
        if (client) {
            client.release();
        }
    }
};


/**
 * Fetches wage records associated with a specific approval token.
 * @param {string} token - The approval token.
 * @returns {Promise<{approval: WageApproval, records: WageRecord[]} | null>} Approval details and associated records, or null if token not found or invalid.
 */
export const getWagesForApproval = async (token: string | null): Promise<{approval: WageApproval, records: WageRecord[]} | null> => {
    const cleanToken = token ? String(token).trim() : null;
    if (!cleanToken) {
        console.warn("[EmployeeService] getWagesForApproval called with an empty or invalid token.");
        throw new Error("Invalid approval link: Token is missing or invalid.");
    }
    console.log(`[EmployeeService] Attempting to fetch wages for approval token: ${cleanToken}`);

    try {
        console.log(`[EmployeeService] Querying wage_approvals for token: ${cleanToken}`);
        const approvalResult = await query(
            `SELECT id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo", status, created_at, approved_at, declined_at, approved_by, updated_at
             FROM wage_approvals WHERE token = $1;`,
            [cleanToken]
        );

        if (approvalResult.rows.length === 0) {
            console.log(`[EmployeeService] No approval found for token: ${cleanToken}`);
            throw new Error("Approval request not found or link is invalid.");
        }
        const approval = approvalResult.rows[0] as WageApproval;
        console.log(`[EmployeeService] Found approval record ID: ${approval.id}, Status: ${approval.status}`);

        console.log(`[EmployeeService] Querying wage_records for approval_id: ${approval.id}`);
        const recordsResult = await query(
            `SELECT
               wr.id, wr.employee_id AS "employeeId", wr.employee_name AS "employeeName", wr.hourly_wage AS "hourlyWage",
               wr.total_hours AS "totalHours", wr.hours_worked AS "hoursWorked", wr.overtime_hours AS "overtimeHours",
               wr.meal_allowance AS "mealAllowance", wr.fnpf_deduction AS "fnpfDeduction", wr.other_deductions AS "otherDeductions",
               wr.gross_pay AS "grossPay", wr.net_pay AS "netPay",
               TO_CHAR(wr.date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(wr.date_to, 'YYYY-MM-DD') AS "dateTo",
               wr.created_at, wr.updated_at, wr.approval_id AS "approvalId",
               e.payment_method AS "paymentMethod", e.fnpf_eligible AS "fnpfEligible"
             FROM wage_records wr
             INNER JOIN employees1 e ON wr.employee_id = e.id
             WHERE wr.approval_id = $1
             ORDER BY e.employee_name;`,
            [approval.id]
        );
        console.log(`[EmployeeService] Found ${recordsResult.rowCount} wage records for approval ID ${approval.id}.`);

         const records = recordsResult.rows.map(row => ({
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

         console.log(`[EmployeeService] Successfully fetched approval and ${records.length} records for token ${cleanToken}.`);
        return { approval, records };

    } catch (error: any) {
        console.error(`[EmployeeService] Error fetching wages for approval token ${cleanToken}:`, error.stack);
        let errorMessage = `Failed to fetch wages for approval.`;
        if (error instanceof Error && error.message.includes("Approval request not found")) {
            errorMessage = error.message;
        } else if (error.message?.includes('relation "wage_approvals" does not exist')) {
           errorMessage += ' Approval table not found.';
        } else if (error.message?.includes('relation "wage_records" does not exist')) {
           errorMessage += ' Wage records table not found.';
         } else if (error.message?.includes('column reference "employee_name" is ambiguous')) {
             errorMessage = `Database query failed: column reference "employee_name" is ambiguous. Please qualify the column name with its table alias (e.g., wr.employee_name or e.employee_name).`;
        } else if (error.message?.includes('column') && error.message?.includes('does not exist')) {
            errorMessage = `Database query failed: column specified in the query does not exist. Check column names. Original error: ${error.message}`;
        } else {
           errorMessage += ` DB Error: ${error.message || 'Unknown error'}`;
        }
        console.error(`[EmployeeService] Throwing error for token ${cleanToken}: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};

/**
 * Updates the status of a wage approval record.
 * @param {string} token - The approval token.
 * @param {'approved' | 'declined'} newStatus - The new status.
 * @param {string | null} approverName - Optional name of the person approving/declining.
 * @returns {Promise<WageApproval | null>} The updated approval record or null if not found/already processed.
 */
export const updateWageApprovalStatus = async (
    token: string,
    newStatus: 'approved' | 'declined',
    approverName: string | null = null
): Promise<WageApproval | null> => {
    if (!token) return null;
    let client;
    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        const currentApprovalResult = await client.query(
            `SELECT id, status FROM wage_approvals WHERE token = $1 FOR UPDATE;`,
            [token]
        );

        if (currentApprovalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log(`No approval found for token ${token} during update.`);
            return null;
        }

        const currentStatus = currentApprovalResult.rows[0].status;
        if (currentStatus !== 'pending') {
            await client.query('ROLLBACK');
            console.log(`Approval for token ${token} is already processed (status: ${currentStatus}).`);
             const existingApprovalResult = await client.query(
                 `SELECT id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo", status, created_at, approved_at, declined_at, approved_by, updated_at
                  FROM wage_approvals WHERE token = $1;`,
                 [token]
             );
             return existingApprovalResult.rows.length > 0 ? (existingApprovalResult.rows[0] as WageApproval) : null;
        }

        const timestampField = newStatus === 'approved' ? 'approved_at' : 'declined_at';
        const updateResult = await client.query(
            `UPDATE wage_approvals
             SET status = $1, ${timestampField} = CURRENT_TIMESTAMP, approved_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE token = $3 AND status = 'pending'
             RETURNING id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo", status, created_at, approved_at, declined_at, approved_by, updated_at;`,
            [newStatus, approverName, token]
        );

         if (updateResult.rowCount === 0) {
            await client.query('ROLLBACK');
            console.log(`Failed to update approval status for token ${token} (possibly changed status concurrently).`);
             return null;
        }

        await client.query('COMMIT');

        const updatedApproval = updateResult.rows[0] as WageApproval;

        console.log(`Wage approval ${updatedApproval.id} status updated to ${newStatus}.`);
        return updatedApproval;

    } catch (error: any) {
        if (client) {
            await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr));
        }
        console.error(`Error updating wage approval status for token ${token}:`, error.stack);
        throw new Error(`Failed to update approval status. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
         if (client) client.release();
    }
};


/**
 * Deletes wage records (and potentially the approval record) for a specific date range
 * based on the approval ID. This is used when an admin deletes from the records page.
 * @param {string} approvalId - The ID of the wage_approval record.
 * @returns {Promise<void>}
 */
export const deleteWageRecordsByApprovalId = async (approvalId: string): Promise<void> => {
   if (!approvalId) {
       throw new Error("Approval ID is required for deletion.");
   }

   let client;
   try {
       const pool = await getDbPool();
       client = await pool.connect();
       await client.query('BEGIN');

       const deleteRecordsResult = await client.query(
           'DELETE FROM wage_records WHERE approval_id = $1;',
           [approvalId]
       );
       console.log(`Deleted ${deleteRecordsResult.rowCount} wage records for approval ID ${approvalId}`);

       const deleteApprovalResult = await client.query(
           'DELETE FROM wage_approvals WHERE id = $1;',
           [approvalId]
       );
        if (deleteApprovalResult.rowCount === 0) {
             console.warn(`Approval record with ID ${approvalId} not found during deletion.`);
         } else {
             console.log(`Deleted wage approval record with ID ${approvalId}`);
         }

       await client.query('COMMIT');
   } catch (error: any) {
       if (client) {
           await client.query('ROLLBACK');
           console.log('Transaction rolled back due to deletion error.');
       }
       console.error(`Detailed error deleting wage records and approval for approval ID ${approvalId}:`, error.stack);
       throw new Error(`Failed to delete wage data. DB Error: ${error.message || 'Unknown error'}`);
   } finally {
       if (client) {
           client.release();
       }
   }
};


/**
 * Fetches distinct pay periods summaries (date_from, date_to, approval_id, totals)
 * from the database, filtered by status. Calculates cash and online totals.
 * @param {string} status - The status to filter by ('pending', 'approved', 'declined').
 * @returns {Promise<PayPeriodSummary[]>} A promise resolving with the summaries.
 */
export const getPayPeriodSummaries = async (status: 'pending' | 'approved' | 'declined'): Promise<PayPeriodSummary[]> => {
  const queryString = `
    SELECT
      TO_CHAR(wa.date_from, 'YYYY-MM-DD') AS "dateFrom",
      TO_CHAR(wa.date_to, 'YYYY-MM-DD') AS "dateTo",
      wa.id AS "approvalId",
      wa.status,
      wa.token,
      wa.updated_at AS "updated_at",
      COALESCE(SUM(wr.net_pay), 0) AS "totalWages",
      COALESCE(SUM(CASE WHEN e.payment_method = 'cash' THEN wr.net_pay ELSE 0 END), 0) AS "totalCashWages",
      COALESCE(SUM(CASE WHEN e.payment_method = 'online' THEN wr.net_pay ELSE 0 END), 0) AS "totalOnlineWages"
    FROM wage_approvals wa
    LEFT JOIN wage_records wr ON wa.id = wr.approval_id
    LEFT JOIN employees1 e ON wr.employee_id = e.id
    WHERE wa.status = $1
    GROUP BY wa.id, wa.date_from, wa.date_to, wa.status, wa.token, wa.updated_at
    ORDER BY wa.date_from DESC;
  `;

  try {
    const result = await query(queryString, [status]);
    return result.rows.map(row => ({
        ...row,
        totalWages: Number(row.totalWages) || 0,
        totalCashWages: Number(row.totalCashWages) || 0,
        totalOnlineWages: Number(row.totalOnlineWages) || 0,
    })) as PayPeriodSummary[];
  } catch (error: any) {
    console.error(`Detailed error fetching ${status} pay periods:`, error.stack);
    throw error;
  }
};


/**
 * Fetches wage records from the database, optionally filtered by date range and approval status.
 * @param {Date | string | null} filterDateFrom - Optional start date for filtering.
 * @param {Date | string | null} filterDateTo - Optional end date for filtering.
 * @param {string | null} approvalStatus - Optional status to filter by ('pending', 'approved', 'declined').
 * @param {string | null} approvalId - Optional approval ID to filter by.
 * @returns {Promise<WageRecord[]>} A promise resolving with the fetched records.
 */
export const getWageRecords = async (
    filterDateFrom: Date | string | null = null,
    filterDateTo: Date | string | null = null,
    approvalStatus: 'pending' | 'approved' | 'declined' | null = null,
    approvalId: string | null = null
): Promise<WageRecord[]> => {
  let queryString = `
    SELECT
      wr.id,
      wr.employee_id AS "employeeId",
      wr.employee_name AS "employeeName",
      wr.hourly_wage AS "hourlyWage",
      wr.total_hours AS "totalHours",
      wr.hours_worked AS "hoursWorked",
      wr.overtime_hours AS "overtimeHours",
      wr.meal_allowance AS "mealAllowance",
      wr.fnpf_deduction AS "fnpfDeduction",
      wr.other_deductions AS "otherDeductions",
      wr.gross_pay AS "grossPay",
      wr.net_pay AS "netPay",
      TO_CHAR(wr.date_from, 'YYYY-MM-DD') AS "dateFrom",
      TO_CHAR(wr.date_to, 'YYYY-MM-DD') AS "dateTo",
      wr.created_at,
      wr.updated_at,
      wr.approval_id AS "approvalId",
      e.payment_method AS "paymentMethod",
      e.fnpf_eligible AS "fnpfEligible"
    FROM wage_records wr
    INNER JOIN employees1 e ON wr.employee_id = e.id
    LEFT JOIN wage_approvals wa ON wr.approval_id = wa.id
  `;
  const queryParams: any[] = [];
  const conditions: string[] = [];

   const formatDateForQuery = (date: Date | string | null): string | null => {
       if (!date) return null;
       try {
           const d = typeof date === 'string' ? parseISO(date) : date;
           return isDateValid(d) ? format(d, 'yyyy-MM-dd') : null;
       } catch (e) {
           console.warn("Invalid date provided for filtering:", date);
           return null;
       }
   };

   const formattedDateFrom = formatDateForQuery(filterDateFrom);
   const formattedDateTo = formatDateForQuery(filterDateTo);

    if (approvalId) {
       conditions.push(`wr.approval_id = $${queryParams.length + 1}`);
       queryParams.push(approvalId);
   } else {
        if (formattedDateFrom) {
            conditions.push(`wr.date_from >= $${queryParams.length + 1}::date`);
            queryParams.push(formattedDateFrom);
        }
        if (formattedDateTo) {
            conditions.push(`wr.date_to <= $${queryParams.length + 1}::date`);
            queryParams.push(formattedDateTo);
        }
        if (approvalStatus) {
            conditions.push(`wa.status = $${queryParams.length + 1}`);
            queryParams.push(approvalStatus);
        }
   }

  if (conditions.length > 0) {
      queryString += ' WHERE ' + conditions.join(' AND ');
  }

  queryString += ' ORDER BY wr.date_from DESC, wr.employee_name;';

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
    console.error('Detailed error fetching wage records from database:', error.stack);
    throw error;
  }
};

/**
 * Checks if wage records exist for a specific date range and approval status.
 * @param {string} dateFrom - Start date YYYY-MM-DD.
 * @param {string} dateTo - End date YYYY-MM-DD.
 * @returns {Promise<boolean>} True if records exist for the range with a 'pending' or 'approved' status, false otherwise.
 */
export const checkWageRecordsExistByDateRange = async (dateFrom: string, dateTo: string): Promise<boolean> => {
    if (!dateFrom || !dateTo) {
        console.warn("Date range not provided for checking wage records existence.");
        return false;
    }
    try {
        const result = await query(
            `SELECT 1
             FROM wage_records wr
             JOIN wage_approvals wa ON wr.approval_id = wa.id
             WHERE wr.date_from = $1::date AND wr.date_to = $2::date
             AND wa.status IN ('pending', 'approved')
             LIMIT 1;`,
            [dateFrom, dateTo]
        );
        return result.rowCount > 0;
    } catch (error: any) {
        console.error(`Error checking if wage records exist for date range ${dateFrom} - ${dateTo}:`, error.stack);
        throw new Error(`Failed to check wage records existence. DB Error: ${error.message || 'Unknown error'}`);
    }
};


/**
 * Updates the name of an employee in existing wage records when the employee's name is changed.
 * This ensures that the denormalized employee name in the wage records is consistent with the employees table.
 * @param {string} employeeId - The ID of the employee whose name has been updated.
 * @param {string} newEmployeeName - The new name of the employee.
 * @returns {Promise<void>}
 */
export const updateEmployeeNameInWageRecords = async (employeeId: string, newEmployeeName: string): Promise<void> => {
    try {
        const result = await query(
            `UPDATE wage_records SET employee_name = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2;`,
            [newEmployeeName, employeeId]
        );
        console.log(`Updated employee name to "${newEmployeeName}" in ${result.rowCount} wage records for employee ID ${employeeId}.`);
    } catch (error: any) {
        console.error(`Error updating employee name in wage_records for employee ID ${employeeId}:`, error.stack);
        throw new Error(`Failed to update employee name in wage records. DB Error: ${error.message || 'Unknown error'}`);
    }
};

/**
 * Updates existing wage records for a given approval ID.
 * Resets the approval status to 'pending'.
 * @param {string} approvalId - The ID of the wage_approvals record.
 * @param {UpdatedWageRecordData[]} updatedRecords - Array of wage records with updated data.
 * @returns {Promise<void>}
 */
export const updateWageRecordsInApproval = async (
    approvalId: string,
    updatedRecords: UpdatedWageRecordData[]
): Promise<void> => {
    if (!approvalId) throw new Error("Approval ID is required.");
    if (!updatedRecords || updatedRecords.length === 0) {
        console.log("No records provided for update.");
        return;
    }

    let client;
    try {
        const pool = await getDbPool();
        client = await pool.connect();
        await client.query('BEGIN');

        for (const record of updatedRecords) {
            if (!record.id) {
                console.warn("Skipping record update due to missing record ID:", record);
                continue;
            }

            const originalRecordResult = await client.query(
                `SELECT wr.hourly_wage, e.employee_name, e.fnpf_eligible
                 FROM wage_records wr
                 JOIN employees1 e ON wr.employee_id = e.id
                 WHERE wr.id = $1 AND wr.approval_id = $2;`,
                [record.id, approvalId]
            );

            if (originalRecordResult.rows.length === 0) {
                console.warn(`Wage record with ID ${record.id} not found for approval ${approvalId}. Skipping.`);
                continue;
            }
            const originalHourlyWage = parseFloat(originalRecordResult.rows[0].hourly_wage);
            const employeeName = originalRecordResult.rows[0].employee_name; // Corrected: was e.name
            const fnpfEligible = originalRecordResult.rows[0].fnpf_eligible;

            const totalHours = record.totalHours ?? 0;
            const mealAllowance = record.mealAllowance ?? 0;
            const otherDeductions = record.otherDeductions ?? 0;

            const normalHoursThreshold = employeeName === SPECIAL_EMPLOYEE_NAME
                ? SPECIAL_NORMAL_HOURS_THRESHOLD
                : STANDARD_NORMAL_HOURS_THRESHOLD;

            const hoursWorked = Math.min(totalHours, normalHoursThreshold);
            const overtimeHours = Math.max(0, totalHours - normalHoursThreshold);
            const regularPay = originalHourlyWage * hoursWorked;
            const overtimePay = overtimeHours * originalHourlyWage * OVERTIME_RATE;
            const grossPay = regularPay + overtimePay + mealAllowance;
            const fnpfDeduction = fnpfEligible ? regularPay * 0.08 : 0;
            const netPay = Math.max(0, grossPay - fnpfDeduction - otherDeductions);

            await client.query(
                `UPDATE wage_records
                 SET
                   total_hours = $1,
                   hours_worked = $2,
                   overtime_hours = $3,
                   meal_allowance = $4,
                   other_deductions = $5,
                   fnpf_deduction = $6,
                   gross_pay = $7,
                   net_pay = $8,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9 AND approval_id = $10;`,
                [
                    totalHours, hoursWorked, overtimeHours, mealAllowance, otherDeductions,
                    fnpfDeduction, grossPay, netPay,
                    record.id, approvalId
                ]
            );
        }

        // Reset approval status to 'pending' and clear approval timestamps/by
        await client.query(
            `UPDATE wage_approvals
             SET status = 'pending', approved_at = NULL, declined_at = NULL, approved_by = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1;`, 
            [approvalId]
        );
        console.log(`Wage approval ${approvalId} status reset to pending and timestamps cleared after edits.`);

        await client.query('COMMIT');
    } catch (error: any) {
        if (client) await client.query('ROLLBACK');
        console.error(`Error updating wage records for approval ID ${approvalId}:`, error);
        throw new Error(`Failed to update wage records. DB Error: ${error.message || 'Unknown error'}`);
    } finally {
        if (client) client.release();
    }
};
