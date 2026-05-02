document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const btnRun = document.getElementById("btn-run");
    const btnPlay = document.getElementById("btn-play");
    const btnClear = document.getElementById("btn-clear-history");
    const scrubber = document.getElementById("inp-scrubber");
    const canvas = document.getElementById("sim-canvas");
    const ctx = canvas.getContext("2d");
    const uiProgress = document.getElementById("ui-progress");
    const progressText = document.getElementById("progress-text");
    const uiVisualization = document.getElementById("ui-visualization");
    const historyBox = document.getElementById("history-box-content");
    
    // --- Global Simulation State ---
    let historyX = null;
    let historyY = null;
    let historyR = null; 
    let totalSteps = 0;
    let numParticles = 0;
    let edgeLength = 0;
    let particleRadius = 0;
    
    // Global array to store data across multiple runs
    let simulationResults = [];
    
    // Animation state
    let isPlaying = false;
    let currentFrame = 0;
    let animationId = null;
    let playbackStep = 5; 

    // --- Calculation Engine ---
    btnRun.addEventListener("click", () => {
        numParticles = parseInt(document.getElementById("inp-n1").value);
        const T = parseFloat(document.getElementById("inp-T").value);
        const m = parseFloat(document.getElementById("inp-m1").value);
        edgeLength = parseFloat(document.getElementById("inp-edge").value);
        const sigma = parseFloat(document.getElementById("inp-sigma").value);
        
        totalSteps = parseInt(document.getElementById("inp-steps").value);
        const dt = parseFloat(document.getElementById("inp-dt").value);
        
        particleRadius = sigma / 2;
        playbackStep = Math.max(1, Math.round(5 * (T / 300)));

        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);
        historyR = new Uint8Array(numParticles * totalSteps); 

        let particles = [];
        const baseSpeed = Math.sqrt((2 * 8.314 * T) / m); 

        for (let i = 0; i < numParticles; i++) {
            const angle = Math.random() * 2 * Math.PI;
            particles.push({
                x: particleRadius + Math.random() * (edgeLength - sigma),
                y: particleRadius + Math.random() * (edgeLength - sigma),
                vx: baseSpeed * Math.cos(angle),
                vy: baseSpeed * Math.sin(angle)
            });
        }

        uiProgress.style.display = "block";
        btnRun.disabled = true;
        let step = 0;
        
        // Trackers for EoS and Graphs
        let totalMomentumTransfer = 0; 
        let totalParticleCollisions = 0;
        let collisionFreqData = []; // Stores collision count per chunk for the line graph

        const cellSize = sigma > 0 ? sigma * 1.1 : edgeLength; 
        const cols = Math.ceil(edgeLength / cellSize);
        const rows = Math.ceil(edgeLength / cellSize);

        function computeChunk() {
            const chunkSize = 500; 
            const endStep = Math.min(step + chunkSize, totalSteps);
            let chunkCollisions = 0;

            for (; step < endStep; step++) {
                
                let grid = [];
                if (sigma > 0) {
                    for (let i = 0; i < cols * rows; i++) grid.push([]);
                    for (let i = 0; i < numParticles; i++) {
                        let p = particles[i];
                        let cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / cellSize)));
                        let cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / cellSize)));
                        grid[cy * cols + cx].push(i);
                    }
                }

                for (let i = 0; i < numParticles; i++) {
                    let p1 = particles[i];

                    p1.x += p1.vx * dt;
                    p1.y += p1.vy * dt;

                    if (p1.x <= particleRadius) { 
                        p1.x = particleRadius; p1.vx *= -1; 
                        totalMomentumTransfer += 2 * m * Math.abs(p1.vx); 
                    } else if (p1.x >= edgeLength - particleRadius) { 
                        p1.x = edgeLength - particleRadius; p1.vx *= -1; 
                        totalMomentumTransfer += 2 * m * Math.abs(p1.vx); 
                    }
                    
                    if (p1.y <= particleRadius) { 
                        p1.y = particleRadius; p1.vy *= -1; 
                        totalMomentumTransfer += 2 * m * Math.abs(p1.vy); 
                    } else if (p1.y >= edgeLength - particleRadius) { 
                        p1.y = edgeLength - particleRadius; p1.vy *= -1; 
                        totalMomentumTransfer += 2 * m * Math.abs(p1.vy); 
                    }

                    if (sigma > 0) {
                        let cx = Math.floor(p1.x / cellSize);
                        let cy = Math.floor(p1.y / cellSize);

                        for (let ny = cy - 1; ny <= cy + 1; ny++) {
                            for (let nx = cx - 1; nx <= cx + 1; nx++) {
                                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                                    let cellParticles = grid[ny * cols + nx];
                                    
                                    for (let idx of cellParticles) {
                                        if (i >= idx) continue; 
                                        
                                        let p2 = particles[idx];
                                        let dx = p2.x - p1.x;
                                        let dy = p2.y - p1.y;
                                        let distSq = dx * dx + dy * dy;

                                        if (distSq < sigma * sigma && distSq > 0) {
                                            let dist = Math.sqrt(distSq);
                                            let overlap = sigma - dist;

                                            let nxNorm = dx / dist;
                                            let nyNorm = dy / dist;
                                            p1.x -= nxNorm * overlap / 2; p1.y -= nyNorm * overlap / 2;
                                            p2.x += nxNorm * overlap / 2; p2.y += nyNorm * overlap / 2;

                                            p1.x = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p1.x));
                                            p1.y = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p1.y));
                                            p2.x = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p2.x));
                                            p2.y = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p2.y));

                                            let dvx = p2.vx - p1.vx;
                                            let dvy = p2.vy - p1.vy;
                                            let dotProduct = dvx * nxNorm + dvy * nyNorm;

                                            if (dotProduct < 0) {
                                                p1.vx += dotProduct * nxNorm; p1.vy += dotProduct * nyNorm;
                                                p2.vx -= dotProduct * nxNorm; p2.vy -= dotProduct * nyNorm;
                                                
                                                // Count actual particle collision
                                                chunkCollisions++;
                                                totalParticleCollisions++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    historyX[offset + i] = particles[i].x;
                    historyY[offset + i] = particles[i].y;
                    
                    let v = Math.sqrt(particles[i].vx**2 + particles[i].vy**2);
                    let ratio = Math.min(1, v / (2 * baseSpeed));
                    historyR[offset + i] = Math.round(ratio * 255);
                }
            }
            
            // Store collision frequency for this chunk (Collisions per unit time)
            collisionFreqData.push(chunkCollisions / (chunkSize * dt));

            let percent = Math.floor((step / totalSteps) * 100);
            progressText.innerText = `Progresso: ${percent}%`;

            if (step < totalSteps) {
                setTimeout(computeChunk, 0); 
            } else {
                // Final Calculations
                let totalTime = totalSteps * dt;
                let perimeter = 4 * edgeLength;
                let area = edgeLength * edgeLength;
                
                let P_2D = totalMomentumTransfer / (totalTime * perimeter);
                let Z = (P_2D * area) / (numParticles * 8.314 * T);
                let eta = (numParticles * Math.PI * Math.pow(particleRadius, 2)) / area;
                let avgFreq = totalParticleCollisions / totalTime;
                
                // Store EVERY parameter so the user can plot anything vs anything
                simulationResults.push({ 
                    T: T, N: numParticles, sigma: sigma, 
                    eta: eta, P: P_2D, Z: Z, f: avgFreq 
                });

                // Render Results with Dropdowns for Scatter Plot
                historyBox.innerHTML = `
                    <div style="font-size: 0.9em; margin-bottom: 15px; color: #333;">
                        <p style="margin:2px 0;">Fração de Empacotamento (&eta;): <b>${eta.toFixed(3)}</b></p>
                        <p style="margin:2px 0;">Pressão 2D Calculada (P): <b>${P_2D.toFixed(2)}</b></p>
                        <p style="margin:2px 0;">Fator Compressibilidade (Z): <b>${Z.toFixed(3)}</b></p>
                    </div>
                    
                    <b style="color:#003c64; font-size:0.9em;">Frequência de Colisões por Passo (Run Atual)</b>
                    <canvas id="freq-canvas" width="400" height="150" style="background:#fff; border:1px solid #ccc; border-radius:4px; width:100%; margin-bottom: 20px;"></canvas>
                    
                    <b style="color:#003c64; font-size:0.9em;">Gráfico Multivariável (Múltiplos Runs)</b>
                    <div style="display: flex; gap: 10px; margin: 5px 0 10px 0; font-size: 0.85em;">
                        <label>Eixo X: 
                            <select id="sel-x" style="padding: 2px;">
                                <option value="eta" selected>Fração de Emp. (&eta;)</option>
                                <option value="T">Temperatura (T)</option>
                                <option value="N">Partículas (N)</option>
                                <option value="sigma">Diâmetro (&sigma;)</option>
                            </select>
                        </label>
                        <label>Eixo Y: 
                            <select id="sel-y" style="padding: 2px;">
                                <option value="Z" selected>Fator Z (Z)</option>
                                <option value="P">Pressão 2D (P)</option>
                                <option value="f">Freq. Colisões Média (f)</option>
                            </select>
                        </label>
                    </div>
                    <canvas id="plot-canvas" width="400" height="200" style="background:#fff; border:1px solid #ccc; border-radius:4px; width:100%;"></canvas>
                `;
                
                // Draw Line Graph (Current Run)
                drawFreqGraph(collisionFreqData);
                
                // Draw Scatter Plot (All Runs)
                drawScatterPlot();
                
                // Attach Event Listeners to Dropdowns to dynamically update graph
                document.getElementById("sel-x").addEventListener("change", drawScatterPlot);
                document.getElementById("sel-y").addEventListener("change", drawScatterPlot);

                finishCalculation();
            }
        }

        computeChunk(); 
    });

    // --- 1. Line Graph: Collision Freq vs Steps ---
    function drawFreqGraph(data) {
        const cCanvas = document.getElementById("freq-canvas");
        if (!cCanvas) return;
        const ctxF = cCanvas.getContext("2d");
        const w = cCanvas.width;
        const h = cCanvas.height;
        const padX = 40;
        const padY = 20;

        ctxF.clearRect(0, 0, w, h);
        
        let maxF = Math.max(...data, 1); // Avoid div by 0
        const mapX = (idx) => padX + (idx / (data.length - 1)) * (w - padX - 10);
        const mapY = (val) => h - padY - (val / maxF) * (h - padY - 10);

        // Axes
        ctxF.strokeStyle = "#333";
        ctxF.lineWidth = 1;
        ctxF.beginPath();
        ctxF.moveTo(padX, 10); ctxF.lineTo(padX, h - padY); ctxF.lineTo(w - 10, h - padY);
        ctxF.stroke();

        // Line
        ctxF.strokeStyle = "rgb(255, 60, 100)"; // Site Redish
        ctxF.lineWidth = 2;
        ctxF.beginPath();
        data.forEach((val, i) => {
            if (i === 0) ctxF.moveTo(mapX(i), mapY(val));
            else ctxF.lineTo(mapX(i), mapY(val));
        });
        ctxF.stroke();
    }

    // --- 2. Scatter Plot: Dynamic Variables ---
    function drawScatterPlot() {
        const plotCanvas = document.getElementById("plot-canvas");
        const selX = document.getElementById("sel-x");
        const selY = document.getElementById("sel-y");
        
        if (!plotCanvas || !selX || !selY) return;
        
        const varX = selX.value;
        const varY = selY.value;
        
        const pCtx = plotCanvas.getContext("2d");
        const width = plotCanvas.width;
        const height = plotCanvas.height;
        const padX = 45;
        const padY = 30;

        pCtx.clearRect(0, 0, width, height);
        
        if (simulationResults.length === 0) return;

        // Dynamic scaling based on chosen variables
        let maxX = Math.max(...simulationResults.map(d => d[varX]));
        let maxY = Math.max(...simulationResults.map(d => d[varY]));
        
        // Add 10% padding to max values so points don't sit exactly on the edge
        maxX = maxX > 0 ? maxX * 1.1 : 1; 
        maxY = maxY > 0 ? maxY * 1.1 : 1;

        const mapX = (val) => padX + (val / maxX) * (width - padX - 10);
        const mapY = (val) => height - padY - (val / maxY) * (height - padY - 10);

        // Draw Plot Axes
        pCtx.strokeStyle = "#333";
        pCtx.lineWidth = 2;
        pCtx.beginPath();
        pCtx.moveTo(padX, 10);
        pCtx.lineTo(padX, height - padY);
        pCtx.lineTo(width - 10, height - padY);
        pCtx.stroke();

        // Draw Labels based on Dropdown text
        pCtx.fillStyle = "#333";
        pCtx.font = "11px sans-serif";
        pCtx.fillText(selY.options[selY.selectedIndex].text, 5, 15);
        pCtx.fillText(selX.options[selX.selectedIndex].text, width / 2 - 40, height - 5);

        // Draw Theoretical Line ONLY if X is eta and Y is Z
        if (varX === "eta" && varY === "Z") {
            pCtx.strokeStyle = "rgba(255, 60, 100, 0.6)"; 
            pCtx.setLineDash([5, 5]);
            pCtx.beginPath();
            pCtx.moveTo(mapX(0), mapY(1)); 
            pCtx.lineTo(mapX(maxX), mapY(1 + 2 * maxX));
            pCtx.stroke();
            pCtx.setLineDash([]); 
        }

        // Plot Simulated Data Points (Site blue)
        pCtx.fillStyle = "rgb(0, 60, 100)";
        simulationResults.forEach(d => {
            pCtx.beginPath();
            pCtx.arc(mapX(d[varX]), mapY(d[varY]), 4, 0, Math.PI * 2);
            pCtx.fill();
        });
    }

    function finishCalculation() {
        uiProgress.style.display = "none";
        btnRun.disabled = false;
        uiVisualization.style.display = "flex";
        
        scrubber.max = totalSteps - 1;
        scrubber.value = 0;
        currentFrame = 0;
        drawFrame(0);
    }

    // --- Visualization & Playback Animation ---
    function drawFrame(frameIndex) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const scale = canvas.width / edgeLength;
        const drawRadius = Math.max(2, particleRadius * scale); 

        let offset = frameIndex * numParticles;
        const siteG = 60;
        const siteB = 100;

        for (let i = 0; i < numParticles; i++) {
            let x = historyX[offset + i] * scale;
            let y = historyY[offset + i] * scale;
            let siteR = historyR[offset + i]; 

            ctx.fillStyle = `rgb(${siteR}, ${siteG}, ${siteB})`;
            ctx.beginPath();
            ctx.arc(x, y, drawRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function animate() {
        if (!isPlaying) return;
        
        currentFrame += playbackStep; 
        
        if (currentFrame >= totalSteps) {
            currentFrame = 0;
            isPlaying = false;
            btnPlay.innerText = "Reproduzir";
            btnPlay.classList.replace("jsbox-btn-danger", "jsbox-btn-success");
            return;
        }

        scrubber.value = currentFrame;
        drawFrame(currentFrame);
        animationId = requestAnimationFrame(animate);
    }

    btnPlay.addEventListener("click", () => {
        if (isPlaying) {
            isPlaying = false;
            cancelAnimationFrame(animationId);
            btnPlay.innerText = "Reproduzir";
            btnPlay.classList.replace("jsbox-btn-danger", "jsbox-btn-success");
        } else {
            isPlaying = true;
            btnPlay.innerText = "Pausar";
            btnPlay.classList.replace("jsbox-btn-success", "jsbox-btn-danger");
            animate();
        }
    });

    scrubber.addEventListener("input", (e) => {
        currentFrame = parseInt(e.target.value);
        drawFrame(currentFrame);
    });

    btnClear.addEventListener("click", () => {
        uiVisualization.style.display = "none";
        simulationResults = []; 
        historyBox.innerHTML = `<p style="color: #999; font-style: italic; font-size: 0.85em;">Nenhuma simulação realizada.</p>`;
        historyX = null;
        historyY = null;
        historyR = null;
    });
});
