import {api,toast} from '../api.js';

const $=id=>document.getElementById(id);
const ZONE='Australia/Brisbane';
const MAX_SPEED=3600;
const SERVICE_TIME=new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function formatServiceTime(serviceDate,seconds){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)||!Number.isInteger(seconds)||seconds<0)
    throw new TypeError('Invalid GTFS service time');
  const dayOffset=Math.floor(seconds/86400);
  const date=new Date(`${serviceDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+dayOffset);
  date.setUTCHours(Math.floor(seconds%86400/3600),Math.floor(seconds%3600/60));
  const time=SERVICE_TIME.format(date);
  return dayOffset?`${time} (+${dayOffset}d)`:time;
}

function brisbaneNow(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-AU',{
    timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date()).map(part=>[part.type,part.value]));
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
}

function dateTime(value){
  return new Intl.DateTimeFormat('en-AU',{
    timeZone:'UTC',weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).format(new Date(value));
}

function dateKey(value){return new Date(value).toISOString().slice(0,10);}

export class TimeSimulation{
  constructor({onFrame}){
    this.onFrame=onFrame;
    this.now=brisbaneNow();
    this.value=this.now;
    this.min=this.withYear(this.now,-2);
    this.max=this.withYear(this.now,2);
    this.timer=null;
    this.playing=false;
    this.loaded=false;
    this.trains=[];
    this.request=0;
    this.lastError='';
    const slider=$('time-slider');
    slider.min=String(this.min);slider.max=String(this.max);slider.step='1000';slider.value=String(this.value);
    $('time-min').textContent=`${dateKey(this.min)} · 2 years back`;
    $('time-max').textContent=`${dateKey(this.max)} · 2 years ahead`;
    slider.addEventListener('input',()=>this.setValue(Number(slider.value),false));
    slider.addEventListener('change',()=>this.fetchTime());
    const speedSlider=$('time-speed');
    speedSlider.min='1';speedSlider.max=String(MAX_SPEED);speedSlider.step='1';speedSlider.value='1';
    speedSlider.addEventListener('input',()=>this.updateSpeedLabel());
    $('time-play').addEventListener('click',()=>this.play());
    $('time-pause').addEventListener('click',()=>this.pause());
    $('time-stop').addEventListener('click',()=>this.stop());
    $('sim-tab-time').addEventListener('click',()=>this.onMode?.('time'));
    $('sim-tab-single').addEventListener('click',()=>this.onMode?.('single'));
    this.setValue(this.value,false);
    this.updateSpeedLabel();
    this.updateControls();
  }

  withYear(value,offset){
    const date=new Date(value);
    date.setUTCFullYear(date.getUTCFullYear()+offset);
    return date.getTime();
  }

  async load(){
    try{
      this.status=await api('/map/calendar/status');
      this.loaded=!!this.status.available;
      $('time-status').textContent=this.loaded
        ?`Translink GTFS · ${this.status.trips.toLocaleString()} train trips · ${this.status.holidays} Queensland holidays`
        :'Timetable not loaded. Run npm run ingest:translink to fetch the official SEQ feed.';
      this.updateControls();
      if(this.loaded)await this.fetchTime();
    }catch(error){
      $('time-status').textContent=`Timetable unavailable: ${error.message}`;
      this.loaded=false;this.updateControls();
    }
  }

  setModeHandler(handler){this.onMode=handler;}

  updateSpeedLabel(){
    const speed=Number($('time-speed').value)||1;
    $('time-speed-value').textContent=speed===1
      ?'Real time · 1×'
      :speed===MAX_SPEED
        ?'1 hour / second · 3,600×'
        :`${speed.toLocaleString()}× real time`;
  }

  setValue(value,fetch=true){
    this.value=Math.max(this.min,Math.min(this.max,Math.round(value/1000)*1000));
    $('time-slider').value=String(this.value);
    $('time-current').textContent=dateTime(this.value);
    $('sim-tick').textContent=dateTime(this.value);
    if(fetch)this.fetchTime();
  }

  async fetchTime(){
    if(!this.loaded)return;
    const request=++this.request,date=dateKey(this.value),current=new Date(this.value);
    const time=current.getUTCHours()*3600+current.getUTCMinutes()*60+current.getUTCSeconds();
    try{
      const data=await api('/map/calendar',{query:{date,time}});
      if(request!==this.request)return;
      this.trains=data.trains;
      const holiday=data.holidays.length?` · ${data.holidays.map(h=>h.name).join(', ')}`:'';
      $('time-status').textContent=`${data.trains.length} trains running · ${this.status.trips.toLocaleString()} scheduled${holiday}`;
      this.lastError='';
      this.onFrame();
    }catch(error){
      if(request!==this.request)return;
      this.trains=[];
      $('time-status').textContent=`Timetable unavailable: ${error.message}`;
      if(this.lastError!==error.message){toast(error.message,'error');this.lastError=error.message;}
      this.onFrame();
    }
  }

  play(){
    if(!this.loaded||this.playing)return;
    if(this.value>=this.max)this.setValue(this.min,false);
    this.playing=true;
    this.lastStep=performance.now();
    this.timer=setInterval(()=>this.step(),250);
    this.updateControls();
  }

  pause(){
    if(!this.playing)return;
    this.playing=false;clearInterval(this.timer);this.timer=null;
    this.updateControls();
  }

  step(){
    const now=performance.now();
    const elapsed=(now-this.lastStep)/1000;
    this.lastStep=now;
    const speed=Number($('time-speed').value)||1;
    const next=Math.min(this.max,this.value+elapsed*speed*1000);
    this.setValue(next,false);
    this.fetchTime();
    if(this.value>=this.max)this.pause();
  }

  stop(){
    this.pause();
    this.now=brisbaneNow();
    this.setValue(this.now,false);
    this.fetchTime();
  }

  updateControls(){
    $('time-play').disabled=!this.loaded||this.playing;
    $('time-pause').disabled=!this.playing;
    $('time-stop').disabled=!this.loaded;
    $('time-slider').disabled=!this.loaded;
    $('time-play').hidden=this.playing;
    $('time-pause').hidden=!this.playing;
  }

  trainsNow(){return this.trains;}
}
