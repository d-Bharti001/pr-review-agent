import mysql from "mysql2/promise";
import { DATABASE_URL } from "src/config";

const pool = mysql.createPool({
    uri: DATABASE_URL,
    connectionLimit: 5,
    charset: "utf8mb4", // for emoji support
    timezone: "Z",

    supportBigNumbers: true,
    bigNumberStrings: true,
});

export default pool;
