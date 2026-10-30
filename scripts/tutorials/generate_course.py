#!/usr/bin/env python3
"""Generate the self-contained SimWorld ESIG syllabus from the nine supplied SUBSET-026 v4.0.0 chapter PDFs.

Metadata-only extraction: section titles, page references, figure captions, packet names.
Does NOT copy standard text or figures. Rendering is a separate, labelled educational re-expression.
Requires pdftotext (Poppler) only to rebuild. Runtime never needs these files.

Usage: python3 scripts/tutorials/generate_course.py /path/to/PDFs
"""
from __future__ import annotations
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SPEC_ISSUE='4.0.0'
MODULES={
  1: [('01', 'Foundations & interoperability', 'SRS scope; standards boundaries', 'architecture')],
  2: [('02', 'ETCS architecture and levels', 'Trackside and on-board boundaries; application levels', 'architecture')],
  3: [
    ('03','Balises, linking & Euroloop','3.4','position'),
    ('04','Radio communication','3.5','radio'),
    ('05','Location and position confidence','3.6','position'),
    ('06','Data completeness','3.7','guard'),
    ('07','Movement Authority','3.8','authority'),
    ('08','Infill & emergency orders','3.9–3.10','emergency'),
    ('09','Speed, gradient & route profiles','3.11–3.12','profile'),
    ('10','Braking and speed supervision','3.13–3.14','braking'),
    ('11','Special functions & handover','3.15','handover'),
    ('12','Data consistency and versioning','3.16–3.17','version'),
    ('13','National, train and juridical data','3.18–3.20','parameter')],
  4: [('14','Modes and transitions','4.4–4.12','mode')],
  5: [('15','Operational procedures','5.4–5.22','procedure')],
  6: [('16','Older system versions','6.3–6.6','version')],
  7: [('17','ETCS language and packets','7.3–7.5','packet')],
  8: [('18','Eurobalise and radio messages','8.4–8.7','message')],
  9: [('19','Clause classification','9.4','classification')],
}
# Keep educational boundaries explicit. No professional operation or safety engineering claims.
FAMILY={
 'architecture': {'title':'Interface selection','actors':['Trackside','OBU','Interface','DMI'],'inputs':[
 ('tracksideReady','Trackside interface available','boolean',True,'Trackside subsystem'),
 ('onboardReady','OBU operational','boolean',True,'On-board subsystem'),
 ('interfaceCompatible','Interfaces compatible','boolean',True,'Configuration'),
 ('level','ETCS application level','number',2,'Application configuration',0,3)],'fault':'interfaceCompatible'},
 'guard':{'title':'Evidence gate','actors':['Track circuit','Interlocking','RBC','OBU'],'inputs':[
 ('routeProved','Route proved','boolean',True,'Interlocking'),('sectionClear','Protected section clear','boolean',True,'Train detection'),
 ('dataComplete','Information complete','boolean',True,'Trackside data'),('trainFront','Train front position','number',300,'OBU report',0,5000)],'fault':'sectionClear'},
 'authority':{'title':'Authority assessment','actors':['Interlocking','RBC','OBU','DMI'],'inputs':[
 ('routeProved','Route proved','boolean',True,'Interlocking'),('positionValid','Location accepted','boolean',True,'OBU report'),
 ('radioSession','Radio session available','boolean',True,'RBC–OBU'),('trainFront','Train front','number',300,'OBU',0,5000),
 ('maLimit','Proposed authority limit','number',900,'Trackside route limit',0,5000),
 ('targetAtEnd','Target speed at end','number',0,'MA profile',0,160)],'fault':'routeProved'},
 'position':{'title':'Position confidence','actors':['Balise','Odometry','OBU','RBC'],'inputs':[
 ('baliseKnown','Balise reference known','boolean',True,'Eurobalise'),('linkingValid','Linking consistent','boolean',True,'Balise/linking data'),
 ('orientationValid','Direction consistent','boolean',True,'OBU'),('measuredPosition','Odometer estimate','number',320,'Odometry',0,5000),
 ('positionError','Estimated inaccuracy','number',12,'OBU estimator',0,200)],'fault':'linkingValid'},
 'radio':{'title':'Communication session','actors':['OBU','Radio','RBC','DMI'],'inputs':[
 ('radioAvailable','Radio bearer available','boolean',True,'Radio network'),('versionCompatible','System version compatible','boolean',True,'RBC/OBU'),
 ('positionKnown','Position reference known','boolean',True,'Balise/odometry'),('trainFront','Position report','number',320,'OBU',0,5000)],'fault':'radioAvailable'},
 'braking':{'title':'Illustrative speed / distance monitor','actors':['SSP','Braking model','OBU','DMI'],'inputs':[
 ('speed','Train speed','number',60,'OBU speedometer',0,200),('permitted','Permitted speed','number',80,'Speed profile',0,200),
 ('distance','Distance to target','number',600,'Target / position',0,5000),('targetSpeed','Target speed','number',0,'Profile target',0,200),
 ('deceleration','Example brake deceleration','number',0.9,'Synthetic train model',0.1,3),
 ('buildUp','Example brake build-up time','number',4,'Synthetic train model',0,15),
 ('gradient','Gradient','number',0,'Trackside profile',-40,40)],'fault':'permitted'},
 'profile':{'title':'Restrictive profile','actors':['Trackside SSP','Restrictions','OBU','DMI'],'inputs':[
 ('lineSpeed','Permanent line speed','number',120,'Trackside SSP',0,200),
 ('temporarySpeed','Temporary restriction','number',70,'Trackside TSR',0,200),
 ('restrictionActive','Temporary restriction active','boolean',True,'Trackside'),
 ('gradient','Gradient','number',-6,'Track profile',-40,40),
 ('profileComplete','Profile data complete','boolean',True,'Trackside data')],'fault':'profileComplete'},
 'emergency':{'title':'Emergency order','actors':['Trackside','Radio','OBU','Driver'],'inputs':[
 ('orderDelivered','Emergency order delivered','boolean',True,'RBC/trackside'),
 ('trainSpeed','Train speed','number',50,'OBU',0,200),
 ('driverAcknowledged','Driver acknowledged','boolean',True,'Driver interface'),
 ('communicationsValid','Communication available','boolean',True,'Radio session')],'fault':'communicationsValid'},
 'mode':{'title':'Mode state change','actors':['Train data','Mode manager','OBU','DMI'],'inputs':[
 ('trainDataValid','Train data valid','boolean',True,'OBU/driver'),
 ('authorityAvailable','Applicable movement permission','boolean',True,'Trackside/operating procedure'),
 ('driverAcknowledged','Driver acknowledgement','boolean',True,'DMI'),
 ('modePermitted','Mode conditions met','boolean',True,'OBU mode logic')],'fault':'modePermitted'},
 'procedure':{'title':'Procedure sequence','actors':['Driver','Trackside','OBU','DMI'],'inputs':[
 ('driverReady','Driver action complete','boolean',True,'Driver'),('tracksideReady','Trackside condition ready','boolean',True,'Trackside'),
 ('trainDataValid','Train data available','boolean',True,'OBU/driver'),('permitReceived','Required permission available','boolean',True,'Procedure input')],'fault':'permitReceived'},
 'handover':{'title':'Controller transfer','actors':['RBC A','RBC B','OBU','Trackside'],'inputs':[
 ('sourceReady','Current controller ready','boolean',True,'RBC A'),('targetReady','Receiving controller ready','boolean',True,'RBC B'),
 ('borderKnown','Handover boundary known','boolean',True,'Trackside reference'),('radioAvailable','Radio link available','boolean',True,'OBU/RBC'),
 ('front','Train front','number',350,'OBU',0,5000)],'fault':'targetReady'},
 'version':{'title':'Version compatibility','actors':['Trackside version','OBU version','Checker','Response'],'inputs':[
 ('operatedVersion','Trackside system version','number',3,'Trackside',1,4),('supportedVersion','On-board supported version','number',3,'OBU',1,4),
 ('compatibilityAllowed','Compatibility rules satisfied','boolean',True,'Version policy')],'fault':'compatibilityAllowed'},
 'parameter':{'title':'Data parameter validation','actors':['National data','Train data','OBU','DMI'],'inputs':[
 ('sourcePresent','Parameter source present','boolean',True,'System/national data'),('valueValid','Parameter validity checked','boolean',True,'Data rules'),
 ('parameterValue','Illustrative parameter value','number',60,'SimWorld fixture',0,200),
 ('dataCurrent','Parameter not expired','boolean',True,'Source metadata')],'fault':'valueValid'},
 'packet':{'title':'Packet decoding','actors':['Trackside packet','Decoder','OBU','State'],'inputs':[
 ('lengthValid','Packet length valid','boolean',True,'Packet header'),('directionValid','Direction applies','boolean',True,'Q_DIR'),
 ('versionValid','Version compatible','boolean',True,'System version'),('payloadValid','Payload fields valid','boolean',True,'Packet payload'),
 ('packetBits','Illustrative payload length (bits)','number',96,'Fixture encoder',0,2048)],'fault':'lengthValid'},
 'message':{'title':'Message processing','actors':['Sender','Radio','Decoder','Receiver'],'inputs':[
 ('transportValid','Safe transport available','boolean',True,'Euroradio'),
 ('sequenceValid','Sequence / correlation accepted','boolean',True,'Session context'),
 ('payloadValid','Payload valid','boolean',True,'Message/packet data'),
 ('recipientReady','Receiver ready','boolean',True,'OBU or RBC')],'fault':'payloadValid'},
 'classification':{'title':'Clause classification inspection','actors':['SRS clause','Class table','Reviewer','Trace'],'inputs':[
 ('clauseFound','Clause reference found','boolean',True,'SUBSET-026'),('classificationKnown','Classification entry present','boolean',True,'Chapter 9'),
 ('editionMatched','Edition matches','boolean',True,'Document versions')],'fault':'editionMatched'},
 'level':{'title':'Application level','actors':['Trackside level','OBU','Transition logic','DMI'],'inputs':[
 ('tracksideLevel','Trackside level','number',2,'Trackside',0,3),('onboardLevel','Active OBU level','number',1,'OBU',0,3),
 ('transitionDataValid','Transition information valid','boolean',True,'Trackside/OBU'),
 ('driverAccepted','Driver action ready','boolean',True,'DMI')],'fault':'transitionDataValid'}
}

