-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for storing employee information
CREATE TABLE IF NOT EXISTS employees1 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_name VARCHAR(255) NOT NULL,
    position VARCHAR(100) NOT NULL,
    hourly_wage NUMERIC(10, 2) NOT NULL,
    fnpf_no VARCHAR(50),
    tin_no VARCHAR(50),
    bank_code VARCHAR(20),
    bank_account_number VARCHAR(50),
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'online')),
    branch VARCHAR(10) NOT NULL CHECK (branch IN ('labasa', 'suva')),
    fnpf_eligible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing wage records
CREATE TABLE IF NOT EXISTS wage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees1(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    hourly_wage NUMERIC(10, 2) NOT NULL,
    hours_worked NUMERIC(8, 2) NOT NULL,
    meal_allowance NUMERIC(10, 2) NOT NULL DEFAULT 0,
    fnpf_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0,
    other_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0,
    gross_pay NUMERIC(12, 2) NOT NULL,
    net_pay NUMERIC(12, 2) NOT NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Add a unique constraint for employee_id, date_from, and date_to
    -- to prevent duplicate entries for the same employee in the same period.
    -- This might need adjustment depending on whether overwrites are handled purely in the application layer.
    CONSTRAINT unique_wage_period UNIQUE (employee_id, date_from, date_to)
);

-- Optional: Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_employees1_branch ON employees1 (branch);
CREATE INDEX IF NOT EXISTS idx_wage_records_employee_id ON wage_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_wage_records_date_range ON wage_records (date_from, date_to);

-- Optional: Function to automatically update the updated_at timestamp on employees1 table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Optional: Trigger to call the function before any update on employees1
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_employees1_updated_at') THEN
      CREATE TRIGGER trigger_update_employees1_updated_at
      BEFORE UPDATE ON employees1
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
   END IF;
END $$;

-- Grant necessary permissions (replace 'your_app_user' with the actual database user your app uses)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employees1 TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wage_records TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE employees1_id_seq TO your_app_user; -- If using SERIAL instead of UUID
-- GRANT USAGE, SELECT ON SEQUENCE wage_records_id_seq TO your_app_user; -- If using SERIAL instead of UUID
