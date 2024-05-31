import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./pokernow-gpt.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err: any) => {
    if (err && err.code == "SQLITE_CANTOPEN") {
        createDatabase();
        return;
    } else if (err) {
        console.log("Getting error " + err);
        return;
    }
});

async function createDatabase(): Promise<void> {
    const db = new sqlite3.Database('./pokernow-gpt.db', (err: any) => {
        if (err) {
            console.log("Getting error " + err);
            return;
        }
    });
    await createTables(db);
}

async function createTables(db: any): Promise<void> {
    await createPlayerDataTable(db);
}

async function createPlayerDataTable(db: any): Promise<void> {
    db.exec(`
        CREATE TABLE Player (
            player_id INT PRIMARY KEY NOT NULL,
            total_hands INT NOT NULL,
        ) 
    `);
}

async function query(sql: string, params: Array<string>): Promise<Array<string>> {
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