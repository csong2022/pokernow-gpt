import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./pokernow-gpt.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err: any) => {
    console.log("Creating DB");
    if (err) {
        console.log("Failed to create database " + err);
    } else {
        console.log("Creating Tables");
        createTables(db);
    }
});

async function createTables(db: any): Promise<void> {
    await createPlayerTable(db);
}

async function createPlayerTable(db: any): Promise<void> {
    try {
        console.log("Creating Player ")
        db.exec(`
            CREATE TABLE IF NOT EXISTS Player (
                id TEXT PRIMARY KEY NOT NULL,
                total_hands INT NOT NULL
            )
        `);
        db.exec(`
            INSERT INTO Player (id, total_hands) 
            VALUES ('player1', 123)
        `);
    } catch (err) {
        console.log("Failed to create player table " + err);
    }
}

export async function query(sql: string, params: Array<string>): Promise<Array<string>> {
    console.log("RUNNING QUERY");
    var rows : string[] = [];
    db.each(sql, params, function (err: any, row: string) {
        if (err) {
            console.log("Getting error " + err);
            return;
        }
        rows.push(row);
    });
    return rows;
}