import path from 'node:path';
import {ingestFunctionalData} from '../../server/functional-ingest.js';
import {buildSimWorld} from '../../server/simworld.js';
import {isolateOfficialSource} from '../../server/isolate-sources.js';

const root=path.resolve(import.meta.dirname,'../..');
try{
  ingestFunctionalData(root);
  console.log(JSON.stringify(await isolateOfficialSource(root)));
  console.log(JSON.stringify(buildSimWorld(root)));
}catch(error){console.error(error.message);process.exitCode=1;}
