
# Future ideas for meemi_kansio

## Priority 1

* Bulk upload of images, with progress indication and error handling
  * Bulk uploaded files use their name (without extension) as the default title. Other metadata is left empty.
* Generate thumbnails; a few resolutions per image
* Automatically generate easily clipboard-copyable images: PNG, max 1024px per dimension

## Priority 2

* Compute perceptual hashes for images to detect duplicates
  * This can use blockhash-js to compute the hash on the client side, then query the backend for existing hashes to find duplicates.
  * Store hashes in PG as bigint and compute hamming distance using bit_count and bitwise XOR for similarity search.
