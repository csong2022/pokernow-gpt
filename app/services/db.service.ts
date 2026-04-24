import Database from 'better-sqlite3';

export class DBService {
    private file_name: string;
    private db!: Database.Database;

    constructor(file_name: string) {
        this.file_name = file_name;
    }

    init(): void {
        this.db = new Database(this.file_name);
    }

    createTables(): void {
        this.createPlayerTable();
    }

    createPlayerTable(): void {
        try {
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS PlayerStats (
                    name TEXT PRIMARY KEY NOT NULL,
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

    close(): void {
        this.db.close();
    }

    query(sql: string, params: Array<any>): Array<any> {
        const stmt = this.db.prepare(sql);
        if (stmt.reader) {
            return stmt.all(params);
        }
        stmt.run(params);
        return [];
    }
}

const db_service = new DBService("./app/pokernow-gpt.db");

export default db_service;
