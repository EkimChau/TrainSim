import {el} from '../api.js';
import {LESSONS,lessonById,lessonIndex} from './lessons.js';
import {createLessonState,stepLesson,lessonSnapshot} from './engine.js';
import {flowDiagram,stateDiagram,speedLine} from './diagrams.js';

const text=(tag,value,className)=>el(tag,className?{class:className}:{},String(value));
const button=(label,attrs={})=>el('button',{type:'button',...attrs},label);
const paperCard=(title,subtitle,...body)=>el('section',{class:'paper-card'},
  el('header',{class:'paper-card-heading'},text('h2',title),subtitle?text('p',subtitle,'paper-small'):null),...body);
const row=(a,b)=>el('div',{class:'paper-row'},text('dt',a),text('dd',b));
function table(headings,records){
  return el('div',{class:'paper-table-wrap'},el('table',{class:'paper-table'},
    el('thead',{},el('tr',{},...headings.map(h=>text('th',h)))),
    el('tbody',{},...records.map(rec=>el('tr',{},...rec.map(x=>text('td',x)))))));
}
const status=(message,tone='ink')=>el('div',{class:`paper-notice paper-notice-${tone}`,role:'status','aria-live':'polite'},message);
function input(field,current){
  const attrs={name:field.id,'data-input':field.id,'aria-label':field.label};
  let control;
  if(field.kind==='boolean'){
    control=el('input',{...attrs,type:'checkbox',checked:current===true});
    return el('label',{class:'paper-toggle'},control,el('span',{class:'paper-toggle-text'},field.label),
      text('small',field.from,'paper-input-from'));
  }
  if(field.kind==='number'){
    control=el('input',{...attrs,type:'number',min:field.min,max:field.max,step:field.step??1,value:current});
  }else control=el('input',{...attrs,type:'text',maxlength:'30',value:current});
  return el('label',{class:'paper-field'},el('span',{class:'paper-label'},field.label),
    el('span',{class:'paper-input-line'},control,field.unit?text('span',field.unit,'paper-unit'):null),
    text('small',field.from,'paper-input-from'));
}
function scenarioActions(lesson){
  return el('div',{class:'paper-scenario-list'},...lesson.scenarios.map(s=>button(s.label,{
    class:`paper-action paper-action-${s.kind==='alert'?'red':'green'} paper-scenario`,
    'data-scenario':s.id,title:`Replay ${s.label}`
  })));
}
function lessonDropdown(lesson){
  return el('div',{class:'paper-lesson-picker','data-picker':'1'},
    button(`Lesson ${lesson.number} ▾`,{class:'paper-lesson-trigger',title:'Show all lessons; hover or click','aria-haspopup':'true','aria-expanded':'false','data-action':'toggle-menu'}),
    el('div',{class:'paper-lesson-menu',role:'menu',hidden:true,'aria-label':'All tutorials'},
      text('p','Choose a lesson','paper-menu-title'),
      ...LESSONS.map(item=>button(`Lesson ${item.number}  ·  ${item.short}`,{
        class:`paper-lesson-menu-item${item.id===lesson.id?' current':''}`,
        'data-lesson':item.id,role:'menuitem','aria-current':item.id===lesson.id?'page':'false'
      }))));
}
function sectionHeader(lesson){
  return el('section',{class:'paper-hero'},
    el('div',{class:'paper-hero-main'},
      el('div',{class:'paper-title-row'},lessonDropdown(lesson),
        text('h1',`— ${lesson.title}`,'paper-title'),
        el('div',{class:'paper-arrows'},
          button('‹',{class:'paper-arrow','data-action':'prev',title:'Previous lesson','aria-label':'Previous lesson'}),
          button('›',{class:'paper-arrow','data-action':'next',title:'Next lesson','aria-label':'Next lesson'}))),
      text('p',lesson.summary,'paper-hero-summary'),
      el('div',{class:'paper-tags'},
        text('span','FICTITIOUS SIMWORLD','paper-tag'),text('span','Source-linked / not certified','paper-tag'),
        text('span',`Lesson ${lesson.number} of ${String(LESSONS.length).padStart(2,'0')}`,'paper-tag'))),
    el('aside',{class:'paper-sticky'},text('h2','✧ Learning goal'),text('p',lesson.goal),
      text('small','Observe → change one input → inspect the result','paper-small')));
}
function inputsPanel(lesson,state){
  const numeric=lesson.inputs.filter(f=>f.kind!=='boolean');
  const toggles=lesson.inputs.filter(f=>f.kind==='boolean');
  return paperCard('⚙ Interactive simulator','Change one signal, then issue a command. All values are fictitious training fixtures.',
    numeric.length?el('div',{class:'paper-input-grid'},...numeric.map(f=>input(f,state.inputs[f.id]))):null,
    toggles.length?el('fieldset',{class:'paper-toggles'},el('legend',{},'Trackside and train signals'),
      ...toggles.map(f=>input(f,state.inputs[f.id]))):null,
    el('div',{class:'paper-buttons'},...lesson.actions.map(a=>button(a.label,{
      class:`paper-action paper-action-${a.tone}${a.tone==='red'?' paper-alarm-button':''}`,
      'data-command':a.id,title:a.help}))),
    text('h3','↻ Replay a corpus fixture','paper-subhead'),scenarioActions(lesson));
}
function iOTable(lesson){
  return paperCard('♧ Inputs & outputs','Each input has a named origin; outputs are derived from the same lesson state as the handheld.',
    table(['Signal / value','From / to'],[
      ...lesson.inputs.map(f=>[f.label+(f.unit?` (${f.unit})`:''),f.from]),
      ['Visible result','SimWorld state projection → desktop + reader'],
    ]));
}
function metricCard(s){return el('div',{class:'paper-metric'},text('span',s.label,'paper-metric-label'),text('strong',s.value,'paper-metric-value'));}
function outputPanel(snapshot){
  return paperCard('▥ Live function outputs','One computed projection drives every value shown on this page.',
    el('div',{class:'paper-metrics'},...snapshot.stats.map(metricCard)),
    el('div',{class:'paper-snapshot-status'},
      text('span',snapshot.status,`paper-status paper-status-${snapshot.statusTone}`),
      text('span',snapshot.reason,'paper-reason')),
    el('dl',{class:'paper-facts'},...snapshot.facts.map(s=>row(s.label,s.value))));
}
function diagramPanel(lesson,snapshot){
  const speed=snapshot.speedline;
  const renderMermaid=(title,svg,source)=>el('div',{class:'paper-diagram'},
    text('h3',title),svg,
    el('details',{class:'paper-mermaid-source'},el('summary',{},'Mermaid source ▾'),el('pre',{},source)));
  return paperCard('✎ System & state diagrams','Ink-bordered graphs highlight the current functional condition.',
    el('div',{class:'paper-graph-grid'},renderMermaid('Who sends which signal?',flowDiagram(lesson,snapshot.phase),lesson.diagrams.flow),
      renderMermaid('How state changes',stateDiagram(lesson,snapshot.phase),lesson.diagrams.state)),
    speed?el('div',{class:'paper-speedline-box'},text('h3','✈ Train progress / green speed line'),
      speedLine(speed,snapshot.phase==='TRAIN_RUNNING')):null);
}
function eventPanel(state){
  return paperCard('▤ Scenario log','Recorded steps are deterministic, ordered, and tied to this lesson only.',
    el('ol',{class:'paper-log',role:'log','aria-label':'Lesson event log'},
      ...state.events.map(entry=>el('li',{},
        text('span',`#${String(entry.n).padStart(2,'0')} · ${entry.actor}`,'paper-log-meta'),
        text('span',entry.message,`paper-log-message paper-log-${entry.tone}`)))),
    button('Copy event log',{class:'paper-action paper-action-neutral','data-action':'copy-log'}));
}
function handheld(snapshot,lesson){
  const items=[...snapshot.readerRows];
  return el('aside',{class:'paper-reader-wrap','aria-label':'SimWorld handheld reader'},
    el('div',{class:'paper-reader-antenna'}),
    el('div',{class:'paper-reader'},
      el('div',{class:'paper-reader-grip'},text('span','SimWorld','paper-reader-logo'),text('span','▂▅▇  ▰','paper-reader-signal')),
      el('div',{class:'paper-reader-screen'},
        el('div',{class:'paper-reader-banner','data-tone':snapshot.statusTone},snapshot.status),
        text('h2',snapshot.readerHeader,'paper-reader-heading'),
        el('dl',{class:'paper-reader-rows'},...items.map(s=>row(s.label,s.value))),
        el('div',{class:'paper-reader-footer'},
          text('strong',`LESSON ${lesson.number}`),text('span',snapshot.phase.replaceAll('_',' ')),
          text('small','Fictitious / teaching values'))),
      el('div',{class:'paper-reader-keys'},
        el('span',{},'◀'),el('span',{},'≡'),el('span',{},'OK'))),
    text('p','Handheld reader · derived from exactly the same state as the desktop cards.','paper-reader-caption'));
}
function footer(lesson){
  return paperCard('✏ Notebook margin','Where these ideas came from and what this lesson does not claim.',
    text('p',lesson.boundary,'paper-limit'),
    text('h3','Pinned source references','paper-subhead'),
    el('ul',{class:'paper-sources'},...lesson.source.map(s=>el('li',{},s))));
}

