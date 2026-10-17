import { requireDb } from './client.js';

// TODO(Tier 1 #1): ~6 synthetic visits (Maya, 6, tummy = demo star) + thousands of
// check-in / game events so charts look alive. All patients is_synthetic = true.
const sql = requireDb();
console.log('seed: not implemented yet');
await sql.end();
