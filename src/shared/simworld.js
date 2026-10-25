import {Track,Station} from './models.js';
export class SimWorld {
  constructor({tracks,stations}, {source='synthetic-seed'}={}) {
    this.source=source; this.tracks=tracks.map(t=>new Track(t)); this.stations=stations.map(s=>new Station(s)); this.trackside=[];
    this.tracksById = new Map(this.tracks.map(t=>[t.id,t]));
  }
  setTrackside(devices) { this.trackside=[...devices]; }
}