def extract_chapter(folder, chapter):
    file=folder / f'SUBSET-026-{chapter} v400.pdf'
    if not file.exists():raise FileNotFoundError(file)
    text=subprocess.run(['pdftotext','-layout',str(file),'-'],capture_output=True,text=True,check=True).stdout
    pages=text.split('\f')
    header=pages[0]
    if not re.search(r'REF\s*:\s*SUBSET-026-'+str(chapter),header) or '4.0.0' not in header:
        raise ValueError(f'Unexpected file/edition for Chapter {chapter}: {file}')
    pat=re.compile(r'^\s*('+str(chapter)+r'\.\d+(?:\.\d+){0,3})\s+(.+?)\s*\.{4,}\s*(\d+)\s*$',re.M)
    found={}
    for m in pat.finditer(text):
        ref,title,page=m.group(1),re.sub(r'\s+',' ',m.group(2).strip()),int(m.group(3))
        found.setdefault(ref,{'id':ref,'chapter':chapter,'title':title,'page':page})
    figures={}
    for page,raw in enumerate(pages,1):
        for m in re.finditer(r'(?mi)^\s*Figure\s+([0-9]+[a-z]?)\s*[:–-]\s*([^\n]+)',raw):
            number,title=m.group(1),re.sub(r'\s+',' ',m.group(2).strip())
            key=f'{chapter}:Fig:{number}'
            if key not in figures:
                figures[key]={'id':key,'chapter':chapter,'figure':number,'caption':title,'page':page,
                              'deleted':title.lower().startswith('intentionally deleted')}
    packets={}
    if chapter==7:
      for page,raw in enumerate(pages,1):
        for m in re.finditer(r'(?m)^\s*(7\.4\.[23]\.\d+(?:\.\d+)?)\s+Packet Number\s+(\d+):\s*([^\n]+)',raw):
            ref,num,title=m.group(1),int(m.group(2)),m.group(3).strip()
            key=f'P{num}-{ref}'
            packets.setdefault(key,{'id':key,'chapter':7,'clause':ref,'packet':num,'title':title,'page':page})
    return list(found.values()),list(figures.values()),list(packets.values())

