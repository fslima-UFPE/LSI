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
    const elSelX = getEl("sel-x");
    const elSelY = getEl("sel-y");
    const selX = elSelX ? elSelX : false;
    const selY = elSelY ? elSelY : false;
    const hsSection = getEl("hs-analysis-section");

    if (!canvas || !btnRun) return;

    const ctx = canvas.getContext("2d");
    const isHardSphereMode = !!inputSigma; 

    // Históricos de posições e velocidades
    let historyX, historyY, historyR; 
    let historyVX, historyVY; 
    let totalSteps, numParticles, edgeLength, particleRadius, equilibriumStep;
    let simulationResults = [];
    let currentWallFreqData = []; 
    
    // Controles de Animação
    let isPlaying = false, currentFrame = 0, animationId = null;
    let playbackSpeed = 5; 
    let stateChart = null; 

    // Variáveis Globais para o Histograma (Maxwell-Boltzmann)
    let histMedia = [];
    let histAtual = [];
    let histTeorico = [];
    const numBins = 50;
    let vMaxHist = 0;
    let binWidth = 0;
    let samplesCount = 0;

    if (selX) selX.addEventListener("change", drawScatterPlot);
    if (selY) selY.addEventListener("change", drawScatterPlot);
    
    if (btnClear) {
        btnClear.addEventListener("click", () => {
            simulationResults = [];
            if (historyBox) historyBox.innerHTML = '<p style="color: #999; font-style: italic; font-size: 0.85em;">Nenhuma simulação realizada.</p>';
            if (selX && selY) {
                drawScatterPlot();
            } else {
                let chartInstance = Chart.getChart("plot-canvas");
                if (chartInstance) chartInstance.destroy();
                stateChart = null;
            }
        });
    }

    btnRun.addEventListener("click", () => {
        numParticles = parseInt(getEl("inp-n1").value);
        const T = parseFloat(getEl("inp-T").value);
        const m = parseFloat(getEl("inp-m1").value);
        edgeLength = parseFloat(getEl("inp-edge").value);
        
        // Calculando o multiplicador visual para a animação
        const boost = Math.pow(T, 0.5) / 10;
        playbackSpeed = Math.max(1, Math.round(5 * boost));

        // 1 & 2. LOGIC FOR IDEAL GAS VS HARD SPHERE
        let rawSigma = isHardSphereMode ? parseFloat(inputSigma.value) : 0;
        const isIG = rawSigma < 0.1; 

        // Se for IG, o sigma físico é 0 (sem colisão). Caso contrário, usa o input.
        const sigmaEffective = isIG ? 0 : rawSigma;
        
        // Se for IG, desenha com tamanho 1.0 para podermos ver as partículas.
        const visualSigma = isIG ? 1.0 : rawSigma;

        const dt = parseFloat(getEl("inp-dt")?.value || 0.005);
        totalSteps = parseInt(getEl("inp-steps")?.value || 15000);
        
        particleRadius = visualSigma / 2;
        
        // Alocando memória para o filme da simulação
        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);
        historyR = new Uint8Array(numParticles * totalSteps);
        historyVX = new Float32Array(numParticles * totalSteps); 
        historyVY = new Float32Array(numParticles * totalSteps); 

        const R = 8.314; 

        // Configuração dos Bins do Histograma de Velocidades
        const sigmaV = Math.sqrt(R * T / m);
        vMaxHist = 3.5 * sigmaV; 
        binWidth = (2 * vMaxHist) / numBins;
        histMedia = new Array(numBins).fill(0);
        samplesCount = 0;

        function randomGaussian() {
            let u = 0, v = 0;
            while(u === 0) u = Math.random();
            while(v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        }

        // --- 1. INITIALIZATION ---
        let particles = [];
        for (let i = 0; i < numParticles; i++) {
            let p;
            let overlap = true;
            let attempts = 0;
            
            while (overlap && attempts < 2000) {
                p = {
                    x: particleRadius + Math.random() * (edgeLength - visualSigma),
                    y: particleRadius + Math.random() * (edgeLength - visualSigma),
                    vx: randomGaussian(),
                    vy: randomGaussian()
                };
                
                overlap = false;
                // 3. BYPASS INITIAL OVERLAP CHECK IF IDEAL GAS
                if (!isIG) {
                    for (let j = 0; j < particles.length; j++) {
                        let dx = p.x - particles[j].x;
                        let dy = p.y - particles[j].y;
                        if (dx*dx + dy*dy < sigmaEffective * sigmaEffective) {
                            overlap = true;
                            break;
                        }
                    }
                }
                attempts++;
            }
            particles.push(p);
        }

        // --- 2. TEMPERATURE SCALING ---
        let vCMx = 0, vCMy = 0;
        for (let p of particles) { vCMx += p.vx; vCMy += p.vy; }
        vCMx /= numParticles; vCMy /= numParticles;
        for (let p of particles) { p.vx -= vCMx; p.vy -= vCMy; }

        let currentKinetic = 0;
        for (let p of particles) {
            currentKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy);
        }

        let targetKinetic = numParticles * R * T;
        let scaleFactor = Math.sqrt(targetKinetic / currentKinetic);

        for (let p of particles) {
            p.vx *= scaleFactor;
            p.vy *= scaleFactor;
        }

        getEl("ui-progress").style.display = "block";
        btnRun.disabled = true;

        let step = 0;
        let wallMomentumTransfer = 0;
        let wallCollisionCount = 0;
        
        let intervalCollisions = 0;
        const intervalSteps = 50; 
        currentWallFreqData = [];

        equilibriumStep = Math.floor(totalSteps * 0.20); 

        // --- 3. SIMULATION LOOP (PURE PHYSICS) ---
        function computeChunk() {
            const chunkSize = 800;
            const end = Math.min(step + chunkSize, totalSteps);
            const maxExpectedV = 3.0 * sigmaV; 

            for (; step < end; step++) {
                let collisionsThisStep = 0;
                let isEquilibrated = step >= equilibriumStep; 

                if (step === equilibriumStep) {
                    intervalCollisions = 0;
                    currentWallFreqData = [];
                }

                for (let i = 0; i < numParticles; i++) {
                    let p = particles[i];
                    p.x += p.vx * dt; p.y += p.vy * dt;

                    // Colisões Parede (X)
                    if (p.x <= particleRadius) {
                        p.x = particleRadius;
                        p.vx = Math.abs(p.vx);
                        if (isEquilibrated) { 
                            collisionsThisStep++; 
                            wallMomentumTransfer += 2 * m * Math.abs(p.vx);
                            wallCollisionCount++;
                        }
                    } else if (p.x >= edgeLength - particleRadius) {
                        p.x = edgeLength - particleRadius;
                        p.vx = -Math.abs(p.vx);
                        if (isEquilibrated) { 
                            collisionsThisStep++; 
                            wallMomentumTransfer += 2 * m * Math.abs(p.vx);
                            wallCollisionCount++;
                        }
                    }

                    // Colisões Parede (Y)
                    if (p.y <= particleRadius) {
                        p.y = particleRadius;
                        p.vy = Math.abs(p.vy);
                        if (isEquilibrated) { 
                            collisionsThisStep++; 
                            wallMomentumTransfer += 2 * m * Math.abs(p.vy);
                            wallCollisionCount++;
                        }
                    } else if (p.y >= edgeLength - particleRadius) {
                        p.y = edgeLength - particleRadius;
                        p.vy = -Math.abs(p.vy);
                        if (isEquilibrated) { 
                            collisionsThisStep++; 
                            wallMomentumTransfer += 2 * m * Math.abs(p.vy);
                            wallCollisionCount++;
                        }
                    }

                    // Colisões entre Partículas
                    // 3. BYPASS ACTUAL COLLISIONS IF IDEAL GAS
                    if (!isIG) {
                        for (let j = i + 1; j < numParticles; j++) {
                            let p2 = particles[j];
                            let dx = p.x - p2.x; 
                            let dy = p.y - p2.y;
                            let distSq = dx*dx + dy*dy;
                            
                            if (distSq < sigmaEffective * sigmaEffective) {
                                let dvx = p.vx - p2.vx;
                                let dvy = p.vy - p2.vy;
                                
                                if (dx * dvx + dy * dvy < 0) {
                                    let dotProduct = (dx * dvx + dy * dvy) / distSq;
                                    p.vx -= dotProduct * dx;
                                    p.vy -= dotProduct * dy;
                                    p2.vx += dotProduct * dx;
                                    p2.vy += dotProduct * dy;
                                }
                            }
                        }
                    }
                }
                
                if (isEquilibrated) {
                    intervalCollisions += collisionsThisStep;
                    let equilibratedStep = step - equilibriumStep;
                    
                    if ((equilibratedStep + 1) % intervalSteps === 0) {
                        let freqHz = intervalCollisions / (intervalSteps * dt);
                        currentWallFreqData.push(freqHz);
                        intervalCollisions = 0;
                    }

                    // COLETA DE DADOS: Histograma da Média
                    if (equilibratedStep % 10 === 0 && !selX) {
                        samplesCount++;
                        for (let i = 0; i < numParticles; i++) {
                            let p = particles[i];
                            let binX = Math.floor((p.vx + vMaxHist) / binWidth);
                            let binY = Math.floor((p.vy + vMaxHist) / binWidth);
                            if (binX >= 0 && binX < numBins) histMedia[binX]++;
                            if (binY >= 0 && binY < numBins) histMedia[binY]++;
                        }
                    }
                }
                
                // Gravação do Frame e Cores
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    let p = particles[i];
                    historyX[offset+i] = p.x;
                    historyY[offset+i] = p.y;
                    historyVX[offset+i] = p.vx; 
                    historyVY[offset+i] = p.vy; 

                    let vInstantanea = Math.sqrt(p.vx**2 + p.vy**2);
                    let ratio = Math.min(1, vInstantanea / maxExpectedV);
                    historyR[offset + i] = Math.round(ratio * 255);
                }
            }
            
            const pct = Math.floor((step/totalSteps)*100);
            if (step < equilibriumStep) {
                getEl("progress-text").innerText = `Termalizando o sistema: ${pct}%`;
            } else {
                getEl("progress-text").innerText = `Calculando médias: ${pct}%`;
            }

            if (step < totalSteps) {
                setTimeout(computeChunk, 0);
            } else {
                // --- FECHAMENTO E CÁLCULO FINAL DAS CURVAS ---
                if (!selX) {
                    histAtual = new Array(numBins).fill(0);
                    for (let i = 0; i < numParticles; i++) {
                        let p = particles[i];
                        let binX = Math.floor((p.vx + vMaxHist) / binWidth);
                        let binY = Math.floor((p.vy + vMaxHist) / binWidth);
                        if (binX >= 0 && binX < numBins) histAtual[binX]++;
                        if (binY >= 0 && binY < numBins) histAtual[binY]++;
                    }

                    if (samplesCount > 0) {
                        for (let i = 0; i < numBins; i++) {
                            histMedia[i] /= samplesCount;
                        }
                    }

                    histTeorico = new Array(numBins).fill(0);
                    for (let i = 0; i < numBins; i++) {
                        let vCenter = -vMaxHist + (i + 0.5) * binWidth;
                        let probDensity = (1 / (sigmaV * Math.sqrt(2 * Math.PI))) * Math.exp(-(vCenter * vCenter) / (2 * sigmaV * sigmaV));
                        histTeorico[i] = 2 * numParticles * probDensity * binWidth;
                    }
                }
                
                // Passamos isIG para não plotar Z/eta se for um Gás Ideal
                finishSimulation(T, dt, wallMomentumTransfer, wallCollisionCount, sigmaEffective, equilibriumStep, isIG);
            }
        }
        computeChunk();
    });
    
    function finishSimulation(T, dt, totalMomentum, totalWallCollisions, sigmaEffective, equilibriumStep, isIG) {

        getEl("ui-progress").style.display = "none";
        btnRun.disabled = false;
        uiVisualization.style.display = "flex";
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        
        const activeTime = (totalSteps - equilibriumStep) * dt; 
        const perimeter = 4 * edgeLength;
        const area = edgeLength * edgeLength;
        
        const P_2D = totalMomentum / (activeTime * perimeter);
        const avgWallFreq = totalWallCollisions / activeTime;

        if (historyBox) {
            if (historyBox.innerHTML.includes("Nenhuma simulação realizada")) {
                historyBox.innerHTML = "";
            }
            let entry = `<div style="border-bottom: 1px dashed #ccc; padding: 6px 0; font-size: 0.9em;">`;
            entry += `<b>T:</b> ${T}K | <b>N:</b> ${numParticles} | <b>L:</b> ${edgeLength} <br/>`;
            
            if (!isIG) {
                const Z = (P_2D * area) / (numParticles * 8.314 * T);
                // Calcula eta usando o raio real, não o visual
                const realRadius = sigmaEffective / 2;
                const eta = (numParticles * Math.PI * (realRadius**2)) / area;
                simulationResults.push({ T, N: numParticles, sigma: sigmaEffective, eta, P: P_2D, Z, f: avgWallFreq });
                entry += `<b>Z:</b> ${Z.toFixed(3)} | <b>&eta;:</b> ${eta.toFixed(3)} | <b>P:</b> ${P_2D.toFixed(2)} | <b>Freq:</b> ${avgWallFreq.toFixed(1)} Hz`;
            } else {
                entry += `<b>Modo Gás Ideal</b> | <b>Freq. Parede:</b> ${avgWallFreq.toFixed(1)} Hz`;
            }
            entry += `</div>`;
            historyBox.innerHTML += entry;
            
            if (!isIG && hsSection) hsSection.style.display = "block";
        }

        if (selX && selY) {
            drawScatterPlot();
        } else {
            drawVelocityDistribution();
        }

        drawFrame(0);
    }

    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / edgeLength;
        const offset = frame * numParticles;
        
        for (let i = 0; i < numParticles; i++) {
            let redVal = historyR[offset+i];
            let blueVal = 255 - redVal; 
            
            // Vermelho = Rápido, Azul = Lento
            ctx.fillStyle = `rgb(${redVal}, 0, ${blueVal})`; 
            ctx.beginPath();
            ctx.arc(historyX[offset+i]*scale, historyY[offset+i]*scale, particleRadius*scale, 0, Math.PI*2);
            ctx.fill();
        }
        drawFreqLineGraph(frame / totalSteps);

        // ATUALIZAR HISTOGRAMA DINAMICAMENTE
        if (stateChart && stateChart.config.type === 'bar') {
            let tempHist = new Array(numBins).fill(0);
            
            for (let i = 0; i < numParticles; i++) {
                let binX = Math.floor((historyVX[offset + i] + vMaxHist) / binWidth);
                let binY = Math.floor((historyVY[offset + i] + vMaxHist) / binWidth);
                
                if (binX >= 0 && binX < numBins) tempHist[binX]++;
                if (binY >= 0 && binY < numBins) tempHist[binY]++;
            }
            
            stateChart.data.datasets[0].data = tempHist;
            stateChart.update('none'); 
        }
    }

    function drawFreqLineGraph(progressRatio) {
        const c = getEl("freq-canvas"); if (!c) return;
        const g = c.getContext("2d");
        g.clearRect(0,0,c.width,c.height);
        
        if (currentWallFreqData.length === 0) return;

        const marginX = 60; 
        const marginY = 50; 
        const drawW = c.width - marginX - 20;
        const drawH = c.height - marginY - 20;
        
        const avgFreq = currentWallFreqData.reduce((a,b)=>a+b,0) / currentWallFreqData.length;
        const maxFreq = Math.max(...currentWallFreqData);
        const minFreq = Math.min(...currentWallFreqData);
        
        const padding = 0.10 * (maxFreq - minFreq);
        let yMax = maxFreq + padding;
        let yMin = Math.max(0, minFreq - padding);

        if (yMax === yMin) {
            yMax += 5;
            yMin = Math.max(0, yMin - 5);
        }

        g.strokeStyle = "#333"; 
        g.lineWidth = 2.5;      
        g.beginPath();
        g.moveTo(marginX, 20); g.lineTo(marginX, c.height - marginY); 
        g.lineTo(c.width - 20, c.height - marginY); 
        g.stroke();

        g.fillStyle = "#666"; 
        g.font = "14px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";

        g.fillText("Tempo (Passos da Simulação)", marginX + drawW / 2, c.height - 15);
        
        g.save();
        g.translate(15, 20 + drawH / 2);
        g.rotate(-Math.PI / 2);
        g.fillText("Frequência de Colisão (Hz)", 0, 0);
        g.restore();

        g.font = "11px monospace";
        const yMajorTicks = 5;
        g.textAlign = "right";
        for (let i = 0; i <= yMajorTicks; i++) {
            let frac = i / yMajorTicks;
            let yPos = (c.height - marginY) - frac * drawH;
            let yVal = yMin + frac * (yMax - yMin);

            g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(marginX - 6, yPos); g.lineTo(marginX, yPos); g.stroke();
            g.fillText(yVal.toFixed(1), marginX - 10, yPos);

            if (i < yMajorTicks) {
                let yPosMinor = (c.height - marginY) - (frac + 0.5 / yMajorTicks) * drawH;
                g.lineWidth = 1;
                g.beginPath(); g.moveTo(marginX - 3, yPosMinor); g.lineTo(marginX, yPosMinor); g.stroke();
            }
        }

        const xMajorTicks = 10;
        g.textAlign = "center";
        g.textBaseline = "top";
        for (let i = 0; i <= xMajorTicks; i++) {
            let frac = i / xMajorTicks;
            let xPos = marginX + frac * drawW;
            let xVal = Math.floor(equilibriumStep + frac * (totalSteps - equilibriumStep)); 

            g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(xPos, c.height - marginY); g.lineTo(xPos, c.height - marginY + 6); g.stroke();
            g.fillText(xVal, xPos, c.height - marginY + 10);

            if (i < xMajorTicks) {
                let xPosMinor = marginX + (frac + 0.5 / xMajorTicks) * drawW;
                g.lineWidth = 1;
                g.beginPath(); g.moveTo(xPosMinor, c.height - marginY); g.lineTo(xPosMinor, c.height - marginY + 3); g.stroke();
            }
        }

        g.strokeStyle = "#d9534f"; 
        g.lineWidth = 2.0; 
        g.beginPath();
        const points = Math.floor(currentWallFreqData.length * progressRatio);
        const stepX = drawW / Math.max(1, currentWallFreqData.length - 1);
        
        for(let i=0; i<points; i++) {
            let x = marginX + i * stepX; 
            let y = (c.height - marginY) - ((currentWallFreqData[i] - yMin) / (yMax - yMin)) * drawH;
            y = Math.max(20, Math.min(c.height - marginY, y));
            if(i === 0) g.moveTo(x,y); else g.lineTo(x,y);
        }
        g.stroke();

        g.strokeStyle = "rgba(0, 51, 102, 0.6)"; 
        g.lineWidth = 1.5;
        g.setLineDash([5, 5]); 
        g.beginPath();
        let yAvg = (c.height - marginY) - ((avgFreq - yMin) / (yMax - yMin)) * drawH;
        yAvg = Math.max(20, Math.min(c.height - marginY, yAvg));
        g.moveTo(marginX, yAvg); g.lineTo(marginX + drawW, yAvg);
        g.stroke(); 
        g.setLineDash([]);
    }

    function drawScatterPlot() {
        const canvasEl = getEl("plot-canvas"); 
        if (!canvasEl) return;

        if (simulationResults.length === 0) {
            if (stateChart) {
                stateChart.destroy();
                stateChart = null;
            }
            return;
        }

        const vX = selX.value;
        const vY = selY.value;

        const labels = {
            "eta": "Fração de Empacotamento (η)",
            "sigma": "Diâmetro da Partícula (σ)",
            "T": "Temperatura (T)",
            "N": "Número de Partículas (N)",
            "Z": "Fator de Compressibilidade (Z)",
            "P": "Pressão 2D (P)",
            "f": "Frequência de Colisão (Hz)"
        };

        const chartData = simulationResults.map(d => ({ x: d[vX], y: d[vY] }));

        if (stateChart) {
            stateChart.data.datasets[0].data = chartData;
            stateChart.options.scales.x.title.text = labels[vX];
            stateChart.options.scales.y.title.text = labels[vY];
            stateChart.update();
        } else {
            const ctxChart = canvasEl.getContext('2d');
            stateChart = new Chart(ctxChart, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Resultados da Simulação',
                        data: chartData,
                        backgroundColor: '#d9534f',
                        borderColor: '#003366',
                        borderWidth: 1.5,
                        pointRadius: 6,
                        pointHoverRadius: 9
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear', position: 'bottom',
                            title: { display: true, text: labels[vX], font: { size: 14, weight: 'bold' } },
                            grid: { color: '#e9ecef' }
                        },
                        y: {
                            title: { display: true, text: labels[vY], font: { size: 14, weight: 'bold' } },
                            grid: { color: '#e9ecef' }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    function drawVelocityDistribution() {
        const canvasEl = getEl("plot-canvas");
        if (!canvasEl) return;

        let labels = [];
        for (let i = 0; i < numBins; i++) {
            labels.push((-vMaxHist + (i + 0.5) * binWidth).toFixed(1));
        }

        let chartInstance = Chart.getChart(canvasEl);
        if (chartInstance) {
            chartInstance.destroy();
        }

        const ctxChart = canvasEl.getContext('2d');
        stateChart = new Chart(ctxChart, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Atual',
                        data: histAtual,
                        backgroundColor: 'rgba(0, 123, 255, 0.6)',
                        borderColor: '#007bff',
                        borderWidth: 1,
                        barPercentage: 1.0,
                        categoryPercentage: 1.0,
                        order: 3
                    },
                    {
                        label: 'Média Acumulada',
                        data: histMedia,
                        type: 'line',
                        borderColor: '#dc3545',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0,
                        order: 2
                    },
                    {
                        label: 'Teórico (Gauss)',
                        data: histTeorico,
                        type: 'line',
                        borderColor: '#333333',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Componentes de Velocidade (v_x, v_y) [m/s]' } },
                    y: { title: { display: true, text: 'Contagem de Partículas' }, beginAtZero: true }
                },
                plugins: { legend: { display: false } } 
            }
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
        
        // Pula frames com base na variável playbackSpeed gerada pelo 'boost'
        currentFrame += playbackSpeed; 
        
        if(currentFrame >= totalSteps) { 
            currentFrame = 0; 
            isPlaying = false; 
            btnPlay.innerText = "Reproduzir"; 
            if(scrubber) scrubber.value = 0;
            drawFrame(0);
            return; 
        }
        
        if(scrubber) scrubber.value = currentFrame;
        drawFrame(currentFrame);
        requestAnimationFrame(animate);
    }

    if (scrubber) scrubber.oninput = () => { currentFrame = parseInt(scrubber.value); drawFrame(currentFrame); };
});
