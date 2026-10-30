import path from 'node:path';
import {moveGeographyInput} from '../../server/geography.js';

try{console.log(JSON.stringify(moveGeographyInput(path.resolve(import.meta.dirname,'../..')),null,2));}
catch(error){console.error(error.message);process.exitCode=1;}
