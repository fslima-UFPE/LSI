document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    const btnRun = getEl("btn-run-dual");
    const canvas = getEl("sim-canvas-dual");

    if (!canvas || !btnRun) return;
    const ctx = canvas.getContext("2d");

    // CRISP RESOLUTION FIX: Read device pixel ratio and upscale backing coordinates
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = canvas.width || 700;
    const logicalHeight = canvas.height || 650;
    
    canvas.style.width = logicalWidth + "px";
    canvas.style.height = logicalHeight + "px";
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    ctx.scale(dpr, dpr);

    let isRunning = false;
    let animationId = null;
    
    let sysV = { particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, historyT: [], historyP: [] };
    let sysP = { 
        particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, 
        initialHeight: 0, vCap: 0, historyT: [], historyP: [] 
    };
    
    let numParticles, particleRadius, m;
    const dt = 0.02; 
    const R = 8.314;
    
    let heatingFramesRemaining = 0;
    let isCooling = false;
    
    let equilibriumFramesCounter = 0;
    const REQUIRED_EQUILIBRIUM_FRAMES = 200; 

    let boxWidth, initialBoxHeight, leftBoxOffset, rightBoxOffset;
    let Cv_m, Cp_m;
    let T_theo_V, P_theo_V, T_theo_P, P_theo_P;
    let tMinGlobal, tMaxGlobal;

    function validateAndLoadInputs(forceRewrite = false) {
        let p0 = Math.max(0.5, Math.min(3.0, parseFloat(getEl("p0Input")?.value || 1.0)));
        let t0 = Math.max(200, Math.min(600, parseFloat(getEl("t0Input")?.value || 300)));
        numParticles = Math.max(100, Math.min(300, parseInt(getEl("nInput")?.value || 180)));
        
        if (forceRewrite) {
            if (getEl("p0Input")) getEl("p0Input").value = p0.toFixed(2);
            if (getEl("t0Input")) getEl("t0Input").value = t0.toFixed(0);
            if (getEl("nInput")) getEl("nInput").value = numParticles.toFixed(0);
        }

        const geometry = getEl("geomSelect")?.value || "mono";
        if (geometry === "mono") {
            Cv_m = 1.5 * R;
            Cp_m = 2.5 * R;
        } else if (geometry === "linear") {
            Cv_m = 2.5 * R;
            Cp_m = 3.5 * R;
        } else {
            Cv_m = 3.0 * R;
            Cp_m = 4.0 * R;
        }

        const nMolesProportional = numParticles / 180;
        
        let qMinAllowed = (nMolesProportional * Cv_m * (60 - t0)) / 1000;
        let qMaxAllowed = (nMolesProportional * Cv_m * (1200 - t0)) / 1000;
        
        const qRangeLabel = getEl("q-range-label");
        if (qRangeLabel) {
            qRangeLabel.innerText = `Permitido: ${qMinAllowed.toFixed(1)} a ${qMaxAllowed.toFixed(1)}`;
        }

        let qInput = parseFloat(getEl("qInput")?.value || 11.2);
        if (qInput < qMinAllowed) qInput = qMinAllowed;
        if (qInput > qMaxAllowed) qInput = qMaxAllowed;
        
        if (forceRewrite && getEl("qInput")) {
            getEl("qInput").value = qInput.toFixed(1);
        }

        m = 4;
        particleRadius = 3.5; 
        boxWidth = 210; 
        initialBoxHeight = 90; 
        
        leftBoxOffset = (logicalWidth / 4) - (boxWidth / 2);
        rightBoxOffset = (3 * logicalWidth / 4) - (boxWidth / 2);

        const systemEnergyJoules = qInput * 1000; 
        
        T_theo_V = t0 + (systemEnergyJoules / (nMolesProportional * Cv_m));
        P_theo_V = p0 * (T_theo_V / t0);
        
        T_theo_P = t0 + (systemEnergyJoules / (nMolesProportional * Cp_m));
        P_theo_P = p0; 

        tMinGlobal = Math.min(t0, T_theo_V, T_theo_P);
        tMaxGlobal = Math.max(t0, T_theo_V, T_theo_P) * 1.15; 

        if (getEl("t-v-teo")) getEl("t-v-teo").innerText = `${T_theo_V.toFixed(0)} K`;
        if (getEl("p-v-teo")) getEl("p-v-teo").innerText = `${P_theo_V.toFixed(2)} bar`;
        if (getEl("t-p-teo")) getEl("t-p-teo").innerText = `${T_theo_P.toFixed(0)} K`;
        if (getEl("p-p-teo")) getEl("p-p-teo").innerText = `${P_theo_P.toFixed(2)} bar`;

        heatingFramesRemaining = 350; 
        isCooling = (qInput < 0);

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

        equilibriumFramesCounter = 0;
    }

    function initSimulationState() {
        validateAndLoadInputs(true);
        
        const pBox = getEl("pDisplayBox");
        if (pBox) {
            pBox.className = "jsbox-alert";
            pBox.style.background = "#fff3cd";
            pBox.style.color = "#856404";
            pBox.style.borderColor = "#ffeeba";
        }
        const sVal = getEl("status-val");
        if (sVal) sVal.innerText = "Pronto para iniciar";
        
        if (getEl("t-v-sim")) getEl("t-v-sim").innerText = "-";
        if (getEl("p-v-sim")) getEl("p-v-sim").innerText = "-";
        if (getEl("t-p-sim")) getEl("t-p-sim").innerText = "-";
        if (getEl("p-p-sim")) getEl("p-p-sim").innerText = "-";
    }

    function renderStaticFrame() {
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        
        drawSystem(sysV, leftBoxOffset, "Vol. Constante (Isofórico)", false);
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (Isobárico)", true);

        drawGraph(50, 490, 270, 110, "Evolução da Temperatura (T)", sysV.historyT, sysP.historyT, " K", tMinGlobal, tMaxGlobal);
        drawGraph(380, 490, 270, 110, "Evolução da Pressão (p)", sysV.historyP, sysP.historyP, " bar", sysV.P, P_theo_V * 1.05);

        ctx.fillStyle = "#e67e22";
        ctx.fillRect(220, 620, 12, 12);
        ctx.fillStyle = "#2c3e50";
        ctx.font = "12px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Câmara Fixa (ΔV=0)", 238, 631);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(400, 620, 12, 12);
        ctx.fillStyle = "#2c3e50";
        ctx.fillText("Câmara Móvel (Δp=0)", 418, 631);

        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(logicalWidth / 2 - 150, 20, 300, 16);
        ctx.fillStyle = "#2c3e50";
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Calor Transferido (Q): 0%", logicalWidth / 2, 32);
    }

    ["p0Input", "t0Input", "nInput", "qInput", "geomSelect"].forEach(id => {
        const element = getEl(id);
        if (!element) return;

        element.addEventListener("input", () => {
            if (!isRunning) { 
                validateAndLoadInputs(false); 
                renderStaticFrame(); 
            }
        });

        element.addEventListener("change", () => {
            if (!isRunning) {
                validateAndLoadInputs(true); 
                renderStaticFrame();
            }
        });
    });

    btnRun.addEventListener("click", () => {
        if (isRunning) {
            cancelAnimationFrame(animationId);
            isRunning = false;
            btnRun.innerText = "Simular Processo (Dual)";
            btnRun.style.backgroundColor = "#007bff";
            return;
        }

        validateAndLoadInputs(true);
        isRunning = true;
        btnRun.innerText = "Parar Simulação";
        btnRun.style.backgroundColor = "#d9534f";
        
        const sVal = getEl("status-val");
        if (sVal) sVal.innerText = isCooling ? "Resfriando o sistema..." : "Aquecendo o sistema...";

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

    function updatePhysics(sys, isIsobaric, targetP, frameTargetT) {
        const N = sys.particles.length;

        if (isIsobaric) {
            let fNet = (sys.P - targetP) * 45; 
            sys.vCap += fNet * dt;
            sys.vCap *= 0.85; 
            sys.height += sys.vCap * dt;

            // FIXED: Ceiling cap extended safely to 300 to eliminate thermodynamic path lockouts
            if (sys.height < 30) { sys.height = 30; sys.vCap = 0; }
            if (sys.height > 300) { sys.height = 300; sys.vCap = 0; }
        }
        
        const wallBuffer = particleRadius + 1.5; 

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
        for (let p of sys.particles) totalKinetic += 0.5 * m * (p.vx * p.vx + p.vy * p.vy);
        sys.T = totalKinetic / (N * R);

        let scale = Math.sqrt(frameTargetT / (sys.T || 1));
        for (let p of sys.particles) { p.vx *= scale; p.vy *= scale; }
        sys.T = frameTargetT;

        const currentVolume = sys.width * sys.height;
        const initialVolume = sys.width * sys.initialHeight;
        sys.P = (sys.T / sys.T0) * (initialVolume / currentVolume) * targetP;
    }

    function drawSystem(sys, offsetX, title, isIsobaric) {
        ctx.save();
        // Shifted baseline down to 445 to accommodate high vertical expansion crisply
        ctx.translate(offsetX, 445); 
        ctx.scale(1, -1); 

        // Premium glass chamber visual design
        ctx.fillStyle = "rgba(245, 247, 250, 0.8)";
        ctx.fillRect(0, 0, sys.width, 360); 

        ctx.strokeStyle = "#2c3e50";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 360);
        ctx.lineTo(0, 0);
        ctx.lineTo(sys.width, 0);
        ctx.lineTo(sys.width, 360);
        ctx.stroke();

        let fColor = (sys.T - tMinGlobal) / (tMaxGlobal - tMinGlobal || 1);
        fColor = Math.max(0, Math.min(1, fColor)); 
        
        let rVal = Math.floor(46 + fColor * 209);
        let gVal = Math.floor(62 - fColor * 20);
        let bVal = Math.floor(243 - fColor * 180);

        // Render sleek anti-aliased energetic gaseous atoms
        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        for (let p of sys.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Heavy steel engine piston profile
        ctx.strokeStyle = "#34495e";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(0, sys.height);
        ctx.lineTo(sys.width, sys.height);
        ctx.stroke();

        if (!isIsobaric) {
            ctx.fillStyle = "#e74c3c";
            ctx.fillRect(-5, sys.height + 3, 8, 5);           
            ctx.fillRect(sys.width - 3, sys.height + 3, 8, 5); 
        }

        ctx.restore();

        // High resolution system telemetry displays using standard system UI typography stack
        ctx.fillStyle = "#2c3e50";
        ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, offsetX + sys.width / 2, 45);
        
        ctx.font = "bold 12px monospace";
        ctx.fillStyle = `rgb(${Math.min(210, rVal)}, 40, ${Math.min(210, bVal)})`;
        ctx.fillText(`Temp (T): ${sys.T.toFixed(0)} K`, offsetX + sys.width / 2, 65);
        ctx.fillStyle = "#27ae60";
        ctx.fillText(`Pressão (p): ${sys.P.toFixed(2)} bar`, offsetX + sys.width / 2, 83);
        ctx.fillStyle = "#7f8c8d";
        ctx.fillText(`Vol (V): ${(sys.width * sys.height / 1000).toFixed(1)} L`, offsetX + sys.width / 2, 101);
    }

    function drawGraph(x, y, w, h, title, historyV, historyP, unit, defMin, defMax) {
        ctx.save();
        ctx.translate(x, y);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);

        ctx.fillStyle = "#2c3e50";
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(title, 0, -10);

        let allValues = historyV.concat(historyP).concat([defMin, defMax]);
        let yMin = Math.min(...allValues);
        let yMax = Math.max(...allValues);
        let delta = yMax - yMin;
        yMax += delta * 0.15;
        yMin -= delta * 0.05;
        if (yMax === yMin) yMax += 1.0; 

        ctx.strokeStyle = "#f1f5f9";
        ctx.beginPath();
        for(let i = 1; i < 4; i++) {
            let ly = h - (i * h / 4);
            ctx.moveTo(0, ly);
            ctx.lineTo(w, ly);
        }
        ctx.stroke();

        ctx.fillStyle = "#94a3b8";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(yMax.toFixed(1) + unit, -6, 10);
        ctx.fillText(((yMax + yMin)/2).toFixed(1) + unit, -6, h/2 + 4);
        ctx.fillText(yMin.toFixed(1) + unit, -6, h - 2);

        const maxPoints = Math.max(600, historyV.length);

        const drawLine = (history, color) => {
            if (history.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
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

        let targetP0 = parseFloat(getEl("p0Input")?.value || 1.0);
        let t0 = parseFloat(getEl("t0Input")?.value || 300);

        let currentStep = 350 - heatingFramesRemaining;
        let totalQInputJoules = parseFloat(getEl("qInput")?.value || 0) * 1000;
        
        let qInjectedJoules = totalQInputJoules * (Math.min(350, currentStep) / 350);
        let nMolesProportional = numParticles / 180;

        let frameTargetT_V = t0 + qInjectedJoules / (nMolesProportional * Cv_m);
        
        let workDoneJoules = nMolesProportional * R * t0 * ((sysP.height - sysP.initialHeight) / sysP.initialHeight);
        let frameTargetT_P = t0 + (qInjectedJoules - workDoneJoules) / (nMolesProportional * Cv_m);
        if (frameTargetT_P < 40) frameTargetT_P = 40; 

        updatePhysics(sysV, false, targetP0, frameTargetT_V);
        updatePhysics(sysP, true, targetP0, frameTargetT_P);

        if (heatingFramesRemaining > 0) {
            heatingFramesRemaining--;
        }

        if (animationId % 2 === 0) { 
            sysV.historyT.push(sysV.T);
            sysV.historyP.push(sysV.P);
            sysP.historyT.push(sysP.T);
            sysP.historyP.push(sysP.P);
        }

        if (getEl("t-v-sim")) getEl("t-v-sim").innerText = `${sysV.T.toFixed(0)} K`;
        if (getEl("p-v-sim")) getEl("p-v-sim").innerText = `${sysV.P.toFixed(2)} bar`;
        if (getEl("t-p-sim")) getEl("t-p-sim").innerText = `${sysP.T.toFixed(0)} K`;
        if (getEl("p-p-sim")) getEl("p-p-sim").innerText = `${sysP.P.toFixed(2)} bar`;

        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        
        drawSystem(sysV, leftBoxOffset, "Vol. Constante (Isofórico)", false);
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (Isobárico)", true);

        drawGraph(50, 490, 270, 110, "Evolução da Temperatura (T)", sysV.historyT, sysP.historyT, " K", tMinGlobal, tMaxGlobal);
        drawGraph(380, 490, 270, 110, "Evolução da Pressão (p)", sysV.historyP, sysP.historyP, " bar", targetP0, P_theo_V * 1.05);

        ctx.fillStyle = "#e67e22";
        ctx.fillRect(220, 620, 12, 12);
        ctx.fillStyle = "#2c3e50";
        ctx.font = "12px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Câmara Fixa (ΔV=0)", 238, 631);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(400, 620, 12, 12);
        ctx.fillStyle = "#2c3e50";
        ctx.fillText("Câmara Móvel (Δp=0)", 418, 631);

        const pct = Math.min(100, ((350 - heatingFramesRemaining) / 350) * 100);
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(logicalWidth / 2 - 150, 20, 300, 16);
        ctx.fillStyle = isCooling ? "#3498db" : "#28a745";
        ctx.fillRect(logicalWidth / 2 - 150, 20, 3 * pct, 16);
        
        ctx.fillStyle = "#2c3e50";
        ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${isCooling ? 'Frio' : 'Calor'} Transferido: ${pct.toFixed(0)}%`, logicalWidth / 2, 32);

        if (heatingFramesRemaining <= 0) {
            const pressureSettled = Math.abs(sysP.P - targetP0) <= 0.015;
            const mechanicalFrictionGrounded = Math.abs(sysP.vCap) < 0.4;

            if (pressureSettled && mechanicalFrictionGrounded) {
                equilibriumFramesCounter++;
            } else {
                equilibriumFramesCounter = 0; 
            }

            let remainingSecs = Math.max(0, (REQUIRED_EQUILIBRIUM_FRAMES - equilibriumFramesCounter) * dt);
            const sVal = getEl("status-val");
            if (sVal) sVal.innerText = `Estabilizando pistão... (${remainingSecs.toFixed(1)}s restante)`;

            if (equilibriumFramesCounter >= REQUIRED_EQUILIBRIUM_FRAMES) {
                cancelAnimationFrame(animationId);
                isRunning = false;
                
                btnRun.innerText = "Simular Processo (Dual)";
                btnRun.style.backgroundColor = "#007bff";
                
                let pBox = getEl("pDisplayBox");
                if (pBox) pBox.className = "jsbox-alert snapped";
                if (sVal) sVal.innerText = "Equilíbrio Atingido (Estável)!";
                return;
            }
        }

        animationId = requestAnimationFrame(animate);
    }

    initSimulationState();
    renderStaticFrame();
});
