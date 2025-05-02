-- SQL script to create the necessary tables for the WageWise app

-- Drop tables if they exist (optional, useful for development/resetting)
-- DROP TABLE IF EXISTS wage_records;
-- DROP TABLE IF EXISTS employees;

-- Create the employees table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- Enable UUID generation if not already enabled

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Use UUID for primary key
    name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    hourly_wage NUMERIC(10, 2) NOT NULL, -- Use NUMERIC for currency/precise values
    fnpf_no VARCHAR(100) UNIQUE, -- FNPF number, can be unique if required, nullable
    tin_no VARCHAR(100) UNIQUE, -- TIN number, can be unique if required, nullable
    bank_code VARCHAR(50), -- Bank code, nullable
    bank_account_number VARCHAR(100), -- Bank account number, nullable
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'online')), -- 'cash' or 'online'
    branch VARCHAR(10) NOT NULL CHECK (branch IN ('labasa', 'suva')), -- 'labasa' or 'suva'
    fnpf_eligible BOOLEAN NOT NULL DEFAULT TRUE, -- FNPF eligibility, defaults to true
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp for creation
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP -- Timestamp for last update
);

-- Optional: Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_employee_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employee_branch ON employees(branch);
CREATE INDEX IF NOT EXISTS idx_employee_payment_method ON employees(payment_method);

-- Create the wage_records table
CREATE TABLE IF NOT EXISTS wage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Foreign key linked to employees, cascade delete
    employee_name VARCHAR(255) NOT NULL, -- Store name for convenience, though denormalized
    hourly_wage NUMERIC(10, 2) NOT NULL,
    hours_worked NUMERIC(8, 2) NOT NULL,
    meal_allowance NUMERIC(10, 2) DEFAULT 0.00, -- Added meal allowance
    fnpf_deduction NUMERIC(10, 2) NOT NULL,
    other_deductions NUMERIC(10, 2) DEFAULT 0.00,
    gross_pay NUMERIC(10, 2) NOT NULL,
    net_pay NUMERIC(10, 2) NOT NULL,
    date_from DATE NOT NULL, -- Use DATE type for the start date of the period
    date_to DATE NOT NULL, -- Use DATE type for the end date of the period
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Add indexes for wage records
CREATE INDEX IF NOT EXISTS idx_wage_employee_id ON wage_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_wage_date_range ON wage_records(date_from, date_to);

-- Optional: Trigger to automatically update the updated_at timestamp on employees table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop the trigger if it exists before creating it again
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;

-- Create the trigger
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add some sample data (optional)
-- INSERT INTO employees (name, position, hourly_wage, branch, payment_method, fnpf_eligible) VALUES
--   ('John Doe', 'Winder', 15.50, 'suva', 'online', true),
--   ('Jane Smith', 'Assistant', 12.00, 'labasa', 'cash', false);

-- INSERT INTO wage_records (employee_id, employee_name, hourly_wage, hours_worked, fnpf_deduction, other_deductions, gross_pay, net_pay, date_from, date_to)
-- SELECT id, name, hourly_wage, 40, (hourly_wage * 40 * 0.08), 10.00, (hourly_wage * 40), (hourly_wage * 40 - (hourly_wage * 40 * 0.08) - 10.00), '2023-10-05', '2023-10-11' FROM employees WHERE name = 'John Doe';

