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

    let historyX, historyY;
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

    // --- Função de Ajuste de Velocidade Visual ---
    function getVisualSpeedMultiplier(T) {
        if (T <= 300) {
            // Escala de 1x (em 0K) até 2x (em 300K)
            return 1 + (T / 300);
        } else {
            // Escala de 2x (em 300K) até 6x (em 1000K)
            // Inclinação: (6 - 2) / (1000 - 300) = 4 / 700
            return 2 + (T - 300) * (4 / 700);
        }
    }

    btnRun.addEventListener("click", () => {
        numParticles = parseInt(getEl("inp-n1").value);
        const T = parseFloat(getEl("inp-T").value);
        const m = parseFloat(getEl("inp-m1").value);
        edgeLength = parseFloat(getEl("inp-edge").value);
        const sigma = isHardSphereMode ? parseFloat(inputSigma.value) : 0;
        const dt = parseFloat(getEl("inp-dt")?.value || 0.005);
        totalSteps = parseInt(getEl("inp-steps")?.value || 15000);
        
        particleRadius = sigma / 2;
        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);

        // --- Cálculo da Velocidade com Multiplicador Customizado ---
        const speedBoost = getVisualSpeedMultiplier(T);
        const vBase = Math.sqrt(T / m) * 5 * speedBoost; 

        let particles = [];
        for (let i = 0; i < numParticles; i++) {
            particles.push({
                x: particleRadius + Math.random() * (edgeLength - (sigma || 1)),
                y: particleRadius + Math.random() * (edgeLength - (sigma || 1)),
                vx: (Math.random() - 0.5) * vBase,
                vy: (Math.random() - 0.5) * vBase
            });
        }

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
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;

                    if (p.x <= particleRadius || p.x >= edgeLength - particleRadius) {
                        p.vx *= -1;
                        wallMomentumTransfer += 2 * m * Math.abs(p.vx);
                        collisionsThisStep++;
                        wallCollisionCount++;
                    }
                    if (p.y <= particleRadius || p.y >= edgeLength - particleRadius) {
                        p.vy *= -1;
                        wallMomentumTransfer += 2 * m * Math.abs(p.vy);
                        collisionsThisStep++;
                        wallCollisionCount++;
                    }

                    if (isHardSphereMode && sigma > 0) {
                        for (let j = i + 1; j < numParticles; j++) {
                            let p2 = particles[j];
                            let dx = p2.x - p.x;
                            let dy = p2.y - p.y;
                            if (dx*dx + dy*dy < sigma * sigma) {
                                let tempVx = p.vx; p.vx = p2.vx; p2.vx = tempVx;
                                let tempVy = p.vy; p.vy = p2.vy; p2.vy = tempVy;
                            }
                        }
                    }
                }

                if (step % 50 === 0) currentWallFreqData.push(collisionsThisStep);
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    historyX[offset + i] = particles[i].x;
                    historyY[offset + i] = particles[i].y;
                }
            }

            getEl("progress-text").innerText = `Calculando: ${Math.floor((step/totalSteps)*100)}%`;
            if (step < totalSteps) setTimeout(computeChunk, 0);
            else finishSimulation(T, dt, wallMomentumTransfer, wallCollisionCount);
        }
        computeChunk();
    });

    function finishSimulation(T, dt, totalMomentum, totalWallCollisions) {
        getEl("ui-progress").style.display = "none";
        btnRun.disabled = false;
        uiVisualization.style.display = "flex";
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        currentFrame = 0;

        const totalTime = totalSteps * dt;
        const area = edgeLength * edgeLength;
        const perimeter = 4 * edgeLength;
        const P_2D = totalMomentum / (totalTime * perimeter);
        const avgWallFreq = totalWallCollisions / totalTime;

        if (isHardSphereMode) {
            if (hsSection) hsSection.style.display = "block";
            const Z = (P_2D * area) / (numParticles * 8.314 * T);
            const eta = (numParticles * Math.PI * (particleRadius**2)) / area;
            simulationResults.push({ T, N: numParticles, sigma: particleRadius*2, eta, P: P_2D, Z, f: avgWallFreq });
            
            if (historyBox) {
                historyBox.innerHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 0.9em;">
                        <span><b>Z:</b> ${Z.toFixed(3)}</span>
                        <span><b>&eta;:</b> ${eta.toFixed(3)}</span>
                        <span><b>P:</b> ${P_2D.toFixed(2)}</span>
                        <span><b>Freq:</b> ${avgWallFreq.toFixed(1)} Hz</span>
                    </div>
                `;
            }
            drawScatterPlot();
        } else {
            if (historyBox) historyBox.innerHTML = `<p style="color:green;">Freq. Média: ${avgWallFreq.toFixed(1)} Hz</p>`;
        }
        drawFrame(0);
    }

    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / edgeLength;
        const offset = frame * numParticles;
        ctx.fillStyle = "#003366";
        const rVisual = Math.max(2, particleRadius * scale);
        for (let i = 0; i < numParticles; i++) {
            ctx.beginPath();
            ctx.arc(historyX[offset + i] * scale, historyY[offset + i] * scale, rVisual, 0, Math.PI * 2);
            ctx.fill();
        }
        drawFreqLineGraph(frame / totalSteps);
    }

    function drawFreqLineGraph(progressRatio) {
        const c = getEl("freq-canvas");
        if (!c) return;
        const g = c.getContext("2d");
        g.clearRect(0, 0, c.width, c.height);
        g.strokeStyle = "#eee";
        g.beginPath(); g.moveTo(30, 10); g.lineTo(30, c.height - 20); g.lineTo(c.width - 10, c.height - 20); g.stroke();
        if (currentWallFreqData.length === 0) return;
        g.strokeStyle = "#d9534f";
        g.lineWidth = 2;
        g.beginPath();
        const pointsToShow = Math.floor(currentWallFreqData.length * progressRatio);
        const stepX = (c.width - 40) / currentWallFreqData.length;
        for (let i = 0; i < pointsToShow; i++) {
            let x = 30 + i * stepX;
            let y = (c.height - 20) - (currentWallFreqData[i] * 12);
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
    }

    function drawScatterPlot() {
        const c = getEl("plot-canvas");
        if (!c || simulationResults.length === 0) return;
        const g = c.getContext("2d");
        const vX = selX.value, vY = selY.value;
        const w = c.width, h = c.height, pad = 40;
        g.clearRect(0, 0, w, h);
        g.strokeStyle = "#ccc";
        g.strokeRect(pad, 10, w - pad - 10, h - pad - 10);
        const maxX = Math.max(...simulationResults.map(d => d[vX])) * 1.1 || 1;
        const maxY = Math.max(...simulationResults.map(d => d[vY])) * 1.1 || 1;
        g.fillStyle = "#003366";
        simulationResults.forEach(d => {
            let px = pad + (d[vX] / maxX) * (w - pad - 20);
            let py = (h - pad) - (d[vY] / maxY) * (h - pad - 20);
            g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
        });
    }

    if (btnPlay) {
        btnPlay.onclick = () => {
            isPlaying = !isPlaying;
            btnPlay.innerText = isPlaying ? "Pausar" : "Reproduzir";
            if (isPlaying) animate();
        };
    }

    function animate() {
        if (!isPlaying) return;
        currentFrame += 5; 
        if (currentFrame >= totalSteps) {
            currentFrame = 0;
            isPlaying = false;
            btnPlay.innerText = "Reproduzir";
            return;
        }
        if (scrubber) scrubber.value = currentFrame;
        drawFrame(currentFrame);
        animationId = requestAnimationFrame(animate);
    }

    if (scrubber) {
        scrubber.oninput = () => {
            currentFrame = parseInt(scrubber.value);
            drawFrame(currentFrame);
        };
    }
});
