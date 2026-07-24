document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    // Using unique element IDs to prevent any interference with your original script
    const btnRun = getEl("btn-run-dual");
    const canvas = getEl("sim-canvas-dual");

    if (!canvas || !btnRun) return;
    const ctx = canvas.getContext("2d");

    // Simulation states
    let isRunning = false;
    let animationId = null;
    
    let sysV = { particles: [], width: 0, height: 0, T: 0, T0: 0 };
    let sysP = { particles: [], width: 0, height: 0, T: 0, T0: 0, initialHeight: 0 };
    
    // Shared physics parameters
    let numParticles, particleRadius, m;
    const dt = 0.02; 
    let heatAddedTotal = 0;
    const maxHeatToAdd = 3000; 
    let heatingRate = 8; 
    
    let boxWidth, initialBoxHeight, leftBoxOffset, rightBoxOffset;

    btnRun.addEventListener("click", () => {
        if (isRunning) {
            cancelAnimationFrame(animationId);
            isRunning = false;
            btnRun.innerText = "Simular Aquecimento (Dual)";
            return;
        }

        // Reads values from your existing UI inputs safely
        numParticles = parseInt(getEl("inp-n1")?.value || 60);
        const T0 = parseFloat(getEl("inp-T")?.value || 150);
        m = parseFloat(getEl("inp-m1")?.value || 4);
        const sigma = parseFloat(getEl("inp-sigma")?.value || 1.2);
        particleRadius = sigma / 2;

        // Setup Canvas Geometry (Side-by-Side)
        const padding = 40;
        boxWidth = (canvas.width / 2) - (padding * 1.5);
        initialBoxHeight = canvas.height - (padding * 2);
        
        leftBoxOffset = padding;
        rightBoxOffset = (canvas.width / 2) + (padding / 2);

        // Initialize both systems with identical states
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
        const R = 8.314;
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

        // Remove net velocity drift
        let vCMx = 0, vCMy = 0;
        for (let p of arr) { vCMx += p.vx; vCMy += p.vy; }
        vCMx /= N; vCMy /= N;
        for (let p of arr) { p.vx -= vCMx; p.vy -= vCMy; }

        // Scale to target temperature
        for (let p of arr) { currentKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy); }
        let scale = Math.sqrt(targetKinetic / currentKinetic);
        for (let p of arr) { p.vx *= scale; p.vy *= scale; }

        return arr;
    }

    function updatePhysics(sys) {
        const N = sys.particles.length;
        
        // Move particles & resolve wall boundaries
        for (let i = 0; i < N; i++) {
            let p = sys.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt; // Fixed: properly updates vertical position

            if (p.x <= particleRadius) { p.x = particleRadius; p.vx = Math.abs(p.vx); }
            else if (p.x >= sys.width - particleRadius) { p.x = sys.width - particleRadius; p.vx = -Math.abs(p.vx); }

            if (p.y <= particleRadius) { p.y = particleRadius; p.vy = Math.abs(p.vy); }
            else if (p.y >= sys.height - particleRadius) { p.y = sys.height - particleRadius; p.vy = -Math.abs(p.vy); }
        }

        // Handle perfectly elastic inter-particle collisions
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

        // Recalculate temperature based on new kinetic energy state
        let totalKinetic = 0;
        for (let p of sys.particles) {
            totalKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy);
        }
        const R = 8.314;
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
        ctx.translate(offsetX, canvas.height - 40);
        ctx.scale(1, -1); // Flips Y-axis so floor is at the bottom

        // Container outlines
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, sys.height);
        ctx.lineTo(0, 0);
        ctx.lineTo(sys.width, 0);
        ctx.lineTo(sys.width, sys.height);
        ctx.stroke();

        // Piston cap line
        ctx.strokeStyle = "#d9534f";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-2, sys.height);
        ctx.lineTo(sys.width + 2, sys.height);
        ctx.stroke();

        // Color shifts from Blue (Cold) to Red (Hot) based on temperature delta
        const tDiff = Math.min(1.0, (sys.T - sys.T0) / 250);
        const rVal = Math.floor(50 + tDiff * 205);
        const bVal = Math.floor(220 - tDiff * 180);
        const gVal = Math.floor(80 - tDiff * 40);

        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        for (let p of sys.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.stroke();
        }

        ctx.restore();

        // Canvas UI text info indicators
        ctx.fillStyle = "#222";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, offsetX + sys.width / 2, 25);
        
        ctx.font = "13px monospace";
        ctx.fillText(`Temp (T): ${sys.T.toFixed(1)} K`, offsetX + sys.width / 2, canvas.height - 22);
        ctx.fillText(`Vol  (V): ${(sys.width * sys.height / 100).toFixed(1)} L`, offsetX + sys.width / 2, canvas.height - 5);
    }

    function animate() {
        if (!isRunning) return;

        if (heatAddedTotal < maxHeatToAdd) {
            heatAddedTotal += heatingRate;

            // Isochoric Box (V Constant): Receives full heat injection
            injectHeat(sysV, heatingRate);
            
            // Isobaric Box (P Constant): Exactly 50% turns to temperature, 50% turns to work expansion
            injectHeat(sysP, heatingRate * 0.5);

            // Expand the boundary of the isobaric cylinder proportional to temperature growth
            sysP.height = sysP.initialHeight * (sysP.T / sysP.T0);
        }

        updatePhysics(sysV);
        updatePhysics(sysP);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        drawSystem(sysV, leftBoxOffset, "Volume Constante (Isoeletro/Isocórica)");
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (Isobárica)");

        // Global Progress Heat Bar 
        ctx.fillStyle = "#666";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        const pct = Math.min(100, (heatAddedTotal / maxHeatToAdd) * 100);
        ctx.fillText(`Energia Térmica Adicionada (Q): ${pct.toFixed(0)}%`, canvas.width / 2, 50);

        animationId = requestAnimationFrame(animate);
    }
});
