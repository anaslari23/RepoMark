import ReedSolomon from '@bnb-chain/reed-solomon';

// RS(63, 32) -> we can use RS with 32 data shards and 31 parity shards?
// Actually @bnb-chain/reed-solomon might use dataShards, parityShards.
const dataShards = 32;
const parityShards = 31;

const rs = new ReedSolomon(dataShards, parityShards);

const data = Buffer.alloc(dataShards, 0);
data[0] = 42;

// The package probably wants an array of Uint8Arrays, or just one Uint8Array
try {
  const shards = rs.encode(data);
  console.log('Shards:', shards);
} catch (e) {
  console.error(e);
}
