// Base map: Google Maps (with an API key) plus a deck.gl overlay, or a keyless
// fallback that draws OpenStreetMap raster tiles with deck.gl. Both use Web
// Mercator, so OSM-derived geometry lines up exactly with the base map.
import {Deck,WebMercatorViewport} from '@deck.gl/core';
import {BitmapLayer} from '@deck.gl/layers';
import {TileLayer} from '@deck.gl/geo-layers';
import {GoogleMapsOverlay} from '@deck.gl/google-maps';

export const SEQ_VIEW={latitude:-27.32,longitude:152.98,zoom:10};

export function rasterLayer(id,url,{opacity=1,maxZoom=19,visible=true}={}){
  return new TileLayer({
    id,data:url,minZoom:0,maxZoom,tileSize:256,opacity,visible,
    onTileError:()=>{}, // offline or blocked tiles just stay blank
    renderSubLayers:props=>{
      const {boundingBox}=props.tile;
      return new BitmapLayer(props,{data:null,image:props.data,bounds:[boundingBox[0][0],boundingBox[0][1],boundingBox[1][0],boundingBox[1][1]]});
    },
  });
}

function loadGoogle(key){
  if(window.google?.maps?.Map)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const cb='__trainsimGoogle'+Date.now();
    window[cb]=()=>{delete window[cb];resolve();};
    const s=document.createElement('script');
    s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`;
    s.async=true;s.onerror=()=>reject(new Error('Google Maps failed to load'));
    window.gm_authFailure=()=>reject(new Error('Google Maps rejected the API key'));
    document.head.append(s);
  });
}

// Hide Google's own transit lines and POIs so the railway overlay reads cleanly.
const PLAIN_STYLE=[
  {featureType:'transit.line',stylers:[{visibility:'off'}]},
  {featureType:'transit.station.rail',stylers:[{visibility:'off'}]},
  {featureType:'poi',stylers:[{visibility:'off'}]},
];

/**
 * @returns {Promise<{kind,setLayers,onView,fit,flyTo,setType,view}>}
 */
export async function createBasemap(container,{mapsApiKey,mapId},{onView,onClick,getTooltip,initial=SEQ_VIEW}){
  if(mapsApiKey){
    try{return await googleBasemap(container,{mapsApiKey,mapId},{onView,onClick,getTooltip,initial});}
    catch(e){console.warn(e);container.replaceChildren();}
  }
  return osmBasemap(container,{onView,onClick,getTooltip,initial});
}

async function googleBasemap(container,{mapsApiKey,mapId},{onView,onClick,getTooltip,initial}){
  await loadGoogle(mapsApiKey);
  const map=new google.maps.Map(container,{
    center:{lat:initial.latitude,lng:initial.longitude},zoom:Math.round(initial.zoom),
    mapTypeId:'roadmap',...(mapId?{mapId}:{styles:PLAIN_STYLE}),
    streetViewControl:false,fullscreenControl:false,mapTypeControl:false,clickableIcons:false,gestureHandling:'greedy',
    zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_BOTTOM},
  });
  const overlay=new GoogleMapsOverlay({interleaved:!!mapId,layers:[],onClick,getTooltip,pickingRadius:6});
  overlay.setMap(map);
  const view=()=>{
    const b=map.getBounds();if(!b)return null;
    const sw=b.getSouthWest(),ne=b.getNorthEast(),c=map.getCenter();
    return {bbox:[sw.lng(),sw.lat(),ne.lng(),ne.lat()],zoom:map.getZoom(),lat:c.lat(),lon:c.lng()};
  };
  map.addListener('idle',()=>{const v=view();if(v)onView(v);});
  return {
    kind:'google',view,
    setLayers:layers=>overlay.setProps({layers}),
    fit:([w,s,e,n])=>map.fitBounds({west:w,south:s,east:e,north:n},40),
    flyTo:(lat,lon,zoom)=>{map.panTo({lat,lng:lon});if(zoom)map.setZoom(zoom);},
    setType:t=>map.setMapTypeId(t),
  };
}

function osmBasemap(container,{onView,onClick,getTooltip,initial}){
  let viewState={...initial,zoom:initial.zoom-1,pitch:0,bearing:0};
  let overlayLayers=[];
  const base=rasterLayer('osm-base','https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19});
  const deck=new Deck({
    parent:container,initialViewState:viewState,controller:{doubleClickZoom:true,dragRotate:false,touchRotate:false},
    layers:[base],onClick,getTooltip,pickingRadius:6,
    onViewStateChange:({viewState:vs})=>{viewState=vs;schedule();return vs;},
    style:{position:'absolute',inset:0},
  });
  let timer=null;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{const v=view();if(v)onView(v);},180);};
  const view=()=>{
    const vp=new WebMercatorViewport({...viewState,width:container.clientWidth||800,height:container.clientHeight||600});
    const [w,s,e,n]=vp.getBounds();
    // deck.gl zoom counts 512 px tiles; slippy-map (and Google) zoom counts 256 px tiles.
    return {bbox:[w,s,e,n],zoom:Math.round(viewState.zoom+1),lat:viewState.latitude,lon:viewState.longitude};
  };
  const go=vs=>{viewState={...viewState,...vs,transitionDuration:500};deck.setProps({initialViewState:viewState});schedule();};
  setTimeout(schedule,50);
  return {
    kind:'osm',view,
    setLayers:layers=>{overlayLayers=layers;deck.setProps({layers:[base,...overlayLayers]});},
    fit:([w,s,e,n])=>{
      const vp=new WebMercatorViewport({width:container.clientWidth||800,height:container.clientHeight||600});
      const {longitude,latitude,zoom}=vp.fitBounds([[w,s],[e,n]],{padding:40});
      go({longitude,latitude,zoom:Math.min(zoom,17)});
    },
    flyTo:(lat,lon,zoom)=>go({latitude:lat,longitude:lon,...(zoom?{zoom:zoom-1}:{})}),
    setType:()=>{},
  };
}
