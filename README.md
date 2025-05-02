# Lal's Motor Winders (FIJI) PTE Limited - Payroll Management App

This is a Next.js application for managing employee information and calculating wages for Lal's Motor Winders (FIJI) PTE Limited. It connects to a PostgreSQL database hosted on Railway.

## Features

*   Employee Management (Create, Read, Update, Delete)
*   Wages Calculation based on employee data
*   Wages Record Keeping
*   Export wage data to CSV (BSP & BRED formats) and Excel
*   User Authentication (Simple username/password)
*   Administrator Section (Future implementation)

## Tech Stack

*   Next.js (App Router)
*   React
*   TypeScript
*   Tailwind CSS
*   Shadcn/ui
*   PostgreSQL
*   `node-postgres` (pg) library
*   Railway (Hosting & Database)

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm, yarn, or pnpm
*   Access to the PostgreSQL database on Railway (Connection details required)

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Environment Variables:**

    *   Create a `.env.local` file in the root of the project.
    *   Add the **public** database connection details provided by Railway. It's crucial to use the **public proxy URL** for local development unless your machine is directly peered with the Railway network.

    ```dotenv
    # .env.local

    # Option 1: Using the full public URL (Recommended for local dev)
    # DATABASE_PUBLIC_URL=postgresql://postgres:<your_password>@trolley.proxy.rlwy.net:<your_port>/railway

    # Option 2: Using individual components (If DATABASE_PUBLIC_URL doesn't work or you prefer this)
    PGHOST=trolley.proxy.rlwy.net
    PGPORT=<your_public_proxy_port> # e.g., 43769
    PGDATABASE=railway
    PGUSER=postgres
    PGPASSWORD=<your_actual_database_password> # Replace with your password

    # Note: Do NOT commit .env.local to Git. The .gitignore file should already prevent this.
    ```

    **Important:** Replace `<your_actual_database_password>` and `<your_public_proxy_port>` with the actual credentials and port from your Railway database service settings.

4.  **Database Schema:**
    *   Ensure the database schema matches the structure defined in `db_schema.sql`. You might need to apply this schema to your Railway database if it's not already set up. Use a PostgreSQL client tool (like `psql`, TablePlus, DBeaver, etc.) connected via the **public proxy URL** to run the SQL commands in `db_schema.sql`.

### Running the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:9002](http://localhost:9002) (or the port specified in your `package.json` dev script) with your browser to see the result.

### Running in Production Mode (Locally)

1.  **Build the application:**
    ```bash
    npm run build
    # or
    yarn build
    # or
    pnpm build
    ```
2.  **Start the production server:**
    ```bash
    npm start
    # or
    yarn start
    # or
    pnpm start
    ```

## Deployment (Railway)

This application is intended for deployment on Railway.

1.  **Push to GitHub:** Ensure your code is pushed to a GitHub repository.
2.  **Create a Railway Project:** Connect your GitHub repository to a new Railway project.
3.  **Configure Environment Variables:** In your Railway project settings, add the **internal** database connection variables provided by Railway (usually prefixed like `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `DATABASE_URL`). Railway injects these automatically into your service's environment. **Do not** use the public proxy URL here; use the internal host (`postgres.railway.internal`).
4.  **Build and Deploy:** Railway will automatically detect the `Next.js` application, build it, and deploy it. It will use the environment variables you configured in the Railway dashboard.
5.  **Database Migrations:** If you update the database schema (`db_schema.sql`), you'll need to manually apply those changes to your Railway database using a PostgreSQL client connected via the public proxy URL.

## Available Users (Default)

*   **Admin:** Username: `ADMIN`, Password: `admin01`
*   **User 1:** Username: `Karishma`, Password: `kdevi`
*   **User 2:** Username: `Renuka`, Password: `renu`

## License

© Aayush Atishay Lal 北京化工大学