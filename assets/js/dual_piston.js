document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    const btnRun = getEl("btn-run-dual");
    const canvas = getEl("sim-canvas-dual");

    if (!canvas || !btnRun) return;
    const ctx = canvas.getContext("2d");

    let isRunning = false;
    let animationId = null;
    
    // System data stores with vector metrics arrays
    let sysV = { particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, historyT: [], historyP: [] };
    let sysP = { 
        particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, 
        initialHeight: 0, vCap: 0, mCap: 0, fExt: 0, historyT: [], historyP: [] 
    };
    
    let numParticles, particleRadius, m;
    const dt = 0.02; 
    const R = 8.314;
    
    let heatAddedTotal = 0;
    let maxHeatToAdd = 0; 
    let heatingRate = 0; 
    
    let boxWidth, initialBoxHeight, leftBoxOffset, rightBoxOffset;

    btnRun.addEventListener("click", () => {
        if (isRunning) {
            cancelAnimationFrame(animationId);
            isRunning = false;
            btnRun.innerText = "Simular Aquecimento (Dual)";
            btnRun.style.backgroundColor = "#007bff";
            return;
        }

        // 1. Process statistical upgrades (3x Particle Count)
        const baseParticles = parseInt(getEl("inp-n1")?.value || 55);
        numParticles = baseParticles * 3; // Tripled for clean statistical averages
        
        const T0 = parseFloat(getEl("inp-T")?.value || 300); 
        m = parseFloat(getEl("inp-m1")?.value || 4);
        
        // 2. Process radius upgrades (5x Radius increase)
        const baseSigma = parseFloat(getEl("inp-sigma")?.value || 1.6);
        const upgradedSigma = baseSigma * 5; 
        particleRadius = upgradedSigma / 2; // Noticeable, bold molecular spheres

        // 3. Desktop layout tracking adapted for 700px maximum width bounds
        boxWidth = 130; 
        initialBoxHeight = 180; 
        
        leftBoxOffset = (canvas.width / 4) - (boxWidth / 2);
        rightBoxOffset = (3 * canvas.width / 4) - (boxWidth / 2);

        // 4. Boost energy ceiling to maximize visible displacement height
        maxHeatToAdd = numParticles * R * 950; 
        heatingRate = maxHeatToAdd / 450; 

        // Compute balance force parameters
        const calculatedFExt = (numParticles * R * T0) / initialBoxHeight;

        sysV = {
            particles: initParticles(numParticles, boxWidth, initialBoxHeight, T0),
            width: boxWidth,
            height: initialBoxHeight,
            initialHeight: initialBoxHeight,
            T: T0,
            T0: T0,
            P: 1.0,
            historyT: [T0],
            historyP: [1.0]
        };

        sysP = {
            particles: initParticles(numParticles, boxWidth, initialBoxHeight, T0),
            width: boxWidth,
            height: initialBoxHeight,
            initialHeight: initialBoxHeight,
            T: T0,
            T0: T0,
            P: 1.0,
            vCap: 0,
            mCap: m * 35, // Lighter mass scale makes the cap highly reactive to collisions
            fExt: calculatedFExt,
            historyT: [T0],
            historyP: [1.0]
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

        let vCMx = 0, vCMy = 0;
        for (let p of arr) { vCMx += p.vx; vCMy += p.vy; }
        vCMx /= N; vCMy /= N;
        for (let p of arr) { p.vx -= vCMx; p.vy -= vCMy; }

        for (let p of arr) { currentKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy); }
        let scale = Math.sqrt(targetKinetic / currentKinetic);
        for (let p of arr) { p.vx *= scale; p.vy *= scale; }

        return arr;
    }

    function updatePhysics(sys, isIsobaric) {
        const N = sys.particles.length;

        if (isIsobaric) {
            let aCap = -sys.fExt / sys.mCap;
            sys.vCap += aCap * dt;
            sys.vCap *= 0.94; // Smooth out macroscopic jittering
            sys.height += sys.vCap * dt;

            // Containment ceiling parameters
            if (sys.height < 50) { sys.height = 50; sys.vCap = 0; }
            if (sys.height > 330) { sys.height = 330; sys.vCap = 0; }
        }
        
        for (let i = 0; i < N; i++) {
            let p = sys.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x <= particleRadius) { p.x = particleRadius; p.vx = Math.abs(p.vx); }
            else if (p.x >= sys.width - particleRadius) { p.x = sys.width - particleRadius; p.vx = -Math.abs(p.vx); }

            if (p.y <= particleRadius) { p.y = particleRadius; p.vy = Math.abs(p.vy); }
            else if (p.y >= sys.height - particleRadius) { 
                p.y = sys.height - particleRadius; 
                
                if (p.vy > 0) {
                    if (isIsobaric) {
                        // True dynamic momentum transfer to moving piston cap
                        let v1 = p.vy;
                        let v2 = sys.vCap;
                        let M = sys.mCap;

                        let v1New = ((m - M) * v1 + 2 * M * v2) / (m + M);
                        let v2New = ((M - m) * v2 + 2 * m * v1) / (m + M);

                        p.vy = v1New; 
                        sys.vCap = v2New; 
                    } else {
                        p.vy = -Math.abs(p.vy);
                    }
                }
            }
        }

        // Hard-sphere elastic intermolecular collisions
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

        let totalKinetic = 0;
        for (let p of sys.particles) {
            totalKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy);
        }
        sys.T = totalKinetic / (N * R);

        const currentVolume = sys.width * sys.height;
        const initialVolume = sys.width * sys.initialHeight;
        sys.P = (sys.T / sys.T0) * (initialVolume / currentVolume);
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
        ctx.translate(offsetX, 400); 
        ctx.scale(1, -1); 

        ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
        ctx.fillRect(0, 0, sys.width, 340);

        ctx.strokeStyle = "#444";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 340);
        ctx.lineTo(0, 0);
        ctx.lineTo(sys.width, 0);
        ctx.lineTo(sys.width, 340);
        ctx.stroke();

        const tDiff = Math.min(1.0, (sys.T - sys.T0) / 400);
        const rVal = Math.floor(40 + tDiff * 215);
        const bVal = Math.floor(230 - tDiff * 190);
        const gVal = Math.floor(100 - tDiff * 60);

        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        for (let p of sys.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = "#d9534f";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(-4, sys.height);
        ctx.lineTo(sys.width + 4, sys.height);
        ctx.stroke();

        ctx.restore();

        ctx.fillStyle = "#222";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, offsetX + sys.width / 2, 85);
        
        ctx.font = "12px monospace";
        ctx.fillStyle = "#d9534f";
        ctx.fillText(`Temp (T): ${sys.T.toFixed(0)} K`, offsetX + sys.width / 2, 108);
        ctx.fillStyle = "#28a745";
        ctx.fillText(`Pressure (p): ${sys.P.toFixed(2)} atm`, offsetX + sys.width / 2, 126);
        ctx.fillStyle = "#333";
        ctx.fillText(`Vol (V): ${(sys.width * sys.height / 1000).toFixed(1)} L`, offsetX + sys.width / 2, 144);
    }

    function drawGraph(x, y, w, h, title, yMin, yMax, unit, historyV, historyP) {
        ctx.save();
        ctx.translate(x, y);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);

        ctx.fillStyle = "#333";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(title, 5, -10);

        ctx.strokeStyle = "#eee";
        ctx.beginPath();
        for(let i = 1; i < 4; i++) {
            let ly = h - (i * h / 4);
            ctx.moveTo(0, ly);
            ctx.lineTo(w, ly);
        }
        ctx.stroke();

        ctx.fillStyle = "#777";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(yMax.toFixed(0) + unit, -5, 10);
        ctx.fillText(((yMax + yMin)/2).toFixed(0) + unit, -5, h/2 + 4);
        ctx.fillText(yMin.toFixed(0) + unit, -5, h - 2);

        const drawLine = (history, color) => {
            if (history.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            
            for (let i = 0; i < history.length; i++) {
                let px = (i / 450) * w; 
                if (px > w) px = w;

                let val = history[i];
                let py = h - ((val - yMin) / (yMax - yMin)) * h;
                
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        };

        drawLine(historyV, "#e67e22"); 
        drawLine(historyP, "#3498db"); 

        ctx.restore();
    }

    function animate() {
        if (!isRunning) return;

        if (heatAddedTotal < maxHeatToAdd) {
            heatAddedTotal += heatingRate;

            // Heat added directly to particle kinetic distributions
            injectHeat(sysV, heatingRate);
            injectHeat(sysP, heatingRate);
        }

        updatePhysics(sysV, false);
        updatePhysics(sysP, true);

        if (animationId % 2 === 0) { 
            sysV.historyT.push(sysV.T);
            sysV.historyP.push(sysV.P);
            sysP.historyT.push(sysP.T);
            sysP.historyP.push(sysP.P);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        drawSystem(sysV, leftBoxOffset, "Constant Volume (Isochoric)");
        drawSystem(sysP, rightBoxOffset, "Constant Pressure (Isobaric)");

        // Render charts adjusted within 700px limits
        drawGraph(50, 490, 270, 110, "Temperature Evolution (T)", 300, 950, "K", sysV.historyT, sysP.historyT);
        drawGraph(380, 490, 270, 110, "Pressure Evolution (p)", 1.0, 3.2, "atm", sysV.historyP, sysP.historyP);

        // Chart color coding keys
        ctx.fillStyle = "#e67e22";
        ctx.fillRect(220, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Fixed Chamber (ΔV=0)", 238, 631);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(400, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.fillText("Piston Chamber (Δp=0)", 418, 631);

        // Master progress thermal energy bar
        const pct = Math.min(100, (heatAddedTotal / maxHeatToAdd) * 100);
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(canvas.width / 2 - 150, 20, 300, 16);
        ctx.fillStyle = "#28a745";
        ctx.fillRect(canvas.width / 2 - 150, 20, 3 * pct, 16);
        
        ctx.fillStyle = "#333";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Heat Energy Injected (Q): ${pct.toFixed(0)}%`, canvas.width / 2, 32);

        animationId = requestAnimationFrame(animate);
    }
});
