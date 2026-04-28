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
                    pfr_stat REAL AS (pfr_hands / CAST((total_hands - walks) AS REAL)),
                    three_bet_hands INT NOT NULL DEFAULT 0,
                    three_bet_opportunities INT NOT NULL DEFAULT 0,
                    faced_three_bet INT NOT NULL DEFAULT 0,
                    folded_to_three_bet INT NOT NULL DEFAULT 0,
                    total_bets INT NOT NULL DEFAULT 0,
                    total_raises INT NOT NULL DEFAULT 0,
                    total_calls INT NOT NULL DEFAULT 0,
                    total_folds INT NOT NULL DEFAULT 0
                );
            `);
            this.addColumnIfMissing("three_bet_hands", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("three_bet_opportunities", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("faced_three_bet", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("folded_to_three_bet", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("total_bets", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("total_raises", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("total_calls", "INT NOT NULL DEFAULT 0");
            this.addColumnIfMissing("total_folds", "INT NOT NULL DEFAULT 0");
        } catch (err) {
            console.log("Failed to create player table", err.message);
        }
    }

    private addColumnIfMissing(column_name: string, column_def: string): void {
        const cols = this.db.prepare(`PRAGMA table_info(PlayerStats)`).all() as Array<{ name: string }>;
        if (!cols.some(c => c.name === column_name)) {
            this.db.exec(`ALTER TABLE PlayerStats ADD COLUMN ${column_name} ${column_def}`);
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

    transaction<T>(fn: () => T): T {
        return this.db.transaction(fn)();
    }
}

const db_service = new DBService("./pokernow-gpt.db");

export default db_service;
