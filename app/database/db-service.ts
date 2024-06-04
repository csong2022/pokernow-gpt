import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const db = await open({
        filename: './pokernow-gpt.db',
        driver: sqlite3.Database
}).then((db) => {
    createTables(db);
    return db;
})

async function createTables(db: any): Promise<void> {
    await createPlayerTable(db);
}

async function createPlayerTable(db: any): Promise<void> {
    try {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Player (
                id TEXT PRIMARY KEY NOT NULL,
                total_hands INT NOT NULL
            );
        `);
    } catch (err) {
        console.log("Failed to create player table", err.message);
    }
}

export async function query(sql: string, params: Array<any>): Promise<Array<string>> {
    var rows : string[] = [];
    const result = await db.each(sql, params, (err: any, row: string) => {
        if (err) {
            console.log("Getting error", err.message);
            return;
        }
        rows.push(row);
    });
    return rows;
}