def family_for(ref,title):
    ch=int(ref.split('.')[0]);parts=ref.split('.');sub=int(parts[1]) if len(parts)>1 else 0
    if ch==2 and sub==6:return 'level'
    if ch==3:
      if sub==4 or sub==6:return 'position'
      if sub in [5,9]:return 'radio'
      if sub==7:return 'guard'
      if sub==8:return 'authority'
      if sub==10:return 'emergency'
      if sub in [11,12]:return 'profile'
      if sub in [13,14]:return 'braking'
      if sub==15:return 'handover' if 'handover' in title.lower() or ref=='3.15.1' else 'procedure'
      if sub==16:return 'message'
      if sub==17:return 'version'
      return 'parameter'
    if ch==4:return 'mode'
    if ch==5:
      if sub==10:return 'level'
      if sub==15:return 'handover'
      if sub==11:return 'emergency'
      return 'procedure'
    if ch==6:return 'version'
    if ch==7:return 'packet'
    if ch==8:return 'message'
    if ch==9:return 'classification'
    return 'architecture'

def module_for(ref):
    chapter=int(ref.split('.')[0]);sub=int(ref.split('.')[1]) if len(ref.split('.'))>1 else 0
    if chapter!=3:return MODULES[chapter][0]
    for mod in MODULES[3]:
        anchor=mod[2].split('–')[0]
        if int(anchor.split('.')[1])<=sub:
            selected=mod
    return selected

