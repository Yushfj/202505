
-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (optional, for clean setup during development)
-- Use with caution in production!
-- DROP TABLE IF EXISTS wage_records;
-- DROP TABLE IF EXISTS employees;

-- Create the employees table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Use UUID for primary key
    name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    hourly_wage NUMERIC(10, 2) NOT NULL, -- Use NUMERIC for currency/precise values
    fnpf_no VARCHAR(50) NULL,
    tin_no VARCHAR(50) NULL,
    bank_code VARCHAR(50) NULL,
    bank_account_number VARCHAR(50) NULL,
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'online')),
    branch VARCHAR(10) NOT NULL CHECK (branch IN ('labasa', 'suva')),
    fnpf_eligible BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, -- Timestamp with time zone
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the wage_records table
CREATE TABLE IF NOT EXISTS wage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Foreign key to employees
    employee_name VARCHAR(255) NOT NULL, -- Consider removing if always joining with employees table
    hourly_wage NUMERIC(10, 2) NOT NULL,
    hours_worked NUMERIC(10, 2) NOT NULL,
    meal_allowance NUMERIC(10, 2) NOT NULL DEFAULT 0,
    fnpf_deduction NUMERIC(10, 2) NOT NULL,
    other_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0,
    gross_pay NUMERIC(10, 2) NOT NULL,
    net_pay NUMERIC(10, 2) NOT NULL,
    date_from DATE NOT NULL, -- Use DATE type for dates
    date_to DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_wage_records_employee_id ON wage_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_wage_records_date_range ON wage_records(date_from, date_to);

-- Optional: Add a trigger function to automatically update updated_at on employees table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (adjust 'your_app_user' if needed, though 'postgres' usually has rights)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON wage_records TO your_app_user;

-- You might need to grant usage on sequences if you use SERIAL types (though UUID is recommended)
-- GRANT USAGE, SELECT ON SEQUENCE employees_id_seq TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE wage_records_id_seq TO your_app_user;

