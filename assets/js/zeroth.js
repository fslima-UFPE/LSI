document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    const btnRun = getEl("btn-run");
    const btnPlay = getEl("btn-play");
    const scrubber = getEl("inp-scrubber");
    const canvas = getEl("sim-canvas");

    if (!canvas || !btnRun) return;

    const ctx = canvas.getContext("2d");

    // Histórico para o "filme"
    let historyX, historyY, historyR, historyT; 
    let totalSteps, totalParticles;
    
    // Controles de animação
    let isPlaying = false, currentFrame = 0;
    let playbackSpeed = 5; 

    // Configuração da Simulação
    let boxConfigs = [
        { id: 0, N: 300, T: 800, m: 1.0, L: 150 }, // Caixa 1: Quente
        { id: 1, N: 300, T: 100, m: 1.0, L: 150 }, // Caixa 2: Fria
        { id: 2, N: 300, T: 400, m: 1.0, L: 150 }  // Caixa 3: Média
    ];
    
    let globalOffsets = [];
    let maxL = 0;
    let totalL = 0;
    const chartHeight = 120; // Espaço para os gráficos no topo

    let maxExpectedT = 0; 

    btnRun.addEventListener("click", () => {
        // Mudar texto do botão para indicar carregamento
        let originalRunText = btnRun.innerText;
        btnRun.innerText = "CALCULANDO...";
        btnRun.disabled = true;

        totalParticles = boxConfigs.reduce((sum, box) => sum + box.N, 0);
        totalL = 0;
        maxL = 0;
        globalOffsets = [];
        maxExpectedT = Math.max(...boxConfigs.map(b => b.T)) * 1.2; 

        // Coordenadas globais X
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

        // --- 1. INICIALIZAÇÃO ---
        let particles = [];
        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            for (let i = 0; i < box.N; i++) {
                particles.push({
                    boxId: b,
                    m: box.m,
                    x: particleRadius + Math.random() * (box.L - 2 * particleRadius),
                    y: particleRadius + Math.random() * (box.L - 2 * particleRadius),
                    vx: randomGaussian(),
                    vy: randomGaussian()
                });
            }
        }

        // --- 2. ESCALA DE TEMPERATURA POR CAIXA ---
        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            let boxParticles = particles.filter(p => p.boxId === b);
            
            let vCMx = 0, vCMy = 0;
            for (let p of boxParticles) { vCMx += p.vx; vCMy += p.vy; }
            vCMx /= box.N; vCMy /= box.N;
            for (let p of boxParticles) { p.vx -= vCMx; p.vy -= vCMy; }

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
        let wallQueues = new Array(boxConfigs.length - 1).fill(null).map(() => ({left: [], right: []}));

        // --- 3. LOOP DE SIMULAÇÃO ---
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

                    // Paredes Y Rígidas
                    if (p.y <= particleRadius) {
                        p.y = particleRadius; p.vy = Math.abs(p.vy);
                    } else if (p.y >= box.L - particleRadius) {
                        p.y = box.L - particleRadius; p.vy = -Math.abs(p.vy);
                    }

                    // Paredes X
                    if (p.x <= particleRadius) {
                        if (p.boxId > 0) {
                            wallQueues[p.boxId - 1].right.push(p);
                        } else {
                            p.x = particleRadius; p.vx = Math.abs(p.vx);
                        }
                    } else if (p.x >= box.L - particleRadius) {
                        if (p.boxId < boxConfigs.length - 1) {
                            wallQueues[p.boxId].left.push(p);
                        } else {
                            p.x = box.L - particleRadius; p.vx = -Math.abs(p.vx);
                        }
                    }

                    kineticE[p.boxId] += 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
                }

                // Paredes Diatérmicas
                for (let w = 0; w < wallQueues.length; w++) {
                    let q = wallQueues[w];
                    
                    q.left.sort(() => Math.random() - 0.5);
                    q.right.sort(() => Math.random() - 0.5);

                    let pairs = Math.min(q.left.length, q.right.length);

                    for (let i = 0; i < pairs; i++) {
                        let pL = q.left[i];  
                        let pR = q.right[i]; 

                        let Kx = 0.5 * pL.m * (pL.vx ** 2) + 0.5 * pR.m * (pR.vx ** 2);
                        
                        let fractionL = Math.random();
                        let Kx_L = fractionL * Kx;
                        let Kx_R = (1 - fractionL) * Kx;

                        pL.vx = -Math.sqrt((2 * Kx_L) / pL.m); 
                        pR.vx = Math.sqrt((2 * Kx_R) / pR.m);  

                        pL.x = boxConfigs[pL.boxId].L - particleRadius;
                        pR.x = particleRadius;
                    }

                    for (let i = pairs; i < q.left.length; i++) {
                        let pL = q.left[i];
                        pL.vx = -Math.abs(pL.vx);
                        pL.x = boxConfigs[pL.boxId].L - particleRadius;
                    }
                    for (let i = pairs; i < q.right.length; i++) {
                        let pR = q.right[i];
                        pR.vx = Math.abs(pR.vx);
                        pR.x = particleRadius;
                    }

                    q.left = []; q.right = [];
                }
                
                // Armazenar Dados do Frame
                let offset = step * totalParticles;
                for (let i = 0; i < totalParticles; i++) {
                    let p = particles[i];
                    historyX[offset + i] = p.x + globalOffsets[p.boxId];
                    historyY[offset + i] = p.y; 

                    let vInstantanea = Math.sqrt(p.vx**2 + p.vy**2);
                    let ratio = Math.min(1, vInstantanea / maxExpectedV);
                    historyR[offset + i] = Math.round(ratio * 255);
                }

                for (let b = 0; b < boxConfigs.length; b++) {
                    let instT = kineticE[b] / (boxConfigs[b].N * R);
                    historyT[step * boxConfigs.length + b] = instT;
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
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        canvas.width = totalL;
        canvas.height = maxL + chartHeight; 
        drawFrame(0);
    }

    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // --- 1. GRÁFICOS NO TOPO ---
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

            // Texto de Temperatura
            let currentT = historyT[frame * boxConfigs.length + b];
            ctx.fillStyle = "white";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`Caixa ${b+1}: ${currentT.toFixed(1)} K`, startX + boxW / 2, 20);
        }

        // --- 2. CAIXAS DA SIMULAÇÃO ---
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

        // --- 3. PARTÍCULAS ---
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
            if (totalSteps === undefined) {
                alert("Por favor, clique em 'GERAR SIMULAÇÃO' primeiro!");
                return;
            }
            isPlaying = !isPlaying;
            btnPlay.innerText = isPlaying ? "Pausar" : "Reproduzir";
            btnPlay.style.backgroundColor = isPlaying ? "#dc3545" : "#28a745"; // Vermelho pausar, Verde play
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
