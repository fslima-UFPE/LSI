document.addEventListener("DOMContentLoaded", () => {
    // --- Seleção de Elementos com Verificação ---
    const getEl = (id) => document.getElementById(id);

    const btnRun = getEl("btn-run");
    const btnPlay = getEl("btn-play");
    const btnClear = getEl("btn-clear-history");
    const scrubber = getEl("inp-scrubber");
    const canvas = getEl("sim-canvas");
    const historyBox = getEl("history-box-content");
    const uiVisualization = getEl("ui-visualization");
    const inputSigma = getEl("inp-sigma");
    
    // Elementos exclusivos da aula de Esferas Rígidas (HS)
    const selX = getEl("sel-x");
    const selY = getEl("sel-y");
    const hsSection = getEl("hs-analysis-section");

    if (!canvas || !btnRun) {
        console.warn("Simulador: Elementos básicos não encontrados nesta página.");
        return;
    }

    const ctx = canvas.getContext("2d");
    const isHardSphereMode = !!inputSigma; // Detecta se estamos na aula de Esferas Rígidas

    // --- Estado Global ---
    let historyX, historyY, historyR;
    let totalSteps, numParticles, edgeLength, particleRadius;
    let simulationResults = [];
    let currentCollisionFreqData = [];
    let isPlaying = false, currentFrame = 0, animationId = null;

    // --- Listeners Seguros ---
    if (selX) selX.addEventListener("change", drawScatterPlot);
    if (selY) selY.addEventListener("change", drawScatterPlot);
    if (btnClear) btnClear.addEventListener("click", () => {
        simulationResults = [];
        if (historyBox) historyBox.innerHTML = "Histórico limpo.";
        drawScatterPlot();
    });

    btnRun.addEventListener("click", () => {
        // Coleta de dados comum
        numParticles = parseInt(getEl("inp-n1").value);
        const T = parseFloat(getEl("inp-T").value);
        const m = parseFloat(getEl("inp-m1").value);
        edgeLength = parseFloat(getEl("inp-edge").value);
        const sigma = isHardSphereMode ? parseFloat(inputSigma.value) : 0;
        const dt = parseFloat(getEl("inp-dt").value);
        totalSteps = parseInt(getEl("inp-steps").value);
        
        particleRadius = sigma / 2;
        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);
        historyR = new Uint8Array(numParticles * totalSteps);

        let particles = Array.from({ length: numParticles }, () => ({
            x: particleRadius + Math.random() * (edgeLength - (sigma || 1)),
            y: particleRadius + Math.random() * (edgeLength - (sigma || 1)),
            vx: (Math.random() - 0.5) * Math.sqrt(T/m) * 10,
            vy: (Math.random() - 0.5) * Math.sqrt(T/m) * 10
        }));

        getEl("ui-progress").style.display = "block";
        let step = 0;
        let totalCollisions = 0;
        let momentumTransfer = 0;
        currentCollisionFreqData = [];

        function computeChunk() {
            const chunkSize = 500;
            const end = Math.min(step + chunkSize, totalSteps);

            for (; step < end; step++) {
                let collisionsThisStep = 0;
                for (let i = 0; i < numParticles; i++) {
                    let p = particles[i];
                    p.x += p.vx * dt; p.y += p.vy * dt;

                    // Colisões com Paredes
                    if (p.x <= particleRadius || p.x >= edgeLength - particleRadius) {
                        p.vx *= -1;
                        momentumTransfer += 2 * m * Math.abs(p.vx);
                        if (!isHardSphereMode) collisionsThisStep++; // No IG, conta parede
                    }
                    if (p.y <= particleRadius || p.y >= edgeLength - particleRadius) {
                        p.vy *= -1;
                        momentumTransfer += 2 * m * Math.abs(p.vy);
                        if (!isHardSphereMode) collisionsThisStep++; // No IG, conta parede
                    }

                    // Colisões entre partículas (Só se for Esferas Rígidas)
                    if (isHardSphereMode) {
                        for (let j = i + 1; j < numParticles; j++) {
                            let p2 = particles[j];
                            let dx = p2.x - p.x, dy = p2.y - p.y;
                            if (dx*dx + dy*dy < sigma*sigma) {
                                let tvx = p.vx; p.vx = p2.vx; p2.vx = tvx;
                                let tvy = p.vy; p.vy = p2.vy; p2.vy = tvy;
                                collisionsThisStep++;
                                totalCollisions++;
                            }
                        }
                    }
                }
                
                if (step % 50 === 0) currentCollisionFreqData.push(collisionsThisStep);
                
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    historyX[offset + i] = particles[i].x;
                    historyY[offset + i] = particles[i].y;
                }
            }

            getEl("progress-text").innerText = `Calculando: ${Math.floor((step/totalSteps)*100)}%`;
            if (step < totalSteps) setTimeout(computeChunk, 0);
            else finishCalculation(T, dt, momentumTransfer, totalCollisions);
        }
        computeChunk();
    });

    function finishCalculation(T, dt, momentum, collisions) {
        getEl("ui-progress").style.display = "none";
        uiVisualization.style.display = "flex";
        if (scrubber) scrubber.max = totalSteps - 1;

        if (isHardSphereMode) {
            if (hsSection) hsSection.style.display = "block";
            let area = edgeLength * edgeLength;
            let P = momentum / (totalSteps * dt * (4 * edgeLength));
            let Z = (P * area) / (numParticles * 8.314 * T);
            let eta = (numParticles * Math.PI * (particleRadius**2)) / area;
            
            simulationResults.push({ T, N: numParticles, sigma: particleRadius*2, eta, P, Z, f: collisions/(totalSteps*dt) });
            if (historyBox) historyBox.innerHTML = `<p><b>Z:</b> ${Z.toFixed(3)} | <b>&eta;:</b> ${eta.toFixed(3)}</p>`;
            drawScatterPlot();
        } else {
            if (historyBox) historyBox.innerHTML = `<p>Simulação IG: OK</p>`;
        }
        drawFrame(0);
    }

    // --- Desenho das Telas ---
    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let scale = canvas.width / edgeLength;
        let offset = frame * numParticles;
        ctx.fillStyle = "#003366";
        for (let i = 0; i < numParticles; i++) {
            ctx.beginPath();
            ctx.arc(historyX[offset+i]*scale, historyY[offset+i]*scale, Math.max(2, particleRadius*scale), 0, Math.PI*2);
            ctx.fill();
        }
        drawFreqGraph(frame / totalSteps);
    }

    function drawFreqGraph(ratio) {
        const c = getEl("freq-canvas");
        if (!c) return; 
        const g = c.getContext("2d");
        g.clearRect(0,0,c.width,c.height);
        g.strokeStyle = "#d9534f";
        g.lineWidth = 2;
        g.beginPath();
        let points = Math.floor(currentCollisionFreqData.length * ratio);
        for(let i=0; i < points; i++) {
            let x = (i/currentCollisionFreqData.length) * c.width;
            let y = c.height - (currentCollisionFreqData[i] * 15); // Escala visual
            if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
        }
        g.stroke();
    }

    function drawScatterPlot() {
        const c = getEl("plot-canvas");
        if (!c || !simulationResults.length) return;
        const g = c.getContext("2d");
        const vX = selX.value, vY = selY.value;
        g.clearRect(0,0,c.width,c.height);
        
        // Eixos simples
        g.strokeStyle = "#ccc";
        g.strokeRect(40, 10, c.width-50, c.height-40);

        simulationResults.forEach(d => {
            let maxX = Math.max(...simulationResults.map(i=>i[vX])) * 1.2;
            let maxY = Math.max(...simulationResults.map(i=>i[vY])) * 1.2;
            let x = 40 + (d[vX] / maxX) * (c.width - 50);
            let y = (c.height - 30) - (d[vY] / maxY) * (c.height - 40);
            g.fillStyle = "#003366";
            g.beginPath(); g.arc(x, y, 5, 0, Math.PI*2); g.fill();
        });
    }

    // --- Animação ---
    if (btnPlay) {
        btnPlay.onclick = () => {
            isPlaying = !isPlaying;
            btnPlay.innerText = isPlaying ? "Pausar" : "Reproduzir";
            if(isPlaying) animate();
        };
    }

    function animate() {
        if(!isPlaying) return;
        currentFrame = (currentFrame + 5) % totalSteps;
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
