import assert from 'node:assert/strict';
import {selectRankingNeighbors} from '../src/utils/ranking';

type Row = {userJobId: string; rank: number};

const makeRows = (ids: string[]): Row[] =>
    ids.map((id, index) => ({userJobId: id, rank: index + 1}));

{
    const rows = makeRows(['u1']);
    const result = selectRankingNeighbors(rows, 'u1');
    assert.equal(result.me?.userJobId, 'u1');
    assert.equal(result.top?.userJobId, 'u1');
    assert.equal(result.betweenTop, null);
    assert.equal(result.betweenBottom, null);
}

{
    const rows = makeRows(['u1', 'u2', 'u3']);
    const result = selectRankingNeighbors(rows, 'u1');
    assert.equal(result.me?.userJobId, 'u1');
    assert.equal(result.top?.userJobId, 'u1');
    assert.equal(result.betweenTop, null);
    assert.equal(result.betweenBottom?.userJobId, 'u2');
}

{
    const rows = makeRows(['u1', 'u2', 'u3', 'u4', 'u5']);
    const result = selectRankingNeighbors(rows, 'u4');
    assert.equal(result.me?.userJobId, 'u4');
    assert.equal(result.top?.userJobId, 'u1');
    assert.equal(result.betweenTop?.userJobId, 'u2');
    assert.equal(result.betweenBottom, null);
}

console.log('previewCompetencyProfile ranking selection tests passed.');
