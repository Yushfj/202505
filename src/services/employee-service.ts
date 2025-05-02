
'use server';

import { query, getDbPool } from '@/lib/db'; // Import getDbPool along with query
import { format } from 'date-fns'; // For formatting dates in getWageRecords

// Define the structure for an Employee object
interface Employee {
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
  created_at?: Date; // Added timestamp (optional)
  updated_at?: Date; // Added timestamp (optional)
}

/**
 * Fetches the list of employees from the PostgreSQL database.
 * @returns {Promise<Employee[]>} A promise that resolves with the array of employees.
 */
export const getEmployees = async (): Promise<Employee[]> => {
  try {
    const result = await query(`
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
        created_at,
        updated_at
      FROM employees1 -- Use the correct table name
      ORDER BY branch, name; -- Optional: order by branch then name
    `);
    // Ensure consistent data types, especially for boolean and potentially null values
     return result.rows.map(row => ({
        ...row,
        hourlyWage: String(row.hourlyWage || '0'), // Ensure string
        fnpfEligible: Boolean(row.fnpfEligible), // Ensure boolean
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
    }
     // Re-throw the potentially enhanced error message
     throw new Error(errorMessage);
  }
};

/**
 * Adds a new employee to the PostgreSQL database.
 * @param {Omit<Employee, 'id' | 'created_at' | 'updated_at'>} employeeData - The employee data without the ID and timestamps.
 * @returns {Promise<string>} A promise that resolves with the ID of the newly created employee.
 */
export const addEmployee = async (employeeData: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<string> => {
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
  const finalFnpfNo = fnpfEligible ? fnpfNo : null;
  const finalBankCode = paymentMethod === 'online' ? bankCode : null;
  const finalBankAccountNumber = paymentMethod === 'online' ? bankAccountNumber : null;

  try {
    const result = await query(
      `INSERT INTO employees1 (employee_name, position, hourly_wage, fnpf_no, tin_no, bank_code, bank_account_number, payment_method, branch, fnpf_eligible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id;`, // Use the correct table name
      [
        name, // This value goes into the employee_name column
        position,
        hourlyWageNumeric, // Use numeric value for DB
        finalFnpfNo,
        tinNo, // Allow null
        finalBankCode,
        finalBankAccountNumber,
        paymentMethod,
        branch,
        fnpfEligible,
      ]
    );
    if (result.rows.length === 0) {
        throw new Error('Failed to create employee, no ID returned.');
    }
    console.log('Employee added successfully with ID:', result.rows[0].id);
    return result.rows[0].id; // Return the newly generated UUID from the DB
  } catch (error: any) {
    console.error('Detailed error adding employee to database:', error);
    let errorMessage = `Failed to add employee. DB Error: ${error.message || 'Unknown database error'}`;
    if (error.message?.includes('relation "employees1" does not exist')) {
        errorMessage = 'Failed to add employee. The "employees1" table does not seem to exist in the database. Please check the schema.';
    } else if (error.code === '23502') { // Not null violation
        errorMessage = `Failed to add employee. A required field is missing or null. Original error: ${error.message}`;
    } else if (error.message?.includes('does not exist') && error.message?.includes('column')) {
         errorMessage = `Failed to add employee. A column specified in the query does not exist in the 'employees1' table. Check column names. Original error: ${error.message}`;
    } else if (error.message?.includes('password authentication failed')) {
        errorMessage = 'Failed to add employee. Database password authentication failed. Check PGPASSWORD.';
    } else if (error.message?.includes('Database pool is not initialized')) {
       errorMessage = 'Failed to add employee. Database connection is not available. Check server logs for initialization errors.';
    } else if (error.message?.includes('Database connection is not available')) {
        errorMessage = error.message; // Use the specific message from the query function
    }
    throw new Error(errorMessage);
  }
};

/**
 * Updates an existing employee's information in the PostgreSQL database.
 * @param {Employee} updatedEmployee - The employee object with updated information. ID must be included.
 * @returns {Promise<void>} A promise that resolves when the update is complete.
 * @throws {Error} If the employee with the specified ID is not found or update fails.
 */
export const updateEmployee = async (updatedEmployee: Employee): Promise<void> => {
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
  } = updatedEmployee;

   // Basic validation
   if (!id || !name || !position || !hourlyWage) {
     throw new Error('Missing required employee fields for update (id, name, position, hourlyWage).');
   }

   // Ensure correct data types
   const hourlyWageNumeric = parseFloat(hourlyWage);
   if (isNaN(hourlyWageNumeric)) {
     throw new Error('Invalid Hourly Wage value for update.');
   }

   // Ensure conditional fields are handled
   const finalFnpfNo = fnpfEligible ? fnpfNo : null;
   const finalBankCode = paymentMethod === 'online' ? bankCode : null;
   const finalBankAccountNumber = paymentMethod === 'online' ? bankAccountNumber : null;

  try {
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
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $11;`,
      [
        name, // This value updates the employee_name column
        position,
        hourlyWageNumeric,
        finalFnpfNo,
        tinNo,
        finalBankCode,
        finalBankAccountNumber,
        paymentMethod,
        branch,
        fnpfEligible,
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
    // Re-throw the original error from the query function
    throw error;
  }
};

/**
 * Deletes an employee from the PostgreSQL database by their ID.
 * @param {string} employeeId - The ID of the employee to delete.
 * @returns {Promise<void>} A promise that resolves when the deletion is complete.
 */
export const deleteEmployee = async (employeeId: string): Promise<void> => {
   if (!employeeId) {
     throw new Error('Employee ID is required for deletion.');
   }

  try {
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
    // Re-throw the original error from the query function
    throw error;
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
    } as Employee;
  } catch (error: any) {
    console.error(`Detailed error fetching employee with ID ${employeeId}:`, error);
    // Re-throw the original error from the query function
    throw error;
  }
};

// --- Wage Record Service Functions ---

interface WageRecord {
  id?: string; // Optional: UUID from DB if fetching existing
  employeeId: string;
  employeeName: string;
  hourlyWage: number;
  hoursWorked: number;
  mealAllowance: number;
  fnpfDeduction: number;
  otherDeductions: number;
  grossPay: number;
  netPay: number;
  dateFrom: string; // Store dates as ISO strings or YYYY-MM-DD
  dateTo: string;
  created_at?: Date;
}

/**
 * Saves multiple wage records to the database for a specific period.
 * It first deletes any existing records for the same employees within the *exact* same date range.
 * @param {WageRecord[]} wageRecords - Array of wage records to save.
 * @returns {Promise<void>}
 */
export const saveWageRecords = async (wageRecords: WageRecord[]): Promise<void> => {
  if (!wageRecords || wageRecords.length === 0) {
    console.warn("No wage records provided to save.");
    return;
  }

  // Assume all records in the batch share the same dateFrom and dateTo
  const { dateFrom, dateTo } = wageRecords[0];
  const employeeIds = wageRecords.map(r => r.employeeId);

  if (!dateFrom || !dateTo || employeeIds.length === 0) {
    throw new Error("Missing date range or employee IDs in wage records batch.");
  }

  let client;
  try {
      const pool = await getDbPool(); // Get the initialized pool
      client = await pool.connect();

      await client.query('BEGIN'); // Start transaction

      // Delete existing records for these employees within this exact date range
      await client.query(
          `DELETE FROM wage_records
           WHERE employee_id = ANY($1::uuid[]) AND date_from = $2::date AND date_to = $3::date;`,
          [employeeIds, dateFrom, dateTo]
      );
      console.log(`Deleted existing records for employees [${employeeIds.join(', ')}] for period ${dateFrom} to ${dateTo}.`);

      // Prepare for bulk insert
      const insertValues = wageRecords.map(record => [
          record.employeeId, record.employeeName, record.hourlyWage, record.hoursWorked, record.mealAllowance,
          record.fnpfDeduction, record.otherDeductions, record.grossPay, record.netPay, record.dateFrom, record.dateTo
      ]);

      let placeholderIndex = 1;
      const placeholders = insertValues.map(() =>
          `($${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}, $${placeholderIndex++}::date, $${placeholderIndex++}::date)`
      ).join(', ');

      const flatValues = insertValues.flat();

      await client.query(
          `INSERT INTO wage_records (
               employee_id, employee_name, hourly_wage, hours_worked, meal_allowance,
               fnpf_deduction, other_deductions, gross_pay, net_pay, date_from, date_to
           ) VALUES ${placeholders};`,
          flatValues
      );

      await client.query('COMMIT'); // Commit transaction
      console.log(`Successfully saved ${wageRecords.length} wage records for period ${dateFrom} to ${dateTo}.`);
  } catch (error: any) {
      if (client) {
          await client.query('ROLLBACK'); // Rollback on error
          console.log('Transaction rolled back due to error.');
      }
      console.error('Detailed error saving wage records to database:', error);
      // Re-throw the original error from the query function
      throw error;
  } finally {
      if (client) {
          client.release(); // Release client back to the pool
      }
  }
};


/**
 * Fetches wage records from the database, optionally filtered by date range.
 * @param {Date | null} filterDateFrom - Optional start date for filtering.
 * @param {Date | null} filterDateTo - Optional end date for filtering.
 * @returns {Promise<WageRecord[]>} A promise resolving with the fetched records.
 */
export const getWageRecords = async (filterDateFrom: Date | null = null, filterDateTo: Date | null = null): Promise<WageRecord[]> => {
  let queryString = `
    SELECT
      id,
      employee_id AS "employeeId",
      employee_name AS "employeeName",
      hourly_wage AS "hourlyWage",
      hours_worked AS "hoursWorked",
      meal_allowance AS "mealAllowance",
      fnpf_deduction AS "fnpfDeduction",
      other_deductions AS "otherDeductions",
      gross_pay AS "grossPay",
      net_pay AS "netPay",
      TO_CHAR(date_from, 'YYYY-MM-DD') AS "dateFrom", -- Format date as string
      TO_CHAR(date_to, 'YYYY-MM-DD') AS "dateTo",     -- Format date as string
      created_at
    FROM wage_records
  `;
  const queryParams = [];

  // IMPORTANT: Ensure date parameters are correctly formatted for the query if provided
  if (filterDateFrom && filterDateTo) {
    queryString += ' WHERE date_from >= $1::date AND date_to <= $2::date';
    queryParams.push(format(filterDateFrom, 'yyyy-MM-dd')); // Format as YYYY-MM-DD string
    queryParams.push(format(filterDateTo, 'yyyy-MM-dd'));   // Format as YYYY-MM-DD string
  } else if (filterDateFrom) {
    queryString += ' WHERE date_from >= $1::date';
    queryParams.push(format(filterDateFrom, 'yyyy-MM-dd'));
  } else if (filterDateTo) {
     queryString += ' WHERE date_to <= $1::date';
     queryParams.push(format(filterDateTo, 'yyyy-MM-dd'));
  }

  queryString += ' ORDER BY date_from DESC, employee_name;'; // Order by date, then name

  try {
    const result = await query(queryString, queryParams);
    // Ensure numeric types are correct
    return result.rows.map(row => ({
        ...row,
        hourlyWage: Number(row.hourlyWage) || 0,
        hoursWorked: Number(row.hoursWorked) || 0,
        mealAllowance: Number(row.mealAllowance) || 0,
        fnpfDeduction: Number(row.fnpfDeduction) || 0,
        otherDeductions: Number(row.otherDeductions) || 0,
        grossPay: Number(row.grossPay) || 0,
        netPay: Number(row.netPay) || 0,
    })) as WageRecord[];
  } catch (error: any) {
    console.error('Detailed error fetching wage records from database:', error);
    // Re-throw the original error from the query function
    throw error;
  }
};

/**
 * Deletes wage records for a specific date range from the database.
 * @param {string} dateFrom - The start date of the period (YYYY-MM-DD or ISO string).
 * @param {string} dateTo - The end date of the period (YYYY-MM-DD or ISO string).
 * @returns {Promise<void>}
 */
export const deleteWageRecordsByPeriod = async (dateFrom: string, dateTo: string): Promise<void> => {
   if (!dateFrom || !dateTo) {
       throw new Error("Date range (from and to) is required for deletion.");
   }
   try {
     const result = await query(
       'DELETE FROM wage_records WHERE date_from = $1::date AND date_to = $2::date;',
       [dateFrom, dateTo] // Pass dates as strings, ensure DB interprets correctly
     );
     console.log(`Deleted ${result.rowCount} wage records for period ${dateFrom} to ${dateTo}`);
   } catch (error: any) {
     console.error(`Detailed error deleting wage records for period ${dateFrom} to ${dateTo}:`, error);
     // Re-throw the original error from the query function
     throw error;
   }
};
