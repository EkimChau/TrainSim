// Do not request an absent optional dataset: a direct GET /api/region/world
// intentionally returns 404 when no imported OSM snapshot exists.
export async function loadRegionWorld(config, fetcher) {
  if(!config?.regionWorldAvailable)return null;
  const response=await fetcher('/api/region/world');
  if(!response.ok)throw new Error(`Region world HTTP ${response.status}`);
  const region=await response.json();
  if(region?.source!=='OSM-derived'||region.dataset_status!=='real-source') {
    throw new Error('Region world has invalid OSM source metadata');
  }
  return region;
}
