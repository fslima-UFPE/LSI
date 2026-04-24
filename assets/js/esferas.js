document.addEventListener('DOMContentLoaded', function() {
  // Procura pelo ID da Aula 2 ou pelo ID da Aula 5
  const container = document.getElementById('gas-ideal') || document.getElementById('esferas-rigidas');
  if (!container) return;

  // --- VARIÁVEIS GLOBAIS E ESTADO ---
  let isCalculating = false;
  let frames = [];         
  let velocityData = [];   
  let frequencyData = [];
  let histData = [];
  let simulationHistory = [];

  let theoreticalMeanV = 0;
  let velocityMaxY = 10;
  let frequencyMaxY = 10; 
  let histConfig = { vmin: -10, vmax: 10, binWidth: 0.5, bins: 40 };
  let theoreticalCurve = [];
  let maxHistY = 1.0;

  // Reprodução
  let isPlaying = false;
  let currentFrameIdx = 0;
  let exactFrame = 0;
  let animId = null;

  // Elementos DOM
  const btnRun = document.getElementById('btn-run');
  const uiProgress = document.getElementById('ui-progress');
  const uiVis = document.getElementById('ui-visualization');
  const progText = document.getElementById('progress-text');
  
  const canvas = document.getElementById('sim-canvas');
  const ctx = canvas.getContext('2d');
  
  const btnPlay = document.getElementById('btn-play');
  const scrubber = document.getElementById('inp-scrubber');
  const svgHist = document.getElementById('svg-hist');
  const svgVel = document.getElementById('svg-vel');
  const svgFreq = document.getElementById('svg-freq'); // Adicionado

  // --- UTILS ---
  function gaussian(a, b, v) { return a * Math.exp(-b*(v**2)); }
  function randomUniform(min, max) { return Math.random() * (max - min) + min; }

  function getSpeedColor(vx, vy, vmax) {
    const speed = Math.hypot(vx, vy);
    let ratio = speed / (vmax * 0.8);
    if (ratio > 1) ratio = 1; 
    const r = Math.round(255 * ratio);
    const b = Math.round(255 * (1 - ratio));
    return `rgb(${r}, 0, ${b})`;
  }

  // --- CLASSE BOLA ---50
  class Bola {
    constructor(radius, mass, x, y, vx, vy, color) {
      this.radius = radius; this.mass = mass;
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.color = color;
    }
    advance(dt, edge, simRef) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.x + this.radius >= edge) { this.x = edge - this.radius; this.vx *= -1; simRef.colisaoContador++; } 
      if (this.x - this.radius <= 0) { this.x = this.radius; this.vx *= -1; simRef.colisaoContador++; }
      if (this.y + this.radius >= edge) { this.y = edge - this.radius; this.vy *= -1; simRef.colisaoContador++; } 
      if (this.y - this.radius <= 0) { this.y = this.radius; this.vy *= -1; simRef.colisaoContador++; }
    }
  }

  // --- SIMULAÇÃO ---
  async function runSimulation() {
    if (isCalculating) return;
    isCalculating = true;

    // Verifica se o input do Sigma existe no HTML atual
    const inputSigma = document.getElementById('inp-sigma');
    const sigma = inputSigma ? parseFloat(inputSigma.value) : null;
    // Ler parâmetros da UI
    const params = {
      n1: Number(document.getElementById('inp-n1').value),
      // Se o sigma existir, o raio 1 é sigma/2. Se não, lê o inp-r1 default do html
      r1: sigma !== null ? (sigma / 2.0) : Number(document.getElementById('inp-r1').value),
      m1: Number(document.getElementById('inp-m1').value),
      n2: Number(document.getElementById('inp-n2').value),
      r2: Number(document.getElementById('inp-r2').value),
      m2: Number(document.getElementById('inp-m2').value),
      T: Number(document.getElementById('inp-T').value),
      steps: Number(document.getElementById('inp-steps').value),
      edge: Number(document.getElementById('inp-edge').value),
      dt: Number(document.getElementById('inp-dt').value),
      freqInterval: Number(document.getElementById('inp-freqInterval').value)
    };

    btnRun.disabled = true;
    btnRun.innerText = "Calculando...";
    uiProgress.style.display = 'block';
    uiVis.style.display = 'none';
    
    frames = []; velocityData = []; histData = []; 
    frequencyData = [{ step: 0, count: 0 }]; 
    
    await new Promise(r => setTimeout(r, 50)); 
    
    const particles = [];
    const k1 = 5.0;
    const sigma1 = Math.sqrt(k1 * params.T / params.m1);
    const b1 = 1 / (sigma1**2);
    theoreticalMeanV = Math.sqrt(Math.PI / b1) / 2;
    const a1 = Math.sqrt(b1 / Math.PI); 

    histConfig.vmax = 3.5 * sigma1;
    histConfig.vmin = -histConfig.vmax;
    histConfig.bins = 40;
    histConfig.binWidth = (histConfig.vmax - histConfig.vmin) / histConfig.bins;

    theoreticalCurve = [];
    let maxT = 0;
    for (let i = 0; i <= 50; i++) {
      let v = histConfig.vmin + (i / 50) * (histConfig.vmax - histConfig.vmin);
      let dens = a1 * Math.exp(-b1 * (v**2));
      theoreticalCurve.push({ v, dens });
      if (dens > maxT) maxT = dens;
    }
    maxHistY = maxT * 1.3;

    let runningBins = new Array(histConfig.bins).fill(0);
    let runningTotal = 0;

    const placeParticles = (count, r, m, baseColor) => {
      let placed = 0; let attempts = 0;
      const maxAttempts = count * 2000;
      const sigma = Math.sqrt(k1 * params.T / m);
      const b = 1 / (sigma**2);
      const a = Math.sqrt(b/Math.PI);
      const vmax = 3*sigma; const vmin = -vmax;
      const slices = 40; const window = (vmax - vmin)/slices;
      const prob_wind = [];

      for (let i = 0; i < slices; i++) {    	
        const l_bound = vmin + i * window;
        const u_bound = l_bound + window;
        prob_wind.push((gaussian(a,b,u_bound) + gaussian(a,b,l_bound))*window/2);
      }

      while (placed < count && attempts < maxAttempts) {
        attempts++;50
        const x = Math.random() * (params.edge - 2*r) + r;
        const y = Math.random() * (params.edge - 2*r) + r;
        
        let overlap = false;
        for (let p of particles) {
          if (Math.hypot(x - p.x, y - p.y) <= (r + p.radius)) { overlap = true; break; }
        }
        
        if (!overlap) {
          let vx, vy;
          while (true) {
            vx = randomUniform(vmin,vmax); vy = randomUniform(vmin,vmax);
            const wx = Math.random(); const wy = Math.random();
            let ix = Math.floor(((vx - vmin) / (vmax - vmin)) * slices);
            let iy = Math.floor(((vy - vmin) / (vmax - vmin)) * slices);
            ix = Math.max(0, Math.min(ix, slices - 1));
            iy = Math.max(0, Math.min(iy, slices - 1));
            if (wx <= prob_wind[ix] && wy <= prob_wind[iy]) break;
          }	
          particles.push(new Bola(r, m, x, y, vx, vy, baseColor));
          placed++;
        }
      }
    };

    placeParticles(params.n1, params.r1, params.m1, '#4caf50');
    placeParticles(params.n2, params.r2, params.m2, '#dc3545');

    const chunkSize = 100; 
    let lastCollisionCount = 0;
    const simObj = { colisaoContador: 0 }; 

    for (let step = 0; step < params.steps; step++) {
      for (let p of particles) p.advance(params.dt, params.edge, simObj);
      
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i]; const p2 = particles[j];
          const dx = p2.x - p1.x; const dy = p2.y - p1.y;
          const dist = Math.hypot(dx, dy);
          const sumRadius = p1.radius + p2.radius;

          if (dist <= sumRadius) {
             const safeDist = dist === 0 ? 1e-8 : dist;
             const theta = Math.atan2(dy, dx);
             const vn1 = Math.cos(theta) * p1.vx + Math.sin(theta) * p1.vy;
             const vn2 = Math.cos(theta) * p2.vx + Math.sin(theta) * p2.vy;
             const vt1 = -Math.sin(theta) * p1.vx + Math.cos(theta) * p1.vy;
             const vt2 = -Math.sin(theta) * p2.vx + Math.cos(theta) * p2.vy;
             
             const un1 = ((p1.mass - p2.mass) * vn1 + 2 * p2.mass * vn2) / (p1.mass + p2.mass);
             const un2 = ((p2.mass - p1.mass) * vn2 + 2 * p1.mass * vn1) / (p1.mass + p2.mass);
             
             p1.vx = Math.cos(theta) * un1 - Math.sin(theta) * vt1;
             p1.vy = Math.sin(theta) * un1 + Math.cos(theta) * vt1;
             p2.vx = Math.cos(theta) * un2 - Math.sin(theta) * vt2;
             p2.vy = Math.sin(theta) * un2 + Math.cos(theta) * vt2;

             const overlap = sumRadius - safeDist;
             if (overlap > 0) {
               p1.x -= (dx / safeDist) * (overlap / 2); p1.y -= (dy / safeDist) * (overlap / 2);
               p2.x += (dx / safeDist) * (overlap / 2); p2.y += (dy / safeDist) * (overlap / 2);
             }
          }
        }
      }
      
      const stride = Math.max(1, Math.floor(params.steps / 1000));
      
      if (step % stride === 0 || step === params.steps - 1) {
        frames.push(particles.map(p => ({ x: p.x, y: p.y, r: p.radius, c: getSpeedColor(p.vx, p.vy, histConfig.vmax) })));
        const totalSpeed = particles.reduce((acc, p) => acc + Math.hypot(p.vx, p.vy), 0);
        velocityData.push({ step, sim: totalSpeed / particles.length, theo: theoreticalMeanV });

        let instBins = new Array(histConfig.bins).fill(0);
        let instTotal = 0;
        for (let p of particles) {
          if (p.mass === params.m1) {
            let bx = Math.floor((p.vx - histConfig.vmin) / histConfig.binWidth);
            let by = Math.floor((p.vy - histConfig.vmin) / histConfig.binWidth);
            if (bx >= 0 && bx < histConfig.bins) { instBins[bx]++; runningBins[bx]++; instTotal++; runningTotal++; }
            if (by >= 0 && by < histConfig.bins) { instBins[by]++; runningBins[by]++; instTotal++; runningTotal++; }
          }
        }
        histData.push({ 
          inst: instBins.map(c => c / (instTotal * histConfig.binWidth || 1)), 
          cum: runningBins.map(c => c / (runningTotal * histConfig.binWidth || 1)) 
        });
      }

      // Regista colisões a cada intervalo
      if (step > 0 && step % params.freqInterval === 0) {
        frequencyData.push({ step, count: simObj.colisaoContador - lastCollisionCount });
        lastCollisionCount = simObj.colisaoContador;
      }
      // Cálulo do Progresso
      if (step % chunkSize === 0) {
        const p = (step / params.steps) * 100;
        progText.innerText = `Progresso: ${p.toFixed(1)}%`;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const maxSimV = Math.max(...velocityData.map(d => d.sim));
    const maxTheoV = Math.max(...velocityData.map(d => d.theo));
    velocityMaxY = Math.max(maxSimV, maxTheoV) * 1.1; 
    
    const maxFreq = frequencyData.length > 1 ? Math.max(...frequencyData.map(d => d.count)) : 0;
    frequencyMaxY = maxFreq > 0 ? maxFreq * 1.1 : 10;

    // --- CÁLCULO DA MÉDIA DOS 80% FINAIS ---
 let avg = 0; 
    
    if (frequencyData && frequencyData.length > 5) {
      const startIdx = Math.floor(frequencyData.length * 0.2);
      const last80 = frequencyData.slice(startIdx);
      
      const sum = last80.reduce((acc, d) => {
        let val = (typeof d === 'number') ? d : (d.count || d.f || d.value || d.freq || 0);
        return acc + val;
      }, 0);
      
      avg = sum / last80.length;
      
      const avgSpan = document.getElementById('val-avg-freq');
      if (avgSpan) avgSpan.innerText = isNaN(avg) ? '--' : avg.toFixed(2);
    }

    const inpN = document.getElementById('inp-n1');
    const inpT = document.getElementById('inp-T');
    const inpM = document.getElementById('inp-m1');
    const inpL = document.getElementById('inp-edge');
    const inpSigma = document.getElementById('inp-sigma');
    
    const currentN = inpN ? inpN.value : '?';
    const currentT = inpT ? inpT.value : '?';
    const currentM = inpM ? inpM.value : '?';
    const currentL = inpL ? inpL.value : '?';
    // Guarda o valor de sigma se existir, senão fica null
    const currentSigma = inpSigma ? inpSigma.value : null;

    simulationHistory.unshift({
      n: currentN,
      t: currentT,
      m: currentM,
      l: currentL,
      sigma: currentSigma,
      f: isNaN(avg) ? '--' : avg.toFixed(2)
    });

    if (simulationHistory.length > 3) simulationHistory.pop();

    const historyContainer = document.getElementById('history-box-content');
    if (historyContainer) {
      historyContainer.innerHTML = simulationHistory.map((sim, index) => {
        
        // Diferenciar texto da Aula 2 pra Aula 5
        let parametrosTexto = `N=${sim.n}, T=${sim.t}, m=${sim.m}, L=${sim.l}`;
        if (sim.sigma !== null) {
            parametrosTexto += `, &sigma;=${sim.sigma}`;
        }

        return `
        <div style="font-size: 0.85em; border-bottom: ${index === simulationHistory.length - 1 ? 'none' : '1px solid #eee'}; padding: 4px 0;">
          <span style="color: ${index === 0 ? '#ff9800' : '#888'}; font-weight: bold;">
            ${index === 0 ? 'ATUAL' : 'Anterior'}
          </span>: 
          ${parametrosTexto} &rarr; <b>f=${sim.f}</b>
        </div>
        `;
      }).join('');
    }

    isCalculating = false;
    btnRun.disabled = false;
    btnRun.innerText = "Atualizar Simulação";
    uiProgress.style.display = 'none';
    uiVis.style.display = 'flex';
    
    scrubber.max = frames.length - 1;
    currentFrameIdx = 0;
    exactFrame = 0;
    
    drawFrame(0);
    updateCharts(0);

  } 

  // --- DESENHO E ANIMAÇÃO ---
  function drawFrame(idx) {
    if (!frames[idx]) return;
    const edge = Number(document.getElementById('inp-edge').value);
    const scale = canvas.width / edge;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let p of frames[idx]) {
      const drawRadius = p.r === 0 ? 0.5 : p.r;
      ctx.beginPath();
      ctx.arc(p.x * scale, (edge - p.y) * scale, drawRadius * scale, 0, Math.PI * 2);
      ctx.fillStyle = p.c; ctx.fill();
      ctx.lineWidth = 0.5; ctx.strokeStyle = '#333'; ctx.stroke();
    }
  }

  function playLoop() {
    const scaleV = document.getElementById('inp-scaleV').checked;
    const T = Number(document.getElementById('inp-T').value);
    const speedFactor = scaleV ? Math.sqrt(Math.max(1, T) / 1000) : 1.0;

    if (exactFrame < frames.length - 1) {
      exactFrame += speedFactor;
      if (exactFrame >= frames.length - 1) { exactFrame = frames.length - 1; isPlaying = false; }
      
      currentFrameIdx = Math.floor(exactFrame);
      scrubber.value = currentFrameIdx;
      drawFrame(currentFrameIdx);
      updateCharts(currentFrameIdx);
      
      if (isPlaying) animId = requestAnimationFrame(playLoop);
      else {
        btnPlay.innerText = 'Reproduzir';
        btnPlay.classList.remove('jsbox-btn-warning');
        btnPlay.classList.add('jsbox-btn-success');
      }
    } else {
      isPlaying = false;
      btnPlay.innerText = 'Reproduzir';
      btnPlay.classList.remove('jsbox-btn-warning');
      btnPlay.classList.add('jsbox-btn-success');
    }
  }

  btnPlay.addEventListener('click', () => {
    if (isPlaying) {
      cancelAnimationFrame(animId);
      isPlaying = false;
      btnPlay.innerText = 'Reproduzir';
      btnPlay.classList.remove('jsbox-btn-warning');
      btnPlay.classList.add('jsbox-btn-success');
    } else {
      isPlaying = true;
      btnPlay.innerText = 'Pausar';
      btnPlay.classList.remove('jsbox-btn-success');
      btnPlay.classList.add('jsbox-btn-warning');
      if (currentFrameIdx >= frames.length - 1) { currentFrameIdx = 0; exactFrame = 0; }
      else { exactFrame = currentFrameIdx; }
      playLoop();
    }
  });

  scrubber.addEventListener('input', (e) => {
    currentFrameIdx = Number(e.target.value);
    exactFrame = currentFrameIdx;
    drawFrame(currentFrameIdx);
    updateCharts(currentFrameIdx);
  });

  // --- RENDERIZAÇÃO DE GRÁFICOS (SVG) ---
  function updateCharts(fIdx) {
    const curHist = histData[fIdx] || { cum: [], inst: [] };
    const curVel = velocityData.slice(0, fIdx + 1);
    const curStep = velocityData[fIdx]?.step || 0;
    const curFreq = frequencyData.filter(d => d.step <= curStep);
    const steps = Number(document.getElementById('inp-steps').value);

    // 1. HISTOGRAMA
    let histHTML = `
      <line x1="40" y1="260" x2="360" y2="260" stroke="#ccc" />
      <line x1="40" y1="260" x2="40" y2="40" stroke="#ccc" />
      <text x="200" y="290" text-anchor="middle" font-size="12" fill="#888">Velocidade (v)</text>
    `;
    const getHistX = i => 40 + (i / histConfig.bins) * 320;
    const histW = 320 / histConfig.bins;
    const getHistY = d => 260 - (d / maxHistY) * 220;
    const getHistH = d => (d / maxHistY) * 220;

    curHist.cum.forEach((dens, i) => {
      histHTML += `<rect x="${getHistX(i)}" y="${getHistY(dens)}" width="${histW}" height="${getHistH(dens)}" fill="#2196f3" opacity="0.5" />`;
    });
    curHist.inst.forEach((dens, i) => {
      histHTML += `<rect x="${getHistX(i)}" y="${getHistY(dens)}" width="${histW}" height="${getHistH(dens)}" fill="none" stroke="#ff9800" stroke-width="2" opacity="0.9" />`;
    });

    let theoPath = "";
    theoreticalCurve.forEach((pt, i) => {
      let x = 40 + ((pt.v - histConfig.vmin) / (histConfig.vmax - histConfig.vmin)) * 320;
      let y = 260 - (pt.dens / maxHistY) * 220;
      theoPath += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });
    histHTML += `<path d="${theoPath}" fill="none" stroke="#28a745" stroke-width="2" />`;
    if (svgHist) { svgHist.innerHTML = histHTML; }
    
    // FUNÇÃO AUXILIAR PARA EIXOS
    const drawAxes = (labelY, maxY) => {
      let html = `
        <line x1="60" y1="300" x2="600" y2="300" stroke="#ccc" />
        <line x1="60" y1="300" x2="60" y2="20" stroke="#ccc" />
        <text x="55" y="25" text-anchor="end" font-size="12" fill="#555">${maxY.toFixed(labelY === 'Velocidade' ? 2 : 0)}</text>
        <text x="55" y="300" text-anchor="end" font-size="12" fill="#555">0</text>
        <text x="30" y="160" text-anchor="middle" transform="rotate(-90, 30, 160)" font-size="12" fill="#888">${labelY}</text>
      `;
      for (let i = 0; i <= 5; i++) {
        let x = 60 + (i / 5) * 540;
        html += `<line x1="${x}" y1="300" x2="${x}" y2="305" stroke="#aaa" />
                 <text x="${x}" y="320" text-anchor="middle" font-size="11" fill="#666">${Math.round((steps/5)*i)}</text>`;
      }
      return html;
    };

    const createPathStr = (data, getKeyY, maxYRef) => {
      if (!data || !data.length) return "";
      let d = `M 60 ${300 - (getKeyY(data[0]) / maxYRef) * 280}`;
      for (let point of data) {
        d += ` L ${60 + (point.step / steps) * 540} ${300 - (getKeyY(point) / maxYRef) * 280}`;
      }
      return d;
    };

    // 2. VELOCIDADE
    let velHTML = drawAxes('Velocidade', velocityMaxY);
    velHTML += `<path d="${createPathStr(velocityData, d=>d.theo, velocityMaxY)}" fill="none" stroke="#28a745" stroke-width="2" stroke-dasharray="5,5" opacity="0.6"/>`;
    velHTML += `<path d="${createPathStr(curVel, d=>d.sim, velocityMaxY)}" fill="none" stroke="#003366" stroke-width="2" />`;
    
    let theoYPos = 300 - (theoreticalMeanV / velocityMaxY) * 280;
    velHTML += `<text x="55" y="${theoYPos + 4}" text-anchor="end" font-size="12" fill="#28a745" font-weight="bold">${theoreticalMeanV.toFixed(2)}</text>
                <line x1="55" y1="${theoYPos}" x2="60" y2="${theoYPos}" stroke="#28a745" stroke-width="2" />`;
    if (svgVel) { svgVel.innerHTML = velHTML; }

    // 3. FREQUÊNCIA DE COLISÕES
    let freqHTML = drawAxes('Colisões / int.', frequencyMaxY);
    freqHTML += `<path d="${createPathStr(curFreq, d=>d.count, frequencyMaxY)}" fill="none" stroke="#ff9800" stroke-width="2" />`;
    if (svgFreq) { svgFreq.innerHTML = freqHTML; };
  }

  btnRun.addEventListener('click', runSimulation);

  // --- BOTÃO DE LIMPAR HISTÓRICO ---
  const btnClearHistory = document.getElementById('btn-clear-history');
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      simulationHistory = []; 
      
      const historyContainer = document.getElementById('history-box-content');
      if (historyContainer) {
        historyContainer.innerHTML = '<p style="color: #999; font-style: italic; font-size: 0.85em;">Nenhuma simulação realizada.</p>';
      }
    });
  }
});
