// Google content stays in this page's memory; bookmarks persist place IDs only.
let apiKey='',loading=null;
const locations=new Map(),pending=new Map(),cityCenters=new Map();
export function configureGoogleMaps(key){apiKey=String(key||'');}
export function clearGoogleLocations(){locations.clear();pending.clear();cityCenters.clear();}
export function googleLocation(place){return place?.googlePlaceId?{...place,lat:null,lng:null,...locations.get(place.googlePlaceId)}:place;}
export function loadGoogleMaps(){
  if(!apiKey)return Promise.reject(new Error('Google 지도 키 설정이 필요해요.'));
  if(globalThis.google?.maps?.Map)return Promise.resolve(globalThis.google.maps);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let timer;
    const failed=()=>{clearTimeout(timer);script.remove();delete globalThis.travelGoogleReady;loading=null;reject(new Error('Google 지도를 불러오지 못했어요. API 키·허용 사이트·결제·API 활성화를 확인해주세요.'));};
    globalThis.travelGoogleReady=()=>{clearTimeout(timer);delete globalThis.travelGoogleReady;resolve(globalThis.google.maps);};
    const url=new URL('https://maps.googleapis.com/maps/api/js');url.search=new URLSearchParams({key:apiKey,loading:'async',callback:'travelGoogleReady',v:'weekly',language:'ko',libraries:'places'});
    script.src=url.href;script.async=true;script.onerror=failed;timer=setTimeout(failed,18000);document.head.append(script);
  });
  return loading;
}
function coordinates(location){return location?{lat:typeof location.lat==='function'?location.lat():location.lat,lng:typeof location.lng==='function'?location.lng():location.lng}:null;}
export async function searchGooglePlaces(textQuery){
  await loadGoogleMaps();const {Place}=await google.maps.importLibrary('places');
  const {places}=await Place.searchByText({textQuery,fields:['id','displayName','formattedAddress','location','types'],maxResultCount:6,language:'ko'});
  return (places||[]).filter(p=>p.location).map(p=>{
    const position=coordinates(p.location);locations.set(p.id,position);
    const area=(p.types||[]).some(t=>['locality','sublocality','sublocality_level_1','sublocality_level_2','postal_code','administrative_area_level_1','administrative_area_level_2','country','neighborhood','route'].includes(t))&&!(p.types||[]).some(t=>['establishment','point_of_interest','premise','street_address','lodging'].includes(t));
    return {name:p.displayName||textQuery,address:p.formattedAddress||'',...position,googlePlaceId:p.id,precision:area?'area':'place',source:'Google Places',link:'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:textQuery,query_place_id:p.id})};
  });
}
export async function resolveGooglePlaces(places){
  const ids=[...new Set(places.map(p=>p.googlePlaceId).filter(Boolean))].filter(id=>!locations.has(id));
  if(!ids.length)return false;
  await loadGoogleMaps();const {Place}=await google.maps.importLibrary('places');
  const results=await Promise.allSettled(ids.map(id=>{
    if(!pending.has(id))pending.set(id,(async()=>{const place=new Place({id});await place.fetchFields({fields:['location']});const position=coordinates(place.location);if(position)locations.set(id,position);return Boolean(position);})().finally(()=>pending.delete(id)));
    return pending.get(id);
  }));
  return results.some(r=>r.status==='fulfilled'&&r.value);
}
export async function googleCityCenter(city,country){
  const query=`${city} ${country}`;
  if(!cityCenters.has(query))cityCenters.set(query,searchGooglePlaces(query).then(results=>results[0]?{lat:results[0].lat,lng:results[0].lng}:null).catch(()=>null));
  return cityCenters.get(query);
}
export async function createGoogleMap(node,{center,zoom=14,onClick}){
  const g=await loadGoogleMaps();
  const canvas=new g.Map(node,{center,zoom,streetViewControl:false,mapTypeControl:false,fullscreenControl:true,gestureHandling:'cooperative',clickableIcons:false});
  let markers=[],path=null,disposed=false;
  const listener=onClick?canvas.addListener('click',e=>onClick(coordinates(e.latLng))):null;
  class NumberPin extends g.OverlayView{
    constructor(position,label,title,active,click){super();this.position=position;this.label=label;this.title=title;this.active=active;this.click=click;this.setMap(canvas);}
    onAdd(){const button=document.createElement('button');button.type='button';button.className='google-number-pin'+(this.active?' active':'');button.textContent=this.label;button.title=this.title;button.setAttribute('aria-label',this.title);button.onclick=e=>{e.stopPropagation();this.click?.();};g.OverlayView.preventMapHitsAndGesturesFrom(button);this.element=button;this.getPanes().overlayMouseTarget.append(button);}
    draw(){if(!this.element)return;const point=this.getProjection().fromLatLngToDivPixel(new g.LatLng(this.position));this.element.style.left=point.x+'px';this.element.style.top=point.y+'px';}
    onRemove(){if(this.element){this.element.onclick=null;this.element.remove();}}
  }
  return {provider:'google',node,
    update({center,zoom=14,pins=[],line=[],boundsPoints=line}){
      if(disposed)return;g.event.trigger(canvas,'resize');markers.forEach(m=>m.setMap(null));markers=pins.map(p=>new NumberPin(p.position,p.label,p.title,p.active,p.onClick));path?.setMap(null);
      path=line.length>1?new g.Polyline({map:canvas,path:line,strokeOpacity:0,icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:.8,strokeColor:'#527cbd',scale:3},offset:'0',repeat:'16px'}]}):null;
      if(boundsPoints.length>1){const bounds=new g.LatLngBounds();boundsPoints.forEach(p=>bounds.extend(p));canvas.fitBounds(bounds,45);g.event.addListenerOnce(canvas,'idle',()=>{if(!disposed&&canvas.getZoom()>16)canvas.setZoom(16);});}
      else {canvas.setCenter(center);canvas.setZoom(zoom);}
    },
    setPoint(position){this.update({center:position,zoom:17,pins:[{position,label:'●',title:'확인한 위치'}]});},
    remove(){disposed=true;listener?.remove();markers.forEach(m=>m.setMap(null));path?.setMap(null);g.event.clearInstanceListeners(canvas);node.replaceChildren();},
    stop(){},invalidateSize(){if(!disposed)g.event.trigger(canvas,'resize');}
  };
}
