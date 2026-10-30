import fs from 'node:fs';
import path from 'node:path';
import {ingestFunctionalData,readFunctionalCatalogue} from '../../server/functional-ingest.js';
import {buildSimWorld,SIMWORLD_DB} from '../../server/simworld.js';

const root=path.resolve(import.meta.dirname,'../..');
try{
  ingestFunctionalData(root);
  const world=buildSimWorld(root);
  const catalogue=readFunctionalCatalogue(root,SIMWORLD_DB);
  const output=path.join(root,'public/assets/docs-catalogue.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output+'.tmp',JSON.stringify(catalogue,null,2)+'\n');
  fs.renameSync(output+'.tmp',output);
  const report=path.join(root,'data/corpus/reports/functional-ingestion.json');
  fs.mkdirSync(path.dirname(report),{recursive:true});
  fs.writeFileSync(report,JSON.stringify({hash:catalogue.hash,guides:catalogue.documents.length,functions:catalogue.records.length,datasets:catalogue.datasets.length,...catalogue.storage},null,2)+'\n');
  console.log(`Sim Docs: ${catalogue.documents.length} guides, ${catalogue.datasets.length} data files, ${catalogue.records.length} requirements, ${catalogue.warnings.length} records with review gaps. ${catalogue.hash}`);
  console.log(`Database: ${catalogue.storage.database}; extracted pages: ${catalogue.storage.extraction.counts.source_page}/${catalogue.storage.extraction.expectedPages}; missing PDFs: ${catalogue.storage.extraction.missingSources.length}; missing tools: ${catalogue.storage.extraction.missingTools.join(', ')||'none'}`);
  console.log(`Technical corpus: ${catalogue.storage.technical.technical_reference} references, ${catalogue.storage.technical.technical_variable} variables, ${catalogue.storage.technical.component_io_function} I/O contracts, ${catalogue.storage.technical.component_io_parameter} parameters`);
  console.log(`Runtime: ${world.database}; ${world.classification}; ${world.components} component instances`);
}catch(error){console.error(error.message);process.exitCode=1;}
