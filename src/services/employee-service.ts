
'use server';

import { Pool, PoolClient } from 'pg'; // Ensure PoolClient is imported if used in transactions
import { query, getDbPool } from '@/lib/db';
import { format, isValid as isDateValid, parseISO } from 'date-fns';
import { randomBytes } from 'crypto';
// import nodemailer from 'nodemailer'; // Removed Nodemailer import

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
  hoursWorked: number; // Normal hours (<= 45 or 48)
  overtimeHours: number; // Overtime hours
  mealAllowance: number;
  fnpfDeduction: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  dateFrom: string; // YYYY-MM-DD string
  dateTo: string; // YYYY-MM-DD string
  approvalId?: string; // Reference to the approval batch
  approvalStatus?: 'pending' | 'approved' | 'declined'; // Optional status
  created_at?: Date;
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
}

// Interface for Pay Period Summaries (used in Wage Records page)
export interface PayPeriodSummary {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  approvalId: string;
  totalWages: number;
  status: 'pending' | 'approved' | 'declined'; // Include status
  token?: string; // Include token for generating link
}


// --- Employee Service Functions ---

/**
 * Fetches the list of employees from the PostgreSQL database.
 * By default, only fetches active employees.
 * @param {boolean} includeInactive - Whether to include inactive employees. Defaults to false.
 * @returns {Promise<Employee[]>} A promise that resolves with the array of employees.
 */
