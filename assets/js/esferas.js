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
    let totalSteps, numParticles, edgeLength, particleRadius, equilibriumStep;
    let simulationResults = [];
    let currentWallFreqData = []; 
    let isPlaying = false, currentFrame = 0, animationId = null;
    let stateChart = null; // Added for Chart.js state curve

    if (selX) selX.addEventListener("change", drawScatterPlot);
    if (selY) selY.addEventListener("change", drawScatterPlot);
    
    if (btnClear) {
        btnClear.addEventListener("click", () => {
            simulationResults = [];
            if (historyBox) historyBox.innerHTML = '<p style="color: #999; font-style: italic; font-size: 0.85em;">Nenhuma simulação realizada.</p>';
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

        const vBaseFisico = Math.sqrt(T / m) * 5; 
        const boost = getVisualSpeedMultiplier(T);
        const vVisualBase = vBaseFisico * boost; 

        // FIX 1: Rejection Sampling to prevent overlapping particles
        let particles = [];
        for (let i = 0; i < numParticles; i++) {
            let p;
            let overlap = true;
            let attempts = 0;
            
            while (overlap && attempts < 2000) {
                p = {
                    x: particleRadius + Math.random() * (edgeLength - sigmaEffective),
                    y: particleRadius + Math.random() * (edgeLength - sigmaEffective),
                    vx: (Math.random() - 0.5) * vVisualBase,
                    vy: (Math.random() - 0.5) * vVisualBase
                };
                
                overlap = false;
                if (isHardSphereMode) {
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

        getEl("ui-progress").style.display = "block";
        btnRun.disabled = true;

        let step = 0;
        let wallMomentumTransfer = 0;
        let wallCollisionCount = 0;
        
        let intervalCollisions = 0;
        const intervalSteps = 50; 
        currentWallFreqData = [];

        equilibriumStep = Math.floor(totalSteps * 0.20); // 20% Threshold

        function computeChunk() {
            const chunkSize = 800;
            const end = Math.min(step + chunkSize, totalSteps);
            const maxExpectedV = vBaseFisico * 0.8; 

            for (; step < end; step++) {
                let collisionsThisStep = 0;
                let isEquilibrated = step >= equilibriumStep; 

                // Clear any junk data collected right at the threshold
                if (step === equilibriumStep) {
                    intervalCollisions = 0;
                    currentWallFreqData = [];
                }

                for (let i = 0; i < numParticles; i++) {
                    let p = particles[i];
                    p.x += p.vx * dt; p.y += p.vy * dt;

                    if (p.x <= particleRadius || p.x >= edgeLength - particleRadius) {
                        p.vx *= -1; 
                        if (isEquilibrated) { // FIX 2: Only count post-equilibrium
                            collisionsThisStep++; 
                            wallMomentumTransfer += 2 * m * Math.abs(p.vx);
                            wallCollisionCount++;
                        }
                    }
                    if (p.y <= particleRadius || p.y >= edgeLength - particleRadius) {
                        p.vy *= -1; 
                        if (isEquilibrated) { // FIX 2: Only count post-equilibrium
                            collisionsThisStep++; 
                            wallMomentumTransfer += 2 * m * Math.abs(p.vy);
                            wallCollisionCount++;
                        }
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
                
                if (isEquilibrated) {
                    intervalCollisions += collisionsThisStep;
                    let equilibratedStep = step - equilibriumStep;
                    if ((equilibratedStep + 1) % intervalSteps === 0) {
                        let freqHz = intervalCollisions / (intervalSteps * dt);
                        currentWallFreqData.push(freqHz);
                        intervalCollisions = 0;
                    }
                }
                
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    let p = particles[i];
                    historyX[offset+i] = p.x;
                    historyY[offset+i] = p.y;

                    let vFisicaInstantanea = Math.sqrt(p.vx**2 + p.vy**2) / boost;
                    let ratio = Math.min(1, vFisicaInstantanea / maxExpectedV);
                    historyR[offset + i] = Math.round(ratio * 255);
                }
            }
            
            const pct = Math.floor((step/totalSteps)*100);
            if (step < equilibriumStep) {
                getEl("progress-text").innerText = `Termalizando o sistema: ${pct}%`;
            } else {
                getEl("progress-text").innerText = `Calculando médias: ${pct}%`;
            }

            if (step < totalSteps) setTimeout(computeChunk, 0);
            else finishSimulation(T, dt, wallMomentumTransfer, wallCollisionCount, sigmaEffective, equilibriumStep);
        }
        computeChunk();
    });

    function finishSimulation(T, dt, totalMomentum, totalWallCollisions, sigmaEffective, equilibriumStep) {
        getEl("ui-progress").style.display = "none";
        btnRun.disabled = false;
        uiVisualization.style.display = "flex";
        if (scrubber) { scrubber.max = totalSteps - 1; scrubber.value = 0; }
        
        // Calculate averages using ONLY the active (post-equilibrium) time
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
            if (isHardSphereMode) {
                const Z = (P_2D * area) / (numParticles * 8.314 * T);
                const eta = (numParticles * Math.PI * (particleRadius**2)) / area;
                simulationResults.push({ T, N: numParticles, sigma: sigmaEffective, eta, P: P_2D, Z, f: avgWallFreq });
                entry += `<b>Z:</b> ${Z.toFixed(3)} | <b>&eta;:</b> ${eta.toFixed(3)} | <b>P:</b> ${P_2D.toFixed(2)} | <b>Freq:</b> ${avgWallFreq.toFixed(1)} Hz`;
            } else {
                entry += `<b>Freq. Colisão:</b> ${avgWallFreq.toFixed(1)} Hz`;
            }
            entry += `</div>`;
            historyBox.innerHTML += entry;
            
            if (isHardSphereMode && hsSection) hsSection.style.display = "block";
            drawScatterPlot();
        }

        drawFrame(0);
    }

    function drawFrame(frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / edgeLength;
        const offset = frame * numParticles;
        
        for (let i = 0; i < numParticles; i++) {
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

    // UPDATED: Replaced manual canvas drawing with Chart.js
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
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ` ${labels[vX]}: ${context.parsed.x.toFixed(3)} | ${labels[vY]}: ${context.parsed.y.toFixed(3)}`;
                                }
                            }
                        }
                    }
                }
            });
        }
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
