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
    let historyR = null; // MEMORY OPTIMIZED: Stores only the RED index (0-255)
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

        // Dynamic Playback Speed based on Temperature
        playbackStep = Math.max(1, Math.round(5 * (T / 300)));

        // Pre-allocate Typed Arrays for high performance on mobile
        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);
        historyR = new Uint8Array(numParticles * totalSteps); // stores 0-255

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
        let totalMomentumTransfer = 0; // Track for P_2D

        const cellSize = sigma > 0 ? sigma * 1.1 : edgeLength; 
        const cols = Math.ceil(edgeLength / cellSize);
        const rows = Math.ceil(edgeLength / cellSize);

        function computeChunk() {
            const chunkSize = 500; 
            const endStep = Math.min(step + chunkSize, totalSteps);

            for (; step < endStep; step++) {
                
                // Spatial Grid Construction (O(N) Optimization for collisions)
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

                // Update Positions, Wall Collisions, and Particle Collisions
                for (let i = 0; i < numParticles; i++) {
                    let p1 = particles[i];

                    p1.x += p1.vx * dt;
                    p1.y += p1.vy * dt;

                    // Wall Collisions & Momentum Tracking for Pressure
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

                        // Check neighboring cells only (Spatial Partitioning)
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

                                            // 1. Separate
                                            let nxNorm = dx / dist;
                                            let nyNorm = dy / dist;
                                            p1.x -= nxNorm * overlap / 2; p1.y -= nyNorm * overlap / 2;
                                            p2.x += nxNorm * overlap / 2; p2.y += nyNorm * overlap / 2;

                                            // 2. Clamp (Boundary Escape Fix)
                                            p1.x = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p1.x));
                                            p1.y = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p1.y));
                                            p2.x = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p2.x));
                                            p2.y = Math.max(particleRadius, Math.min(edgeLength - particleRadius, p2.y));

                                            // 3. Elastic Bounce
                                            let dvx = p2.vx - p1.vx;
                                            let dvy = p2.vy - p1.vy;
                                            let dotProduct = dvx * nxNorm + dvy * nyNorm;

                                            if (dotProduct < 0) {
                                                p1.vx += dotProduct * nxNorm; p1.vy += dotProduct * nyNorm;
                                                p2.vx -= dotProduct * nxNorm; p2.vy -= dotProduct * nyNorm;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Store state and CUSTOM BRAND COLOR (Blue -> Purple -> Red)
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    historyX[offset + i] = particles[i].x;
                    historyY[offset + i] = particles[i].y;
                    
                    let v = Math.sqrt(particles[i].vx**2 + particles[i].vy**2);
                    // BRAND COLOR MAPPING logic:
                    // Normalizing velocity: anything above 2x baseSpeed is max red
                    let ratio = Math.min(1, v / (2 * baseSpeed));
                    // User Blue is RGB(0,60,100), User Red is RGB(255,60,100).
                    // We only vary the Red index (0 -> 255) to pass through purples.
                    let redIndex = Math.round(ratio * 255);
                    historyR[offset + i] = redIndex;
                }
            }

            let percent = Math.floor((step / totalSteps) * 100);
            progressText.innerText = `Progresso: ${percent}%`;

            if (step < totalSteps) {
                setTimeout(computeChunk, 0); 
            } else {
                // Calculation finished: Compute EoS variables (Exact Wall Momentum Sum)
                let totalTime = totalSteps * dt;
                let perimeter = 4 * edgeLength;
                let area = edgeLength * edgeLength;
                
                let P_2D = totalMomentumTransfer / (totalTime * perimeter);
                let Z = (P_2D * area) / (numParticles * 8.314 * T);
                let eta = (numParticles * Math.PI * Math.pow(particleRadius, 2)) / area;
                
                // Store results for the multi-run scatter plot
                simulationResults.push({ eta: eta, Z: Z });

                // Render Results and scatter plot graph
                historyBox.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom: 10px;">
                        <div>
                            <p style="margin:2px 0; color:#333;">Fraçao de Empacotamento (&eta;): <b>${eta.toFixed(3)}</b></p>
                            <p style="margin:2px 0; color:#333;">Fator Compressibilidade (Z): <b>${Z.toFixed(3)}</b></p>
                        </div>
                    </div>
                    <canvas id="plot-canvas" width="400" height="200" style="background:#fff; border:1px solid #ccc; border-radius:4px; width:100%;"></canvas>
                `;
                
                drawPlot();
                finishCalculation();
            }
        }

        computeChunk(); 
    });

    // --- Built-in Scatter Plot Logic ---
    function drawPlot() {
        const plotCanvas = document.getElementById("plot-canvas");
        if (!plotCanvas) return;
        const pCtx = plotCanvas.getContext("2d");
        const width = plotCanvas.width;
        const height = plotCanvas.height;
        
        // Canvas Margins
        const padX = 40;
        const padY = 30;

        pCtx.clearRect(0, 0, width, height);
        
        // Determine dynamic scaling based on data
        let maxEta = 0.5; // Default reference max X
        let maxZ = 3.0;   // Default reference max Y
        
        simulationResults.forEach(d => {
            if (d.eta > maxEta) maxEta = d.eta + 0.1;
            if (d.Z > maxZ) maxZ = d.Z + 0.5;
        });

        // Mapping helpers
        const mapX = (val) => padX + (val / maxEta) * (width - padX - 10);
        const mapY = (val) => height - padY - (val / maxZ) * (height - padY - 10);

        // Draw Plot Axes
        pCtx.strokeStyle = "#333";
        pCtx.lineWidth = 2;
        pCtx.beginPath();
        pCtx.moveTo(padX, 10);
        pCtx.lineTo(padX, height - padY);
        pCtx.lineTo(width - 10, height - padY);
        pCtx.stroke();

        // Draw Labels
        pCtx.fillStyle = "#333";
        pCtx.font = "12px Segoe UI, sans-serif";
        pCtx.fillText("Z", 15, 20);
        pCtx.fillText("η (Fração de Empacotamento)", width / 2 - 50, height - 5);

        // Draw Theoretical Baseline (Red dashed line: Z = 1 + 2 * eta)
        pCtx.strokeStyle = "rgba(255, 60, 100, 0.6)"; // Site redish, semi-transparent
        pCtx.setLineDash([5, 5]);
        pCtx.beginPath();
        pCtx.moveTo(mapX(0), mapY(1)); // Start at Z=1 for eta=0
        pCtx.lineTo(mapX(maxEta), mapY(1 + 2 * maxEta));
        pCtx.stroke();
        pCtx.setLineDash([]); // Reset line dash

        // Plot Simulated Data Points (Site blue)
        pCtx.fillStyle = "rgb(0, 60, 100)";
        simulationResults.forEach(d => {
            pCtx.beginPath();
            pCtx.arc(mapX(d.eta), mapY(d.Z), 4, 0, Math.PI * 2);
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

        // FIXED GREEN AND BLUE FROM SITE BRANDING
        const siteG = 60;
        const siteB = 100;

        for (let i = 0; i < numParticles; i++) {
            let x = historyX[offset + i] * scale;
            let y = historyY[offset + i] * scale;
            let siteR = historyR[offset + i]; // Retrieve BRAND RED component (0-255)

            // APPLIES CUSTOM BRAND COLOR GRADIENT (Blue -> Purple -> Red)
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
        simulationResults = []; // Clear data across multiple runs
        historyBox.innerHTML = `<p style="color: #999; font-style: italic; font-size: 0.85em;">Nenhuma simulação realizada.</p>`;
        historyX = null;
        historyY = null;
        historyR = null;
    });
});
