export function emptyOrSingleRow(rows) {
    if (!rows) {
        return [];
    }
    return rows[0];
}