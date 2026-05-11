"use client";
import React, { useEffect, useRef, useState } from 'react';
 
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
 
  /* prevent rubber-band scroll & text selection while playing */
  html, body {
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
 
  @keyframes score-pop {
    0%   { transform: scale(1); }
    35%  { transform: scale(1.22) skewX(-3deg); }
    100% { transform: scale(1); }
  }
  @keyframes combo-in {
    0%   { transform: translateX(16px); opacity: 0; }
    100% { transform: translateX(0);    opacity: 1; }
  }
  @keyframes x2-slide {
    0%   { transform: translateY(8px); opacity: 0; }
    100% { transform: translateY(0);   opacity: 1; }
  }
  @keyframes bar-drain {
    from { transform: scaleX(1); }
    to   { transform: scaleX(0); }
  }
  @keyframes go-stamp {
    0%   { transform: rotate(-6deg) scale(0.55); opacity: 0; }
    55%  { transform: rotate(1.5deg) scale(1.06); opacity: 1; }
    75%  { transform: rotate(-0.5deg) scale(0.97); }
    100% { transform: rotate(0deg) scale(1); opacity: 1; }
  }
  @keyframes screen-shake {
    0%,100% { transform: translate(0,0); }
    20%     { transform: translate(-7px, 4px); }
    40%     { transform: translate(7px,-3px); }
    60%     { transform: translate(-4px, 5px); }
    80%     { transform: translate(5px,-3px); }
  }
  @keyframes blink {
    0%,100% { opacity:1; }
    50%     { opacity:0; }
  }
  @keyframes tap-hint {
    0%,100% { transform: translateY(0); opacity:0.4; }
    50%     { transform: translateY(-8px); opacity:1; }
  }
  @keyframes fade-in {
    from { opacity:0; transform:translateY(12px); }
    to   { opacity:1; transform:translateY(0); }
  }
`;
 
// ─── helpers ──────────────────────────────────────────────────────────────────
const isMobileDevice = () =>
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);
 
export default function FruitNinjaGame() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [score,     setScore]     = useState(0);
  const [lives,     setLives]     = useState(3);
  const [gameOver,  setGameOver]  = useState(false);
  const [isX2,      setIsX2]      = useState(false);
  const [combo,     setCombo]     = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [scorePop,  setScorePop]  = useState(false);
  const [shaking,   setShaking]   = useState(false);
  const [splash,    setSplash]    = useState(true);
  const [isMobile,  setIsMobile]  = useState(false);
 
  const isDown     = useRef(false);
  const gameTime   = useRef(0);
  const shakeTime  = useRef(0);
  const livesRef   = useRef(3);
  const comboRef   = useRef(0);
  const comboTimer = useRef<NodeJS.Timeout | null>(null);
  const x2Timeout  = useRef<NodeJS.Timeout | null>(null);
  const sounds     = useRef<Record<string, HTMLAudioElement>>({});
  const started    = useRef(false);
  const scoreRef   = useRef(0);
 
  useEffect(() => {
    const s = document.createElement('style');
    s.textContent = GLOBAL_CSS;
    document.head.appendChild(s);
    setIsMobile(isMobileDevice());
    return () => s.remove();
  }, []);
 
  // ─── MAIN GAME LOOP ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (splash || started.current) return;
    started.current = true;
 
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
 
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
 
    // images
    const imgs: Record<string, HTMLImageElement> = {};
    ['Watermelon','Watermelonv.2','Orange','Orangev.2','Pineapple','Pineapplev.2','Boom'].forEach(n => {
      imgs[n] = Object.assign(new Image(), { src: `/${n}.png` });
    });
    imgs['Watermelonv2'] = imgs['Watermelonv.2'];
    imgs['Orangev2']     = imgs['Orangev.2'];
    imgs['Pineapplev2']  = imgs['Pineapplev.2'];
    imgs['Boomv2']       = imgs['Boom'];
 
    // sounds
    [['cut','/sword-cut.mp3'],['boom','/failboom.mp3'],['item','/item.mp3'],['lobby','/Lobby-sound.mp3']]
      .forEach(([k,src]) => { sounds.current[k] = Object.assign(new Audio(src), { preload:'auto' }); });
 
    const sfx = (k: string) => { const s=sounds.current[k]; if(s){ s.currentTime=0; s.play().catch(()=>{}); }};
    const lobby = sounds.current.lobby;
    if(lobby){ lobby.volume=0.08; lobby.loop=true; lobby.play().catch(()=>{}); }
 
    // scale for small screens — fruits smaller on phone
    const scale = () => Math.min(1, window.innerWidth / 420);
 
    // ── particles ──────────────────────────────────────────────────────────────
    interface P { x:number;y:number;vx:number;vy:number;life:number;r:number;color:string; }
    const parts: P[] = [];
    const burst = (x:number,y:number,color:string,n=10) => {
      for(let i=0;i<n;i++){
        const a=(Math.PI*2*i/n)+Math.random()*0.6, sp=3+Math.random()*4;
        parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,life:1,r:3+Math.random()*5,color});
      }
    };
 
    // ── float texts ────────────────────────────────────────────────────────────
    interface FT { x:number;y:number;text:string;life:number;color:string; }
    const floats: FT[] = [];
 
    // ── multi-touch trails (one per finger) ────────────────────────────────────
    const touchTrails = new Map<number, {x:number;y:number}[]>();
    let mouseTrail: {x:number;y:number}[] = [];
 
    let fruits: any[] = [];
 
    const spawnFruit = () => {
      if(livesRef.current<=0) return;
      const r=Math.random();
      const name = r>.7?'Watermelon':r>.4?'Pineapple':'Orange';
      const t=Math.random();
      let type='normal';
      if(t>.92) type='bomb'; else if(t>.85) type='gold'; else if(t>.80) type='multiplier';
 
      const sc = scale();
      const baseRadius = name==='Watermelon' ? 60 : 50;
 
      fruits.push({
        name:type==='bomb'?'Boom':name, type,
        x: Math.random()*(canvas.width - 120) + 60,
        y: canvas.height + 60,
        vx:(Math.random()-.5)*4,
        vy:(-12 - Math.random()*5) * Math.max(0.8, sc),
        angle:0, rot:(Math.random()-.5)*0.09,
        radius: baseRadius * Math.max(0.7, sc),
        isSliced:false, sliceX:0, sliceOpacity:1,
      });
 
      gameTime.current++;
      setTimeout(spawnFruit, Math.max(500, 1500 - gameTime.current*10));
    };
    setTimeout(spawnFruit, 700);
 
    // ── hit test against ALL active trails ────────────────────────────────────
    const hitTestAllTrails = (fx: number, fy: number, radius: number): boolean => {
      // mouse trail
      if(isDown.current && mouseTrail.length > 0){
        const lp = mouseTrail[mouseTrail.length-1];
        if(Math.hypot(lp.x-fx, lp.y-fy) < radius) return true;
      }
      // touch trails
      for(const trail of touchTrails.values()){
        if(trail.length > 0){
          const lp = trail[trail.length-1];
          if(Math.hypot(lp.x-fx, lp.y-fy) < radius) return true;
        }
      }
      return false;
    };
 
    const sliceFruit = (f: any) => {
      f.isSliced = true;
      if(f.type==='bomb'){
        sfx('boom');
        const nl = livesRef.current - 1;
        livesRef.current = nl; setLives(nl);
        shakeTime.current = 22;
        setShaking(true); setTimeout(()=>setShaking(false), 500);
        comboRef.current = 0; setCombo(0); setShowCombo(false);
        burst(f.x, f.y, '#ff5533', 16);
      } else {
        sfx('cut');
        comboRef.current++;
        setCombo(comboRef.current); setShowCombo(true);
        if(comboTimer.current) clearTimeout(comboTimer.current);
        comboTimer.current = setTimeout(()=>{
          comboRef.current=0; setCombo(0); setShowCombo(false);
        }, 1600);
 
        const base = f.type==='gold' ? 100 : 10;
        const cm   = comboRef.current>=5 ? 3 : comboRef.current>=3 ? 2 : 1;
        let cx = false; setIsX2(v=>{ cx=v; return v; });
        const total = base * cm * (cx ? 2 : 1);
        scoreRef.current += total; setScore(scoreRef.current);
        setScorePop(true); setTimeout(()=>setScorePop(false), 180);
 
        const col = f.type==='gold'?'#ffc930': f.type==='multiplier'?'#bf6fff':'#e8e0cc';
        burst(f.x, f.y, col, 10);
        floats.push({x:f.x, y:f.y-20, text:`+${total}`, life:1, color:col});
 
        if(f.type==='multiplier'){
          sfx('item');
          setIsX2(true);
          if(x2Timeout.current) clearTimeout(x2Timeout.current);
          x2Timeout.current = setTimeout(()=>setIsX2(false), 5000);
        }
      }
    };
 
    // ── draw trail ─────────────────────────────────────────────────────────────
    const drawTrail = (trail: {x:number;y:number}[]) => {
      if(trail.length < 2) return;
      for(let i=1; i<trail.length; i++){
        const a = i/trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = `rgba(248,240,220,${a*0.9})`;
        ctx.lineWidth = a*6; ctx.lineCap='round'; ctx.stroke();
      }
      if(trail.length>14) trail.shift();
    };
 
    // ── main loop ──────────────────────────────────────────────────────────────
    let raf: number;
    const loop = () => {
      if(livesRef.current <= 0){ setGameOver(true); return; }
 
      ctx.save();
      if(shakeTime.current>0){
        ctx.translate(Math.random()*10-5, Math.random()*10-5);
        shakeTime.current--;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
 
      // draw all trails
      if(isDown.current) drawTrail(mouseTrail);
      touchTrails.forEach(t => drawTrail(t));
 
      // particles
      for(let i=parts.length-1; i>=0; i--){
        const p=parts[i];
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.14; p.life-=0.028;
        if(p.life<=0){ parts.splice(i,1); continue; }
        ctx.globalAlpha=p.life;
        ctx.fillStyle=p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
 
      // float texts
      for(let i=floats.length-1; i>=0; i--){
        const f=floats[i];
        f.y-=1.3; f.life-=0.018;
        if(f.life<=0){ floats.splice(i,1); continue; }
        ctx.globalAlpha=f.life;
        ctx.font=`700 ${Math.round(26*scale())}px "Oswald",sans-serif`;
        ctx.textAlign='center';
        ctx.fillStyle=f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha=1;
 
      // fruits
      for(let i=fruits.length-1; i>=0; i--){
        const f=fruits[i];
        f.x+=f.vx; f.y+=f.vy; f.vy+=0.18; f.angle+=f.rot;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
 
        if(!f.isSliced){
          const img=imgs[f.name];
          if(img?.complete) ctx.drawImage(img, -f.radius,-f.radius, f.radius*2,f.radius*2);
 
          if(f.type==='gold'){
            ctx.beginPath(); ctx.arc(0,0,f.radius+5,0,Math.PI*2);
            ctx.strokeStyle='rgba(255,210,60,0.5)'; ctx.lineWidth=2; ctx.stroke();
          }
          if(f.type==='multiplier'){
            ctx.beginPath(); ctx.arc(0,0,f.radius+5,0,Math.PI*2);
            ctx.strokeStyle='rgba(200,100,255,0.5)'; ctx.lineWidth=2; ctx.stroke();
          }
 
          // hit test
          if(hitTestAllTrails(f.x, f.y, f.radius)){
            sliceFruit(f);
          }
        } else {
          f.sliceX+=4; f.sliceOpacity-=0.042;
          ctx.globalAlpha=Math.max(0, f.sliceOpacity);
          const v2=imgs[`${f.name}v2`];
          if(v2?.complete) ctx.drawImage(v2, -f.radius-f.sliceX,-f.radius, f.radius*2,f.radius*2);
        }
        ctx.restore();
 
        if(f.y > canvas.height+120 || f.sliceOpacity<=0){
          if(!f.isSliced && f.type!=='bomb'){ livesRef.current--; setLives(livesRef.current); }
          fruits.splice(i,1);
        }
      }
 
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    loop();
 
    // ── MOUSE events ──────────────────────────────────────────────────────────
    const onMouseDown = () => { isDown.current=true; };
    const onMouseUp   = () => { isDown.current=false; mouseTrail=[]; };
    const onMouseMove = (e: MouseEvent) => { if(isDown.current) mouseTrail.push({x:e.clientX, y:e.clientY}); };
 
    // ── TOUCH events ──────────────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      Array.from(e.changedTouches).forEach(t => {
        touchTrails.set(t.identifier, [{x:t.clientX, y:t.clientY}]);
      });
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      Array.from(e.changedTouches).forEach(t => {
        const trail = touchTrails.get(t.identifier);
        if(trail) trail.push({x:t.clientX, y:t.clientY});
        else touchTrails.set(t.identifier, [{x:t.clientX, y:t.clientY}]);
      });
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      Array.from(e.changedTouches).forEach(t => {
        touchTrails.delete(t.identifier);
      });
    };
 
    window.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mouseup',    onMouseUp);
    window.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('touchstart', onTouchStart, { passive:false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive:false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive:false });
    canvas.addEventListener('touchcancel',onTouchEnd,   { passive:false });
 
    return () => {
      lobby?.pause();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mouseup',    onMouseUp);
      window.removeEventListener('mousemove',  onMouseMove);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
      canvas.removeEventListener('touchcancel',onTouchEnd);
      if(x2Timeout.current)  clearTimeout(x2Timeout.current);
      if(comboTimer.current) clearTimeout(comboTimer.current);
    };
  }, [splash]);
 
  // ─── SPLASH ────────────────────────────────────────────────────────────────
  if (splash) {
    return (
      <div style={{
        position:'fixed', inset:0, background:'#0c0b09',
        display:'flex', flexDirection:'column',
        fontFamily:'"Oswald",sans-serif',
        userSelect:'none',
        overflow:'hidden',
      }}>
        <style>{GLOBAL_CSS}</style>
 
        {/* top red bar */}
        <div style={{ height:'5px', background:'#c0392b', flexShrink:0 }}/>
 
        {/* content — scrollable on very small screens */}
        <div style={{
          flex:1, overflowY:'auto', overscrollBehavior:'contain',
          display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent: isMobile ? 'flex-start' : 'center',
          padding: isMobile ? '32px 24px 40px' : '60px 40px',
          gap:'0',
        }}>
          {/* label */}
          <div style={{
            fontSize:'10px', letterSpacing:'0.5em', color:'#c0392b',
            fontFamily:'"DM Mono",monospace', marginBottom:'16px',
            animation:'fade-in 0.4s ease-out',
          }}>
            JUICE ENGINE V.3
          </div>
 
          {/* title */}
          <div style={{
            fontSize: isMobile ? 'clamp(72px,20vw,108px)' : 'clamp(88px,11vw,132px)',
            lineHeight:0.88, letterSpacing:'-3px', textAlign:'center',
            animation:'fade-in 0.5s ease-out',
          }}>
            <span style={{ color:'#f0ede6' }}>FRUIT</span><br/>
            <span style={{ WebkitTextStroke:'2px #f0ede6', color:'transparent' }}>NINJA</span>
          </div>
 
          {/* divider */}
          <div style={{ display:'flex', gap:'10px', alignItems:'center', margin:'20px 0 24px' }}>
            <div style={{ width:'40px', height:'3px', background:'#c0392b' }}/>
            <div style={{ width:'6px', height:'6px', background:'#c0392b', borderRadius:'50%' }}/>
            <div style={{ width:'40px', height:'3px', background:'#c0392b' }}/>
          </div>
 
          {/* rules table */}
          <div style={{
            width:'100%', maxWidth:'440px',
            animation:'fade-in 0.6s ease-out',
          }}>
            {[
              { label:'NORMAL FRUIT',   pts:'+10',    tag:'orange / watermelon / pineapple', color:'#f0ede6' },
              { label:'GOLD FRUIT',     pts:'+100',   tag:'rare drop — slice fast',          color:'#ffc930' },
              { label:'DOUBLE POINTS',  pts:'×2 / 5s',tag:'purple ring — chain it',          color:'#bf6fff' },
              { label:'COMBO CHAIN',    pts:'up to ×3',tag:'3 chain = ×2, 5 chain = ×3',    color:'#4ec9b0' },
              { label:'BOMB',           pts:'−1 ❤',   tag:'black fuse — dodge it',           color:'#c0392b' },
            ].map((row, i, arr) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding: isMobile ? '13px 0' : '14px 0',
                borderBottom: i<arr.length-1 ? '1px solid rgba(240,237,230,0.07)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: isMobile?'12px':'13px', letterSpacing:'0.2em', color:row.color, fontWeight:700 }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize:'11px', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.25)', marginTop:'2px' }}>
                    {row.tag}
                  </div>
                </div>
                <div style={{ fontSize: isMobile?'16px':'18px', color:row.color, fontFamily:'"DM Mono",monospace', fontWeight:500, marginLeft:'16px', flexShrink:0 }}>
                  {row.pts}
                </div>
              </div>
            ))}
          </div>
 
          {/* tap hint for mobile */}
          {isMobile && (
            <div style={{ marginTop:'20px', textAlign:'center', animation:'tap-hint 2s ease-in-out infinite' }}>
              <div style={{ fontSize:'28px' }}>👆</div>
              <div style={{ fontSize:'10px', letterSpacing:'0.3em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace', marginTop:'4px' }}>
                SWIPE TO SLASH
              </div>
            </div>
          )}
 
          {/* CTA */}
          <button
            onClick={()=>setSplash(false)}
            style={{
              marginTop: isMobile ? '28px' : '36px',
              width: isMobile ? '100%' : 'auto',
              maxWidth:'320px',
              padding: isMobile ? '18px' : '15px 52px',
              fontSize: isMobile ? '20px' : '17px',
              letterSpacing:'0.25em',
              background:'#c0392b', color:'#f0ede6',
              border:'none', borderRadius:'2px',
              cursor:'pointer', fontFamily:'"Oswald",sans-serif',
              WebkitTapHighlightColor:'transparent',
            }}
          >
            {isMobile ? 'TAP TO START' : 'START SLICING'}
          </button>
 
          {!isMobile && (
            <div style={{ marginTop:'12px', fontSize:'10px', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.15)', letterSpacing:'0.3em' }}>
              DRAG MOUSE TO SLASH
            </div>
          )}
        </div>
 
        {/* bottom red bar */}
        <div style={{ height:'5px', background:'#c0392b', flexShrink:0 }}/>
      </div>
    );
  }
 
  // ─── RESPONSIVE HUD sizes ─────────────────────────────────────────────────
  const hudPad    = isMobile ? '16px' : '28px';
  const scoreSize = isMobile ? 'clamp(36px,10vw,52px)' : 'clamp(48px,7vw,72px)';
  const labelSize = isMobile ? '9px' : '10px';
 
  return (
    <div style={{
      position:'relative', width:'100%', height:'100dvh', overflow:'hidden',
      background:`url('/bg-dojo.png') center/cover no-repeat, #0c0b09`,
      cursor: isMobile ? 'default' : 'crosshair',
      userSelect:'none',
      animation: shaking ? 'screen-shake 0.45s ease-in-out' : 'none',
    }}>
      <style>{GLOBAL_CSS}</style>
 
      {/* vignette */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none', zIndex:4,
        background:'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
      }}/>
 
      {/* top bar on mobile / left bar on desktop */}
      {isMobile
        ? <div style={{ position:'absolute', top:0, left:0, right:0, height:'4px', background:'#c0392b', zIndex:20 }}/>
        : <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'5px', background:'#c0392b', zIndex:20 }}/>
      }
 
      {/* ── MOBILE HUD: top strip ──────────────────────────────────────────── */}
      {isMobile && (
        <div style={{
          position:'absolute', top:'12px', left:0, right:0, zIndex:20,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:`0 ${hudPad}`,
          fontFamily:'"Oswald",sans-serif',
        }}>
          {/* score left */}
          <div>
            <div style={{ fontSize:labelSize, letterSpacing:'0.4em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace' }}>
              SCORE
            </div>
            <div style={{
              fontSize:scoreSize, lineHeight:1, letterSpacing:'-1px',
              color: isX2 ? '#bf6fff' : '#f0ede6',
              transition:'color 0.25s',
              animation: scorePop ? 'score-pop 0.18s ease-out' : 'none',
            }}>
              {String(score).padStart(6,'0')}
            </div>
          </div>
 
          {/* combo center */}
          <div style={{ textAlign:'center', minWidth:'60px' }}>
            {showCombo && combo >= 2 && (
              <div style={{ animation:'combo-in 0.2s ease-out' }}>
                <div style={{
                  fontSize: combo>=7?'44px':combo>=4?'36px':'28px',
                  lineHeight:1,
                  color: combo>=7?'#ffc930':combo>=4?'#4ec9b0':'#f0ede6',
                  letterSpacing:'-1px',
                }}>
                  ×{combo}
                </div>
                <div style={{ fontSize:'8px', letterSpacing:'0.3em', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.3)' }}>
                  {combo>=7?'LEGENDARY':combo>=4?'EXCELLENT':'COMBO'}
                </div>
              </div>
            )}
          </div>
 
          {/* lives right */}
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:labelSize, letterSpacing:'0.4em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace', marginBottom:'4px' }}>
              LIVES
            </div>
            <div style={{ display:'flex', gap:'5px', justifyContent:'flex-end', alignItems:'flex-end' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width:'4px',
                  height: i===0?'16px':i===1?'22px':'28px',
                  background: i < lives ? '#c0392b' : 'rgba(240,237,230,0.1)',
                  borderRadius:'1px', transition:'background 0.3s',
                }}/>
              ))}
            </div>
          </div>
        </div>
      )}
 
      {/* ── DESKTOP HUD ────────────────────────────────────────────────────── */}
      {!isMobile && (
        <>
          <div style={{ position:'absolute', top:'28px', left:'28px', zIndex:20, fontFamily:'"Oswald",sans-serif' }}>
            <div style={{ fontSize:'10px', letterSpacing:'0.5em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace', marginBottom:'4px' }}>
              SCORE<span style={{ animation:'blink 1.1s step-end infinite', color:'#c0392b', marginLeft:'2px' }}>_</span>
            </div>
            <div style={{
              fontSize:'clamp(48px,7vw,72px)', lineHeight:1, letterSpacing:'-1px',
              color: isX2 ? '#bf6fff' : '#f0ede6', transition:'color 0.25s',
              animation: scorePop ? 'score-pop 0.18s ease-out' : 'none',
            }}>
              {String(score).padStart(6,'0')}
            </div>
            <div style={{ display:'flex', gap:'5px', marginTop:'14px', alignItems:'flex-end' }}>
              {[2,1,0].map(i => (
                <div key={i} style={{
                  width:'4px', height: i===2?'28px':i===1?'22px':'16px',
                  background: i < lives ? '#c0392b' : 'rgba(240,237,230,0.1)',
                  borderRadius:'1px', transition:'background 0.3s',
                }}/>
              ))}
              <span style={{ marginLeft:'6px', fontSize:'10px', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.2)', lineHeight:'28px' }}>
                {lives} LIVES
              </span>
            </div>
          </div>
 
          {showCombo && combo >= 2 && (
            <div style={{
              position:'absolute', top:'28px', right:'28px', zIndex:20,
              textAlign:'right', fontFamily:'"Oswald",sans-serif',
              animation:'combo-in 0.2s ease-out',
            }}>
              <div style={{
                fontSize: combo>=7?'72px':combo>=4?'56px':'44px',
                lineHeight:1, letterSpacing:'-1px',
                color: combo>=7?'#ffc930':combo>=4?'#4ec9b0':'#f0ede6',
              }}>
                ×{combo}
              </div>
              <div style={{ fontSize:'10px', letterSpacing:'0.4em', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.3)', marginTop:'2px' }}>
                {combo>=7?'LEGENDARY':combo>=4?'EXCELLENT':'COMBO'}
              </div>
            </div>
          )}
        </>
      )}
 
      {/* ── X2 BANNER (both platforms) ────────────────────────────────────── */}
      {isX2 && (
        <div style={{
          position:'absolute',
          bottom: isMobile ? '24px' : '40px',
          right: isMobile ? hudPad : '28px',
          zIndex:20, animation:'x2-slide 0.2s ease-out',
        }}>
          <div style={{ borderLeft:'3px solid #bf6fff', paddingLeft:'12px' }}>
            <div style={{ fontSize: isMobile?'10px':'11px', letterSpacing:'0.3em', color:'#bf6fff', fontFamily:'"DM Mono",monospace' }}>
              DOUBLE POINTS
            </div>
            <div style={{ height:'2px', background:'rgba(191,111,255,0.15)', width:'110px', marginTop:'6px' }}>
              <div style={{ height:'100%', background:'#bf6fff', transformOrigin:'left', animation:'bar-drain 5s linear forwards' }}/>
            </div>
          </div>
        </div>
      )}
 
      {/* ── BOTTOM STRIP — desktop only ────────────────────────────────────── */}
      {!isMobile && (
        <div style={{
          position:'absolute', bottom:'16px', left:'28px', zIndex:20,
          fontFamily:'"DM Mono",monospace', fontSize:'10px',
          color:'rgba(240,237,230,0.12)', letterSpacing:'0.2em',
        }}>
          GOLD +100 · PURPLE ×2 · BOMB −1♥ · COMBO ×3
        </div>
      )}
 
      {/* ── GAME OVER ────────────────────────────────────────────────────── */}
      {gameOver && (
        <div style={{
          position:'absolute', inset:0, background:'rgba(6,5,4,0.95)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:50, fontFamily:'"Oswald",sans-serif',
        }}>
          {isMobile
            ? <div style={{ position:'absolute', top:0, left:0, right:0, height:'5px', background:'#c0392b' }}/>
            : <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'5px', background:'#c0392b' }}/>
          }
 
          <div style={{ textAlign:'center', padding:'24px' }}>
            <div style={{
              fontSize: isMobile ? 'clamp(64px,18vw,108px)' : 'clamp(72px,14vw,148px)',
              lineHeight:0.88, letterSpacing:'-2px',
              animation:'go-stamp 0.5s cubic-bezier(.22,1,.36,1) forwards',
            }}>
              <span style={{ WebkitTextStroke:'2px #c0392b', color:'transparent' }}>GAME</span><br/>
              <span style={{ color:'#f0ede6' }}>OVER</span>
            </div>
 
            <div style={{ display:'flex', gap:'12px', alignItems:'center', justifyContent:'center', margin:'24px 0 20px' }}>
              <div style={{ flex:1, height:'1px', background:'rgba(240,237,230,0.1)', maxWidth:'70px' }}/>
              <div style={{ width:'5px', height:'5px', background:'#c0392b', borderRadius:'50%' }}/>
              <div style={{ flex:1, height:'1px', background:'rgba(240,237,230,0.1)', maxWidth:'70px' }}/>
            </div>
 
            <div style={{ fontSize:'10px', letterSpacing:'0.45em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace', marginBottom:'8px' }}>
              FINAL SCORE
            </div>
            <div style={{ fontSize: isMobile?'clamp(32px,10vw,56px)':'clamp(36px,6vw,64px)', color:'#f0ede6', letterSpacing:'-1px' }}>
              {String(scoreRef.current).padStart(6,'0')}
            </div>
 
            <div style={{
              display:'inline-block', marginTop:'12px',
              padding:'6px 20px',
              border:`1px solid ${scoreRef.current>=1000?'rgba(255,201,48,0.35)':scoreRef.current>=500?'rgba(78,201,176,0.35)':'rgba(240,237,230,0.1)'}`,
              color: scoreRef.current>=1000?'#ffc930':scoreRef.current>=500?'#4ec9b0':'rgba(240,237,230,0.3)',
              fontSize:'10px', letterSpacing:'0.4em', fontFamily:'"DM Mono",monospace', borderRadius:'2px',
            }}>
              {scoreRef.current>=1000?'MASTER SLICER':scoreRef.current>=500?'SKILLED NINJA':'APPRENTICE'}
            </div>
 
            <div style={{ marginTop:'36px' }}>
              <button
                onClick={()=>window.location.reload()}
                style={{
                  padding: isMobile ? '16px 0' : '14px 56px',
                  width: isMobile ? '240px' : 'auto',
                  fontSize: isMobile ? '18px' : '17px',
                  letterSpacing:'0.25em',
                  background:'#c0392b', color:'#f0ede6',
                  border:'none', borderRadius:'2px',
                  cursor:'pointer', fontFamily:'"Oswald",sans-serif',
                  WebkitTapHighlightColor:'transparent',
                }}
              >
                RETRY
              </button>
            </div>
          </div>
        </div>
      )}
 
      <canvas
        ref={canvasRef}
        style={{ position:'relative', zIndex:10, width:'100%', height:'100%', touchAction:'none' }}
      />
    </div>
  );
}
 