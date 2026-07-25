document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    const btnRun = getEl("btn-run-dual");
    const canvas = getEl("sim-canvas-dual");

    if (!canvas || !btnRun) return;
    const ctx = canvas.getContext("2d");

    let isRunning = false;
    let animationId = null;
    
    // System data states
    let sysV = { particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, historyT: [], historyP: [] };
    let sysP = { 
        particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, 
        initialHeight: 0, vCap: 0, historyT: [], historyP: [] 
    };
    
    let numParticles, particleRadius, m;
    const dt = 0.02; 
    const R = 8.314;
    
    let heatAddedTotal = 0;
    let maxHeatToAdd = 0; 
    let heatingRate = 0; 
    
    let boxWidth, initialBoxHeight, leftBoxOffset, rightBoxOffset;

    // Thermodynamic Heat Capacity Configuration Values based on selection
    let Cv_m, Cp_m;
    let T_theo_V, P_theo_V, T_theo_P, P_theo_P;

    // Read and enforce safety bounds on input metrics
    function validateAndLoadInputs() {
        // Enforce user entry constraints safely
        let p0 = Math.max(0.5, Math.min(3.0, parseFloat(getEl("p0Input")?.value || 1.0)));
        let t0 = Math.max(200, Math.min(600, parseFloat(getEl("t0Input")?.value || 300)));
        numParticles = Math.max(50, Math.min(250, parseInt(getEl("nInput")?.value || 150)));
        let qInput = Math.max(1.0, Math.min(25.0, parseFloat(getEl("qInput")?.value || 8.0)));
        
        getEl("p0Input").value = p0.toFixed(2);
        getEl("t0Input").value = t0.toFixed(0);
        getEl("nInput").value = numParticles.toFixed(0);
        getEl("qInput").value = qInput.toFixed(1);

        const geometry = getEl("geomSelect")?.value || "mono";
        if (geometry === "mono") {
            Cv_m = 1.5 * R;
            Cp_m = 2.5 * R;
        } else if (geometry === "linear") {
            Cv_m = 2.5 * R;
            Cp_m = 3.5 * R;
        } else { // non-linear
            Cv_m = 3.0 * R;
            Cp_m = 4.0 * R;
        }

        m = 4;
        particleRadius = 4; 
        boxWidth = 130; 
        initialBoxHeight = 160; 
        
        leftBoxOffset = (canvas.width / 4) - (boxWidth / 2);
        rightBoxOffset = (3 * canvas.width / 4) - (boxWidth / 2);

        // Convert the input kJ scale directly to energy coordinates inside the simulation engine
        maxHeatToAdd = qInput * 800; 
        heatingRate = maxHeatToAdd / 400; 

        // Theoretical Classical Thermodynamic Computations
        // Delta Energy Conversion scaled to align calculations with particle ensemble sizes
        const theoreticalQ = maxHeatToAdd / numParticles; 
        
        T_theo_V = t0 + (theoreticalQ / Cv_m);
        P_theo_V = p0 * (T_theo_V / t0);
        
        T_theo_P = t0 + (theoreticalQ / Cp_m);
        P_theo_P = p0; // Isobaric tracking criteria baseline

        // Update Classical Previsions fields inside the scorecard GUI
        getEl("t-v-teo").innerText = `${T_theo_V.toFixed(0)} K`;
        getEl("p-v-teo").innerText = `${P_theo_V.toFixed(2)} bar`;
        getEl("t-p-teo").innerText = `${T_theo_P.toFixed(0)} K`;
        getEl("p-p-teo").innerText = `${P_theo_P.toFixed(2)} bar`;

        // Initialize state arrays
        sysV = {
            particles: initParticles(numParticles, boxWidth, initialBoxHeight, t0),
            width: boxWidth,
            height: initialBoxHeight,
            initialHeight: initialBoxHeight,
            T: t0,
            T0: t0,
            P: p0,
            historyT: [t0],
            historyP: [p0]
        };

        sysP = {
            particles: initParticles(numParticles, boxWidth, initialBoxHeight, t0),
            width: boxWidth,
            height: initialBoxHeight,
            initialHeight: initialBoxHeight,
            T: t0,
            T0: t0,
            P: p0,
            vCap: 0,
            historyT: [t0],
            historyP: [p0]
        };

        heatAddedTotal = 0;
    }

    function initSimulationState() {
        validateAndLoadInputs();
        
        // Reset scoreboard indicators to active baseline tracking
        getEl("pDisplayBox").className = "jsbox-alert";
        getEl("pDisplayBox").style.background = "#fff3cd";
        getEl("pDisplayBox").style.color = "#856404";
        getEl("pDisplayBox").style.borderColor = "#ffeeba";
        getEl("status-val").innerText = "Pronto para iniciar";
        
        getEl("t-v-sim").innerText = "-";
        getEl("p-v-sim").innerText = "-";
        getEl("t-p-sim").innerText = "-";
        getEl("p-p-sim").innerText = "-";
    }

    function renderStaticFrame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        drawSystem(sysV, leftBoxOffset, "Vol. Constante (Isofcórico)", false);
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (Isobárico)", true);

        drawGraph(50, 490, 270, 110, "Evolução da Temperatura (T)", sysV.historyT, sysP.historyT, " K", sysV.T0, T_theo_V);
        drawGraph(380, 490, 270, 110, "Evolução da Pressão (p)", sysV.historyP, sysP.historyP, " bar", sysV.P, P_theo_V);

        // Chart labels
        ctx.fillStyle = "#e67e22";
        ctx.fillRect(220, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Chamber Fixa (ΔV=0)", 238, 631);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(400, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.fillText("Câmara Móvel (Δp=0)", 418, 631);

        // Progress bar container
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(canvas.width / 2 - 150, 20, 300, 16);
        ctx.fillStyle = "#333";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Calor Injetado (Q): 0%", canvas.width / 2, 32);
    }

    // Trigger base initialization automatically upon script loading execution
    initSimulationState();
    renderStaticFrame();

    btnRun.addEventListener("click", () => {
        if (isRunning) {
            cancelAnimationFrame(animationId);
            isRunning = false;
            btnRun.innerText = "Simular Aquecimento (Dual)";
            btnRun.style.backgroundColor = "#007bff";
            return;
        }

        initSimulationState();
        isRunning = true;
        btnRun.innerText = "Parar Simulação";
        btnRun.style.backgroundColor = "#d9534f";
        getEl("status-val").innerText = "Aquecendo o sistema...";

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

    function updatePhysics(sys, isIsobaric, targetP) {
        const N = sys.particles.length;

        if (isIsobaric) {
            // Acceleration driven relative to user-specified initial external baseline parameters
            let fNet = (sys.P - targetP) * 60; 
            sys.vCap += fNet * dt;
            sys.vCap *= 0.85; 
            sys.height += sys.vCap * dt;

            if (sys.height < 40) { sys.height = 40; sys.vCap = 0; }
            if (sys.height > 290) { sys.height = 290; sys.vCap = 0; }
        }
        
        const wallBuffer = particleRadius + 2; 

        for (let i = 0; i < N; i++) {
            let p = sys.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x <= wallBuffer) { p.x = wallBuffer; p.vx = Math.abs(p.vx); }
            else if (p.x >= sys.width - wallBuffer) { p.x = sys.width - wallBuffer; p.vx = -Math.abs(p.vx); }

            if (p.y <= wallBuffer) { p.y = wallBuffer; p.vy = Math.abs(p.vy); }
            else if (p.y >= sys.height - particleRadius) { 
                p.y = sys.height - particleRadius; 
                if (p.vy > 0) {
                    if (isIsobaric) {
                        p.vy = -p.vy + 2 * sys.vCap;
                    } else {
                        p.vy = -Math.abs(p.vy);
                    }
                }
            }
        }

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
        sys.P = (sys.T / sys.T0) * (initialVolume / currentVolume) * targetP;
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

    function drawSystem(sys, offsetX, title, isIsobaric) {
        ctx.save();
        ctx.translate(offsetX, 450); 
        ctx.scale(1, -1); 

        ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
        ctx.fillRect(0, 0, sys.width, 300);

        ctx.strokeStyle = "#444";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 300);
        ctx.lineTo(0, 0);
        ctx.lineTo(sys.width, 0);
        ctx.lineTo(sys.width, 300);
        ctx.stroke();

        const tDiff = Math.min(1.0, (sys.T - sys.T0) / 500);
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
        ctx.moveTo(0, sys.height);
        ctx.lineTo(sys.width, sys.height);
        ctx.stroke();

        if (!isIsobaric) {
            ctx.fillStyle = "#555";
            ctx.fillRect(-6, sys.height + 4, 10, 6);           
            ctx.fillRect(sys.width - 4, sys.height + 4, 10, 6); 
        }

        ctx.restore();

        ctx.fillStyle = "#222";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, offsetX + sys.width / 2, 65);
        
        ctx.font = "12px monospace";
        ctx.fillStyle = "#d9534f";
        ctx.fillText(`Temp (T): ${sys.T.toFixed(0)} K`, offsetX + sys.width / 2, 85);
        ctx.fillStyle = "#28a745";
        ctx.fillText(`Pressure (p): ${sys.P.toFixed(2)} bar`, offsetX + sys.width / 2, 103);
        ctx.fillStyle = "#333";
        ctx.fillText(`Vol (V): ${(sys.width * sys.height / 1000).toFixed(1)} L`, offsetX + sys.width / 2, 121);
    }

    function drawGraph(x, y, w, h, title, historyV, historyP, unit, defMin, defMax) {
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

        let yMin = defMin; 
        let yMax = Math.max(...historyV, ...historyP, defMax);
        let delta = yMax - yMin;
        yMax += delta * 0.12;
        if (yMax === yMin) yMax += 1.0; 

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
        ctx.fillText(yMax.toFixed(2) + unit, -5, 10);
        ctx.fillText(((yMax + yMin)/2).toFixed(2) + unit, -5, h/2 + 4);
        ctx.fillText(yMin.toFixed(2) + unit, -5, h - 2);

        const maxPoints = Math.max(450, historyV.length);

        const drawLine = (history, color) => {
            if (history.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            
            for (let i = 0; i < history.length; i++) {
                let px = (i / maxPoints) * w; 
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

        // Fetch target pressure criteria context dynamically from inputs
        let targetP0 = parseFloat(getEl("p0Input")?.value || 1.0);

        if (heatAddedTotal < maxHeatToAdd) {
            heatAddedTotal += heatingRate;
            injectHeat(sysV, heatingRate);
            injectHeat(sysP, heatingRate);
        }

        updatePhysics(sysV, false, targetP0);
        updatePhysics(sysP, true, targetP0);

        if (animationId % 2 === 0) { 
            sysV.historyT.push(sysV.T);
            sysV.historyP.push(sysV.P);
            sysP.historyT.push(sysP.T);
            sysP.historyP.push(sysP.P);
        }

        // Live scorecard readout population updates
        getEl("t-v-sim").innerText = `${sysV.T.toFixed(0)} K`;
        getEl("p-v-sim").innerText = `${sysV.P.toFixed(2)} bar`;
        getEl("t-p-sim").innerText = `${sysP.T.toFixed(0)} K`;
        getEl("p-p-sim").innerText = `${sysP.P.toFixed(2)} bar`;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        drawSystem(sysV, leftBoxOffset, "Vol. Constante (Isofórico)", false);
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (Isobárico)", true);

        drawGraph(50, 490, 270, 110, "Evolução da Temperatura (T)", sysV.historyT, sysP.historyT, " K", sysV.T0, T_theo_V);
        drawGraph(380, 490, 270, 110, "Evolução da Pressão (p)", sysV.historyP, sysP.historyP, " bar", targetP0, P_theo_V);

        // Chart indicators
        ctx.fillStyle = "#e67e22";
        ctx.fillRect(220, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Chamber Fixa (ΔV=0)", 238, 631);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(400, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.fillText("Câmara Móvel (Δp=0)", 418, 631);

        // Thermal progression bar updates
        const pct = Math.min(100, (heatAddedTotal / maxHeatToAdd) * 100);
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(canvas.width / 2 - 150, 20, 300, 16);
        ctx.fillStyle = "#28a745";
        ctx.fillRect(canvas.width / 2 - 150, 20, 3 * pct, 16);
        
        ctx.fillStyle = "#333";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Calor Injetado (Q): ${pct.toFixed(0)}%`, canvas.width / 2, 32);

        // Automated Equilibrium Exit Criteria Evaluation Check
        // Evaluates if heating injection concluded and moving piston mechanical oscillation stabilized
        if (heatAddedTotal >= maxHeatToAdd && Math.abs(sysP.vCap) < 0.04 && Math.abs(sysP.P - targetP0) < 0.02) {
            cancelAnimationFrame(animationId);
            isRunning = false;
            
            btnRun.innerText = "Simular Aquecimento (Dual)";
            btnRun.style.backgroundColor = "#007bff";
            
            // Switch alert class banner style seamlessly using template criteria layout hooks
            let pBox = getEl("pDisplayBox");
            pBox.className = "jsbox-alert snapped";
            getEl("status-val").innerText = "Equilíbrio Atingido!";
            return;
        }

        animationId = requestAnimationFrame(animate);
    }
});
