document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    const btnRun = getEl("btn-run-zeroth");
    const btnStop = getEl("btn-stop-zeroth");
    const btnReset = getEl("btn-reset-zeroth");
    const canvas = getEl("sim-canvas-zeroth");

    if (!canvas || !btnRun) return;

    const ctx = canvas.getContext("2d");

    const T_SCALE = 20; 

    // Dimensões Fixas e Fator de Segurança
    const TOTAL_WIDTH = 600;
    const BOX_HEIGHT = 200;
    const SAFETY_FACTOR = 0.90; 

    let totalParticles;
    let boxConfigs = [];
    let globalOffsets = [];
    const chartHeight = 100; 
    let maxExpectedT = 0; 

    let particles = [];
    let boxParticleIndices = [];
    let isRunning = false;
    let currentStep = 0;
    let convergenceCounter = 0;
    let animationId = null; 
    
    const dt = 0.005;
    const R = 8.314; 
    const requiredConvergenceSteps = 300; 
    let thermalConductivity = 0.15;

    let chartHistory = [];
    let chartSampleInterval = 30; 
    let smoothedT = []; 

    let baseW = TOTAL_WIDTH;
    let baseH = BOX_HEIGHT + chartHeight + 20;

    btnRun.addEventListener("click", startSimulation);
    
    btnStop.addEventListener("click", () => {
        isRunning = false;
        btnRun.innerText = "CONTINUAR SIMULAÇÃO";
        btnRun.disabled = false;
        btnStop.disabled = true;
    });

    btnReset.addEventListener("click", () => {
        isRunning = false;
        cancelAnimationFrame(animationId);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        chartHistory = [];
        particles = [];
        
        btnRun.innerText = "INICIAR SIMULAÇÃO";
        btnRun.disabled = false;
        btnStop.disabled = true;
        btnReset.disabled = true;
    });

    function startSimulation() {
        if (isRunning) return; 

        btnRun.innerText = "SIMULANDO (Aguardando)...";
        btnRun.disabled = true;
        btnStop.disabled = false;
        btnReset.disabled = false;

        if (particles.length === 0) {
            boxConfigs = [
                { 
                    id: 0, 
                    N: parseInt(getEl("b0-n-zeroth").value) || 100, 
                    T: (parseFloat(getEl("b0-t-zeroth").value) || 300) * T_SCALE, 
                    m: 1.0, 
                    L: TOTAL_WIDTH / 3,
                    r: parseFloat(getEl("b0-r-zeroth").value) || 3.5
                },
                { 
                    id: 1, 
                    N: parseInt(getEl("b1-n-zeroth").value) || 100, 
                    T: (parseFloat(getEl("b1-t-zeroth").value) || 300) * T_SCALE, 
                    m: 1.0, 
                    L: TOTAL_WIDTH / 3,
                    r: parseFloat(getEl("b1-r-zeroth").value) || 3.5
                },
                { 
                    id: 2, 
                    N: parseInt(getEl("b2-n-zeroth").value) || 100, 
                    T: (parseFloat(getEl("b2-t-zeroth").value) || 300) * T_SCALE, 
                    m: 1.0, 
                    L: TOTAL_WIDTH / 3,
                    r: parseFloat(getEl("b2-r-zeroth").value) || 3.5
                }
            ];

            // Verificação de superlotamento usando a constante SAFETY_FACTOR
            for (let box of boxConfigs) {
                let maxCols = Math.floor(box.L / (2 * box.r));
                let maxRows = Math.floor(BOX_HEIGHT / (2 * box.r));
                let absoluteMax = maxCols * maxRows;
                
                let safeMax = Math.floor(absoluteMax * SAFETY_FACTOR);

                if (box.N > safeMax) {
                    alert(`Erro: A caixa ${box.id + 1} está superlotada!\nCom o raio de ${box.r}, o limite seguro para evitar falhas na física é de ${safeMax} partículas. Você tentou inserir ${box.N}.`);
                    
                    btnRun.innerText = "INICIAR SIMULAÇÃO";
                    btnRun.disabled = false;
                    btnStop.disabled = true;
                    btnReset.disabled = true;
                    return; 
                }
            }

            thermalConductivity = parseFloat(getEl("wall-k-zeroth").value) || 0.15;
            totalParticles = boxConfigs.reduce((sum, box) => sum + box.N, 0);
            
            globalOffsets = [];
            let currentOffset = 0;
            
            maxExpectedT = Math.max(...boxConfigs.map(b => b.T), 10) * 1.2; 
            smoothedT = boxConfigs.map(b => b.T); 
            chartHistory = [];
            currentStep = 0;
            convergenceCounter = 0;

            for (let box of boxConfigs) {
                globalOffsets.push(currentOffset);
                currentOffset += box.L;
            }

            setupCanvas();
            initParticles();
        }

        isRunning = true;
        gameLoop();
    }

    function initParticles() {
        function randomGaussian() {
            let u = 0, v = 0;
            while(u === 0) u = Math.random();
            while(v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        }

        particles = [];
        boxParticleIndices = boxConfigs.map(() => []);

        let pIndex = 0;
        for (let b = 0; b < boxConfigs.length; b++) {
            let box = boxConfigs[b];
            
            for (let i = 0; i < box.N; i++) {
                let pX, pY;
                let overlapping = true;
                let attempts = 0;
                let maxAttempts = 1000; 

                while (overlapping && attempts < maxAttempts) {
                    pX = box.r + Math.random() * Math.max(1, (box.L - 2 * box.r));
                    pY = box.r + Math.random() * Math.max(1, (BOX_HEIGHT - 2 * box.r));
                    overlapping = false;

                    for (let j = 0; j < boxParticleIndices[b].length; j++) {
                        let existingP = particles[boxParticleIndices[b][j]];
                        let dx = pX - existingP.x;
                        let dy = pY - existingP.y;
                        let distSq = dx * dx + dy * dy;
                        
                        let minDist = box.r + existingP.r;
                        
                        if (distSq < minDist * minDist) {
                            overlapping = true;
                            break;
                        }
                    }
                    attempts++;
                }

                particles.push({
                    boxId: b,
                    m: box.m,
                    r: box.r, 
                    x: pX,
                    y: pY,
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
            if (currentKinetic === 0) currentKinetic = 0.0001; 
            
            let targetKinetic = box.N * R * box.T; 
            let scaleFactor = Math.sqrt(targetKinetic / currentKinetic);

            for (let p of boxParticles) {
                p.vx *= scaleFactor;
                p.vy *= scaleFactor;
            }
        }
    }

    function setupCanvas() {
        const dpr = window.devicePixelRatio || 1;

        canvas.width = baseW * dpr;
        canvas.height = baseH * dpr;
        
        canvas.style.width = "100%";
        canvas.style.maxWidth = baseW + "px";
        canvas.style.height = "auto";
        canvas.style.backgroundColor = "#ffffff";
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }

    function resolveCollisions() {
        for (let b = 0; b < boxConfigs.length; b++) {
            let pIndices = boxParticleIndices[b];
            let len = pIndices.length;
            
            for (let i = 0; i < len; i++) {
                for (let j = i + 1; j < len; j++) {
                    let p1 = particles[pIndices[i]];
                    let p2 = particles[pIndices[j]];
                    
                    let dx = p1.x - p2.x;
                    let dy = p1.y - p2.y;
                    let distSq = dx * dx + dy * dy;
                    
                    let minDist = p1.r + p2.r;
                    let minDistSq = minDist * minDist;
                    
                    if (distSq <= minDistSq && distSq > 0) {
                        let vxDiff = p1.vx - p2.vx;
                        let vyDiff = p1.vy - p2.vy;
                        
                        if (vxDiff * dx + vyDiff * dy < 0) {
                            let dotProduct = vxDiff * dx + vyDiff * dy;
                            let collisionScale = dotProduct / distSq;
                            
                            let collisionX = dx * collisionScale;
                            let collisionY = dy * collisionScale;
                            
                            p1.vx -= collisionX;
                            p1.vy -= collisionY;
                            
                            p2.vx += collisionX;
                            p2.vy += collisionY;
                        }
                    }
                }
            }
        }
    }

    function gameLoop() {
        if (!isRunning) return;

        currentStep++;
        let kineticE = new Array(boxConfigs.length).fill(0);

        for (let i = 0; i < totalParticles; i++) {
            let p = particles[i];
            p.x += p.vx * dt; 
            p.y += p.vy * dt;
        }

        resolveCollisions();

        for (let i = 0; i < totalParticles; i++) {
            let p = particles[i];
            let box = boxConfigs[p.boxId];

            if (p.y <= p.r) {
                p.y = p.r; p.vy = Math.abs(p.vy);
            } else if (p.y >= BOX_HEIGHT - p.r) {
                p.y = BOX_HEIGHT - p.r; p.vy = -Math.abs(p.vy);
            }

            if (p.x <= p.r) {
                p.x = p.r;
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
            else if (p.x >= box.L - p.r) {
                p.x = box.L - p.r;
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
        
        let currentT = new Array(boxConfigs.length);
        for (let b = 0; b < boxConfigs.length; b++) {
            currentT[b] = kineticE[b] / (boxConfigs[b].N * R);
            smoothedT[b] = 0.998 * smoothedT[b] + 0.002 * currentT[b]; 
        }

        if (currentStep % chartSampleInterval === 0) {
            chartHistory.push([...currentT]);
        }

        let maxT = Math.max(...smoothedT);
        let minT = Math.min(...smoothedT);
        let percentDiff = maxT > 0 ? (maxT - minT) / maxT : 0; 

        if (percentDiff <= 0.10) {
            convergenceCounter++;
        } else {
            convergenceCounter = Math.max(0, convergenceCounter - 5);
        }

        if (convergenceCounter >= requiredConvergenceSteps) {
            isRunning = false;
        }

        drawFrame();

        if (isRunning) {
            animationId = requestAnimationFrame(gameLoop);
        } else if (convergenceCounter >= requiredConvergenceSteps) {
            btnRun.innerText = "EQUILÍBRIO ATINGIDO!";
            btnRun.disabled = false;
            btnStop.disabled = true;
        }
    }

    function drawFrame() {
        ctx.clearRect(0, 0, baseW, baseH);
        
        const chartColors = ["blue", "red", "green"]; 

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, TOTAL_WIDTH, chartHeight);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, TOTAL_WIDTH, chartHeight);

        if (chartHistory.length > 0) {
            for (let b = 0; b < boxConfigs.length; b++) {
                let box = boxConfigs[b];
                let startX = globalOffsets[b];
                let boxW = box.L;

                ctx.beginPath();
                ctx.strokeStyle = chartColors[b];
                ctx.lineWidth = 2.5;
                
                for (let s = 0; s < chartHistory.length; s++) {
                    let temp = chartHistory[s][b];
                    let x = startX + (s / Math.max(1, chartHistory.length - 1)) * boxW;
                    let y = chartHeight - (temp / maxExpectedT) * (chartHeight - 15);
                    y = Math.max(0, Math.min(chartHeight, y)); 

                    if (s === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                let currentTempRaw = chartHistory[chartHistory.length - 1][b];
                let displayedTemp = currentTempRaw / T_SCALE;

                ctx.fillStyle = "#222";
                ctx.font = "bold 15px Arial";
                ctx.textAlign = "center";
                ctx.fillText(`${displayedTemp.toFixed(1)} K`, startX + boxW / 2, 25);
            }
        }

        const simOffsetY = chartHeight + 10;
        
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, simOffsetY, TOTAL_WIDTH, BOX_HEIGHT);

        ctx.strokeStyle = "#999";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        for (let offset of globalOffsets) {
            if (offset === 0) continue;
            ctx.beginPath();
            ctx.moveTo(offset, simOffsetY);
            ctx.lineTo(offset, simOffsetY + BOX_HEIGHT);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const maxExpectedV = 3.0 * Math.sqrt(R * Math.max(...boxConfigs.map(b=>b.T)) / 1.0); 

        for (let i = 0; i < totalParticles; i++) {
            let p = particles[i];
            
            let vInst = Math.sqrt(p.vx**2 + p.vy**2);
            let ratio = Math.min(1, vInst / maxExpectedV);
            let redVal = Math.round(ratio * 255);
            let blueVal = 255 - redVal; 

            ctx.fillStyle = `rgb(${redVal}, 40, ${blueVal})`; 
            ctx.beginPath();
            ctx.arc(p.x + globalOffsets[p.boxId], p.y + simOffsetY, p.r, 0, Math.PI*2);
            ctx.fill();
        }
    }
});