export const getEmployees = async (includeInactive = false): Promise<Employee[]> => {
  let queryString = `
    SELECT
      id,
      employee_name AS "name", -- Map employee_name from DB to name in interface
      position,
      hourly_wage AS "hourlyWage",
      fnpf_no AS "fnpfNo",
      tin_no AS "tinNo",
      bank_code AS "bankCode",
      bank_account_number AS "bankAccountNumber",
      payment_method AS "paymentMethod",
      branch,
      fnpf_eligible AS "fnpfEligible",
      is_active AS "isActive", -- Fetch is_active status
      created_at,
      updated_at
    FROM employees1 -- Use the correct table name
  `;

  if (!includeInactive) {
      queryString += ' WHERE is_active = TRUE';
  }

  queryString += ' ORDER BY branch, name;'; // Optional: order by branch then name

  try {
    const result = await query(queryString);
    // Ensure consistent data types, especially for boolean and potentially null values
     return result.rows.map(row => ({
        ...row,
        hourlyWage: String(row.hourlyWage || '0'), // Ensure string
        fnpfEligible: Boolean(row.fnpfEligible), // Ensure boolean
        isActive: Boolean(row.isActive), // Ensure boolean
        // Handle potential nulls explicitly if necessary, though DB query should handle it
        fnpfNo: row.fnpfNo,
        tinNo: row.tinNo,
        bankCode: row.bankCode,
        bankAccountNumber: row.bankAccountNumber,
    })) as Employee[];
  } catch (error: any) {
    // Log the original error for better debugging
    console.error('Detailed error fetching employees from database:', error);
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
        // Check if the original error message already contains specific pool/initialization info
        if (error.message.includes('Original error:')) {
            errorMessage = error.message; // Use the specific message from the query function
        } else {
            errorMessage = `Failed to fetch employees. Database connection is not available. Original error: ${error.message}`;
        }
    }
     // Re-throw the potentially enhanced error message
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
    name, // This is employee_name in the DB
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

  console.log('Received employee data for addEmployee:', employeeData); // Log received data

  // Basic validation (can be expanded)
  if (!name || !position || !hourlyWage) {
      throw new Error('Missing required employee fields (name, position, hourlyWage).');
  }

   // Ensure correct data types before insertion
   const hourlyWageNumeric = parseFloat(hourlyWage);
   if (isNaN(hourlyWageNumeric)) {
     throw new Error('Invalid Hourly Wage value.');
   }

  // Ensure conditional fields are handled (e.g., FNPF no based on eligibility)
  const finalFnpfNo = fnpfEligible ? (fnpfNo?.trim() || null) : null; // Trim and ensure null if empty/ineligible
  const finalTinNo = tinNo?.trim() || null; // Trim and ensure null
  const finalBankCode = paymentMethod === 'online' ? (bankCode || null) : null; // Set null if not online or empty
  const finalBankAccountNumber = paymentMethod === 'online' ? (bankAccountNumber?.trim() || null) : null; // Trim and ensure null


  console.log('Data prepared for DB insert:', {
      name, position, hourlyWageNumeric, finalFnpfNo, finalTinNo, finalBankCode, finalBankAccountNumber, paymentMethod, branch, fnpfEligible
  });

  try {
     // --- Check for existing FNPF Number before attempting to add ---
      if (finalFnpfNo) {
        console.log(`Checking if FNPF No ${finalFnpfNo} already exists...`);
        const existingEmployee = await checkExistingFNPFNo(finalFnpfNo);
        if (existingEmployee) {
             const errorMessage = `Duplicate FNPF Number: ${finalFnpfNo}. Please use a different FNPF Number.`;
             console.error(`Attempted to add employee with duplicate FNPF No: ${finalFnpfNo}`);
             // Throw a specific error message that the frontend can check
             throw new Error(errorMessage); // Make message more specific
        }
         console.log(`FNPF No ${finalFnpfNo} is unique. Proceeding...`);
      }
      // --- End FNPF Check ---

    console.log('Executing INSERT query into employees1...');
    const result = await query(
      `INSERT INTO employees1 (employee_name, position, hourly_wage, fnpf_no, tin_no, bank_code, bank_account_number, payment_method, branch, fnpf_eligible, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE) -- New employees are active by default
       RETURNING id;`, // Use the correct table name
      [
        name, // This value goes into the employee_name column
        position,
        hourlyWageNumeric, // Use numeric value for DB
        finalFnpfNo,
        finalTinNo, // Use trimmed or null value
        finalBankCode,
        finalBankAccountNumber,
        paymentMethod,
        branch,
        fnpfEligible,
      ]
    );
    console.log('Query execution finished. Result:', result);

    if (result.rows.length === 0) {
        console.error('Insert query did not return an ID.');
        throw new Error('Failed to create employee, no ID returned.');
    }
    console.log('Employee added successfully with ID:', result.rows[0].id);
    return result.rows[0].id; // Return the newly generated UUID from the DB
  } catch (error: any) {
    console.error('Detailed error adding employee to database:', error);
    console.error('Error Code:', error.code); // Log specific PG error code if available
    console.error('Error Constraint:', error.constraint); // Log constraint name if available (e.g., for unique violation)

    let errorMessage = `Failed to add employee. DB Error: ${error.message || 'Unknown database error'}`;
    // Check for duplicate FNPF specifically
    if (error.message?.includes(`Duplicate FNPF Number`)) { // Check for the specific message
        errorMessage = error.message; // Use the specific message from the check
    } else if (error.code === '23505' && error.constraint === 'employees1_fnpf_no_key') { // Duplicate key (unique constraint violation)
        errorMessage = `Failed to add employee. The FNPF Number '${finalFnpfNo}' already exists.`;
    } else if (error.message?.includes('relation "employees1" does not exist')) {
        errorMessage = 'Failed to add employee. The "employees1" table does not seem to exist in the database. Please check the schema.';
    } else if (error.code === '23502') { // Not null violation
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
        // Check if the original error message already contains specific pool/initialization info
        if (error.message.includes('Original error:')) {
            errorMessage = error.message; // Use the specific message from the query function
        } else {
            errorMessage = `Failed to add employee. Database connection is not available. Original error: ${error.message}`;
        }
    }
    // Keep the original error message for other unknown DB errors
    throw new Error(errorMessage);
  }
};

/**
 * Checks if an employee with the given FNPF number already exists.
 * @param {string | null} fnpfNo - The FNPF number to check. Returns null if fnpfNo is empty or null.
 * @returns {Promise<{ id: string } | null>} Employee object (id) if exists, null otherwise.
 */
