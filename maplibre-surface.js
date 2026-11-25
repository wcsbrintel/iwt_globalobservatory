/* Public MAP/GLOBE use the exact MapLibre/CARTO styles used by NIMF. */
window.ObservatoryBasemap=(()=>{
 const style=theme=>'https://basemaps.cartocdn.com/gl/'+(theme==='light'?'positron':'dark-matter')+'-gl-style/style.json';
 let layer,theme='dark';
 let notice;
 const credit='<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a> | © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
 function localizeNotice(){if(notice)notice.textContent=({pt:'MapLibre requer WebGL. Ative a aceleração gráfica do navegador para visualizar o mapa CARTO. Os registros continuam disponíveis na lista.',en:'MapLibre requires WebGL. Enable browser graphics acceleration to view the CARTO map. Records remain available in the list.',es:'MapLibre requiere WebGL. Active la aceleración gráfica del navegador para ver el mapa CARTO. Los registros siguen disponibles en la lista.'})[document.getElementById('language').value]||'';}
 function init(map){
  try {layer=L.maplibreGL({style:style(theme),interactive:false,attribution:credit});layer.addTo(map);window.SeizureHotspots?.bindMap(layer.getMaplibreMap?.());}
  catch(error){if(layer){try{map.removeLayer(layer);}catch{}}layer=null;notice=document.createElement('div');notice.className='map-engine-notice';notice.setAttribute('role','status');map.getContainer().append(notice);localizeNotice();console.warn('MapLibre could not initialize WebGL.',error);}
  map.attributionControl.setPrefix(false);
 }
 function setTheme(next){localizeNotice();if(next===theme)return;theme=next;if(layer)layer.getMaplibreMap().setStyle(style(theme));}
 return {init,setTheme,style};
})();
/* A stable 3D star sphere projected into a decorative background; no map data. */
function createObservatoryGlobeSpace(host,map){
 const STAR_COUNT=20000,stars=[];
 let seed=20261125;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<STAR_COUNT;i++){
  const z=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-z*z);
  stars.push({x:r*Math.cos(a),y:r*Math.sin(a),z,brightness:.12+Math.pow(random(),2)*.68,size:.32+Math.pow(random(),5)*1.05});
 }
 let theme='dark',cached='',key='';
 const draw=()=>{
  host.style.backgroundColor=theme==='dark'?'#05070d':'#e8e8e8';
  // Keep the actual MapLibre canvas transparent outside the planet in both themes.
  map.getCanvas().style.backgroundColor='transparent';
  map.getCanvasContainer().style.backgroundColor='transparent';
  if(theme!=='dark'){host.style.backgroundImage='none';return;}
  const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
  if(w<2||h<2)return;
  const next=w+'x'+h;
  if(next!==key){
   const dpr=Math.min(window.devicePixelRatio||1,2,2048/Math.max(w,h));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
   const ctx=canvas.getContext('2d');
   if(!ctx)return;
   ctx.scale(dpr,dpr);
   const focal=h*.66;
   for(const star of stars){
    if(star.z<=0)continue;
    const x=w/2+star.x/star.z*focal,y=h/2+star.y/star.z*focal;
    if(x<0||x>w||y<0||y>h)continue;
    ctx.fillStyle='rgba(224,235,255,'+star.brightness+')';
    ctx.beginPath();ctx.arc(x,y,star.size,0,Math.PI*2);ctx.fill();
   }
   cached=canvas.toDataURL('image/png');key=next;
  }
  host.style.backgroundImage='url("'+cached+'")';
  host.style.backgroundSize='100% 100%';
  host.style.backgroundRepeat='no-repeat';
 };
 map.on('resize',draw);
 draw();
 return {setTheme(next){theme=next;draw();}};
}
/* Premultiplied-alpha compositing: fade the completed CARTO base once, before
   operational layers are drawn. Do not fade markers, route lines or KDE. */
function observatoryGlobeOpacityLayer(){
 const OPACITY=.8;
 let program=null,vao=null;
 function shader(gl,type,source){
  const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw Error(error);}
  return sh;
 }
 return {id:'observatory-globe-opacity',type:'custom',renderingMode:'2d',
  onAdd(map,gl){
   let vs,fs;
   try{
    vs=shader(gl,gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}');
    fs=shader(gl,gl.FRAGMENT_SHADER,'#version 300 es\nprecision mediump float;out vec4 color;void main(){color=vec4(0.0);}');
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    vao=gl.createVertexArray();
    if(!vao)throw Error('No vertex array');
   }catch(error){if(program)gl.deleteProgram(program);program=null;console.warn('Globe opacity unavailable; base remains opaque.',error);}
   finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
  },
  render(gl){
   if(!program||!vao)return;
   // MapLibre resets its GL state after custom-layer rendering.
   gl.disable(gl.DEPTH_TEST);gl.disable(gl.STENCIL_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
   gl.colorMask(true,true,true,true);gl.depthMask(false);
   gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);
   gl.blendColor(0,0,0,OPACITY);
   gl.blendFuncSeparate(gl.ZERO,gl.CONSTANT_ALPHA,gl.ZERO,gl.CONSTANT_ALPHA);
   gl.useProgram(program);gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,3);
   gl.bindVertexArray(null);gl.blendColor(0,0,0,0);
  },
  onRemove(map,gl){if(program)gl.deleteProgram(program);if(vao)gl.deleteVertexArray(vao);program=null;vao=null;}
 };
}
/* Rear hemisphere outlines and routes: use the same globe projection and
   horizon test as the native MapLibre markers. Purely decorative, no hit testing. */
