import fs from 'node:fs';
import path from 'node:path';

// An imported world is optional. Keep the missing-snapshot state distinct from an API error.
export function regionStatus(root) {
  const regionWorldAvailable=fs.existsSync(path.join(root,'data/current/world.json'));
  return {
    regionWorldAvailable,
    source:regionWorldAvailable?'OSM-derived':'synthetic-seed'
  };
}
