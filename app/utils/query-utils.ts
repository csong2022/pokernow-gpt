export function emptyOrSingleRow(rows) {
    console.log("QUERY OUTPUT: ");
    console.log(rows);
    if (!rows) {
        return [];
    }
    return rows[0];
}