function createObservatoryRearGlobe(map,host,M){
 const canvas=document.createElement('canvas');
 canvas.className='observatory-globe-rear';
 canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'0'});
 map.getCanvasContainer().append(canvas);
 const ctx=canvas.getContext('2d');
 let rings=[],paths=[],theme='dark',revision=0,lastKey='',removed=false;
 const coord=p=>M.LngLat.convert(p);
 const hidden=p=>map.transform.isLocationOccluded(coord(p));
 const screen=p=>map.project(coord(p));
 function edge(a,b,aHidden){
  let lo=a,hi=b;
  for(let i=0;i<7;i++){
   const mid=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];
   if(hidden(mid)===aHidden)lo=mid;else hi=mid;
  }
  return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];
 }
 function trace(lines){
  ctx.beginPath();
  for(const line of lines){
   let prev=null,prevHidden=false,active=false;
   for(const raw of line){
    const p=[prev?raw[0]+360*Math.round((prev[0]-raw[0])/360):raw[0],raw[1]];
    const isHidden=hidden(p);
    if(prev&&isHidden!==prevHidden){
     const q=screen(edge(prev,p,prevHidden));
     if(Number.isFinite(q.x)&&Number.isFinite(q.y)){
      if(prevHidden&&active)ctx.lineTo(q.x,q.y);
      else if(isHidden){ctx.moveTo(q.x,q.y);active=true;}
     }
    }
    if(isHidden){
     const q=screen(p);
     if(Number.isFinite(q.x)&&Number.isFinite(q.y)){
      if(active)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);
      active=true;
     }else active=false;
    }else active=false;
    prev=p;prevHidden=isHidden;
   }
  }
  ctx.stroke();
 }
 function draw(){
  if(!ctx||removed)return;
  const w=host.clientWidth,h=host.clientHeight,zoom=map.getZoom();
  if(!w||!h)return;
  const c=map.getCenter(),dpr=Math.min(window.devicePixelRatio||1,1.5);
  const key=[w,h,dpr,c.lng,c.lat,zoom,map.getPitch(),map.getBearing(),theme,revision].join('|');
  if(key===lastKey)return;lastKey=key;
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  // In local-scale views rear geography should not masquerade as local data.
  const fade=Math.max(0,Math.min(1,(5-zoom)/1.5));
  if(!fade)return;
  ctx.lineJoin='round';ctx.lineCap='round';
  ctx.globalAlpha=.10*fade;ctx.lineWidth=.85;
  ctx.strokeStyle=theme==='dark'?'#c7dce9':'#233f4c';
  trace(rings);
  ctx.strokeStyle=window.DocumentedRoutes.visual(theme).color;ctx.lineWidth=1.5;
  trace(paths);
  ctx.globalAlpha=1;
 }
 map.on('render',draw);
 fetch('globe-rear-boundaries.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(data=>{
  if(removed)return;rings=Array.isArray(data.rings)?data.rings:[];revision++;map.triggerRepaint();
 }).catch(error=>console.warn('Rear globe boundaries unavailable.',error));
 return {setTheme(next){if(theme!==next){theme=next;revision++;map.triggerRepaint();}},
  setRoutes(next){paths=next.flatMap(d=>window.DocumentedRoutes.paths(d).map(line=>line.map(p=>[p[1],p[0]])));revision++;map.triggerRepaint();},
  remove(){removed=true;map.off('render',draw);canvas.remove();}
 };
}
/* Adapt the existing dashboard view contract to MapLibre, without another case store. */
window.Globe=function(host){
 const M=window.maplibregl,props={},markers=[],decorations=[];
 let theme='dark',routes=[],queued=false;
 const map=new M.Map({container:host,style:window.ObservatoryBasemap.style(theme),center:[5,14],zoom:1,projection:{type:'globe'},attributionControl:false});
 map.addControl(new M.AttributionControl());
 const space=createObservatoryGlobeSpace(host,map);
 const rear=createObservatoryRearGlobe(map,host,M);
 const opacityId='observatory-globe-opacity',kdeId='seizure-hotspots-kde',routeId='documented-routes';
 function installGlobeOpacity(){
  try{
   if(!map.getLayer(opacityId))map.addLayer(observatoryGlobeOpacityLayer());
   // Render operational overlays after the opacity pass, even after style reloads.
   if(map.getLayer(kdeId))map.moveLayer(kdeId);
   if(map.getLayer(routeId))map.moveLayer(routeId);
  }catch(error){console.warn('Globe opacity setup unavailable.',error);}
 }
 window.SeizureHotspots?.bindMap(map);
 map.on('style.load',installGlobeOpacity);
 map.on('webglcontextrestored',()=>{if(map.getLayer(opacityId))map.removeLayer(opacityId);installGlobeOpacity();});
 const clear=list=>{for(const marker of list)marker.remove();list.length=0;};
 const updateRoutes=()=>{
  if(!map.isStyleLoaded()){if(!queued){queued=true;map.once('idle',()=>{queued=false;updateRoutes();});}return;}
  map.setProjection({type:'globe'});
  const data={type:'FeatureCollection',features:routes.map(d=>({type:'Feature',properties:{id:d.id},geometry:{type:'MultiLineString',coordinates:window.DocumentedRoutes.paths(d).map(path=>path.map(p=>[p[1],p[0]]))}}))};
  if(map.getSource('documented-routes'))map.getSource('documented-routes').setData(data);
  else {map.addSource('documented-routes',{type:'geojson',data});map.addLayer({id:'documented-routes',type:'line',source:'documented-routes',paint:{'line-color':window.DocumentedRoutes.visual(theme).color,'line-width':2.5}});}
  map.setPaintProperty('documented-routes','line-color',window.DocumentedRoutes.visual(theme).color);
 };
 map.on('style.load',updateRoutes);
 map.on('click','documented-routes',e=>{const d=routes.find(r=>r.id===e.features?.[0]?.properties.id);if(d)props.onPathClick?.(d);});
 map.on('mouseenter','documented-routes',()=>map.getCanvas().style.cursor='pointer');
 map.on('mouseleave','documented-routes',()=>map.getCanvas().style.cursor='');
 map.on('move',()=>props.onZoom?.(api.pointOfView()));
 const methods={
  isMapLibre:true,map,
  isVisible(d){return !map.transform.isLocationOccluded(M.LngLat.convert([d.lng,d.lat]));},
  pointOfView(next,ms=0){if(!next){const c=map.getCenter();return {lat:c.lat,lng:c.lng,altitude:2.4/Math.pow(2,map.getZoom()-1)};}map.easeTo({center:[next.lng,next.lat],zoom:Math.max(0,Math.min(19,1+Math.log2(2.4/next.altitude))),duration:ms});return api;},
  htmlElementsData(data){props.htmlElementsData=data;clear(markers);clear(decorations);for(const d of data){const element=props.htmlElement(d);const marker=new M.Marker({element,anchor:'center',opacityWhenCovered:d.routeAdornment?'0':'0.15',subpixelPositioning:true}).setLngLat([d.lng,d.lat]).addTo(map);(d.routeAdornment?decorations:markers).push(marker);}orient();return api;},
  pathsData(data){routes=data;props.pathsData=data;rear.setRoutes(data);updateRoutes();return api;},
  setTheme(next){space.setTheme(next);rear.setTheme(next);if(next!==theme){theme=next;map.setStyle(window.ObservatoryBasemap.style(theme));}return api;},
  getScreenCoords(lat,lng){return map.project([lng,lat]);},
  width(){map.resize();return api;},height(){map.resize();return api;},
  pauseAnimation(){return api;},resumeAnimation(){map.resize();return api;},
  renderer(){return {setPixelRatio(){}};},globeMaterial(){return {color:{set(){}}};},controls(){return {addEventListener(){}};},
  _destructor(){rear.remove();clear(markers);clear(decorations);map.remove();}
 };
 function orient(){for(const marker of decorations){
  const el=marker.getElement(),d=el.routeDecoration;if(!d)continue;
  // Projection/style transitions and resize can change occlusion without a move event.
  const visible=methods.isVisible(d);
  el.style.setProperty('visibility',visible?'visible':'hidden','important');
  el.style.setProperty('pointer-events',visible&&d.kind!=='approx'?'auto':'none','important');
  el.setAttribute('aria-hidden',String(!visible));el.tabIndex=visible?0:-1;
  if(!visible||d.kind!=='arrow')continue;
  const a=window.DocumentedRoutes.point(d.segment,d.fraction-.005*d.sign),b=window.DocumentedRoutes.point(d.segment,d.fraction+.005*d.sign);
  // Keep both tangent samples in the symbol's world copy at the antimeridian.
  const near=lng=>lng+360*Math.round((marker.getLngLat().lng-lng)/360);
  const p=map.project([near(a.lng),a.lat]),q=map.project([near(b.lng),b.lat]);
  if(Math.hypot(q.x-p.x,q.y-p.y)>1e-8)el.querySelector('span').style.transform='rotate('+Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI+'deg)';
 }}
 map.on('render',orient);
 const api=new Proxy(methods,{get(target,key){if(key==='then')return undefined;if(key in target)return target[key];return value=>{props[key]=value;return api;};}});
 return api;
};
