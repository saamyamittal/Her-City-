import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { ArrowUpRight, Check, Database, Heart, Layers, MapPin, Navigation, Plus, Search, ShieldCheck, Sparkles, Sun, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const categories = [
  ['all','All reports'],['poor_lighting','Poor lighting'],['broken_streetlight','Broken streetlight'],
  ['isolated_waiting_area','Isolated waiting area'],['road_or_path_issue','Road or path issue'],['other','Other']
];
const label = (key) => categories.find(x => x[0] === key)?.[1] || key;
const style = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export default function App() {
  const mapEl = useRef(null), mapRef = useRef(null);
  const [api,setApi] = useState('checking'), [reports,setReports] = useState([]), [mapReady,setMapReady] = useState(false);
  const [filter,setFilter] = useState('all'), [query,setQuery] = useState('');
  const [results,setResults] = useState([]), [picked,setPicked] = useState(null);
  const [modal,setModal] = useState(false), [category,setCategory] = useState('poor_lighting');
  const [description,setDescription] = useState(''), [saving,setSaving] = useState(false);
  const [toast,setToast] = useState(''), [routeOpen,setRouteOpen] = useState(false);
  const [from,setFrom] = useState(''), [to,setTo] = useState(''), [route,setRoute] = useState(null);
  const [theme,setTheme] = useState('light'), [stats,setStats] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/reports?category=${filter}`);
      if (!r.ok) throw new Error();
      const d = await r.json(); setReports(d.items || []);
    } catch { setReports([]); }
  },[filter]);

  const health = useCallback(async () => {
    try { const r = await fetch(`${API}/health`); if(!r.ok) throw new Error(); setApi('connected'); }
    catch { setApi('offline'); }
  },[]);

  const refreshStats = useCallback(async () => {
    try { const r=await fetch(`${API}/city-insights`); if(r.ok) setStats((await r.json()).report_count || 0); } catch {}
  },[]);

  useEffect(() => { health(); load(); refreshStats(); const id=setInterval(health,12000); return ()=>clearInterval(id); },[health,load,refreshStats]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({container:mapEl.current,style,center:[80.2707,13.0827],zoom:11});
    map.addControl(new maplibregl.NavigationControl(),'top-right');
    map.on('load',()=>{
      map.addSource('reports',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:'reports-dots',type:'circle',source:'reports',paint:{
        'circle-radius':8,'circle-color':'#e84f91','circle-stroke-color':'#fff','circle-stroke-width':2
      }});
      map.on('click','reports-dots',e=>{
        const p=e.features?.[0]?.properties; if(!p)return;
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${esc(label(p.category))}</b><br>${esc(p.description)}<br><small>Unverified community report</small>`).addTo(map);
      });
      map.on('mouseenter','reports-dots',()=>map.getCanvas().style.cursor='pointer');
      map.on('mouseleave','reports-dots',()=>map.getCanvas().style.cursor='');
      map.addSource('chosen',{type:'geojson',data:{type:'FeatureCollection',features:[]}});\n      setMapReady(true);
      map.addLayer({id:'chosen-dot',type:'circle',source:'chosen',paint:{'circle-radius':9,'circle-color':'#8d59d7','circle-stroke-color':'#fff','circle-stroke-width':3}});
    });
    map.on('click',e=>setPicked({latitude:e.lngLat.lat,longitude:e.lngLat.lng}));
    mapRef.current=map;
    return ()=>{map.remove();mapRef.current=null;};
  },[]);

  useEffect(()=>{
    const m=mapRef.current;
    if(!m || !m.isStyleLoaded() || !m.getSource('reports')) return;
    m.getSource('reports').setData({type:'FeatureCollection',features:reports.map(r=>({
      type:'Feature',geometry:{type:'Point',coordinates:[r.longitude,r.latitude]},
      properties:{category:r.category,description:r.description}
    }))});
  },[reports,mapReady]);

  useEffect(()=>{
    const m=mapRef.current;
    if(!m || !m.isStyleLoaded() || !m.getSource('chosen'))return;
    m.getSource('chosen').setData({type:'FeatureCollection',features:picked?[{
      type:'Feature',geometry:{type:'Point',coordinates:[picked.longitude,picked.latitude]},properties:{}
    }]:[]});
  },[picked]);

  async function search(e){
    e.preventDefault(); if(!query.trim())return;
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`);
      if(!r.ok)throw new Error(); setResults(await r.json());
    }catch{setToast('Location search is temporarily unavailable.');}
  }
  function choosePlace(p){
    mapRef.current?.flyTo({center:[Number(p.lon),Number(p.lat)],zoom:15});
    setQuery(p.display_name);setResults([]);
  }
  async function submit(e){
    e.preventDefault();if(!picked){setToast('Click the map to choose a location first.');return;}
    setSaving(true);
    try{
      const r=await fetch(`${API}/reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,description,...picked})});
      const d=await r.json();if(!r.ok)throw new Error(d.detail||'Could not save report');
      setToast('Report saved in the HER CITY database.');setModal(false);setDescription('');await load();await refreshStats();
    }catch(err){setToast(err.message);}finally{setSaving(false);}
  }
  async function geocode(q){
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
    const d=await r.json();if(!d.length)throw new Error(`Location not found: ${q}`);
    return {lat:Number(d[0].lat),lon:Number(d[0].lon)};
  }
  async function findRoute(e){
    e.preventDefault();try{
      const [a,b]=await Promise.all([geocode(from),geocode(to)]);
      const r=await fetch(`${API}/routes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_lat:a.lat,start_lon:a.lon,end_lat:b.lat,end_lon:b.lon})});
      const d=await r.json();if(!r.ok)throw new Error(d.detail||'Route unavailable');
      const m=mapRef.current;
      if(m.getLayer('route-line'))m.removeLayer('route-line');if(m.getSource('route-line'))m.removeSource('route-line');
      m.addSource('route-line',{type:'geojson',data:{type:'Feature',geometry:d.geometry,properties:{}}});
      m.addLayer({id:'route-line',type:'line',source:'route-line',paint:{'line-color':'#9252d7','line-width':5}});
      const bounds=new maplibregl.LngLatBounds();d.geometry.coordinates.forEach(x=>bounds.extend(x));m.fitBounds(bounds,{padding:65});
      setRoute({km:(d.distance_m/1000).toFixed(1),mins:Math.round(d.duration_s/60),notice:d.notice});
    }catch(err){setToast(err.message);}
  }

  return <div className={`app ${theme}`}>
    <header className="topbar">
      <a className="brand" href="#"><span className="logo">h<sup>✦</sup></span><span>HER CITY<small>HER JOURNEY. HER CITY.</small></span></a>
      <nav><a className="selected" href="#map">Explore</a><a href="#reports">Community</a><a href="#about">About</a></nav>
      <div className="head-actions"><span className={`api ${api}`}><i/>{api==='connected'?'API connected':api==='offline'?'API offline':'Checking API'}</span><button className="round" onClick={()=>setTheme(theme==='light'?'dark':'light')}><Sun size={17}/></button></div>
    </header>
    <main>
      <section className="hero">
        <div><div className="eyebrow"><Sparkles size={14}/> MOBILITY, WITH MORE AWARENESS</div>
          <h1>Her journey.<br/><em>Her city.</em><br/>Her right to feel informed.</h1>
          <p>Explore the city with better information, community insight and infrastructure visibility.</p>
          <div className="actions"><button className="primary" onClick={()=>mapRef.current?.flyTo({center:[80.2707,13.0827],zoom:12})}>Explore the map <ArrowUpRight size={16}/></button><button className="secondary" onClick={()=>setRouteOpen(!routeOpen)}><Navigation size={16}/> Plan a journey</button></div>
          <small className="hero-foot"><ShieldCheck size={15}/> Informed choices, not safety guarantees.</small>
        </div>
        <div className="hero-visual"><div className="ring r1"/><div className="ring r2"/><div className="pink-orb"/><span className="sticker"><Heart size={15}/> built around her</span><span className="coord">13°04'57.7"N<br/>80°16'14.5"E</span><b>✳</b></div>
      </section>

      <section id="map" className="section">
        <div className="section-title"><div><div className="eyebrow">THE HER CITY NETWORK</div><h2>Your city, in context.</h2><p>Explore community-submitted information on a real interactive map.</p></div><span className="db-chip"><Database size={15}/> HER CITY database</span></div>
        <div className="map-layout">
          <aside className="side">
            <div className="side-head"><div><small>CITY EXPLORER</small><h3>Explore layers</h3></div><Layers color="#e84f91"/></div>
            <form className="search" onSubmit={search}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search city or location..."/><button>Go</button></form>
            {results.length>0&&<div className="results">{results.map(p=><button key={p.place_id} onClick={()=>choosePlace(p)}><MapPin size={13}/>{p.display_name}</button>)}</div>}
            <small className="label">COMMUNITY MAP LAYERS</small>
            <div className="layer"><span className="layer-icon pink"><MapPin size={15}/></span><span><b>Community reports</b><small>Submitted by users</small></span><strong>{reports.length}</strong></div>
            <div className="layer faded"><span className="layer-icon purple"><Sun size={15}/></span><span><b>Streetlights</b><small>Verified dataset not connected</small></span><strong>—</strong></div>
            <div className="layer faded"><span className="layer-icon peach"><Heart size={15}/></span><span><b>Support locations</b><small>Verified dataset not connected</small></span><strong>—</strong></div>
            <div className="layer faded"><span className="layer-icon blue"><Layers size={15}/></span><span><b>Pedestrian activity</b><small>Data not available</small></span><strong>—</strong></div>
            <hr/><h3 className="report-title">Report an issue</h3><p className="side-copy">Help build a clearer picture of local infrastructure.</p>
            <button className="report-button" onClick={()=>{setPicked(null);setModal(true);}}><Plus size={16}/> Add a community report</button>
            <small className="legend"><i/> Unverified community report</small>
          </aside>
          <div className="map-wrap"><div className="map-bar"><b><i/> LIVE MAP VIEW</b><span>OpenStreetMap · MapLibre</span></div><div ref={mapEl} className="map"/><div className="map-hint"><MapPin size={14}/> Click the map to choose a report location</div>{picked&&<div className="picked"><b><Check size={13}/> Location selected</b><small>{picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)}</small><button onClick={()=>setModal(true)}>Use this location</button></div>}</div>
        </div>
      </section>

      {routeOpen&&<section className="route-box"><div className="section-title"><div><div className="eyebrow">JOURNEY PLANNER</div><h2>Plan with information.</h2></div><button className="round" onClick={()=>setRouteOpen(false)}><X/></button></div><form className="route-form" onSubmit={findRoute}><label>STARTING POINT<input required value={from} onChange={e=>setFrom(e.target.value)} placeholder="e.g. Chennai Central"/></label><label>DESTINATION<input required value={to} onChange={e=>setTo(e.target.value)} placeholder="e.g. Marina Beach"/></label><button className="primary">Find route <ArrowUpRight size={16}/></button></form>{route&&<div className="route-result"><b>{route.km} km</b><span>Approx. {route.mins} min (routing estimate)</span><small>{route.notice}</small></div>}<p className="disclaimer">Route times are estimates, not safety ratings.</p></section>}

      <section className="stats"><article><Database/><small>DATABASE REPORTS</small><b>{stats}</b><p>Community reports stored in HER CITY.</p></article><article><ShieldCheck/><small>DATA TRANSPARENCY</small><b>Source-first</b><p>Community submissions remain unverified until reviewed.</p></article><article><Layers/><small>MAP FOUNDATION</small><b>Open data</b><p>Real roads and geography displayed inside this application.</p></article></section>

      <section id="reports" className="section report-section"><div className="section-title"><div><div className="eyebrow">COMMUNITY INTELLIGENCE</div><h2>Reports from the map.</h2><p>User-submitted observations, not verified danger assessments.</p></div><select value={filter} onChange={e=>setFilter(e.target.value)}>{categories.map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></div>
        <div className="report-list">{reports.length===0?<div className="empty"><MapPin/><b>No reports in this view yet.</b><span>Reports submitted through HER CITY will appear here.</span></div>:reports.slice(0,8).map(r=><article key={r.id}><span className="report-symbol">!</span><div><b>{label(r.category)}</b><p>{r.description}</p><small>{new Date(r.created_at).toLocaleString()} · {r.status}</small></div><button onClick={()=>mapRef.current?.flyTo({center:[r.longitude,r.latitude],zoom:16})}>View pin ↗</button></article>)}</div>
      </section>
      <section id="about" className="privacy"><ShieldCheck/><div><b>Your location. Your choice.</b><p>This development build does not start background tracking. Location is used only when you choose map interactions or enter a route.</p></div><strong>NO MEANS NO</strong></section>
    </main>
    <footer><a className="brand" href="#"><span className="logo">h<sup>✦</sup></span><span>HER CITY<small>HER JOURNEY. HER CITY.</small></span></a><p>Built for informed mobility and stronger communities.</p><small>© HER CITY · Development build</small></footer>

    {modal&&<div className="overlay" onClick={()=>setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">COMMUNITY CONTRIBUTION</div><h2>Share an observation.</h2></div><button className="round" onClick={()=>setModal(false)}><X/></button></div><p>Choose a map point first, then describe the infrastructure issue. Reports are stored as unverified community submissions.</p><form onSubmit={submit}><label>REPORT CATEGORY<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.filter(x=>x[0]!=='all').map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><label>DESCRIPTION<textarea required minLength={8} maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe what you observed. Avoid personal or identifying information."/></label><div className="chosen"><MapPin size={15}/>{picked?`${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}`:'No map location selected — click the map first.'}</div><button className="primary submit" disabled={saving||!picked||description.trim().length<8}>{saving?'Saving…':'Submit community report'} <ArrowUpRight size={16}/></button></form></div></div>}
    {toast&&<div className="toast">{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
