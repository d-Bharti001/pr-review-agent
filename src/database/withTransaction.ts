import type { PoolConnection } from "mysql2/promise";

import pool from "src/database/pool";

export type IsolationLevel =
    | "READ UNCOMMITTED"
    | "READ COMMITTED"
    | "REPEATABLE READ"
    | "SERIALIZABLE";

/**
 * Runs `fn` inside a single MySQL transaction on a dedicated connection.
 *
 * Commits on success, rolls back on any thrown error (re-throwing it after)
 * and always releases the connection back to the pool.
 */
export async function withTransaction<T>(
    fn: (conn: PoolConnection) => Promise<T>,
    isolationLevel: IsolationLevel = "READ COMMITTED",
): Promise<T> {
    const conn = await pool.getConnection();

    try {
        await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
