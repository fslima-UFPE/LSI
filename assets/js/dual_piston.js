document.addEventListener("DOMContentLoaded", () => {
    const getEl = (id) => document.getElementById(id);
    
    const btnRun = getEl("btn-run-dual");
    const canvas = getEl("sim-canvas-dual");

    if (!canvas || !btnRun) return;
    const ctx = canvas.getContext("2d");

    let isRunning = false;
    let animationId = null;
    
    // Estruturas dos sistemas com vetores de histórico para os gráficos
    let sysV = { particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, historyT: [], historyP: [] };
    let sysP = { particles: [], width: 0, height: 0, T: 0, T0: 0, P: 1.0, initialHeight: 0, historyT: [], historyP: [] };
    
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

        numParticles = parseInt(getEl("inp-n1")?.value || 55);
        const T0 = parseFloat(getEl("inp-T")?.value || 300); // Base de 300K
        m = parseFloat(getEl("inp-m1")?.value || 4);
        const sigma = parseFloat(getEl("inp-sigma")?.value || 1.6);
        particleRadius = sigma / 2;

        // Dimensões otimizadas para os pistões verticais
        boxWidth = 160; 
        initialBoxHeight = 180; 
        
        leftBoxOffset = (canvas.width / 4) - (boxWidth / 2);
        rightBoxOffset = (3 * canvas.width / 4) - (boxWidth / 2);

        maxHeatToAdd = numParticles * R * 250; 
        heatingRate = maxHeatToAdd / 350; // Aquecimento distribuído em 350 frames

        // Inicialização limpa dos estados e históricos
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

    function updatePhysics(sys, isConstantP) {
        const N = sys.particles.length;
        
        for (let i = 0; i < N; i++) {
            let p = sys.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x <= particleRadius) { p.x = particleRadius; p.vx = Math.abs(p.vx); }
            else if (p.x >= sys.width - particleRadius) { p.x = sys.width - particleRadius; p.vx = -Math.abs(p.vx); }

            if (p.y <= particleRadius) { p.y = particleRadius; p.vy = Math.abs(p.vy); }
            else if (p.y >= sys.height - particleRadius) { 
                p.y = sys.height - particleRadius; 
                p.vy = -Math.abs(p.vy); 
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

        // Cálculo da Pressão Termodinâmica P = (N*R*T)/V. 
        // Normalizado para iniciar estritamente em 1.0 atm para fins didáticos.
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
        // Base dos cilindros fixada em Y = 400
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

        const tDiff = Math.min(1.0, (sys.T - sys.T0) / 250);
        const rVal = Math.floor(40 + tDiff * 215);
        const bVal = Math.floor(230 - tDiff * 190);
        const gVal = Math.floor(100 - tDiff * 60);

        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        for (let p of sys.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Piston móvel (vermelho)
        ctx.strokeStyle = "#d9534f";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(-4, sys.height);
        ctx.lineTo(sys.width + 4, sys.height);
        ctx.stroke();

        ctx.restore();

        // Dados textuais acima das caixas
        ctx.fillStyle = "#222";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, offsetX + sys.width / 2, 85);
        
        ctx.font = "13px monospace";
        ctx.fillStyle = "#d9534f";
        ctx.fillText(`Temp (T): ${sys.T.toFixed(0)} K`, offsetX + sys.width / 2, 108);
        ctx.fillStyle = "#28a745";
        ctx.fillText(`Pressão (p): ${sys.P.toFixed(2)} atm`, offsetX + sys.width / 2, 126);
        ctx.fillStyle = "#333";
        ctx.fillText(`Vol (V): ${(sys.width * sys.height / 1000).toFixed(1)} L`, offsetX + sys.width / 2, 144);
    }

    function drawGraph(x, y, w, h, title, yMin, yMax, unit, historyV, historyP) {
        ctx.save();
        ctx.translate(x, y);

        // Fundo do gráfico
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);

        // Título do Gráfico
        ctx.fillStyle = "#333";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(title, 10, -10);

        // Linhas de grade e eixos
        ctx.strokeStyle = "#eee";
        ctx.beginPath();
        for(let i = 1; i < 4; i++) {
            let ly = h - (i * h / 4);
            ctx.moveTo(0, ly);
            ctx.lineTo(w, ly);
        }
        ctx.stroke();

        // Rótulos do eixo Y
        ctx.fillStyle = "#777";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(yMax.toFixed(0) + unit, -5, 10);
        ctx.fillText(((yMax + yMin)/2).toFixed(0) + unit, -5, h/2 + 4);
        ctx.fillText(yMin.toFixed(0) + unit, -5, h - 2);

        // Função interna para traçar as linhas
        const drawLine = (history, color) => {
            if (history.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            
            for (let i = 0; i < history.length; i++) {
                // Mapeamento horizontal baseado no tamanho máximo estimado (3500px fictícios de buffer de pontos)
                let px = (i / 360) * w; 
                if (px > w) px = w; // Trava no limite lateral direito

                let val = history[i];
                let py = h - ((val - yMin) / (yMax - yMin)) * h;
                
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        };

        // Plota ambas as curvas comparativas sobre a mesma malha gráfica
        drawLine(historyV, "#e67e22"); // Volume Constante (Laranja/Vermelho)
        drawLine(historyP, "#3498db"); // Pressão Constante (Azul)

        ctx.restore();
    }

    function animate() {
        if (!isRunning) return;

        if (heatAddedTotal < maxHeatToAdd) {
            heatAddedTotal += heatingRate;

            // Transformações físicas de injeção de energia
            injectHeat(sysV, heatingRate);
            injectHeat(sysP, heatingRate * 0.5);

            sysP.height = sysP.initialHeight * (sysP.T / sysP.T0);
        }

        updatePhysics(sysV);
        updatePhysics(sysP);

        // Salva os dados atuais nos vetores de amostragem gráfica
        if (animationId % 2 === 0) { // Registra a cada 2 frames para suavizar o gráfico
            sysV.historyT.push(sysV.T);
            sysV.historyP.push(sysV.P);
            sysP.historyT.push(sysP.T);
            sysP.historyP.push(sysP.P);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Renderiza os cilindros principais superiores
        drawSystem(sysV, leftBoxOffset, "Volume Constante (Isocórica)");
        drawSystem(sysP, rightBoxOffset, "Pressão Constante (Isobárica)");

        // Renderiza os dois gráficos em tempo real lado a lado na base (Y = 490)
        // Parâmetros: X, Y, Largura, Altura, Título, Ymin, Ymax, Unidade, DadosV, DadosP
        drawGraph(70, 490, 310, 110, "Evolução da Temperatura (T)", 300, 560, "K", sysV.historyT, sysP.historyT);
        drawGraph(490, 490, 310, 110, "Evolução da Pressão (p)", 1.0, 2.0, "atm", sysV.historyP, sysP.historyP);

        // Legenda de Cores dos Gráficos (Centro Inferior)
        ctx.fillStyle = "#333";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        
        ctx.fillStyle = "#e67e22";
        ctx.fillRect(320, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.textAlign = "left";
        ctx.fillText("Sistema (V Constante)", 338, 631);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(485, 620, 12, 12);
        ctx.fillStyle = "#333";
        ctx.fillText("Sistema (p Constante)", 503, 631);

        // Barra global de aquecimento no topo do frame
        const pct = Math.min(100, (heatAddedTotal / maxHeatToAdd) * 100);
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(canvas.width / 2 - 150, 20, 300, 16);
        ctx.fillStyle = "#28a745";
        ctx.fillRect(canvas.width / 2 - 150, 20, 3 * pct, 16);
        
        ctx.fillStyle = "#333";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Calor Injetado no Sistema (Q): ${pct.toFixed(0)}%`, canvas.width / 2, 32);

        animationId = requestAnimationFrame(animate);
    }
});
