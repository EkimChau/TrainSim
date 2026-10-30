import fs from 'node:fs';
import path from 'node:path';
import {loadDocsCatalogue} from '../../server/docs-catalogue.js';

const root=path.resolve(import.meta.dirname,'../..');
try{
  const catalogue=loadDocsCatalogue(root);
  const output=path.join(root,'public/assets/docs-catalogue.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output+'.tmp',JSON.stringify(catalogue,null,2)+'\n');
  fs.renameSync(output+'.tmp',output);
  console.log(`Sim Docs: ${catalogue.documents.length} guides, ${catalogue.datasets.length} data files, ${catalogue.records.length} requirements, ${catalogue.warnings.length} records with review gaps. ${catalogue.hash}`);
}catch(error){console.error(error.message);process.exitCode=1;}