def excluded(sec):
    name=sec['title'].lower()
    clause=sec['id']
    if any(x in name for x in ['intentionally deleted','modification history','table of contents']):return 'deleted' if 'intentionally deleted' in name else 'editorial'
    if clause in ('1.8','2.3','3.3','4.3','5.3','7.3','8.3','9.3'):return 'overview'
    # headings with no distinctive executable behavior can point to more focused children
    if name in ('introduction','scope and purpose','general','scope','definitions','general requirements','rules','packets','list of packets','common rules'):
        return 'overview'
    return None

def curriculum(folder):
    sections=[];figures=[];packets=[]
    for chapter in range(1,10):
        a,b,c=extract_chapter(folder,chapter);sections.extend(a);figures.extend(b);packets.extend(c)
    # Ensure all 116 PDF figures are included, not just illustrations selected for lessons
    assert len(figures)==116, f'Expected 116 figure identifiers from supplied PDFs, found {len(figures)}'
    assert len(packets)>=60, 'Unexpected packet definitions'
    lessons=[]
    for sec in sections:
        cat=excluded(sec)
        # Every non-editorial section gets an interactive lesson or an explicit overview cross-reference.
        if cat:continue
        ref=sec['id']
        chapter=sec['chapter']
        if chapter==7 and ref in ('7.4.2','7.4.3'):continue
        if chapter==8 and ref in ('8.6','8.7'):continue
        if chapter==1 and ref.startswith('1.8.'):continue
        mod=module_for(ref)
        lessons.append({'id':'esig-'+ref.replace('.','-'),'clause':ref,'title':sec['title'],
                       'chapter':chapter,'page':sec['page'],'family':family_for(ref,sec['title']),
                       'module':mod[0],'moduleTitle':mod[1], 'sourceKind':'section','figures':[]})
    for packet in packets:
        mod=MODULES[7][0]
        lessons.append({'id':f"esig-packet-{packet['clause'].replace('.','-')}",
                        'clause':packet['clause'],'title':f"Packet {packet['packet']}: {packet['title']}",
                        'chapter':7,'page':packet['page'],'family':'packet','packetId':packet['packet'],
                        'module':mod[0],'moduleTitle':mod[1],'sourceKind':'packet','figures':[]})
    # Attach each figure to the nearest applicable subsection's page, within its own chapter.
    for figure in figures:
        ch=figure['chapter']
        if figure['deleted']:
            figure['coverage']='excluded_deleted'; figure['lessonIds']=[];continue
        candidates=[l for l in lessons if l['chapter']==ch]
        before=[l for l in candidates if l['page']<=figure['page']]
        anchor=sorted(before or candidates,key=lambda l:(l['page'],len(l['clause']),l['clause']))[-1]
        anchor['figures'].append(figure['id'])
        figure['coverage']='diagram_reexpressed_not_original';figure['lessonIds']=[anchor['id']]
    by_cl={}
    for l in lessons:by_cl.setdefault(l['clause'],[]).append(l)
    for sec in sections:
        options=by_cl.get(sec['id'],[])
        if options:sec['lessonIds']=[l['id'] for l in options];sec['coverage']='interactive'
        elif excluded(sec)=='deleted':sec.update(coverage='excluded_deleted',lessonIds=[])
        else:
            # Closest descendant if overview; otherwise preceding parent concept.
            candidates=[l for l in lessons if l['chapter']==sec['chapter'] and l['clause'].startswith(sec['id']+'.')]
            if not candidates:candidates=[l for l in lessons if l['chapter']==sec['chapter']]
            sec['lessonIds']=[candidates[0]['id']] if candidates else []
            sec['coverage']='cross_referenced' if candidates else 'not_functional'
    # The packet definitions are page-anchored but not TOC headings.
    return {'metadata':{'source':'User supplied SUBSET-026 chapters 1-9', 'issue':SPEC_ISSUE,
                        'version':'1.0.0','meaning':'Learning re-expression, not requirement conformance',
                        'copyright':'Only headings, figure labels, chapter/page and packet names are indexed; PDF content stays upstream',
                        'counts':{'sections':len(sections),'figures':len(figures),
                                  'activeFigures':sum(not f['deleted'] for f in figures),
                                  'packets':len(packets),'lessons':len(lessons),'modules':19}},
            'modules':[{'id':m[0],'title':m[1],'scope':m[2],'family':m[3]} for group in MODULES.values() for m in group],
            'sections':sections,'figures':figures,'packets':packets,'lessons':lessons}

