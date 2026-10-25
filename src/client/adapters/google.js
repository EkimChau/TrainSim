// The only Google Maps dependency boundary. Can be swapped without touching the sim engine.
export async function loadGoogleMaps(apiKey) {
  if(!apiKey)return null;
  return new Promise((resolve,reject)=>{
    const callback=`__trainsimMapReady_${Date.now()}`;
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Google Maps load timeout'));},10000);
    const script=document.createElement('script');
    const cleanup=()=>{clearTimeout(timeout);delete window[callback];};
    window[callback]=()=>{cleanup();resolve(window.google?.maps||null);};
    script.onerror=()=>{cleanup();reject(new Error('Google Maps script unavailable'));};
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=${callback}`;
    script.async=true;document.head.append(script);
  });
}
export class GoogleMapsAdaptor {
  constructor(container,maps,center) {
    this.name='Google Maps';this.maps=maps;
    this.map=new maps.Map(container,{center,zoom:12,streetViewControl:false,fullscreenControl:true});
  }
  fitWorld(world) {
    const points=world.stations;
    if(!points.length)return;
    const bounds=new this.maps.LatLngBounds();
    for(const p of points)bounds.extend({lat:p.lat,lng:p.lng});
    this.map.fitBounds(bounds,48);
  }
  addTrack(track){const line=new this.maps.Polyline({path:track.coords,geodesic:true,strokeColor:'#e96260',strokeOpacity:.90,strokeWeight:track.source==='OSM'?3:4,map:this.map});return{setVisible:on=>line.setMap(on?this.map:null),remove:()=>line.setMap(null)};}
  addPoint(kind,record){
    const icon=kind==='station'?{path:this.maps.SymbolPath.CIRCLE,scale:7,fillColor:'#77b4ff',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}:kind==='signal'?{path:'M 0 -9 L 9 8 L -9 8 Z',scale:1,fillColor:'#52e1a3',fillOpacity:1,strokeColor:'#071e14',strokeWeight:2}:{path:this.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:6,fillColor:record.color||'#ffdb52',fillOpacity:1,strokeColor:'#10151d',strokeWeight:2};
    const marker=new this.maps.Marker({map:this.map,position:record.position||record,title:record.name||record.id,icon});
    return{setVisible:on=>marker.setMap(on?this.map:null),remove:()=>marker.setMap(null),setPosition:p=>marker.setPosition(p),setAlert:alert=>{marker.setIcon({...icon,fillColor:alert?'#ff4f60':record.color||'#ffdb52'});}};
  }
}
