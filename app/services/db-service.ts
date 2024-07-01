import sqlite3 from 'sqlite3';
import { Database } from 'sqlite'
import { open } from 'sqlite';

export class DBService {
    private file_name: string;
    private db!: Database<sqlite3.Database, sqlite3.Statement>;

    constructor(file_name: string) {
        this.file_name = file_name;
    }

    async init() {
        this.db = await open<sqlite3.Database, sqlite3.Statement>({
            filename: this.file_name,
            driver: sqlite3.Database
        })
        this.createTables(this.db);
    }

    async createTables(db: any): Promise<void> {
        await this.createPlayerTable(db);
    }

    async createPlayerTable(db: any): Promise<void> {
        try {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS PlayerStats (
                    id TEXT PRIMARY KEY NOT NULL,
                    total_hands INT NOT NULL,
                    walks INT NOT NULL,
                    vpip_hands INT NOT NULL,
                    vpip_stat REAL AS (vpip_hands / CAST((total_hands - walks) AS REAL)),
                    pfr_hands INT NOT NULL,
                    pfr_stat REAL AS (pfr_hands / CAST((total_hands - walks) AS REAL))
                );
            `);
        } catch (err) {
            console.log("Failed to create player table", err.message);
        }
    }

    async query(sql: string, params: Array<any>): Promise<Array<string>> {
        var rows : string[] = [];
        const result = await this.db.each(sql, params, (err: any, row: string) => {
            if (err) {
                throw new Error(err.message);
            }
            rows.push(row);
        });
        return rows;
    }

    async close() {
        await this.db.close();
    }
}