def main():
    folder=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/mnt/data')
    index=curriculum(folder)
    outfile=ROOT/'public/internet-specs/esig-learning-index.json'
    outfile.parent.mkdir(parents=True,exist_ok=True)
    outfile.write_text(json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n')
    # Embed the same data in an ES module so lesson UI requires no runtime HTTP or attached PDF.
    generated=ROOT/'src/client/tutorials/course-source.js'
    generated.parent.mkdir(parents=True,exist_ok=True)
    # map only needed lesson metadata and figure IDs to the bundled runtime, not full inventory
    compact={'metadata':index['metadata'],'modules':index['modules'],
             'figures':index['figures'],'lessons':index['lessons']}
    generated.write_text('/* Generated from supplied SUBSET-026 v4.0.0 chapter PDFs. Metadata only. */\n'
                         'export const COURSE_SOURCE = '+json.dumps(compact,ensure_ascii=False,indent=2)+';\n'
                         'export const FAMILY_SPEC = '+json.dumps(FAMILY,ensure_ascii=False,indent=2)+';\n')
    csv_file=ROOT/'public/internet-specs/esig-learning-lessons.csv'
    with csv_file.open('w',newline='',encoding='utf-8') as output:
        writer=csv.writer(output)
        writer.writerow(['lesson_id','module','source_chapter','source_clause','printed_page','concept','engine_family','source_figures','complexities','fidelity'])
        for lesson in index['lessons']:
            writer.writerow([lesson['id'],lesson['moduleTitle'],lesson['chapter'],lesson['clause'],lesson['page'],lesson['title'],lesson['family'],';'.join(lesson['figures']),'simple;medium;busy','teaching_abstraction'])
    print(json.dumps(index['metadata']['counts'],indent=2))
    for mod in index['modules']:
       print(mod['id'],mod['title'],len([l for l in index['lessons'] if l['module']==mod['id']]))
    bad=[f for f in index['figures'] if not f['deleted'] and not f['lessonIds']]
    if bad:raise SystemExit(f'Unmapped figure(s): {bad}')

if __name__=='__main__':main()
