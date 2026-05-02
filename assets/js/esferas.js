document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    const btnRun = getEl("btn-run");
    const btnPlay = getEl("btn-play");
    const btnClear = getEl("btn-clear-history");
    const scrubber = getEl("inp-scrubber");
    const canvas = getEl("sim-canvas");
    const historyBox = getEl("history-box-content");
    const uiVisualization = getEl("ui-visualization");
    const inputSigma = getEl("inp-sigma"); 
    const selX = getEl("sel-x");
    const selY = getEl("sel-y");
    const hsSection = getEl("hs-analysis-section");

    if (!canvas || !btnRun) return;

    const ctx = canvas.getContext("2d");
    const isHardSphereMode = !!inputSigma; 

    let historyX, historyY, historyR; 
    let totalSteps, numParticles, edgeLength, particleRadius;
    let simulationResults = [];
    let currentWallFreqData = []; 
    let isPlaying = false, currentFrame = 0, animationId = null;

    if (selX) selX.addEventListener("change", drawScatterPlot);
    if (selY) selY.addEventListener("change", drawScatterPlot);
    
    if (btnClear) {
        btnClear.addEventListener("click", () => {
            simulationResults = [];
            if (historyBox) historyBox.innerHTML = '<p style="color: #999; font-style: italic;">Histórico limpo.</p>';
            drawScatterPlot();
        });
    }

    function getVisualSpeedMultiplier(T) {
        if (T <= 300) return 1 + (T / 300);
        return 2 + (T - 300) * (4 / 700);
    }

    btnRun.addEventListener("click", () => {
        numParticles = parseInt(getEl("inp-n1").value);
        const T = parseFloat(getEl("inp-T").value);
        const m = parseFloat(getEl("inp-m1").value);
        edgeLength = parseFloat(getEl("inp-edge").value);
        
        const sigmaEffective = isHardSphereMode ? parseFloat(inputSigma.value) : 1.0;
        const dt = parseFloat(getEl("inp-dt")?.value || 0.005);
        totalSteps = parseInt(getEl("inp-steps")?.value || 15000);
        
        particleRadius = sigmaEffective / 2;
        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);
        historyR = new Uint8Array(numParticles * totalSteps);

        // --- CORREÇÃO: Física e Estética Separadas ---
        const vBaseFisico = Math.sqrt(T / m) * 5; // Referência física real
        const boost = getVisualSpeedMultiplier(T);
        const vVisualBase = vBaseFisico * boost; // Velocidade visual estetica

        let particles = Array.from({ length: numParticles }, () => ({
            x: particleRadius + Math.random() * (edgeLength - sigmaEffective),
            y: particleRadius + Math.random() * (edgeLength - sigmaEffective),
            vx: (Math.random() - 0.5) * vVisualBase,
            vy: (Math.random() - 0.5) * vVisualBase
        }));

        getEl("ui-progress").style.display = "block";
        btnRun.disabled = true;

        let step = 0;
        let wallMomentumTransfer = 0;
        let wallCollisionCount = 0;
        currentWallFreqData = [];

        function computeChunk() {
            const chunkSize = 800;
            const end = Math.min(step + chunkSize, totalSteps);

            for (; step < end; step++) {
                let collisionsThisStep = 0;
                for (let i = 0; i < numParticles; i++) {
                    let p = particles[i];
                    p.x += p.vx * dt; p.y += p.vy * dt;

                    if (p.x <= particleRadius || p.x >= edgeLength - particleRadius) {
                        p.vx *= -1; wallMomentumTransfer += 2 * m * Math.abs(p.vx);
                        collisionsThisStep++; wallCollisionCount++;
                    }
                    if (p.y <= particleRadius || p.y >= edgeLength - particleRadius) {
                        p.vy *= -1; wallMomentumTransfer += 2 * m * Math.abs(p.vy);
                        collisionsThisStep++; wallCollisionCount++;
                    }

                    if (isHardSphereMode && sigmaEffective > 0) {
                        for (let j = i + 1; j < numParticles; j++) {
                            let p2 = particles[j];
                            let dx = p2.x - p.x, dy = p2.y - p.y;
                            if (dx*dx + dy*dy < sigmaEffective * sigmaEffective) {
                                let tvx = p.vx; p.vx = p2.vx; p2.vx = tvx;
                                let tvy = p.vy; p.vy = p2.vy; p2.vy = tvy;
                            }
                        }
                    }
                }
                if (step % 50 === 0) currentWallFreqData.push(collisionsThisStep);
                
                // --- CORREÇÃO DO CÁLCULO DE COR ---
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    historyX[offset+i] = particles[i].x;
                    historyY[offset+i] = particles[i].y;
                    
                    let p = particles[i];
                    // Recuperamos a velocidade física real dividindo pelo boost visual
                    let vFisicaInstantanea = Math.sqrt(p.vx**2 + p.vy**2) / boost;
                    
                    // Mapeia vFisica para R (0 a 255). 
                    // Partículas com 2.5x a velocidade física base são Max Vermelho.
                    let ratio = Math.min(1, vFisicaInstantanea / (vBaseFisico * 2.5));
                    let redIndex = Math.round(ratio * 255);
                    historyR[offset + i] = redIndex;
                }
            }
            getEl("progress-text").innerText = `Calculando: ${Math.floor((step/totalSteps)*100)}%`;
            if (step < totalSteps) setTimeout(computeChunk, 0);
            else finishSimulation(T, dt, wallMomentumTransfer, wallCollisionCount, sigmaEffective);
        }
        computeChunk();
    });

    function finishSimulation(T, dt, totalMomentum, totalWallCollisions, sigmaEffective) {
        getEl("ui-progress").style.display = "none";
        btnRun.disabled = false;
        uiVisualization.style.display = "flex";
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        
        const totalTime = totalSteps * dt;
        const perimeter = 4 * edgeLength;
        const area = edgeLength * edgeLength;
        const P_2D = totalMomentum / (totalTime * perimeter);
        const avgWallFreq = totalWallCollisions / totalTime;

        if (isHardSphereMode) {
            if (hsSection) hsSection.style.display = "block";
            const Z = (P_2D * area) / (numParticles * 8.314 * T);
            const eta = (numParticles * Math.PI * (particleRadius**2)) / area;
            simulationResults.push({ T, N: numParticles, sigma: sigmaEffective, eta, P: P_2D, Z, f: avgWallFreq });
            if (historyBox) historyBox.innerHTML = `<b>Z:</b> ${Z.toFixed(3)} | <b>&eta;:</b> ${eta.toFixed(3)} | <b>P:</b> ${P_2D.toFixed(2)}`;
            drawScatterPlot();
        } else {
            if (historyBox) historyBox.innerHTML = `<p style="color:green;">GI Concluído. Freq: ${avgWallFreq.toFixed(1)} Hz</p>`;
        }
        drawFrame(0);
    }

    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / edgeLength;
        const offset = frame * numParticles;
        for (let i = 0; i < numParticles; i++) {
            // Desenha a cor usando o índice R corrigido (0-255)
            // Fixamos G=60 e B=100 da marca
            ctx.fillStyle = `rgb(${historyR[offset+i]}, 60, 100)`;
            ctx.beginPath();
            ctx.arc(historyX[offset+i]*scale, historyY[offset+i]*scale, particleRadius*scale, 0, Math.PI*2);
            ctx.fill();
        }
        drawFreqLineGraph(frame / totalSteps);
    }

    function drawFreqLineGraph(progressRatio) {
        const c = getEl("freq-canvas"); if (!c) return;
        const g = c.getContext("2d");
        g.clearRect(0,0,c.width,c.height);
        g.strokeStyle = "#d9534f"; g.lineWidth = 2; g.beginPath();
        const points = Math.floor(currentWallFreqData.length * progressRatio);
        const stepX = (c.width-40)/currentWallFreqData.length;
        for(let i=0; i<points; i++) {
            let x = 30 + i*stepX; let y = (c.height-20)-(currentWallFreqData[i]*12);
            if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
        }
        g.stroke();
    }

    function drawScatterPlot() {
        const c = getEl("plot-canvas"); if (!c || !simulationResults.length) return;
        const g = c.getContext("2d");
        const vX = selX.value, vY = selY.value;
        g.clearRect(0,0,c.width,c.height);
        const maxX = Math.max(...simulationResults.map(d=>d[vX]))*1.1;
        const maxY = Math.max(...simulationResults.map(d=>d[vY]))*1.1;
        g.fillStyle = "rgb(0, 60, 100)"; // Pontos na cor Azul da marca
        simulationResults.forEach(d => {
            let px = 40 + (d[vX]/maxX)*(c.width-60);
            let py = (c.height-40)-(d[vY]/maxY)*(c.height-60);
            g.beginPath(); g.arc(px,py,4,0,Math.PI*2); g.fill();
        });
    }

    if (btnPlay) {
        btnPlay.onclick = () => {
            isPlaying = !isPlaying;
            btnPlay.innerText = isPlaying ? "Pausar" : "Reproduzir";
            if(isPlaying) animate();
        };
    }

    function animate() {
        if(!isPlaying) return;
        currentFrame += 5;
        if(currentFrame >= totalSteps) { currentFrame=0; isPlaying=false; btnPlay.innerText="Reproduzir"; return; }
        if(scrubber) scrubber.value = currentFrame;
        drawFrame(currentFrame);
        requestAnimationFrame(animate);
    }

    if (scrubber) scrubber.oninput = () => { currentFrame = parseInt(scrubber.value); drawFrame(currentFrame); };
});
