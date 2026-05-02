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
    
    // --- Global Simulation State ---
    let historyX = null;
    let historyY = null;
    let totalSteps = 0;
    let numParticles = 0;
    let edgeLength = 0;
    let particleRadius = 0;
    
    // Animation state
    let isPlaying = false;
    let currentFrame = 0;
    let animationId = null;
    let playbackStep = 5; // Default playback speed

    // --- Calculation Engine ---
    btnRun.addEventListener("click", () => {
        // 1. Fetch Parameters
        numParticles = parseInt(document.getElementById("inp-n1").value);
        const T = parseFloat(document.getElementById("inp-T").value);
        const m = parseFloat(document.getElementById("inp-m1").value);
        edgeLength = parseFloat(document.getElementById("inp-edge").value);
        const sigma = parseFloat(document.getElementById("inp-sigma").value);
        
        totalSteps = parseInt(document.getElementById("inp-steps").value);
        const dt = parseFloat(document.getElementById("inp-dt").value);
        
        particleRadius = sigma / 2;

        // Dynamic Playback Speed based on Temperature (Exaggerates the visual difference)
        playbackStep = Math.max(1, Math.round(5 * Math.pow(T / 300, 1.5)));

        // 2. Memory Optimization: Pre-allocate Typed Arrays
        historyX = new Float32Array(numParticles * totalSteps);
        historyY = new Float32Array(numParticles * totalSteps);

        // 3. Initialize Particles
        let particles = [];
        // True physics: v is proportional to sqrt(T/m)
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

        // 4. Spatial Grid Setup
        const cellSize = sigma > 0 ? sigma * 1.1 : edgeLength; 
        const cols = Math.ceil(edgeLength / cellSize);
        const rows = Math.ceil(edgeLength / cellSize);

        // 5. Asynchronous Calculation Loop
        function computeChunk() {
            const chunkSize = 500; 
            const endStep = Math.min(step + chunkSize, totalSteps);

            for (; step < endStep; step++) {
                
                // Build Spatial Grid
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

                // Update Positions and Handle Collisions
                for (let i = 0; i < numParticles; i++) {
                    let p1 = particles[i];

                    p1.x += p1.vx * dt;
                    p1.y += p1.vy * dt;

                    // Wall Collisions
                    if (p1.x <= particleRadius) { p1.x = particleRadius; p1.vx *= -1; }
                    else if (p1.x >= edgeLength - particleRadius) { p1.x = edgeLength - particleRadius; p1.vx *= -1; }
                    
                    if (p1.y <= particleRadius) { p1.y = particleRadius; p1.vy *= -1; }
                    else if (p1.y >= edgeLength - particleRadius) { p1.y = edgeLength - particleRadius; p1.vy *= -1; }

                    // Particle-Particle Collisions (Zero-Sigma Switch)
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
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Save State to Typed Array
                let offset = step * numParticles;
                for (let i = 0; i < numParticles; i++) {
                    historyX[offset + i] = particles[i].x;
                    historyY[offset + i] = particles[i].y;
                }
            }

            let percent = Math.floor((step / totalSteps) * 100);
            progressText.innerText = `Progresso: ${percent}%`;

            if (step < totalSteps) {
                setTimeout(computeChunk, 0); 
            } else {
                finishCalculation();
            }
        }

        computeChunk(); 
    });

    function finishCalculation() {
        uiProgress.style.display = "none";
        btnRun.disabled = false;
        uiVisualization.style.display = "flex";
        
        scrubber.max = totalSteps - 1;
        scrubber.value = 0;
        currentFrame = 0;

        drawFrame(0);
    }

    // --- Visualization & Playback ---
    function drawFrame(frameIndex) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const scale = canvas.width / edgeLength;
        const drawRadius = Math.max(2, particleRadius * scale); 

        ctx.fillStyle = "#3498db";
        let offset = frameIndex * numParticles;

        for (let i = 0; i < numParticles; i++) {
            let x = historyX[offset + i] * scale;
            let y = historyY[offset + i] * scale;

            ctx.beginPath();
            ctx.arc(x, y, drawRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function animate() {
        if (!isPlaying) return;
        
        currentFrame += playbackStep; // Applies dynamic speed multiplier
        
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
        historyX = null;
        historyY = null;
    });
});
