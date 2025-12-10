import React, { useEffect, useState } from 'react'

export default function App(){
  const [signals, setSignals] = useState([])
  const BACKEND = import.meta.env.VITE_BACKEND_URL || (window.location.origin || 'http://localhost:3000')

  useEffect(()=>{
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.onload = () => {
      if(window.TradingView){
        new window.TradingView.widget({
          width: '100%',
          height: 620,
          symbol: 'FX:GBPUSD',
          interval: '15',
          timezone: 'Etc/UTC',
          theme: 'light',
          style: '1',
          toolbar_bg: '#f1f3f6',
          hideideas: true,
          container_id: 'tv_chart'
        })
      }
    }
    document.body.appendChild(s)

    let evt
    try {
      // Use https:// by default if site served over TLS
      const base = BACKEND.replace(/:\/\/localhost/, '://localhost')
      evt = new EventSource((import.meta.env.VITE_BACKEND_URL || '') + '/sse');
      evt.onmessage = (e) => {
        try{ const data = JSON.parse(e.data); setSignals(prev=>[data].concat(prev).slice(0,20)); }catch(err){}
      }
      evt.onerror = ()=>{ if(evt) evt.close(); }
    } catch(err) {
      console.warn('SSE not available', err)
    }
    return ()=>{ if(evt) evt.close(); }
  },[])

  return (
    <div style={{padding:20}}>
      <h1>GBP/USD Live</h1>
      <div id="tv_chart" style={{marginBottom:12}}></div>
      <h3>Recent Signals</h3>
      <ul>
        {signals.map((s, i)=> (
          <li key={i}>{s.time || ''} — {s.side} @ {s.price} (engine: {s.engine || 'unknown'})</li>
        ))}
      </ul>
    </div>
  )
}
