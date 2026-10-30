import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SIMWORLD_DB} from './simworld.js';

export function technicalData(root,query={},database=SIMWORLD_DB){
  const file=path.join(root,database);
  if(!fs.existsSync(file))throw new Error('Technical database not found; run npm run ingest:functional');
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='technical_reference_trace'").get())throw new Error('Technical catalogue not found; run npm run ingest:functional');
    const where=[],args=[];
    for(const [key,column] of [['corpusId','corpus_id'],['kind','kind'],['standard','standard'],['issue','standard_issue']])if(query[key]){where.push(`${column}=?`);args.push(String(query[key]));}
    if(query.q){where.push('(description LIKE ? OR clause_no LIKE ? OR corpus_id LIKE ?)');args.push(...Array(3).fill(`%${String(query.q)}%`));}
    const limit=query.limit===undefined?100:Number(query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('Invalid technical result limit (1–500)');
    const refs=db.prepare(`SELECT * FROM technical_reference_trace ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY corpus_id LIMIT ?`).all(...args,limit);
    if(query.corpusId){
      const reference=refs[0];if(!reference)throw new Error('Corpus reference not found');
      const contract=db.prepare('SELECT * FROM component_io_function WHERE corpus_id=?').get(query.corpusId);
      const variable=db.prepare('SELECT * FROM technical_variable WHERE corpus_id=?').get(query.corpusId);
      const parameter=db.prepare('SELECT * FROM component_io_parameter_provenance WHERE corpus_id=?').get(query.corpusId);
      const clauseReference=db.prepare('SELECT * FROM technical_clause_reference WHERE id=?').get(query.corpusId);
      const externalReference=db.prepare('SELECT * FROM technical_external_reference WHERE id=?').get(query.corpusId);
      const protocol=reference.protocol_id?db.prepare('SELECT * FROM protocol_element WHERE id=?').get(reference.protocol_id):null;
      const parameters=contract?db.prepare('SELECT * FROM component_io_parameter_provenance WHERE function_id=? ORDER BY ordinal').all(contract.id):[];
      const values=variable?db.prepare('SELECT * FROM technical_value WHERE variable_id=? ORDER BY ordinal').all(variable.protocol_id):[];
      const fields=protocol?db.prepare(`SELECT f.*,link.corpus_id,v.corpus_id AS variable_corpus_id FROM protocol_field f JOIN protocol_field_reference link ON link.protocol_id=f.owner_protocol_id AND link.ordinal=f.ordinal LEFT JOIN technical_variable v ON v.protocol_id=f.variable_id WHERE f.owner_protocol_id=? ORDER BY f.ordinal`).all(protocol.id):[];
      const packetReferences=protocol?db.prepare('SELECT * FROM protocol_packet_reference WHERE owner_protocol_id=? ORDER BY field_ordinal,packet_no').all(protocol.id):[];
      return {reference,contract:contract?{...contract,applicability:JSON.parse(contract.applicability_json)}:null,parameters,parameter:parameter??null,variable:variable??null,values,protocol:protocol??null,fields,packetReferences,clauseReference:clauseReference??null,externalReference:externalReference?{...externalReference,referencedStandard:externalReference.document_label,referencedStandardIssue:null}:null};
    }
    return {references:refs,limit,notice:'Corpus IDs are local. Standard identifiers and source provenance are separate. Contracts remain unverified extraction candidates.'};
  }finally{db.close();}
}
