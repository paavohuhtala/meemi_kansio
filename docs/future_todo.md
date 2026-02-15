
# Future ideas for meemi_kansio

## Priority 2

* Compute perceptual hashes for images to detect duplicates
  * This can use blockhash-js to compute the hash on the client side, then query the backend for existing hashes to find duplicates.
  * Store hashes in PG as bigint and compute hamming distance using bit_count and bitwise XOR for similarity search.
