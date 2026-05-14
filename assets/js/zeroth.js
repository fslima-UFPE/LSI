document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    const btnRun = getEl("btn-run");
    const btnPlay = getEl("btn-play");
    const scrubber = getEl("inp-scrubber");
    const canvas = getEl("sim-canvas");

    if (!canvas || !btnRun) return;

    const ctx = canvas.getContext("2d");

    let historyX, historyY, historyR, historyT; 
    let totalSteps, totalParticles;
    let isPlaying = false, currentFrame = 0;
    let playbackSpeed = 5; 
    let boxConfigs = [];
    let globalOffsets = [];
    let maxL = 0;
    let totalL = 0;
    const chartHeight = 120; 
    let maxExpectedT = 0; 

    btnRun.addEventListener("click", () => {
        let originalRunText = btnRun.innerText;
        btnRun.innerText = "CALCULANDO...";
        btnRun.disabled = true;
        btnPlay.disabled = true;
        scrubber.disabled = true;

        // Capturar inputs do usuário
        boxConfigs = [
            { id: 0, N: parseInt(getEl("b0-n").value), T: parseFloat(getEl("b0-t").value), m: 1.0, L: parseFloat(getEl("b0-l").value) },
            { id: 1, N: parseInt(getEl("b1-n").value), T: parseFloat(getEl("b1-t").value), m: 1.0, L: parseFloat(getEl("b1-l").value) },
            { id: 2, N: parseInt(getEl("b2-n").value), T: parseFloat(getEl("b2-t").value), m: 1.0, L: parseFloat(getEl("b2-l").value) }
        ];

        // Nova constante de condutividade capturada do HTML
        const thermalConductivity = parseFloat(getEl("wall-k").value) || 0.15;

        totalParticles = boxConfigs.reduce((sum, box) => sum + box.N, 0);
        totalL = 0;
        maxL = 0;
        globalOffsets = [];
        maxExpectedT = Math.max(...boxConfigs.map(b => b.T)) * 1.2; 

        for (let box of boxConfigs) {
            globalOffsets.push(totalL);
            totalL += box.L;
            if (box.L > maxL) maxL = box.L;
        }

        const dt = 0.005;
        totalSteps = 15000;
        const particleRadius = 1.0; 
        
        let avgT = boxConfigs.reduce((sum, box) => sum + box.T, 0) / boxConfigs.length;
        const boost = Math.pow(avgT, 0.5) / 10;
        playbackSpeed = Math.max(1, Math.round(5 * boost));

        historyX = new Float32Array(totalParticles * totalSteps);
        historyY = new Float32Array(totalParticles * totalSteps);
        historyR = new Uint8Array(totalParticles * totalSteps);
        historyT = new Float32Array(boxConfigs.length * totalSteps);

        const R = 8.314; 

        function randomGaussian() {
            let u = 0, v = 0;
            while(u === 0) u = Math.random();
            while(v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        }

        let particles = [];
        let boxParticleIndices = boxConfigs.map(() => []);

        // 1. Inicialização
        let pIndex = 0;
        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            for (let i = 0; i < box.N; i++) {
                particles.push({
                    boxId: b,
                    m: box.m,
                    x: particleRadius + Math.random() * (box.L - 2 * particleRadius),
                    y: particleRadius + Math.random() * (maxL - 2 * particleRadius),
                    vx: randomGaussian(),
                    vy: randomGaussian()
                });
                boxParticleIndices[b].push(pIndex);
                pIndex++;
            }
        }

        // 2. Escala de Temperatura Inicial
        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            let boxParticles = particles.filter(p => p.boxId === b);
            
            let currentKinetic = 0;
            for (let p of boxParticles) {
                currentKinetic += 0.5 * box.m * (p.vx * p.vx + p.vy * p.vy);
            }
            let targetKinetic = box.N * R * box.T;
            let scaleFactor = Math.sqrt(targetKinetic / currentKinetic);

            for (let p of boxParticles) {
                p.vx *= scaleFactor;
                p.vy *= scaleFactor;
            }
        }

        let step = 0;

        // 3. Loop de Simulação
        function computeChunk() {
            const chunkSize = 800;
            const end = Math.min(step + chunkSize, totalSteps);
            const maxExpectedV = 3.0 * Math.sqrt(R * Math.max(...boxConfigs.map(b=>b.T)) / 1.0); 

            for (; step < end; step++) {
                let kineticE = new Array(boxConfigs.length).fill(0);

                for (let i = 0; i < totalParticles; i++) {
                    let p = particles[i];
                    let box = boxConfigs[p.boxId];
                    p.x += p.vx * dt; 
                    p.y += p.vy * dt;

                    // Paredes Y (Apenas rebatimento)
                    if (p.y <= particleRadius) {
                        p.y = particleRadius; p.vy = Math.abs(p.vy);
                    } else if (p.y >= maxL - particleRadius) {
                        p.y = maxL - particleRadius; p.vy = -Math.abs(p.vy);
                    }

                    // Paredes X (Condução Térmica Diatérmica com Fator K)
                    if (p.x <= particleRadius) {
                        p.x = particleRadius;
                        if (p.boxId > 0 && Math.random() < thermalConductivity) {
                            let targetIndices = boxParticleIndices[p.boxId - 1];
                            if (targetIndices.length > 0) {
                                let partner = particles[targetIndices[Math.floor(Math.random() * targetIndices.length)]];
                                let kx_p = 0.5 * p.m * p.vx * p.vx;
                                let kx_partner = 0.5 * partner.m * partner.vx * partner.vx;
                                p.vx = Math.sqrt((2 * kx_partner) / p.m); // Rebate para a direita
                                partner.vx = Math.sign(partner.vx) * Math.sqrt((2 * kx_p) / partner.m);
                            } else {
                                p.vx = Math.abs(p.vx); // Pulo adiabático se a vizinha estiver vazia
                            }
                        } else {
                            p.vx = Math.abs(p.vx); // Pulo adiabático
                        }
                    } else if (p.x >= box.L - particleRadius) {
                        p.x = box.L - particleRadius;
                        if (p.boxId < boxConfigs.length - 1 && Math.random() < thermalConductivity) {
                            let targetIndices = boxParticleIndices[p.boxId + 1];
                            if (targetIndices.length > 0) {
                                let partner = particles[targetIndices[Math.floor(Math.random() * targetIndices.length)]];
                                let kx_p = 0.5 * p.m * p.vx * p.vx;
                                let kx_partner = 0.5 * partner.m * partner.vx * partner.vx;
                                p.vx = -Math.sqrt((2 * kx_partner) / p.m); // Rebate para a esquerda
                                partner.vx = Math.sign(partner.vx) * Math.sqrt((2 * kx_p) / partner.m);
                            } else {
                                p.vx = -Math.abs(p.vx);
                            }
                        } else {
                            p.vx = -Math.abs(p.vx);
                        }
                    }

                    kineticE[p.boxId] += 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
                }
                
                // Salvar dados do Frame
                let offset = step * totalParticles;
                for (let i = 0; i < totalParticles; i++) {
                    let p = particles[i];
                    historyX[offset + i] = p.x + globalOffsets[p.boxId];
                    historyY[offset + i] = p.y; 

                    let vInst = Math.sqrt(p.vx**2 + p.vy**2);
                    let ratio = Math.min(1, vInst / maxExpectedV);
                    historyR[offset + i] = Math.round(ratio * 255);
                }

                for (let b = 0; b < boxConfigs.length; b++) {
                    historyT[step * boxConfigs.length + b] = kineticE[b] / (boxConfigs[b].N * R);
                }
            }
            
            if (step < totalSteps) {
                setTimeout(computeChunk, 0);
            } else {
                finishSimulation(originalRunText);
            }
        }
        computeChunk();
    });
    
    function finishSimulation(originalText) {
        btnRun.innerText = originalText;
        btnRun.disabled = false;
        btnPlay.disabled = false;
        scrubber.disabled = false;
        
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        canvas.width = totalL;
        canvas.height = maxL + chartHeight; 
        drawFrame(0);
    }

    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = 1.5;
        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            let startX = globalOffsets[b];
            let boxW = box.L;

            ctx.fillStyle = "#1e1e1e";
            ctx.fillRect(startX, 0, boxW, chartHeight);
            ctx.strokeStyle = "#444";
            ctx.strokeRect(startX, 0, boxW, chartHeight);

            ctx.beginPath();
            ctx.strokeStyle = `hsl(${(b * 60) % 360}, 80%, 60%)`; 
            
            for (let s = 0; s <= frame; s += Math.max(1, Math.floor(frame / boxW))) {
                let temp = historyT[s * boxConfigs.length + b];
                let x = startX + (s / totalSteps) * boxW;
                let y = chartHeight - (temp / maxExpectedT) * chartHeight;
                y = Math.max(0, Math.min(chartHeight, y)); 

                if (s === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            let currentT = historyT[frame * boxConfigs.length + b];
            ctx.fillStyle = "white";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`C${b+1}: ${currentT.toFixed(1)} K`, startX + boxW / 2, 20);
        }

        const simOffsetY = chartHeight;
        
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        for (let offset of globalOffsets) {
            if (offset === 0) continue;
            ctx.beginPath();
            ctx.moveTo(offset, simOffsetY);
            ctx.lineTo(offset, simOffsetY + maxL);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const offsetData = frame * totalParticles;
        const particleRadius = 1.0; 
        
        for (let i = 0; i < totalParticles; i++) {
            let redVal = historyR[offsetData+i];
            let blueVal = 255 - redVal; 
            ctx.fillStyle = `rgb(${redVal}, 0, ${blueVal})`; 
            ctx.beginPath();
            ctx.arc(historyX[offsetData+i], historyY[offsetData+i] + simOffsetY, particleRadius, 0, Math.PI*2);
            ctx.fill();
        }
    }

    if (btnPlay) {
        btnPlay.onclick = () => {
            if (totalSteps === undefined) return;
            isPlaying = !isPlaying;
            btnPlay.innerText = isPlaying ? "Pausar" : "Reproduzir";
            btnPlay.style.backgroundColor = isPlaying ? "#dc3545" : "#28a745"; 
            btnPlay.style.borderColor = isPlaying ? "#dc3545" : "#28a745";
            if(isPlaying) animate();
        };
    }

    function animate() {
        if(!isPlaying) return;
        currentFrame += playbackSpeed; 
        
        if(currentFrame >= totalSteps) { 
            currentFrame = 0; 
            isPlaying = false; 
            if (btnPlay) {
                btnPlay.innerText = "Reproduzir"; 
                btnPlay.style.backgroundColor = "#28a745";
                btnPlay.style.borderColor = "#28a745";
            }
            if(scrubber) scrubber.value = 0;
            drawFrame(0);
            return; 
        }
        
        if(scrubber) scrubber.value = currentFrame;
        drawFrame(currentFrame);
        requestAnimationFrame(animate);
    }

    if (scrubber) scrubber.oninput = () => { 
        if (totalSteps !== undefined) {
            currentFrame = parseInt(scrubber.value); 
            drawFrame(currentFrame); 
        }
    };
});