export class TutorialsView{
  constructor(host=document.getElementById('view-tutorials')){
    if(!host)throw new Error('Tutorial view mount point missing');
    this.host=host;
    this.state=createLessonState('ma');
    this.replayToken=0;
    this.notice='Click a control to inspect how the result changes.';
    this.noticeTone='ink';
    this.flashCommand='';
    this.hoverTimer=null;
    this.host.addEventListener('click',event=>this.click(event));
    this.host.addEventListener('change',event=>this.change(event));
    this.host.addEventListener('pointerover',event=>{
      if(event.target.closest('[data-picker]'))this.menu(true);
    });
    this.host.addEventListener('pointerout',event=>{
      const picker=event.target.closest('[data-picker]');
      if(picker&&!picker.contains(event.relatedTarget))this.hoverTimer=setTimeout(()=>this.menu(false),180);
    });
    this.host.addEventListener('keydown',event=>{
      if(event.key==='Escape')this.menu(false);
    });
    document.addEventListener('click',event=>{
      if(!this.host.contains(event.target))this.menu(false);
    });
    this.render();
  }
  activate(params=new URLSearchParams()){
    const lesson=params.get('lesson');
    if(lesson&&LESSONS.some(l=>l.id===lesson)&&this.state.lessonId!==lesson)this.selectLesson(lesson,false);
  }
  menu(open){
    clearTimeout(this.hoverTimer);
    const menu=this.host.querySelector('.paper-lesson-menu');
    const trigger=this.host.querySelector('.paper-lesson-trigger');
    if(!menu||!trigger)return;
    menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
  }
  setNotice(message,tone='ink',command=''){
    this.notice=message;this.noticeTone=tone;this.flashCommand=command;
    this.render();
  }
  selectLesson(id,updateHash=true,trigger=""){
    this.replayToken++;
    const lesson=lessonById(id);
    this.state=createLessonState(lesson.id);
    this.notice=`Opened Lesson ${lesson.number}: ${lesson.short}`;
    this.noticeTone='blue';this.flashCommand=trigger;
    this.render();
    this.host.scrollTop=0;
    if(updateHash)location.hash=`#/tutorials?lesson=${lesson.id}`;
  }
  move(offset){
    const idx=lessonIndex(this.state.lessonId);
    const next=(idx+offset+LESSONS.length)%LESSONS.length;
    this.selectLesson(LESSONS[next].id,true,offset>0?'next':'prev');
  }
  async replay(id){
    const lesson=lessonById(this.state.lessonId);
    const scenario=lesson.scenarios.find(s=>s.id===id);
    if(!scenario)return;
    const ticket=++this.replayToken;
    this.state=createLessonState(lesson.id);
    this.notice=`Replaying: ${scenario.label}`;this.noticeTone=scenario.kind==='alert'?'danger':'ok';
    this.flashCommand=`scenario:${id}`;this.render();
    for(const step of scenario.steps){
      await new Promise(resolve=>setTimeout(resolve,320));
      if(ticket!==this.replayToken)return;
      const command=step.set?{type:'set',values:step.set}:{type:step.action};
      this.state=stepLesson(this.state,command);
      this.notice=this.state.feedback?.message??'Scenario step complete';
      this.noticeTone=this.state.feedback?.tone==='danger'?'danger':'ok';
      this.flashCommand=step.action??'';
      this.render();
    }
    if(ticket===this.replayToken){
      this.notice=`${scenario.label} — completed. Compare the outputs with expected state: ${scenario.expect.phase}.`;
      this.noticeTone='ok';this.render();
    }
  }
  click(event){
    const target=event.target.closest('button');
    if(!target||!this.host.contains(target))return;
    const {action,lesson,command,scenario}=target.dataset;
    if(action==='toggle-menu'){
      const isOpen=this.host.querySelector('.paper-lesson-trigger')?.getAttribute('aria-expanded')==='true';
      this.menu(!isOpen);
      // Keep hover navigation and click-to-toggle as separate, discoverable paths.
      this.notice='Lesson index toggled — choose a lesson to open.';
      this.noticeTone='blue';
      const feedback=this.host.querySelector('.paper-interaction-feedback');
      if(feedback){feedback.textContent=this.notice;feedback.dataset.tone='blue';}
      target.classList.remove('paper-click-flash');void target.offsetWidth;target.classList.add('paper-click-flash');
      return;
    }
    if(lesson){this.selectLesson(lesson);return;}
    if(action==='prev'||action==='next'){this.move(action==='prev'?-1:1);return;}
    if(action==='copy-log'){
      const content=this.state.events.map(e=>`#${e.n} [${e.actor}] ${e.message}`).join('\n');
      if(navigator.clipboard?.writeText){navigator.clipboard.writeText(content).then(()=>this.setNotice('Event log copied','ok','copy-log'))
        .catch(()=>this.setNotice('Clipboard unavailable — select and copy the visible log','danger','copy-log'));}
      else this.setNotice('Clipboard unavailable — select and copy the visible log','warn','copy-log');
      return;
    }
    if(scenario){this.replay(scenario);return;}
    if(command){
      this.replayToken++;
      this.state=stepLesson(this.state,{type:command});
      this.notice=this.state.feedback?.message??`${command} pressed`;
      this.noticeTone=command==='advance'?'ok':command==='occupy'?'danger':this.state.feedback?.tone==='danger'?'danger':'blue';
      this.flashCommand=command;this.render();return;
    }
    this.setNotice('Action selected','blue');
  }
  change(event){
    const id=event.target.dataset.input;
    if(!id)return;
    this.replayToken++;
    const raw=event.target.type==='checkbox'?event.target.checked:event.target.value;
    try{
      this.state=stepLesson(this.state,{type:'set',values:{[id]:raw}});
      this.notice=`Input updated: ${event.target.closest('label')?.textContent?.trim()?.split('\n')[0]||id}`;
      this.noticeTone='blue';this.flashCommand=`input:${id}`;this.render();
    }catch(error){
      this.notice=`Invalid input: ${error.message}`;this.noticeTone='danger';this.flashCommand=`input:${id}`;this.render();
    }
  }
  render(){
    const lesson=lessonById(this.state.lessonId);
    const snapshot=lessonSnapshot(this.state);
    const outer=el('div',{class:'paper-book'},sectionHeader(lesson),
      el('div',{class:'paper-main'},
        el('div',{class:'paper-column paper-controls'},inputsPanel(lesson,this.state),iOTable(lesson)),
        el('div',{class:'paper-column paper-workbench'},
          outputPanel(snapshot),diagramPanel(lesson,snapshot),eventPanel(this.state),footer(lesson)),
        handheld(snapshot,lesson)),
      el('div',{class:'paper-interaction-feedback','data-tone':this.noticeTone,role:'status','aria-live':'polite'},this.notice));
    this.host.replaceChildren(outer);
    // All dynamic values, including handheld and graphs, come from this snapshot.
    const key=this.flashCommand;
    const selector=key.startsWith('scenario:')?`[data-scenario="${key.slice(9)}"]`:
      key.startsWith('input:')?`[data-input="${key.slice(6)}"]`:
      ['prev','next','copy-log'].includes(key)?`[data-action="${key}"]`:`[data-command="${key}"]`;
    const selected=key&&this.host.querySelector(selector);
    if(selected){selected.classList.add('paper-click-flash');
      if(this.flashCommand==='advance')this.host.querySelector('.paper-speedline-box')?.classList.add('paper-speedline-flash');}
  }
}