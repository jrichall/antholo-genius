export interface Env {
  DB: D1Database;
  SEARCH_CACHE: KVNamespace;
  COVERS: R2Bucket;
  HARDCOVER_TOKEN: string;
}
