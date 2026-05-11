"use client";
import React, { useEffect, useRef, useState } from 'react';
 
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
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
    0%   { transform: translateY(10px); opacity: 0; }
    100% { transform: translateY(0);    opacity: 1; }
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
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @keyframes life-out {
    0%   { transform: scale(1); opacity: 1; }
    100% { transform: scale(0) rotate(-20deg); opacity: 0; }
  }
`;
 
export default function FruitNinjaGame() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [score,    setScore]    = useState(0);
  const [lives,    setLives]    = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [isX2,     setIsX2]     = useState(false);
  const [combo,    setCombo]    = useState(0);
  const [showCombo,setShowCombo]= useState(false);
  const [scorePop, setScorePop] = useState(false);
  const [shaking,  setShaking]  = useState(false);
  const [splash,   setSplash]   = useState(true);
 
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
    return () => s.remove();
  }, []);
 
  useEffect(() => {
    if (splash || started.current) return;
    started.current = true;
 
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
 
    const imgs: Record<string, HTMLImageElement> = {};
    ['Watermelon','Watermelonv.2','Orange','Orangev.2','Pineapple','Pineapplev.2','Boom'].forEach(n => {
      imgs[n] = Object.assign(new Image(), { src: `/${n}.png` });
    });
    imgs['Watermelonv2'] = imgs['Watermelonv.2'];
    imgs['Orangev2']     = imgs['Orangev.2'];
    imgs['Pineapplev2']  = imgs['Pineapplev.2'];
    imgs['Boomv2']       = imgs['Boom'];
 
    [['cut','/sword-cut.mp3'],['boom','/failboom.mp3'],['item','/item.mp3'],['lobby','/Lobby-sound.mp3']]
      .forEach(([k,src]) => { sounds.current[k] = Object.assign(new Audio(src), { preload:'auto' }); });
 
    const sfx = (k: string) => { const s=sounds.current[k]; if(s){ s.currentTime=0; s.play().catch(()=>{}); }};
    const lobby = sounds.current.lobby;
    if(lobby){ lobby.volume=0.08; lobby.loop=true; lobby.play().catch(()=>{}); }
 
    interface P { x:number;y:number;vx:number;vy:number;life:number;r:number;color:string; }
    const parts: P[] = [];
    const burst = (x:number,y:number,color:string,n=10) => {
      for(let i=0;i<n;i++){
        const a=(Math.PI*2*i/n)+Math.random()*0.6, sp=3+Math.random()*4;
        parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,life:1,r:3+Math.random()*5,color});
      }
    };
 
    interface FT { x:number;y:number;text:string;life:number;color:string; }
    const floats: FT[] = [];
    let trail: {x:number;y:number}[] = [];
    let fruits: any[] = [];
 
    const spawnFruit = () => {
      if(livesRef.current<=0) return;
      const r=Math.random();
      const name = r>.7?'Watermelon':r>.4?'Pineapple':'Orange';
      const t=Math.random();
      let type='normal';
      if(t>.92) type='bomb'; else if(t>.85) type='gold'; else if(t>.80) type='multiplier';
      fruits.push({
        name:type==='bomb'?'Boom':name, type,
        x:Math.random()*(canvas.width-200)+100,
        y:canvas.height+50,
        vx:(Math.random()-.5)*4, vy:-12-Math.random()*5,
        angle:0, rot:(Math.random()-.5)*0.09,
        radius:name==='Watermelon'?60:50,
        isSliced:false, sliceX:0, sliceOpacity:1,
      });
      gameTime.current++;
      setTimeout(spawnFruit, Math.max(500,1500-gameTime.current*10));
    };
    setTimeout(spawnFruit, 700);
 
    let raf: number;
    const loop = () => {
      if(livesRef.current<=0){ setGameOver(true); return; }
 
      ctx.save();
      if(shakeTime.current>0){ ctx.translate(Math.random()*10-5,Math.random()*10-5); shakeTime.current--; }
      ctx.clearRect(0,0,canvas.width,canvas.height);
 
      // trail
      if(isDown.current && trail.length>1){
        for(let i=1;i<trail.length;i++){
          const a=i/trail.length;
          ctx.beginPath();
          ctx.moveTo(trail[i-1].x,trail[i-1].y);
          ctx.lineTo(trail[i].x,trail[i].y);
          ctx.strokeStyle=`rgba(248,240,220,${a*0.9})`;
          ctx.lineWidth=a*5; ctx.lineCap='round'; ctx.stroke();
        }
        if(trail.length>14) trail.shift();
      }
 
      // particles
      for(let i=parts.length-1;i>=0;i--){
        const p=parts[i];
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.14; p.life-=0.028;
        if(p.life<=0){parts.splice(i,1);continue;}
        ctx.globalAlpha=p.life;
        ctx.fillStyle=p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
 
      // float texts
      for(let i=floats.length-1;i>=0;i--){
        const f=floats[i];
        f.y-=1.3; f.life-=0.018;
        if(f.life<=0){floats.splice(i,1);continue;}
        ctx.globalAlpha=f.life;
        ctx.font=`700 26px "Oswald",sans-serif`;
        ctx.textAlign='center';
        ctx.fillStyle=f.color;
        ctx.fillText(f.text,f.x,f.y);
      }
      ctx.globalAlpha=1;
 
      for(let i=fruits.length-1;i>=0;i--){
        const f=fruits[i];
        f.x+=f.vx; f.y+=f.vy; f.vy+=0.18; f.angle+=f.rot;
        ctx.save();
        ctx.translate(f.x,f.y);
        ctx.rotate(f.angle);
 
        if(!f.isSliced){
          const img=imgs[f.name];
          if(img?.complete) ctx.drawImage(img,-f.radius,-f.radius,f.radius*2,f.radius*2);
 
          if(f.type==='gold'){
            ctx.beginPath(); ctx.arc(0,0,f.radius+5,0,Math.PI*2);
            ctx.strokeStyle='rgba(255,210,60,0.5)'; ctx.lineWidth=2; ctx.stroke();
          }
          if(f.type==='multiplier'){
            ctx.beginPath(); ctx.arc(0,0,f.radius+5,0,Math.PI*2);
            ctx.strokeStyle='rgba(200,100,255,0.5)'; ctx.lineWidth=2; ctx.stroke();
          }
 
          if(isDown.current && trail.length>0){
            const lp=trail[trail.length-1];
            if(Math.hypot(lp.x-f.x,lp.y-f.y)<f.radius){
              f.isSliced=true;
              if(f.type==='bomb'){
                sfx('boom');
                const nl=livesRef.current-1;
                livesRef.current=nl; setLives(nl);
                shakeTime.current=22;
                setShaking(true); setTimeout(()=>setShaking(false),500);
                comboRef.current=0; setCombo(0); setShowCombo(false);
                burst(f.x,f.y,'#ff5533',16);
              } else {
                sfx('cut');
                comboRef.current++;
                setCombo(comboRef.current); setShowCombo(true);
                if(comboTimer.current) clearTimeout(comboTimer.current);
                comboTimer.current=setTimeout(()=>{ comboRef.current=0; setCombo(0); setShowCombo(false); },1600);
 
                const base=f.type==='gold'?100:10;
                const cm=comboRef.current>=5?3:comboRef.current>=3?2:1;
                let cx=false; setIsX2(v=>{cx=v;return v;});
                const total=base*cm*(cx?2:1);
                scoreRef.current+=total; setScore(scoreRef.current);
                setScorePop(true); setTimeout(()=>setScorePop(false),180);
 
                const col=f.type==='gold'?'#ffc930':f.type==='multiplier'?'#bf6fff':'#e8e0cc';
                burst(f.x,f.y,col,10);
                floats.push({x:f.x,y:f.y-20,text:`+${total}`,life:1,color:col});
 
                if(f.type==='multiplier'){
                  sfx('item');
                  setIsX2(true);
                  if(x2Timeout.current) clearTimeout(x2Timeout.current);
                  x2Timeout.current=setTimeout(()=>setIsX2(false),5000);
                }
              }
            }
          }
        } else {
          f.sliceX+=4; f.sliceOpacity-=0.042;
          ctx.globalAlpha=Math.max(0,f.sliceOpacity);
          const v2=imgs[`${f.name}v2`];
          if(v2?.complete) ctx.drawImage(v2,-f.radius-f.sliceX,-f.radius,f.radius*2,f.radius*2);
        }
        ctx.restore();
 
        if(f.y>canvas.height+120||f.sliceOpacity<=0){
          if(!f.isSliced&&f.type!=='bomb'){ livesRef.current--; setLives(livesRef.current); }
          fruits.splice(i,1);
        }
      }
 
      ctx.restore();
      raf=requestAnimationFrame(loop);
    };
    loop();
 
    const mv=(e:MouseEvent)=>{ if(isDown.current) trail.push({x:e.clientX,y:e.clientY}); };
    window.addEventListener('mousedown',()=>{ isDown.current=true; });
    window.addEventListener('mouseup',  ()=>{ isDown.current=false; trail=[]; });
    window.addEventListener('mousemove', mv);
 
    return ()=>{
      lobby?.pause(); cancelAnimationFrame(raf);
      window.removeEventListener('mousemove',mv);
      if(x2Timeout.current) clearTimeout(x2Timeout.current);
      if(comboTimer.current) clearTimeout(comboTimer.current);
    };
  }, [splash]);
 
  // ─── SPLASH ────────────────────────────────────────────────────────────────
  if (splash) return (
    <div style={{
      position:'fixed', inset:0, background:'#0c0b09',
      display:'flex', alignItems:'stretch',
      fontFamily:'"Oswald",sans-serif',
      userSelect:'none', cursor:'crosshair',
      overflow:'hidden',
    }}>
      <style>{GLOBAL_CSS}</style>
 
      {/* left red strip */}
      <div style={{ width:'5px', background:'#c0392b', flexShrink:0 }}/>
 
      {/* LEFT PANEL — title */}
      <div style={{
        flex:'0 0 52%', display:'flex', flexDirection:'column',
        justifyContent:'center', padding:'60px 56px',
        borderRight:'1px solid rgba(240,237,230,0.07)',
        position:'relative',
      }}>
        {/* subtle grid */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:'linear-gradient(rgba(240,237,230,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(240,237,230,0.025) 1px,transparent 1px)',
          backgroundSize:'40px 40px',
        }}/>
 
        <div style={{ position:'relative' }}>
          <div style={{ fontSize:'10px', letterSpacing:'0.55em', color:'#c0392b', fontFamily:'"DM Mono",monospace', marginBottom:'22px' }}>
            JUICE ENGINE V.3
          </div>
          <div style={{
            fontSize:'clamp(88px,11vw,132px)',
            lineHeight:0.88, letterSpacing:'-3px',
          }}>
            <span style={{ color:'#f0ede6' }}>FRUIT</span><br/>
            <span style={{ WebkitTextStroke:'2px #f0ede6', color:'transparent' }}>NINJA</span>
          </div>
 
          <div style={{ display:'flex', gap:'10px', alignItems:'center', margin:'28px 0' }}>
            <div style={{ width:'48px', height:'3px', background:'#c0392b' }}/>
            <div style={{ width:'6px', height:'6px', background:'#c0392b', borderRadius:'50%' }}/>
          </div>
 
          <div style={{
            fontSize:'12px', fontFamily:'"DM Mono",monospace',
            color:'rgba(240,237,230,0.3)', lineHeight:2, letterSpacing:'0.1em',
          }}>
            DRAG MOUSE → SLASH FRUIT<br/>
            CHAIN SLICES → COMBO MULTIPLIER<br/>
            AVOID BLACK BOMBS → SAVE LIVES
          </div>
 
          <button
            onClick={()=>setSplash(false)}
            style={{
              marginTop:'40px', display:'inline-block',
              padding:'15px 52px', fontSize:'17px', letterSpacing:'0.25em',
              background:'#c0392b', color:'#f0ede6',
              border:'none', borderRadius:'2px',
              cursor:'pointer', fontFamily:'"Oswald",sans-serif',
              transition:'background 0.15s, transform 0.1s',
            }}
            onMouseEnter={e=>{const el=e.currentTarget; el.style.background='#e03020'; el.style.transform='scale(1.03)';}}
            onMouseLeave={e=>{const el=e.currentTarget; el.style.background='#c0392b'; el.style.transform='scale(1)';}}
          >
            START SLICING
          </button>
        </div>
      </div>
 
      {/* RIGHT PANEL — rules table */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column',
        justifyContent:'center', padding:'60px 48px',
      }}>
        <div style={{ fontSize:'10px', letterSpacing:'0.5em', color:'rgba(240,237,230,0.25)', fontFamily:'"DM Mono",monospace', marginBottom:'28px' }}>
          HOW TO SCORE
        </div>
 
        {[
          { label:'NORMAL FRUIT',    pts:'+10',    tag:'orange / watermelon / pineapple', color:'#f0ede6' },
          { label:'GOLD FRUIT',      pts:'+100',   tag:'rare drop — slice fast',          color:'#ffc930' },
          { label:'DOUBLE POINTS',   pts:'×2 / 5s',tag:'purple ring — chain it',          color:'#bf6fff' },
          { label:'COMBO ×3',        pts:'5 chain', tag:'3 chain = ×2, 5 chain = ×3',     color:'#4ec9b0' },
          { label:'BOMB',            pts:'−1 ❤',   tag:'black fuse — dodge it',           color:'#c0392b' },
        ].map((row, i, arr) => (
          <div key={i} style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'16px 0',
            borderBottom: i<arr.length-1 ? '1px solid rgba(240,237,230,0.06)' : 'none',
          }}>
            <div>
              <div style={{ fontSize:'13px', letterSpacing:'0.2em', color:row.color, fontWeight:700 }}>
                {row.label}
              </div>
              <div style={{ fontSize:'11px', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.25)', marginTop:'3px' }}>
                {row.tag}
              </div>
            </div>
            <div style={{ fontSize:'20px', color:row.color, fontFamily:'"DM Mono",monospace', fontWeight:500, letterSpacing:'-0.5px' }}>
              {row.pts}
            </div>
          </div>
        ))}
 
        <div style={{ marginTop:'40px', paddingTop:'28px', borderTop:'1px solid rgba(240,237,230,0.06)' }}>
          <div style={{ fontSize:'10px', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.15)', letterSpacing:'0.3em' }}>
            GOLD +100 · PURPLE ×2 · BOMB −1♥ · COMBO ×3 MAX
          </div>
        </div>
      </div>
    </div>
  );
 
  // ─── GAME HUD ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      position:'relative', width:'100%', height:'100vh', overflow:'hidden',
      background:`url('/bg-dojo.png') center/cover no-repeat, #0c0b09`,
      cursor:'crosshair', userSelect:'none',
      animation: shaking ? 'screen-shake 0.45s ease-in-out' : 'none',
    }}>
      <style>{GLOBAL_CSS}</style>
 
      {/* vignette */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none', zIndex:4,
        background:'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
      }}/>
 
      {/* left red bar */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'5px', background:'#c0392b', zIndex:20 }}/>
 
      {/* ── SCORE ── */}
      <div style={{ position:'absolute', top:'28px', left:'28px', zIndex:20, fontFamily:'"Oswald",sans-serif' }}>
        <div style={{ fontSize:'10px', letterSpacing:'0.5em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace', marginBottom:'4px' }}>
          SCORE<span style={{ animation:'blink 1.1s step-end infinite', color:'#c0392b', marginLeft:'2px' }}>_</span>
        </div>
        <div style={{
          fontSize:'clamp(48px,7vw,72px)', lineHeight:1,
          color: isX2 ? '#bf6fff' : '#f0ede6',
          letterSpacing:'-1px',
          transition:'color 0.25s',
          animation: scorePop ? 'score-pop 0.18s ease-out' : 'none',
        }}>
          {String(score).padStart(6,'0')}
        </div>
 
        {/* lives as vertical bars */}
        <div style={{ display:'flex', gap:'5px', marginTop:'14px', alignItems:'flex-end' }}>
          {[2,1,0].map(i => (
            <div key={i} style={{
              width:'4px',
              height: i===2?'28px':i===1?'22px':'16px',
              background: i < lives ? '#c0392b' : 'rgba(240,237,230,0.1)',
              borderRadius:'1px',
              transition:'background 0.3s',
            }}/>
          ))}
          <span style={{ marginLeft:'6px', fontSize:'10px', fontFamily:'"DM Mono",monospace', color:'rgba(240,237,230,0.2)', lineHeight:'28px' }}>
            {lives} LIVES
          </span>
        </div>
      </div>
 
      {/* ── COMBO ── */}
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
          <div style={{
            fontSize:'10px', letterSpacing:'0.4em', fontFamily:'"DM Mono",monospace',
            color:'rgba(240,237,230,0.3)', marginTop:'2px',
          }}>
            {combo>=7?'LEGENDARY':combo>=4?'EXCELLENT':'COMBO'}
          </div>
        </div>
      )}
 
      {/* ── X2 ── */}
      {isX2 && (
        <div style={{
          position:'absolute', bottom:'40px', right:'28px', zIndex:20,
          animation:'x2-slide 0.2s ease-out',
        }}>
          <div style={{ borderLeft:'3px solid #bf6fff', paddingLeft:'14px' }}>
            <div style={{ fontSize:'11px', letterSpacing:'0.3em', color:'#bf6fff', fontFamily:'"DM Mono",monospace' }}>
              DOUBLE POINTS
            </div>
            <div style={{ fontSize:'10px', color:'rgba(240,237,230,0.25)', fontFamily:'"DM Mono",monospace', marginTop:'3px' }}>
              ACTIVE FOR 5 SECONDS
            </div>
            <div style={{ marginTop:'8px', height:'2px', background:'rgba(191,111,255,0.15)', width:'140px' }}>
              <div style={{ height:'100%', background:'#bf6fff', transformOrigin:'left', animation:'bar-drain 5s linear forwards' }}/>
            </div>
          </div>
        </div>
      )}
 
      {/* ── BOTTOM STRIP ── */}
      <div style={{
        position:'absolute', bottom:'16px', left:'28px', zIndex:20,
        fontFamily:'"DM Mono",monospace', fontSize:'10px',
        color:'rgba(240,237,230,0.12)', letterSpacing:'0.2em',
      }}>
        GOLD +100 · PURPLE ×2 · BOMB −1♥ · COMBO ×3
      </div>
 
      {/* ── GAME OVER ── */}
      {gameOver && (
        <div style={{
          position:'absolute', inset:0, background:'rgba(6,5,4,0.95)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:50, fontFamily:'"Oswald",sans-serif',
        }}>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'5px', background:'#c0392b' }}/>
 
          <div style={{ textAlign:'center' }}>
            <div style={{
              fontSize:'clamp(72px,14vw,148px)',
              lineHeight:0.88, letterSpacing:'-2px',
              animation:'go-stamp 0.5s cubic-bezier(.22,1,.36,1) forwards',
            }}>
              <span style={{ WebkitTextStroke:'2px #c0392b', color:'transparent' }}>GAME</span><br/>
              <span style={{ color:'#f0ede6' }}>OVER</span>
            </div>
 
            <div style={{ display:'flex', gap:'12px', alignItems:'center', justifyContent:'center', margin:'28px 0' }}>
              <div style={{ flex:1, height:'1px', background:'rgba(240,237,230,0.1)', maxWidth:'80px' }}/>
              <div style={{ width:'6px', height:'6px', background:'#c0392b', borderRadius:'50%' }}/>
              <div style={{ flex:1, height:'1px', background:'rgba(240,237,230,0.1)', maxWidth:'80px' }}/>
            </div>
 
            <div style={{ fontSize:'11px', letterSpacing:'0.45em', color:'rgba(240,237,230,0.3)', fontFamily:'"DM Mono",monospace', marginBottom:'8px' }}>
              FINAL SCORE
            </div>
            <div style={{ fontSize:'clamp(36px,6vw,64px)', color:'#f0ede6', letterSpacing:'-1px' }}>
              {String(scoreRef.current).padStart(6,'0')}
            </div>
 
            <div style={{
              display:'inline-block', marginTop:'14px',
              padding:'7px 24px',
              border:`1px solid ${scoreRef.current>=1000?'rgba(255,201,48,0.35)':scoreRef.current>=500?'rgba(78,201,176,0.35)':'rgba(240,237,230,0.1)'}`,
              color: scoreRef.current>=1000?'#ffc930':scoreRef.current>=500?'#4ec9b0':'rgba(240,237,230,0.3)',
              fontSize:'11px', letterSpacing:'0.4em', fontFamily:'"DM Mono",monospace',
              borderRadius:'2px',
            }}>
              {scoreRef.current>=1000?'MASTER SLICER':scoreRef.current>=500?'SKILLED NINJA':'APPRENTICE'}
            </div>
 
            <div style={{ marginTop:'44px' }}>
              <button
                onClick={()=>window.location.reload()}
                style={{
                  padding:'14px 56px', fontSize:'17px', letterSpacing:'0.25em',
                  background:'#c0392b', color:'#f0ede6',
                  border:'none', borderRadius:'2px',
                  cursor:'pointer', fontFamily:'"Oswald",sans-serif',
                  transition:'background 0.15s, transform 0.1s',
                }}
                onMouseEnter={e=>{const el=e.currentTarget; el.style.background='#e03020'; el.style.transform='scale(1.04)';}}
                onMouseLeave={e=>{const el=e.currentTarget; el.style.background='#c0392b'; el.style.transform='scale(1)';}}
              >
                RETRY
              </button>
            </div>
          </div>
        </div>
      )}
 
      <canvas ref={canvasRef} style={{ position:'relative', zIndex:10, width:'100%', height:'100%' }}/>
    </div>
  );
}
 