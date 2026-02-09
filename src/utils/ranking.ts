export type RankingNeighbors<T> = {
    me: T | null;
    top: T | null;
    betweenTop: T | null;
    betweenBottom: T | null;
};

export function selectRankingNeighbors<T extends {userJobId: string}>(
    rows: T[],
    userJobId: string,
): RankingNeighbors<T> {
    if (!rows.length) {
        return {me: null, top: null, betweenTop: null, betweenBottom: null};
    }

    const top = rows[0] ?? null;
    const meIndex = rows.findIndex((row) => row.userJobId === userJobId);
    const me = meIndex >= 0 ? rows[meIndex] : null;

    const betweenTop = meIndex > 1 ? rows[Math.floor(meIndex / 2)] : null;

    const lastIndex = rows.length - 1;
    const betweenBottom = meIndex >= 0 && lastIndex - meIndex > 1
        ? rows[Math.floor((meIndex + lastIndex) / 2)]
        : null;

    return {me, top, betweenTop, betweenBottom};
}
