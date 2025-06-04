
import { Pool, PoolClient } from 'pg';
import { format, isValid as isDateValid, parseISO } from 'date-fns'; // Import format for date formatting in getWageRecords

let pool: Pool | null = null; // Initialize pool as null
let poolInitializationPromise: Promise<void> | null = null; // Promise to track initialization

const initializePool = async (): Promise<void> => {
    if (pool && poolInitializationPromise) {
        console.log('Database pool already initialized or initialization in progress.');
        return poolInitializationPromise;
    }
    if (pool) {
        console.log('Database pool already initialized.');
        return Promise.resolve();
    }
    if (poolInitializationPromise) {
        console.log('Database pool initialization already in progress.');
        return poolInitializationPromise;
    }

    console.log('Attempting to initialize database pool...');

    const dbPassword = process.env.PGPASSWORD;

    if (!dbPassword) {
        const errMsg = "CRITICAL: PGPASSWORD environment variable is not set. Cannot initialize database pool.";
        console.error(errMsg);
        throw new Error(errMsg);
    }

    // Use public proxy details for broader accessibility, especially during development
    const host = process.env.DATABASE_PUBLIC_URL ? new URL(process.env.DATABASE_PUBLIC_URL).hostname : (process.env.PGHOST || 'trolley.proxy.rlwy.net');
    const portEnv = process.env.DATABASE_PUBLIC_URL ? new URL(process.env.DATABASE_PUBLIC_URL).port : process.env.PGPORT;
    const port = portEnv ? parseInt(portEnv, 10) : 5432; // Default PG port or typical proxy port
    const database = process.env.DATABASE_PUBLIC_URL ? new URL(process.env.DATABASE_PUBLIC_URL).pathname.slice(1) : (process.env.PGDATABASE || 'railway');
    const user = process.env.DATABASE_PUBLIC_URL ? new URL(process.env.DATABASE_PUBLIC_URL).username : (process.env.PGUSER || 'postgres');

    console.log('--- Database Connection Configuration ---');
    console.log(`  Host: ${host}`);
    console.log(`  Port: ${port}`);
    console.log(`  Database: ${database}`);
    console.log(`  User: ${user}`);
    console.log(`  PGPASSWORD Loaded: Yes (Hidden)`);
    console.log('---------------------------------------');

    const poolConfig = {
        host,
        port,
        database,
        user,
        password: dbPassword,
        ssl: host.includes('railway.internal') ? false : { rejectUnauthorized: false }, // SSL for public, none for internal
        connectionTimeoutMillis: 15000, // Increased connection timeout
        idleTimeoutMillis: 45000,       // Increased idle timeout
        query_timeout: 30000,           // Client-side query timeout (30 seconds)
        statement_timeout: 30000,       // Server-side statement timeout (30 seconds)
        max: 10, // Max number of clients in the pool
    };

    try {
        console.log('Creating new PostgreSQL Pool with config:', { ...poolConfig, password: '[REDACTED]' });
        const newPool = new Pool(poolConfig);

        console.log('Attempting test query to verify connection...');
        const client = await newPool.connect();
        console.log('Successfully acquired client from pool for test.');
        await client.query('SELECT NOW() AS "currentTime";');
        client.release();
        console.log('Database connection test successful. Pool is initialized.');
        pool = newPool;

        pool.on('error', (err, client) => {
          console.error('Unexpected error on idle client in pool', err);
          // You might want to remove the client from the pool here or let pg handle it
        });

    } catch (err: any) {
        console.error('CRITICAL: Error initializing database pool or testing connection:', err.stack);
        pool = null; // Ensure pool is null on failure
        let specificError = `Database initialization failed: ${err.message}`;
        if (err.message?.includes('password authentication failed')) {
            specificError += ' Check if PGPASSWORD environment variable is correct.';
        } else if (err.code === 'ENOTFOUND') {
             specificError += ` Could not resolve host '${poolConfig.host}'. Verify host and network.`;
        } else if (err.code === 'ECONNREFUSED') {
            specificError += ` Connection refused to ${poolConfig.host}:${poolConfig.port}. Check host, port, and firewall.`;
        }
        throw new Error(specificError);
    }
};

const ensurePoolInitialized = (): Promise<void> => {
    if (!poolInitializationPromise) {
        console.log('Pool initialization promise not found, creating one.');
        poolInitializationPromise = initializePool().catch(err => {
            console.error("Database pool initialization promise rejected:", err.message);
            poolInitializationPromise = null; // Reset promise on failure to allow retry
            throw err;
        });
    } else {
        console.log('Pool initialization promise already exists.');
    }
    return poolInitializationPromise;
};

export const getDbPool = async (): Promise<Pool> => {
    console.log('getDbPool called.');
    try {
        await ensurePoolInitialized();
        console.log('Pool initialization ensured.');
    } catch (initError: any) {
        console.error("getDbPool: Failed to ensure database pool is initialized:", initError.message);
        throw new Error(`Database pool failed to initialize. Check application startup logs. Original error: ${initError.message}`);
    }

    if (!pool) {
        const errMsg = 'getDbPool: Pool is null after initialization attempt. This should not happen if ensurePoolInitialized resolved without error.';
        console.error(errMsg);
        // Attempt re-initialization once more as a fallback, though this indicates a deeper issue.
        console.log('Attempting one-time re-initialization in getDbPool...');
        await initializePool().catch(e => console.error("Re-initialization attempt in getDbPool failed:", e));
        if (!pool) {
            throw new Error(errMsg + ' Re-initialization also failed.');
        }
        console.log('Pool re-initialized successfully in getDbPool fallback.');
    }
    return pool;
};

export async function query(text: string, params?: any[]) {
  let currentPool: Pool;
  try {
      currentPool = await getDbPool();
  } catch (error: any) {
      console.error("Failed to get database pool for query:", error.message);
      throw new Error(`Database connection is not available. Check application logs for initialization errors. Original error: ${error.message}`);
  }

  const startTime = Date.now();
  console.log(`Executing query (first 50 chars): ${text.substring(0, 50)}...`);
  try {
    const res = await currentPool.query(text, params);
    const duration = Date.now() - startTime;
    console.log(`Query successful. Duration: ${duration}ms. Rows affected/returned: ${res.rowCount || res.rows?.length}`);
    return res;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Database query error after ${duration}ms:`, error.stack);
    let errorMessage = `Database query failed: ${error.message}`;
    if (error.message?.includes('password authentication failed')) {
        errorMessage = `Database query failed: password authentication failed for user "${process.env.PGUSER || 'postgres'}". Check PGPASSWORD.`;
    } else if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        errorMessage = `Database query failed: table specified in the query does not exist. Check table names. Original error: ${error.message}`;
    } else if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        errorMessage = `Database query failed: column specified in the query does not exist. Check column names. Original error: ${error.message}`;
    } else if (error.code === '23505') { 
        errorMessage = `Database query failed: duplicate key value violates unique constraint "${error.constraint}". Original error: ${error.message}`;
    } else if (error.message?.includes('timeout') || error.code === '57014') { // 57014 is query_canceled
        errorMessage = `Database query failed: The query timed out after ${duration}ms. Original error: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
}
