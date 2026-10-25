import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {regionStatus} from '../server/region-status.js';
import {loadRegionWorld} from '../src/shared/region-api.js';

test('optional region status reflects an absent or present world snapshot',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trainsim-region-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assert.deepEqual(regionStatus(root),{regionWorldAvailable:false,source:'synthetic-seed'});
  fs.mkdirSync(path.join(root,'data/current'),{recursive:true});
  fs.writeFileSync(path.join(root,'data/current/world.json'),'{}');
  assert.deepEqual(regionStatus(root),{regionWorldAvailable:true,source:'OSM-derived'});
});

test('bootstrap skips the world endpoint when no snapshot is advertised',async()=>{
  const result=await loadRegionWorld({regionWorldAvailable:false},()=>{throw new Error('Unexpected request');});
  assert.equal(result,null);
  assert.equal(await loadRegionWorld(null,()=>{throw new Error('Unexpected request');}),null);
});

test('advertised OSM snapshot is loaded and source checked',async()=>{
  let calls=0;
  const world={source:'OSM-derived',dataset_status:'real-source',tracks:[],stations:[],routes:[]};
  const loaded=await loadRegionWorld({regionWorldAvailable:true},async url=>{
    calls++;assert.equal(url,'/api/region/world');
    return {ok:true,json:async()=>world};
  });
  assert.equal(calls,1);
  assert.equal(loaded,world);
});

test('a removed or invalid advertised snapshot reports an error',async()=>{
  await assert.rejects(loadRegionWorld({regionWorldAvailable:true},async()=>({ok:false,status:404})),/HTTP 404/);
  await assert.rejects(loadRegionWorld({regionWorldAvailable:true},async()=>({
    ok:true,json:async()=>({source:'synthetic-seed',dataset_status:'real-source'})
  })),/invalid OSM source metadata/);
});
