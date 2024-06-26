export function emptyOrSingleRow(rows: Array<string>): string {
    if (!rows) {
        return "";
    }
    return rows[0];
}