export const checkExistingFNPFNo = async (fnpfNo: string | null): Promise<{ id: string } | null> => {
    // If FNPF is not eligible or number is empty/null, no need to check
    if (!fnpfNo || fnpfNo.trim() === '') {
        console.log("Skipping FNPF check: No FNPF number provided.");
        return null;
    }

    const trimmedFnpfNo = fnpfNo.trim();
    console.log(`Executing query to check for existing FNPF No: ${trimmedFnpfNo}`);

    try {
        const result = await query(
            `SELECT id FROM employees1 WHERE fnpf_no = $1 LIMIT 1;`,
            [trimmedFnpfNo]
        );
        console.log(`FNPF check query result: ${result.rowCount} rows found.`);

        if (result.rows.length > 0) {
            console.log(`FNPF number ${trimmedFnpfNo} found for employee ID: ${result.rows[0].id}`);
            return { id: result.rows[0].id }; // Return an object indicating existence
        } else {
            console.log(`FNPF number ${trimmedFnpfNo} is unique.`);
            return null; // FNPF number does not exist
        }
    } catch (error: any) {
        console.error("Error checking existing FNPF number:", error);
        // Treat check failure as "doesn't exist" to avoid blocking unnecessarily,
        // but the INSERT will fail later if there's a real duplicate.
        throw new Error(`Failed to check existing FNPF number. DB Error: ${error.message || 'Unknown database error'}`);
    }
};


/**
 * Updates an existing employee's information in the PostgreSQL database.
 * @param {Omit<Employee, 'created_at' | 'updated_at'>} updatedEmployee - The employee object with updated information. ID and isActive must be included.
 * @returns {Promise<void>} A promise that resolves when the update is complete.
 * @throws {Error} If the employee with the specified ID is not found or update fails.
 */
