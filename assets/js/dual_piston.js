document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    const btnRun = getEl("btn-run-dual");
    const canvas = getEl("sim-canvas-dual");

    if (!canvas || !btnRun) return;
    const ctx = canvas.getContext("2d");

    let isRunning = false;
    let animationId = null;
    
    // Independent system data structures
    let sysV = { particles: [], width: 0, height: 0, T: 0, T0: 0 };
    let sysP = { particles: [], width: 0, height: 0, T: 0, T0: 0, initialHeight: 0 };
    
    // Physics constants
    let numParticles, particleRadius, m;
    const dt = 0.02; 
    const R = 8.314;
    
    // Dynamic heating controls
    let heatAddedTotal = 0;
    let maxHeatToAdd = 0; 
    let heatingRate = 0; 
    
    // Geometric offsets
    let boxWidth, initialBoxHeight, leftBoxOffset, rightBoxOffset;

    btnRun.addEventListener("click", () => {
        if (isRunning) {
            cancelAnimationFrame(animationId);
            isRunning = false;
            btnRun.innerText = "Simular Aquecimento (Dual)";
            btnRun.style.backgroundColor = "#007bff";
            return;
        }

        // 1. Inputs fallback safely onto ambient target baselines
        numParticles = parseInt(getEl("inp-n1")?.value || 55);
        const T0 = parseFloat(getEl("inp-T")?.value || 300); // Fixed to Ambient 300K
        m = parseFloat(getEl("inp-m1")?.value || 4);
        const sigma = parseFloat(getEl("inp-sigma")?.value || 1.6);
        particleRadius = sigma / 2;

        // 2. Geometry Overhaul: Re-engineered to look like tall, narrow pistons
        boxWidth = 160; 
        initialBoxHeight = 220; 
        
        // Center the narrow cylinders inside their respective halves of the canvas
        leftBoxOffset = (canvas.width / 4) - (boxWidth / 2);
        rightBoxOffset = (3 * canvas.width / 4) - (boxWidth / 2);

        // 3. Calibrate dynamic energy injection parameters
        // We inject enough total heat to raise the Constant V system by 250 Kelvin
        maxHeatToAdd = numParticles * R * 250; 
        heatingRate = maxHeatToAdd / 350; // Distributed smoothly across 350 frames

        // 4. Initialize both environments with matching physical profiles
        sysV = {
            particles: initParticles(numParticles, boxWidth, initialBoxHeight, T0),
            width: boxWidth,
            height: initialBoxHeight,
            initialHeight: initialBoxHeight,
            T: T0,
            T0: T0
        };

        sysP = {
            particles: initParticles(numParticles, boxWidth, initialBoxHeight, T0),
            width: boxWidth,
            height: initialBoxHeight,
            initialHeight: initialBoxHeight,
            T: T0,
            T0: T0
        };

        heatAddedTotal = 0;
        isRunning = true;
        btnRun.innerText = "Parar Simulação";
        btnRun.style.backgroundColor = "#d9534f";

        animate();
    });

    function randomGaussian() {
        let u = 0, v = 0;
        while(u === 0) u = Math.random();
        while(v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    function initParticles(N, w, h, T) {
        let arr = [];
        const targetKinetic = N * R * T;
        let currentKinetic = 0;

        for (let i = 0; i < N; i++) {
            arr.push({
                x: particleRadius + Math.random() * (w - 2 * particleRadius),
                y: particleRadius + Math.random() * (h - 2 * particleRadius),
                vx: randomGaussian(),
                vy: randomGaussian()
            });
        }

        // Eliminate linear momentum bias
        let vCMx = 0, vCMy = 0;
        for (let p of arr) { vCMx += p.vx; vCMy += p.vy; }
        vCMx /= N; vCMy /= N;
        for (let p of arr) { p.vx -= vCMx; p.vy -= vCMy; }

        // Scale initial velocities to exactly hit T0
        for (let p of arr) { currentKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy); }
        let scale = Math.sqrt(targetKinetic / currentKinetic);
        for (let p of arr) { p.vx *= scale; p.vy *= scale; }

        return arr;
    }

    function updatePhysics(sys) {
        const N = sys.particles.length;
        
        for (let i = 0; i < N; i++) {
            let p = sys.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Handle rigid wall bounds
            if (p.x <= particleRadius) { p.x = particleRadius; p.vx = Math.abs(p.vx); }
            else if (p.x >= sys.width - particleRadius) { p.x = sys.width - particleRadius; p.vx = -Math.abs(p.vx); }

            if (p.y <= particleRadius) { p.y = particleRadius; p.vy = Math.abs(p.vy); }
            else if (p.y >= sys.height - particleRadius) { 
                p.y = sys.height - particleRadius; 
                p.vy = -Math.abs(p.vy); 
            }
        }

        // Inter-particle elastic hard collisions
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                let p1 = sys.particles[i];
                let p2 = sys.particles[j];
                let dx = p2.x - p1.x;
                let dy = p2.y - p1.y;
                let distSq = dx * dx + dy * dy;
                const sigma = particleRadius * 2;

                if (distSq < sigma * sigma) {
                    let dvx = p2.vx - p1.vx;
                    let dvy = p2.vy - p1.vy;
                    if (dx * dvx + dy * dvy < 0) {
                        let dot = (dx * dvx + dy * dvy) / distSq;
                        p1.vx += dot * dx;
                        p1.vy += dot * dy;
                        p2.vx -= dot * dx;
                        p2.vy -= dot * dy;
                    }
                }
            }
        }

        // Sync temperature tracking variable to current root mean square speeds
        let totalKinetic = 0;
        for (let p of sys.particles) {
            totalKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy);
        }
        sys.T = totalKinetic / (N * R);
    }

    function injectHeat(sys, deltaQ) {
        let currentKinetic = 0;
        for (let p of sys.particles) {
            currentKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy);
        }
        
        let newKinetic = currentKinetic + deltaQ;
        let scale = Math.sqrt(newKinetic / currentKinetic);
        for (let p of sys.particles) {
            p.vx *= scale;
            p.vy *= scale;
        }
    }

    function drawSystem(sys, offsetX, title) {
        ctx.save();
        // Shift baseline anchor downward to give plenty of upward headroom
        ctx.translate(offsetX, canvas.height - 60);
        ctx.scale(1, -1); 

        // Draw structural cylinder background fill
        ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
        ctx.fillRect(0, 0, sys.width, canvas.height - 100);

        // Draw chamber frames
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - 100);
        ctx.lineTo(0, 0);
        ctx.lineTo(sys.width, 0);
        ctx.lineTo(sys.width, canvas.height - 100);
        ctx.stroke();

        // Color mapped dynamically to temperature change
        const tDiff = Math.min(1.0, (sys.T - sys.T0) / 250);
        const rVal = Math.floor(40 + tDiff * 215);
        const bVal = Math.floor(230 - tDiff * 190);
        const gVal = Math.floor(100 - tDiff * 60);

        // Draw gas particles
        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        for (let p of sys.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw the moving piston head cap
        ctx.strokeStyle = "#d9534f";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(-4, sys.height);
        ctx.lineTo(sys.width + 4, sys.height);
        ctx.stroke();

        ctx.restore();

        // System information metrics blocks
        ctx.fillStyle = "#222";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, offsetX + sys.width / 2, canvas.height - 25);
        
        ctx.font = "13px monospace";
        ctx.fillStyle = `rgb(${Math.min(200, rVal)}, 40, 40)`;
        ctx.fillText(`Temp (T): ${sys.T.toFixed(0)} K`, offsetX + sys.width / 2, canvas.height - 410);
        ctx.fillStyle = "#333";
        ctx.fillText(`Vol  (V): ${(sys.width * sys.height / 1000).toFixed(2)} L`, offsetX + sys.width / 2, canvas.height - 390);
    }

    function animate() {
        if (!isRunning) return;

        if (heatAddedTotal < maxHeatToAdd) {
            heatAddedTotal += heatingRate;

            // Isochoric: Injects 100% heat directly into particle speeds
            injectHeat(sysV, heatingRate);
            
            // Isobaric: Injects 50% into speeds, 50% absorbed as work expansion
            injectHeat(sysP, heatingRate * 0.5);

            // Dynamically stretch volume height according to Charles's Law
            sysP.height = sysP.initialHeight * (sysP.T / sysP.T0);
        }

        updatePhysics(sysV);
        updatePhysics(sysP);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        drawSystem(sysV, leftBoxOffset, "Volume Constante (ΔV = 0)");
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (W = P·ΔV)");

        // Progress bar rendering at the very top frame
        const pct = Math.min(100, (heatAddedTotal / maxHeatToAdd) * 100);
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(canvas.width / 2 - 150, 20, 300, 16);
        ctx.fillStyle = "#28a745";
        ctx.fillRect(canvas.width / 2 - 150, 20, 3 * pct, 16);
        
        ctx.fillStyle = "#333";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Calor Injetado (Q): ${pct.toFixed(0)}%`, canvas.width / 2, 52);

        animationId = requestAnimationFrame(animate);
    }
});
