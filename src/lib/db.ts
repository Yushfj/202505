
import { Pool } from 'pg';
import { format } from 'date-fns'; // Import format for date formatting in getWageRecords

let pool: Pool | null = null; // Initialize pool as null
let poolInitializationPromise: Promise<void> | null = null; // Promise to track initialization

const initializePool = async (): Promise<void> => {
    // Prevent re-initialization if already done or in progress
    if (pool || poolInitializationPromise) {
        return poolInitializationPromise || Promise.resolve();
    }

    console.log('Attempting to initialize database pool...');

    // Read connection details strictly from individual environment variables
    const publicHost = process.env.PGHOST || 'trolley.proxy.rlwy.net';
    const publicPortEnv = process.env.PGPORT;
    const publicPort = publicPortEnv ? parseInt(publicPortEnv, 10) : 43769; // Use Railway's public proxy port
    const dbName = process.env.PGDATABASE || 'railway';
    const dbUser = process.env.PGUSER || 'postgres';
    const dbPassword = process.env.PGPASSWORD; // Explicitly read the password

    // ** CRITICAL CHECK **
    if (!dbPassword) {
        console.error("CRITICAL: PGPASSWORD environment variable is not set or not accessible in this process. Cannot initialize database pool.");
        throw new Error("Database password (PGPASSWORD) is not configured or accessible in environment variables.");
    }

    console.log('--- Database Connection Configuration ---');
    console.log(`  Using Public Host: ${publicHost}`);
    console.log(`  Using Public Port: ${publicPort}`);
    console.log(`  Database Name: ${dbName}`);
    console.log(`  Database User: ${dbUser}`);
    console.log(`  PGPASSWORD Loaded: ${dbPassword ? 'Yes (Hidden)' : 'No!'}`); // Avoid logging the actual password
    console.log('---------------------------------------');


    const poolConfig = {
        host: publicHost,
        port: publicPort,
        database: dbName,
        user: dbUser,
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
             specificError += ` Could not resolve host '${poolConfig.host}'. Verify host and network. Ensure you are using the public connection details.`;
        } else if (err.code === 'ECONNREFUSED') {
            specificError += ` Connection refused to ${poolConfig.host}:${poolConfig.port}. Check host, port, and firewall rules.`;
        } else if (err.code === 'ECONNRESET') {
            specificError += ' Connection was reset. Check network stability and server logs.';
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
      throw new Error(`Database connection is not available. Check application logs for initialization errors. Original error: ${error.message}`);
  }

  try {
    // console.log('Executing query:', text); // Avoid logging params
    const res = await currentPool.query(text, params);
    // console.log('Query successful.');
    return res;
  } catch (error: any) {
    console.error('Database query error:', error.stack);
    let errorMessage = `Database query failed: ${error.message}`;
    if (error.message?.includes('password authentication failed')) {
        errorMessage = `Database query failed: password authentication failed for user "${process.env.PGUSER || 'postgres'}". Check PGPASSWORD.`;
    }
    throw new Error(errorMessage);
  }
}
