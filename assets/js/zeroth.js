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
    const chartHeight = 100; 
    let maxExpectedT = 0; 
    const particleRadius = 3.5; 

    btnRun.addEventListener("click", () => {
        let originalRunText = btnRun.innerText;
        btnRun.innerText = "CALCULANDO (Aguarde)...";
        btnRun.disabled = true;
        btnPlay.disabled = true;
        scrubber.disabled = true;

        boxConfigs = [
            { id: 0, N: parseInt(getEl("b0-n").value), T: parseFloat(getEl("b0-t").value), m: 1.0, L: parseFloat(getEl("b0-l").value) },
            { id: 1, N: parseInt(getEl("b1-n").value), T: parseFloat(getEl("b1-t").value), m: 1.0, L: parseFloat(getEl("b1-l").value) },
            { id: 2, N: parseInt(getEl("b2-n").value), T: parseFloat(getEl("b2-t").value), m: 1.0, L: parseFloat(getEl("b2-l").value) }
        ];

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
        // Aumentado drasticamente para garantir que a onda de calor chegue ao equilíbrio
        totalSteps = 50000; 
        
        let avgT = boxConfigs.reduce((sum, box) => sum + box.T, 0) / boxConfigs.length;
        const boost = Math.pow(avgT, 0.5) / 10;
        playbackSpeed = Math.max(2, Math.round(15 * boost)); // Playback mais rápido

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

        function computeChunk() {
            const chunkSize = 1500; 
            const end = Math.min(step + chunkSize, totalSteps);
            const maxExpectedV = 3.0 * Math.sqrt(R * Math.max(...boxConfigs.map(b=>b.T)) / 1.0); 

            for (; step < end; step++) {
                let kineticE = new Array(boxConfigs.length).fill(0);

                for (let i = 0; i < totalParticles; i++) {
                    let p = particles[i];
                    let box = boxConfigs[p.boxId];
                    p.x += p.vx * dt; 
                    p.y += p.vy * dt;

                    if (p.y <= particleRadius) {
                        p.y = particleRadius; p.vy = Math.abs(p.vy);
                    } else if (p.y >= maxL - particleRadius) {
                        p.y = maxL - particleRadius; p.vy = -Math.abs(p.vy);
                    }

                    if (p.x <= particleRadius) {
                        p.x = particleRadius;
                        let E_p = 0.5 * p.m * (p.vx*p.vx + p.vy*p.vy);

                        if (p.boxId > 0 && Math.random() < thermalConductivity) {
                            let targetIndices = boxParticleIndices[p.boxId - 1];
                            if (targetIndices.length > 0) {
                                let partner = particles[targetIndices[Math.floor(Math.random() * targetIndices.length)]];
                                let E_partner = 0.5 * partner.m * (partner.vx*partner.vx + partner.vy*partner.vy);
                                
                                let E_total = E_p + E_partner;
                                let share = Math.random(); 
                                let E_p_new = E_total * share;
                                let E_partner_new = E_total * (1.0 - share);

                                let v_p_new = Math.sqrt(2 * E_p_new / p.m);
                                let v_partner_new = Math.sqrt(2 * E_partner_new / partner.m);

                                let theta_p = (Math.random() - 0.5) * Math.PI; 
                                p.vx = Math.cos(theta_p) * v_p_new;
                                p.vy = Math.sin(theta_p) * v_p_new;

                                let theta_partner = Math.random() * 2 * Math.PI;
                                partner.vx = Math.cos(theta_partner) * v_partner_new;
                                partner.vy = Math.sin(theta_partner) * v_partner_new;
                            } else {
                                p.vx = Math.abs(p.vx);
                            }
                        } else {
                            let v_p = Math.sqrt(2 * E_p / p.m);
                            let theta_p = (Math.random() - 0.5) * Math.PI;
                            p.vx = Math.cos(theta_p) * v_p;
                            p.vy = Math.sin(theta_p) * v_p;
                        }
                    } 
                    else if (p.x >= box.L - particleRadius) {
                        p.x = box.L - particleRadius;
                        let E_p = 0.5 * p.m * (p.vx*p.vx + p.vy*p.vy);

                        if (p.boxId < boxConfigs.length - 1 && Math.random() < thermalConductivity) {
                            let targetIndices = boxParticleIndices[p.boxId + 1];
                            if (targetIndices.length > 0) {
                                let partner = particles[targetIndices[Math.floor(Math.random() * targetIndices.length)]];
                                let E_partner = 0.5 * partner.m * (partner.vx*partner.vx + partner.vy*partner.vy);
                                
                                let E_total = E_p + E_partner;
                                let share = Math.random();
                                let E_p_new = E_total * share;
                                let E_partner_new = E_total * (1.0 - share);

                                let v_p_new = Math.sqrt(2 * E_p_new / p.m);
                                let v_partner_new = Math.sqrt(2 * E_partner_new / partner.m);

                                let theta_p = (Math.random() - 0.5) * Math.PI; 
                                p.vx = -Math.cos(theta_p) * v_p_new;
                                p.vy = Math.sin(theta_p) * v_p_new;

                                let theta_partner = Math.random() * 2 * Math.PI;
                                partner.vx = Math.cos(theta_partner) * v_partner_new;
                                partner.vy = Math.sin(theta_partner) * v_partner_new;
                            } else {
                                p.vx = -Math.abs(p.vx);
                            }
                        } else {
                            let v_p = Math.sqrt(2 * E_p / p.m);
                            let theta_p = (Math.random() - 0.5) * Math.PI;
                            p.vx = -Math.cos(theta_p) * v_p;
                            p.vy = Math.sin(theta_p) * v_p;
                        }
                    }

                    kineticE[p.boxId] += 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
                }
                
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
    
    // VARIÁVEIS GLOBAIS DE ESCALA
    let displayScale = 1;
    let baseW = 0;
    let baseH = 0;

    function finishSimulation(originalText) {
        btnRun.innerText = originalText;
        btnRun.disabled = false;
        btnPlay.disabled = false;
        scrubber.disabled = false;
        
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        
        // --- SISTEMA DE ESCALA DE ALTA RESOLUÇÃO ---
        const container = canvas.parentElement;
        const containerW = container.clientWidth || 800; // Pega a largura real da div cinza
        
        baseW = totalL;
        baseH = maxL + chartHeight + 20;
        
        // Faz o canvas preencher a largura do container
        displayScale = containerW / baseW; 
        
        const dpr = window.devicePixelRatio || 1;
        const finalW = baseW * displayScale;
        const finalH = baseH * displayScale;

        // Estilo CSS controla o tamanho visual na tela
        canvas.style.width = finalW + "px";
        canvas.style.height = finalH + "px";
        
        // Propriedades Width/Height controlam os pixels reais (DPR)
        canvas.width = finalW * dpr;
        canvas.height = finalH * dpr;
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr * displayScale, dpr * displayScale);

        drawFrame(0);
    }

    function drawFrame(frame) {
        // Limpa usando as dimensões lógicas originais
        ctx.clearRect(0, 0, baseW, baseH);
        
        const chartColors = ["#d9534f", "#f0ad4e", "#5cb85c"]; 

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, totalL, chartHeight);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, totalL, chartHeight);

        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            let startX = globalOffsets[b];
            let boxW = box.L;

            ctx.beginPath();
            ctx.strokeStyle = chartColors[b];
            ctx.lineWidth = 2.5;
            
            // Otimização para não desenhar 50.000 pontos por linha se não precisar
            let stepIncrement = Math.max(1, Math.floor(totalSteps / boxW));
            
            for (let s = 0; s <= frame; s += stepIncrement) {
                let temp = historyT[s * boxConfigs.length + b];
                let x = startX + (s / totalSteps) * boxW;
                let y = chartHeight - (temp / maxExpectedT) * (chartHeight - 15);
                y = Math.max(0, Math.min(chartHeight, y)); 

                if (s === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            // Desenha o último ponto para garantir que a linha vá até o fim do scrubber
            let tempFinal = historyT[frame * boxConfigs.length + b];
            let xFinal = startX + (frame / totalSteps) * boxW;
            let yFinal = chartHeight - (tempFinal / maxExpectedT) * (chartHeight - 15);
            ctx.lineTo(xFinal, Math.max(0, Math.min(chartHeight, yFinal)));
            ctx.stroke();

            ctx.fillStyle = "#222";
            ctx.font = "bold 15px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`${tempFinal.toFixed(1)} K`, startX + boxW / 2, 25);
        }

        const simOffsetY = chartHeight + 10;
        
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, simOffsetY, totalL, maxL);

        ctx.strokeStyle = "#999";
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
        
        for (let i = 0; i < totalParticles; i++) {
            let redVal = historyR[offsetData+i];
            let blueVal = 255 - redVal; 
            ctx.fillStyle = `rgb(${redVal}, 40, ${blueVal})`; 
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
            currentFrame = totalSteps - 1; 
            isPlaying = false; 
            if (btnPlay) {
                btnPlay.innerText = "Reproduzir"; 
                btnPlay.style.backgroundColor = "#28a745";
                btnPlay.style.borderColor = "#28a745";
            }
            if(scrubber) scrubber.value = totalSteps - 1;
            drawFrame(currentFrame);
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
