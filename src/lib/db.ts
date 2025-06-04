
import { Pool, PoolClient } from 'pg';
import { format, isValid as isDateValid, parseISO } from 'date-fns'; // Import format for date formatting in getWageRecords

let pool: Pool | null = null; // Initialize pool as null
let poolInitializationPromise: Promise<void> | null = null; // Promise to track initialization

const initializePool = async (): Promise<void> => {
    // Prevent re-initialization if already done or in progress
    if (pool || poolInitializationPromise) {
        return poolInitializationPromise || Promise.resolve();
    }

    console.log('Attempting to initialize database pool...');

    // Read connection details strictly from individual environment variables
    const dbPassword = process.env.PGPASSWORD; // **Explicitly read the password FIRST**

    // ** CRITICAL CHECK **
    if (!dbPassword) {
        console.error("CRITICAL: PGPASSWORD environment variable is not set or not accessible in this process. Cannot initialize database pool.");
        // **IMPORTANT**: Ensure the .env file correctly defines PGPASSWORD=your_actual_password
        // Or, in Railway, ensure PGPASSWORD is set in the service variables.
        throw new Error("Database password (PGPASSWORD) is not configured or accessible in environment variables. Check your .env file or server environment configuration.");
    }

    const hostVar = process.env.PGHOST;
    const portEnvVar = process.env.PGPORT;
    const dbNameVar = process.env.PGDATABASE;
    const dbUserVar = process.env.PGUSER;

    const defaultPublicHost = 'trolley.proxy.rlwy.net';
    const defaultDbName = 'railway';
    const defaultDbUser = 'postgres';
    const defaultPublicPort = 43769;

    const effectiveHost = hostVar || defaultPublicHost;
    const effectiveDbName = dbNameVar || defaultDbName;
    const effectiveDbUser = dbUserVar || defaultDbUser;

    let effectivePort: number;
    if (portEnvVar) {
        const parsedPort = parseInt(portEnvVar, 10);
        if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
            console.warn(`WARNING: PGPORT environment variable ("${portEnvVar}") is not a valid port number. Using default port ${defaultPublicPort}.`);
            effectivePort = defaultPublicPort;
        } else {
            effectivePort = parsedPort;
        }
    } else {
        effectivePort = defaultPublicPort;
    }

    console.log('--- Database Connection Configuration ---');
    console.log(`  Using PGHOST: ${effectiveHost} (Source: ${hostVar ? 'env' : 'default fallback'})`);
    console.log(`  Using PGPORT: ${effectivePort} (Source: ${portEnvVar ? (isNaN(parseInt(portEnvVar, 10)) ? 'env (invalid, used default)' : 'env') : 'default fallback'})`);
    console.log(`  Using PGDATABASE: ${effectiveDbName} (Source: ${dbNameVar ? 'env' : 'default fallback'})`);
    console.log(`  Using PGUSER: ${effectiveDbUser} (Source: ${dbUserVar ? 'env' : 'default fallback'})`);
    console.log(`  PGPASSWORD Loaded: Yes (Value Hidden for Security)`);
    console.log('------------------------------------------------------');


    const poolConfig = {
        host: effectiveHost,
        port: effectivePort,
        database: effectiveDbName,
        user: effectiveDbUser,
        password: dbPassword, // Use the password read directly from process.env
        ssl: { rejectUnauthorized: false }, // Typically needed for cloud proxies
        connectionTimeoutMillis: 10000, // Increase connection timeout (optional)
        idleTimeoutMillis: 30000, // Time before idle connections are closed (optional)
    };

    try {
        console.log('Creating new PostgreSQL Pool with derived config...');
        const newPool = new Pool(poolConfig);

        console.log('Attempting test query to verify connection...');
        const client = await newPool.connect();
        console.log('Successfully acquired client from pool for test.');
        await client.query('SELECT NOW()');
        client.release();
        console.log('Database connection test successful. Pool is initialized.');
        pool = newPool;

    } catch (err: any) {
        console.error('CRITICAL: Error initializing database pool or testing connection:', err.stack);
        pool = null;
        let specificError = `Database initialization failed: ${err.message}`;
        if (err.message?.includes('password authentication failed')) {
            specificError += ' Check if PGPASSWORD environment variable is correct and accessible by the server process.';
        } else if (err.code === 'ENOTFOUND') {
             specificError += ` Could not resolve host '${poolConfig.host}'. Verify host and network. Ensure you are using the correct connection details for the environment.`;
        } else if (err.code === 'ECONNREFUSED') {
            specificError += ` Connection refused to ${poolConfig.host}:${poolConfig.port}. Check host, port, and firewall rules.`;
        } else if (err.code === 'ECONNRESET') {
            specificError += ' Connection was reset. Check network stability and server logs.';
        } else if (err.message?.includes('invalid port number')) {
            specificError += ` The port number ${poolConfig.port} is invalid. Check PGPORT environment variable.`;
        }
        throw new Error(specificError);
    }
};

// Function to manage and return the pool initialization promise
const ensurePoolInitialized = (): Promise<void> => {
    if (!poolInitializationPromise) {
        poolInitializationPromise = initializePool().catch(err => {
            console.error("Database pool initialization promise failed:", err.message);
            poolInitializationPromise = null; // Reset promise on failure
            throw err; // Re-throw to indicate failure
        });
    }
    return poolInitializationPromise;
};

export const getDbPool = async (): Promise<Pool> => {
    try {
        await ensurePoolInitialized();
    } catch (initError: any) {
        console.error("Failed to ensure database pool is initialized:", initError.message);
        throw new Error(`Database pool failed to initialize. Check application startup logs. Original error: ${initError.message}`);
    }

    if (!pool) {
        console.error('getDbPool called but pool is still null after initialization attempt.');
        throw new Error('Database pool is not available. Check application startup logs for initialization errors.');
    }
    return pool;
};


// Helper function for executing queries, ensuring pool is ready
export async function query(text: string, params?: any[]) {
  let currentPool: Pool;
  try {
      currentPool = await getDbPool();
  } catch (error: any) {
      console.error("Failed to get database pool for query:", error.message);
      // Rethrow the error indicating the pool isn't ready or failed to initialize
      throw new Error(`Database connection is not available. Check application logs for initialization errors. Original error: ${error.message}`);
  }

  // Pool.query directly uses a client from the pool and releases it
  try {
    // console.log('Executing query:', text); // Avoid logging params which might contain sensitive info
    const res = await currentPool.query(text, params);
    // console.log('Query successful.');
    return res;
  } catch (error: any) {
    console.error('Database query error:', error.stack);
    let errorMessage = `Database query failed: ${error.message}`;
    if (error.message?.includes('password authentication failed')) {
        // Provide a more specific error if authentication fails
        // IMPORTANT: Double-check the PGPASSWORD in your .env file or Railway environment variables.
        errorMessage = `Database query failed: password authentication failed for user "${process.env.PGUSER || 'postgres'}". Check PGPASSWORD.`;
    } else if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        // Relation (table) not found error
        errorMessage = `Database query failed: table specified in the query does not exist. Check table names like 'employees1' or 'wage_records'. Original error: ${error.message}`;
    } else if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        // Column not found error
        errorMessage = `Database query failed: column specified in the query does not exist. Check column names. Original error: ${error.message}`;
    } else if (error.code === '23505') { // Unique constraint violation
        errorMessage = `Database query failed: duplicate key value violates unique constraint "${error.constraint}". Original error: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
}

