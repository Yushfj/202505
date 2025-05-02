
-- Create the employees table if it doesn't exist
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_name VARCHAR(255) NOT NULL, -- Changed from name to employee_name
    position VARCHAR(255) NOT NULL,
    hourly_wage NUMERIC(10, 2) NOT NULL, -- Using NUMERIC for monetary values
    fnpf_no VARCHAR(100), -- Fiji National Provident Fund number (nullable)
    tin_no VARCHAR(100), -- Tax Identification Number (nullable)
    bank_code VARCHAR(50), -- Bank code for online payments (nullable)
    bank_account_number VARCHAR(100), -- Bank account number (nullable)
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'online')),
    branch VARCHAR(10) NOT NULL CHECK (branch IN ('labasa', 'suva')),
    fnpf_eligible BOOLEAN NOT NULL DEFAULT TRUE, -- Eligibility for FNPF deduction
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the wage_records table if it doesn't exist
CREATE TABLE IF NOT EXISTS wage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL,
    employee_name VARCHAR(255) NOT NULL, -- Storing name here for easier retrieval
    hourly_wage NUMERIC(10, 2) NOT NULL,
    hours_worked NUMERIC(10, 2) NOT NULL,
    meal_allowance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    fnpf_deduction NUMERIC(10, 2) NOT NULL,
    other_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    gross_pay NUMERIC(10, 2) NOT NULL,
    net_pay NUMERIC(10, 2) NOT NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- Optional: Foreign key constraint (uncomment if employee_id should reference employees.id)
    -- FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
    -- Or use ON DELETE CASCADE if you want to delete wage records when an employee is deleted
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Optional: Create indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(employee_name); -- Index on employee_name
CREATE INDEX IF NOT EXISTS idx_wage_records_employee_id ON wage_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_wage_records_date_range ON wage_records(date_from, date_to);


-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on employees table updates
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_employees_updated_at') THEN
        CREATE TRIGGER update_employees_updated_at
        BEFORE UPDATE ON employees
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Example: Add some initial data (Optional)
-- INSERT INTO employees (employee_name, position, hourly_wage, fnpf_no, tin_no, bank_code, bank_account_number, payment_method, branch, fnpf_eligible) VALUES
--   ('John Doe', 'Winder', 15.50, '123456F', 'TIN123', 'BSP', '987654321', 'online', 'suva', TRUE),
--   ('Jane Smith', 'Assistant', 12.00, '789012F', 'TIN456', NULL, NULL, 'cash', 'labasa', FALSE);

-- INSERT INTO wage_records (employee_id, employee_name, hourly_wage, hours_worked, meal_allowance, fnpf_deduction, other_deductions, gross_pay, net_pay, date_from, date_to) VALUES
--   ((SELECT id FROM employees WHERE employee_name = 'John Doe'), 'John Doe', 15.50, 40, 0, 49.60, 10.00, 620.00, 560.40, '2024-01-01', '2024-01-07');