export const updateEmployee = async (updatedEmployee: Omit<Employee, 'created_at' | 'updated_at'>): Promise<void> => {
  const {
    id,
    name, // This is employee_name in the DB
    position,
    hourlyWage,
    fnpfNo,
    tinNo,
    bankCode,
    bankAccountNumber,
    paymentMethod,
    branch,
    fnpfEligible,
    isActive, // Include isActive status
  } = updatedEmployee;

   // Basic validation
   if (!id || !name || !position || !hourlyWage || typeof isActive !== 'boolean') {
     throw new Error('Missing required employee fields for update (id, name, position, hourlyWage, isActive).');
   }

   // Ensure correct data types
   const hourlyWageNumeric = parseFloat(hourlyWage);
   if (isNaN(hourlyWageNumeric)) {
     throw new Error('Invalid Hourly Wage value for update.');
   }

   // Ensure conditional fields are handled
   const finalFnpfNo = fnpfEligible ? (fnpfNo?.trim() || null) : null; // Trim and ensure null
   const finalTinNo = tinNo?.trim() || null; // Trim and ensure null
   const finalBankCode = paymentMethod === 'online' ? (bankCode || null) : null; // Set null if not online or empty
   const finalBankAccountNumber = paymentMethod === 'online' ? (bankAccountNumber?.trim() || null) : null; // Trim and ensure null


  try {
    // Check for existing FNPF Number before attempting to update if FNPF# changed
    if (finalFnpfNo) {
        const existingFnpf = await checkExistingFNPFNo(finalFnpfNo);
        // If FNPF exists and belongs to a DIFFERENT employee ID
        if (existingFnpf && existingFnpf.id !== id) {
            throw new Error(`Failed to update employee. The FNPF Number '${finalFnpfNo}' already exists for another employee.`);
        }
      }

    const result = await query(
      `UPDATE employees1 -- Use the correct table name
       SET
         employee_name = $1, -- Use employee_name for the column
         position = $2,
         hourly_wage = $3,
         fnpf_no = $4,
         tin_no = $5,
         bank_code = $6,
         bank_account_number = $7,
         payment_method = $8,
         branch = $9,
         fnpf_eligible = $10,
         is_active = $11, -- Update is_active status
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $12;`, // Adjust parameter index
      [
        name, // This value updates the employee_name column
        position,
        hourlyWageNumeric,
        finalFnpfNo,
        finalTinNo, // Use trimmed or null value
        finalBankCode,
        finalBankAccountNumber,
        paymentMethod,
        branch,
        fnpfEligible,
        isActive, // Pass the isActive boolean
        id, // The ID for the WHERE clause
      ]
    );

    if (result.rowCount === 0) {
      // Throw an error if no rows were affected (employee not found)
      throw new Error(`Employee with ID ${id} not found for update.`);
    }
    console.log(`Employee with ID ${id} updated successfully.`);
  } catch (error: any) {
    console.error(`Detailed error updating employee with ID ${id}:`, error);
    // Check for specific errors like duplicate FNPF number during update
    let errorMessage = `Failed to update employee. DB Error: ${error.message || 'Unknown database error'}`;
     if (error.message?.includes('FNPF Number already exists')) {
        errorMessage = error.message;
    } else if (error.code === '23505' && error.constraint === 'employees1_fnpf_no_key') {
        errorMessage = `Failed to update employee. The FNPF Number '${finalFnpfNo}' already exists for another employee.`;
    }
    // Re-throw the potentially enhanced error message
    throw new Error(errorMessage);
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
        console.error(`Detailed error setting active status for employee ${employeeId}:`, error);
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

  try {
    // Before deleting, check for related wage records (optional but recommended)
    const wageCheck = await query('SELECT 1 FROM wage_records WHERE employee_id = $1 LIMIT 1;', [employeeId]);
    if (wageCheck.rowCount > 0) {
        console.warn(`Attempting to delete employee ${employeeId} who has wage records. Consider inactivating instead.`);
        // Optionally throw an error to prevent deletion if wage records exist
        // throw new Error(`Cannot delete employee ${employeeId} as they have associated wage records. Consider marking as inactive instead.`);
    }

    const result = await query('DELETE FROM employees1 WHERE id = $1;', [employeeId]); // Use the correct table name

    if (result.rowCount === 0) {
      console.warn(`Attempted to delete employee with ID ${employeeId}, but they were not found.`);
      // Optional: throw an error if deletion is critical and the record should have existed
      // throw new Error(`Employee with ID ${employeeId} not found for deletion.`);
    } else {
       console.log(`Employee with ID ${employeeId} deleted successfully.`);
    }
  } catch (error: any) {
    console.error(`Detailed error deleting employee with ID ${employeeId}:`, error);
    let errorMessage = `Failed to delete employee. DB Error: ${error.message || 'Unknown database error'}`;
     if (error.code === '23503') { // Foreign key violation
        errorMessage = `Cannot delete employee ${employeeId}. They have associated records (e.g., wages) that must be deleted or handled first. Consider marking as inactive instead.`;
     }
    // Re-throw the potentially enhanced error message
    throw new Error(errorMessage);
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
        employee_name AS "name", -- Map employee_name to name
        position,
        hourly_wage AS "hourlyWage",
        fnpf_no AS "fnpfNo",
        tin_no AS "tinNo",
        bank_code AS "bankCode",
        bank_account_number AS "bankAccountNumber",
        payment_method AS "paymentMethod",
        branch,
        fnpf_eligible AS "fnpfEligible",
        is_active AS "isActive", -- Fetch is_active status
        created_at,
        updated_at
      FROM employees1 -- Use the correct table name
      WHERE id = $1;
    `, [employeeId]);

    if (result.rows.length === 0) {
      return null; // Employee not found
    }

    const row = result.rows[0];
     // Ensure consistent data types
     return {
        ...row,
        hourlyWage: String(row.hourlyWage || '0'),
        fnpfEligible: Boolean(row.fnpfEligible),
        isActive: Boolean(row.isActive), // Ensure boolean
        tinNo: row.tinNo, // Ensure TIN is included
    } as Employee;
  } catch (error: any) {
    console.error(`Detailed error fetching employee with ID ${employeeId}:`, error);
    // Re-throw the original error from the query function
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
    wageRecords: Omit<WageRecord, 'id' | 'approvalId' | 'approvalStatus' | 'created_at'>[],
    approvalId: string,
    client: Pool | PoolClient // Use PoolClient or Pool type
): Promise<void> => {
    if (!wageRecords || wageRecords.length === 0) {
        throw new Error("No wage records provided for saving within approval.");
    }

    // Prepare values for insertion, including the approvalId
    const insertValues = wageRecords.map(record => [
        record.employeeId, approvalId, record.employeeName, record.hourlyWage,
        record.totalHours, record.hoursWorked, record.overtimeHours,
        record.mealAllowance, record.fnpfDeduction, record.otherDeductions, record.grossPay, record.netPay, record.dateFrom, record.dateTo
    ]);

    // Construct the placeholder string dynamically
    let placeholderIndex = 1;
    const placeholders = insertValues.map(() =>
        `($${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}::date, $${placeholderIndex++}::date)`
    ).join(', ');

    // Flatten the values array
    const flatValues = insertValues.flat();

    // Execute the bulk insert query using the provided transaction client
    await client.query(
        `INSERT INTO wage_records (
             employee_id, approval_id, employee_name, hourly_wage,
             total_hours, hours_worked, overtime_hours,
             meal_allowance, fnpf_deduction, other_deductions, gross_pay, net_pay, date_from, date_to
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
export const requestWageApproval = async (wageRecords: Omit<WageRecord, 'id' | 'approvalId' | 'approvalStatus' | 'created_at'>[]): Promise<{approvalId: string, approvalLink: string}> => {
    if (!wageRecords || wageRecords.length === 0) {
        throw new Error("No wage records provided for approval request.");
    }

    // Assume all records in the batch share the same dateFrom and dateTo
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

        // 1. Create the wage_approvals record
        const approvalResult = await client.query(
            `INSERT INTO wage_approvals (token, date_from, date_to, status)
             VALUES ($1, $2::date, $3::date, 'pending')
             RETURNING id;`,
            [token, dateFrom, dateTo]
        );

        if (approvalResult.rows.length === 0) {
            throw new Error('Failed to create wage approval record.');
        }
        const approvalId = approvalResult.rows[0].id;
        console.log(`Created wage approval record ${approvalId} for period ${dateFrom}-${dateTo}.`);

        // 2. Insert the associated wage_records with the approval_id using the helper function
        await saveWageRecordsForApproval(wageRecords, approvalId, client);

        await client.query('COMMIT');
        console.log(`Successfully saved ${wageRecords.length} associated wage records for approval ${approvalId}.`);

        // 3. Generate the approval link using NEXT_PUBLIC_BASE_URL
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL; // Use env var or fallback

         // --- Validation and Warning for NEXT_PUBLIC_BASE_URL ---
         if (!baseURL) {
            console.error("CRITICAL: NEXT_PUBLIC_BASE_URL environment variable is not set. Approval links will not work correctly in deployment. Please set it in your .env file (for local development) and in your Railway environment variables (for deployment) to your deployed application's public URL (e.g., https://your-app-name.railway.app). Using fallback: http://localhost:9002");
            // throw new Error("Application base URL (NEXT_PUBLIC_BASE_URL) is not configured. Cannot generate approval link.");
         } else if (baseURL === 'http://localhost:9002' && process.env.NODE_ENV === 'production') {
             console.warn("WARNING: NEXT_PUBLIC_BASE_URL is set to a localhost address in a production environment. Approval links will likely not work for external users. Ensure NEXT_PUBLIC_BASE_URL is set to the public URL of your deployed application in your hosting environment (e.g., Railway).");
         } else if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
             console.warn(`WARNING: NEXT_PUBLIC_BASE_URL "${baseURL}" does not seem to be a valid URL. Approval links may not work. Please check the value in your environment variables.`);
             // Consider throwing an error if the format is strictly required:
             // throw new Error("Invalid Application base URL format configured. Cannot generate approval link.");
         }
         // --- End Validation ---


        const approvalLink = `${baseURL}/approve-wages?token=${token}`;

        console.log(`Approval link generated: ${approvalLink}`);

        return { approvalId, approvalLink }; // Return the link

    } catch (error: any) {
        if (client) {
            await client.query('ROLLBACK');
            console.log('Transaction rolled back due to error.');
        }
        console.error('Detailed error requesting wage approval:', error);
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
export const getWagesForApproval = async (token: string): Promise<{approval: WageApproval, records: WageRecord[]} | null> => {
    if (!token) return null;

    try {
        // 1. Find the approval record by token
        const approvalResult = await query(
            `SELECT id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo", status, created_at, approved_at, declined_at, approved_by
             FROM wage_approvals WHERE token = $1;`,
            [token]
        );

        if (approvalResult.rows.length === 0) {
            console.log(`No approval found for token: ${token}`);
            return null; // Token not found
        }
        const approval = approvalResult.rows[0] as WageApproval;


        // 2. Fetch the associated wage records using the approval ID
        const recordsResult = await query(
            `SELECT
               wr.id, employee_id AS "employeeId", employee_name AS "employeeName", hourly_wage AS "hourlyWage",
               total_hours AS "totalHours", hours_worked AS "hoursWorked", overtime_hours AS "overtimeHours",
               meal_allowance AS "mealAllowance", fnpf_deduction AS "fnpfDeduction", other_deductions AS "otherDeductions",
               gross_pay AS "grossPay", net_pay AS "netPay",
               TO_CHAR(wr.date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(wr.date_to, 'YYYY-MM-DD') AS "dateTo",
               wr.created_at, wr.approval_id AS "approvalId"
             FROM wage_records wr
             WHERE wr.approval_id = $1
             ORDER BY wr.employee_name;`,
            [approval.id]
        );

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
         })) as WageRecord[];

        return { approval, records };

    } catch (error: any) {
        console.error(`Error fetching wages for approval token ${token}:`, error);
        // Provide a more specific error message if possible
        let errorMessage = `Failed to fetch wages for approval.`;
        if (error.message?.includes('relation "wage_approvals" does not exist')) {
           errorMessage += ' Approval table not found.';
        } else if (error.message?.includes('relation "wage_records" does not exist')) {
           errorMessage += ' Wage records table not found.';
        } else {
           errorMessage += ` DB Error: ${error.message || 'Unknown error'}`;
        }
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

        // 1. Find the approval record and lock it (optional, for concurrency safety)
        const currentApprovalResult = await client.query(
            `SELECT id, status FROM wage_approvals WHERE token = $1 FOR UPDATE;`,
            [token]
        );

        if (currentApprovalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log(`No approval found for token ${token} during update.`);
            return null; // Not found
        }

        const currentStatus = currentApprovalResult.rows[0].status;
        if (currentStatus !== 'pending') {
            await client.query('ROLLBACK');
            console.log(`Approval for token ${token} is already processed (status: ${currentStatus}).`);
            // Fetch the existing record to return its current state
             const existingApprovalResult = await client.query(
                 `SELECT id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo", status, created_at, approved_at, declined_at, approved_by
                  FROM wage_approvals WHERE token = $1;`,
                 [token]
             );
             return existingApprovalResult.rows.length > 0 ? (existingApprovalResult.rows[0] as WageApproval) : null;
        }

        // 2. Update the status and timestamp
        const timestampField = newStatus === 'approved' ? 'approved_at' : 'declined_at';
        const updateResult = await client.query(
            `UPDATE wage_approvals
             SET status = $1, ${timestampField} = CURRENT_TIMESTAMP, approved_by = $2
             WHERE token = $3 AND status = 'pending' -- Ensure it's still pending
             RETURNING id, token, TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo", status, created_at, approved_at, declined_at, approved_by;`,
            [newStatus, approverName, token]
        );

         if (updateResult.rowCount === 0) {
            // Should not happen due to the SELECT FOR UPDATE, but good to handle
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
            await client.query('ROLLBACK').catch(rbErr => console.error('Rollback failed:', rbErr)); // Catch rollback error too
        }
        console.error(`Error updating wage approval status for token ${token}:`, error);
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

       // First, delete the wage records associated with the approval ID
       const deleteRecordsResult = await client.query(
           'DELETE FROM wage_records WHERE approval_id = $1;',
           [approvalId]
       );
       console.log(`Deleted ${deleteRecordsResult.rowCount} wage records for approval ID ${approvalId}`);

       // Then, delete the approval record itself
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
       console.error(`Detailed error deleting wage records and approval for approval ID ${approvalId}:`, error);
       throw new Error(`Failed to delete wage data. DB Error: ${error.message || 'Unknown error'}`);
   } finally {
       if (client) {
           client.release();
       }
   }
};


/**
 * Fetches distinct pay periods summaries (date_from, date_to, approval_id, totalWages)
 * from the database, filtered by status.
 * @param {string} status - The status to filter by ('pending', 'approved', 'declined').
 * @returns {Promise<PayPeriodSummary[]>} A promise resolving with the summaries.
 */
export const getPayPeriodSummaries = async (status: 'pending' | 'approved' | 'declined'): Promise<PayPeriodSummary[]> => {
  const queryString = `
    SELECT
      TO_CHAR(wa.date_from, 'YYYY-MM-DD') AS "dateFrom",
      TO_CHAR(wa.date_to, 'YYYY-MM-DD') AS "dateTo",
      wa.id AS "approvalId",
      wa.status, -- Include status in selection
      wa.token, -- Include token
      COALESCE(SUM(wr.net_pay), 0) AS "totalWages" -- Use COALESCE to handle periods with 0 records
    FROM wage_approvals wa
    LEFT JOIN wage_records wr ON wa.id = wr.approval_id -- Use LEFT JOIN to include approvals with no records yet
    WHERE wa.status = $1
    GROUP BY wa.id, wa.date_from, wa.date_to, wa.status, wa.token -- Group by status and token as well
    ORDER BY wa.date_from DESC;
  `;

  try {
    const result = await query(queryString, [status]);
    return result.rows.map(row => ({
        ...row,
        totalWages: Number(row.totalWages) || 0,
    })) as PayPeriodSummary[];
  } catch (error: any) {
    console.error(`Detailed error fetching ${status} pay periods:`, error);
    throw error;
  }
};


/**
 * Fetches wage records from the database, optionally filtered by date range and approval status.
 * @param {Date | null} filterDateFrom - Optional start date for filtering.
 * @param {Date | null} filterDateTo - Optional end date for filtering.
 * @param {string | null} approvalStatus - Optional status to filter by ('pending', 'approved', 'declined').
 * @returns {Promise<WageRecord[]>} A promise resolving with the fetched records.
 */
export const getWageRecords = async (
    filterDateFrom: Date | string | null = null, // Allow string input
    filterDateTo: Date | string | null = null,   // Allow string input
    approvalStatus: 'pending' | 'approved' | 'declined' | null = null, // Allow fetching all if null
    approvalId: string | null = null // Optional: Filter by specific approval ID
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
      wr.approval_id AS "approvalId", -- Include approval_id
      wa.status AS "approvalStatus"   -- Include approval status
    FROM wage_records wr
    LEFT JOIN wage_approvals wa ON wr.approval_id = wa.id -- Use LEFT JOIN to handle potential null approval_id if needed
  `;
  const queryParams: any[] = [];
  const conditions: string[] = [];

   // Helper to format date consistently
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
        // Only apply date and status filters if not filtering by approval ID
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
    // Ensure numeric types are correct
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
    })) as WageRecord[];
  } catch (error: any) {
    console.error('Detailed error fetching wage records from database:', error);
    throw error;
  }
};

/**
 * Checks if wage records exist for a specific date range.
 * @param {string} dateFrom - Start date in YYYY-MM-DD format.
 * @param {string} dateTo - End date in YYYY-MM-DD format.
 * @returns {Promise<boolean>} True if records exist for the period, false otherwise.
 */
export const checkWageRecordsExistByDateRange = async (dateFrom: string, dateTo: string): Promise<boolean> => {
    try {
        const result = await query(
            `SELECT 1 FROM wage_records WHERE date_from = $1::date AND date_to = $2::date LIMIT 1;`,
            [dateFrom, dateTo]
        );
        return result.rowCount > 0;
    } catch (error: any) {
        console.error(`Error checking if wage records exist for ${dateFrom} to ${dateTo}:`, error);
        throw new Error(`Failed to check wage records existence. DB Error: ${error.message || 'Unknown error'}`);
    }
};

// Removed SMS and Email related functions
// You would integrate with an actual SMS/Email provider here if needed in the future.



    