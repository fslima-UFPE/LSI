document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".toolbox").forEach(box => {
        if (box.id !== "work-tool") return;

        const canvas = box.querySelector("#workChart");
        const btnUpdate = box.querySelector(".generate-work-btn");
        const resultsPanel = box.querySelector("#results-panel");
        const modelSelect = box.querySelector(".param-model");
        
        let chartInstance = null;

        const R_JOULES = 8.314; 
        const R_LBAR = 0.08314; 

        // -- Lógica de UI: Esconder/Mostrar inputs baseados no modelo --
        function updateInputVisibility() {
            const model = modelSelect.value;
            const toggle = (className, show) => {
                box.querySelector(className).style.display = show ? "flex" : "none";
            };

            // Resetar tudo para escondido
            toggle(".row-a", false);
            toggle(".row-b", false);
            toggle(".row-sigma", false);
            toggle(".row-epsk", false);
            toggle(".row-lambda", false);

            if (model === 'hs') {
                toggle(".row-sigma", true);
            } else if (model === 'sw') {
                toggle(".row-sigma", true);
                toggle(".row-epsk", true);
                toggle(".row-lambda", true);
            } else if (model === 'vdw') {
                toggle(".row-sigma", true);
                toggle(".row-epsk", true);
            } else if (model === 'rk') {
                toggle(".row-a", true);
                toggle(".row-b", true);
            }
            // 'ideal' deixa tudo escondido
        }
        modelSelect.addEventListener("change", updateInputVisibility);
        updateInputVisibility(); // Init

        // -- Padrão de Hachura do Gráfico --
        function createHatchPattern(color) {
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = 10;
            patternCanvas.height = 10;
            const pctx = patternCanvas.getContext('2d');
            pctx.strokeStyle = color;
            pctx.lineWidth = 1;
            pctx.beginPath();
            pctx.moveTo(0, 10);
            pctx.lineTo(10, 0);
            pctx.stroke();
            return pctx.createPattern(patternCanvas, 'repeat');
        }

        // -- Equações de Estado (Pressão) --
        function getPressure(V, model, prm) {
            const { n, T, a, b, epsK, lambda } = prm;
            
            if (model !== 'ideal' && V <= n * b) return null; // Evita assíntotas

            switch (model) {
                case 'ideal':
                    return (n * R_LBAR * T) / V;
                case 'hs': 
                    return (n * R_LBAR * T) / (V - n * b);
                case 'sw': 
                    const A = 1 + (Math.exp(epsK / T) - 1) * (1 - Math.pow(lambda, 3));
                    return ((n * R_LBAR * T) / V) + ((Math.pow(n, 2) * R_LBAR * T * b * A) / Math.pow(V, 2));
                case 'vdw': 
                    return ((n * R_LBAR * T) / (V - n * b)) - ((Math.pow(n, 2) * a) / Math.pow(V, 2));
                case 'rk': 
                    return ((n * R_LBAR * T) / (V - n * b)) - ((Math.pow(n, 2) * a) / (Math.sqrt(T) * V * (V + n * b)));
                default:
                    return (n * R_LBAR * T) / V;
            }
        }

        // -- Equações de Trabalho Reversível --
        function getRevWork(Vi, Vf, model, prm) {
            const { n, T, a, b, epsK, lambda } = prm;
            let w_Lbar = 0; 

            switch (model) {
                case 'ideal':
                    w_Lbar = -n * R_LBAR * T * Math.log(Vf / Vi);
                    break;
                case 'hs':
                    w_Lbar = -n * R_LBAR * T * Math.log((Vf - n * b) / (Vi - n * b));
                    break;
                case 'sw':
                    const A = 1 + (Math.exp(epsK / T) - 1) * (1 - Math.pow(lambda, 3));
                    w_Lbar = -n * R_LBAR * T * Math.log(Vf / Vi) + 
                             Math.pow(n, 2) * R_LBAR * T * b * A * ((1 / Vf) - (1 / Vi));
                    break;
                case 'vdw':
                    w_Lbar = -n * R_LBAR * T * Math.log((Vf - n * b) / (Vi - n * b)) - 
                             Math.pow(n, 2) * a * ((1 / Vf) - (1 / Vi));
                    break;
                case 'rk':
                    w_Lbar = -n * R_LBAR * T * Math.log((Vf - n * b) / (Vi - n * b)) + 
                             ((n * a) / (b * Math.sqrt(T))) * Math.log((Vf * (Vi + n * b)) / (Vi * (Vf + n * b)));
                    break;
            }
            return w_Lbar * 100; // Conversão de L.bar para Joules
        }

        function updateSimulation() {
            const model = box.querySelector(".param-model").value;
            
            // Inputs brutos do usuário
            let prm = {
                T: parseFloat(box.querySelector(".param-t").value),
                n: parseFloat(box.querySelector(".param-n").value),
                a: parseFloat(box.querySelector(".param-a").value),
                b: parseFloat(box.querySelector(".param-b").value),
                sigma: parseFloat(box.querySelector(".param-sigma").value),
                epsK: parseFloat(box.querySelector(".param-epsk").value),
                lambda: parseFloat(box.querySelector(".param-lambda").value)
            };

            // Mapeamento microscópico para macroscópico (b em L/mol, a em L^2 bar/mol^2)
            if (['hs', 'sw', 'vdw'].includes(model)) {
                // b = (2/3) * pi * NA * sigma^3. 
                // Usando sigma em Angstroms, o fator para b é aprox 1.26127e-3 * sigma^3 L/mol
                prm.b = 1.26127e-3 * Math.pow(prm.sigma, 3);
            }
            if (model === 'vdw') {
                // Derivado da cauda atrativa de Lennard-Jones: a = b * R * (eps/k)
                prm.a = prm.b * R_LBAR * prm.epsK; 
            }
            
            const Vi = parseFloat(box.querySelector(".param-vi").value);
            const Vf = parseFloat(box.querySelector(".param-vf").value);
            const S = parseInt(box.querySelector(".param-s").value);

            if (Vi === Vf || S < 1) {
                alert("O volume inicial deve ser diferente do final, e o número de etapas maior que 0.");
                return;
            }

            if (model !== 'ideal' && (Vi <= prm.n * prm.b || Vf <= prm.n * prm.b)) {
                alert(`Atenção: O volume não pode ser menor ou igual ao covolume excluído (n*b = ${(prm.n*prm.b).toFixed(3)} L).`);
                return;
            }

            const isExpansion = Vf > Vi;
            const dV = (Vf - Vi) / S;
            
            // --- Cálculos de Trabalho ---
            const wRev = getRevWork(Vi, Vf, model, prm);
            let wIrrTotal = 0;
            let stepTextOutputs = [];
            let steppedPoints = [{ x: Vi, y: 0 }];

            for (let k = 1; k <= S; k++) {
                let V_prev = Vi + (k - 1) * dV;
                let V_curr = Vi + k * dV;
                
                let P_ext = getPressure(V_curr, model, prm);
                if(P_ext === null) P_ext = 0; 
                
                let wStep = -P_ext * dV * 100; // Joules
                wIrrTotal += wStep;

                stepTextOutputs.push(`Etapa ${k}: W = ${wStep.toFixed(1)} J`);
                steppedPoints.push({ x: V_prev, y: P_ext });
                steppedPoints.push({ x: V_curr, y: P_ext });
            }
            steppedPoints.push({ x: Vf, y: 0 });

            // --- Construção das Curvas ---
            let isothermPoints = [];
            let fillAreaPoints = [];
            
            let vMin = Math.min(Vi, Vf);
            let vMax = Math.max(Vi, Vf);
            
            // Extensão da curva em 15% para as bordas (se seguro do covolume)
            let span = vMax - vMin;
            let curveStart = Math.max(vMin - 0.15 * span, (model!=='ideal' ? prm.n * prm.b + 0.05 : 0.05));
            let curveEnd = vMax + 0.15 * span;
            
            let curveSteps = 150;
            let vStepSize = (curveEnd - curveStart) / curveSteps;

            for (let i = 0; i <= curveSteps; i++) {
                let v = curveStart + i * vStepSize;
                let p = getPressure(v, model, prm);
                if(p !== null && p > 0) { // Limita pressões absurdas
                    isothermPoints.push({ x: v, y: p });
                    if(v >= vMin && v <= vMax) {
                        fillAreaPoints.push({ x: v, y: p });
                    }
                }
            }

            // --- Lógica de Convergência (Margem de 5%) ---
            let error = Math.abs((wIrrTotal - wRev) / wRev);
            let stepsNeededStr = "";

            if (error <= 0.05) {
                stepsNeededStr = `Com ${S} etapas, já se atinge uma margem de erro ≤ 5% em relação ao caminho reversível.`;
            } else {
                let wTestIrr = 0;
                let testS = S;
                let testError = error;

                while (testError > 0.05 && testS <= 5000) {
                    testS++;
                    let dVTest = (Vf - Vi) / testS;
                    wTestIrr = 0;
                    for (let k = 1; k <= testS; k++) {
                        let Vk = Vi + k * dVTest;
                        let Pk = getPressure(Vk, model, prm);
                        wTestIrr += -Pk * dVTest * 100;
                    }
                    testError = Math.abs((wTestIrr - wRev) / wRev);
                }
                
                if (testS > 5000) {
                    stepsNeededStr = `Serão necessárias mais de 5000 etapas para convergir à margem de 5% de diferença.`;
                } else {
                    stepsNeededStr = `Faltam <b>${testS - S}</b> etapa(s) (total de ${testS}) para atingir uma margem de diferença ≤ 5%.`;
                }
            }

            // --- Painel de Texto ---
            let magnitudeComparison = isExpansion 
                ? "Na expansão, o caminho reversível possui a maior magnitude de trabalho (mais energia extraída)."
                : "Na compressão, o caminho reversível demanda a menor magnitude de trabalho (menos energia gasta).";
            
            // Formatar o nome do modelo para o output
            let modelName = modelSelect.options[modelSelect.selectedIndex].text;

            resultsPanel.style.display = "block";
            resultsPanel.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <strong>Processo:</strong> ${isExpansion ? 'Expansão' : 'Compressão'} Isotérmica (${modelName})<br>
                    <strong>Trabalho Reversível (Área Hachurada):</strong> ${wRev.toFixed(1)} J<br>
                    <strong>Trabalho Irreversível (${S} etapas):</strong> ${wIrrTotal.toFixed(1)} J<br>
                </div>
                <div style="margin-bottom: 10px; font-size: 0.9em; color: #555;">
                    <em>${stepTextOutputs.join(' | ')}</em>
                </div>
                <div style="margin-bottom: 10px;">
                    ${magnitudeComparison} A diferença atual é de <b>${(error * 100).toFixed(2)}%</b>.
                </div>
                <div style="color: #007bff;">
                    ${stepsNeededStr}
                </div>
            `;

            // --- Renderização do Gráfico ---
            if (chartInstance) chartInstance.destroy();

            const hatchPattern = createHatchPattern('rgba(231, 76, 60, 0.4)');

            chartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [
                        {
                            label: 'Isoterma Contínua',
                            data: isothermPoints,
                            borderColor: '#e74c3c',
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            tension: 0,
                            pointRadius: 0,
                            order: 1
                        },
                        {
                            label: 'Trabalho Reversível',
                            data: fillAreaPoints,
                            borderColor: 'transparent',
                            backgroundColor: hatchPattern,
                            fill: 'origin',
                            borderWidth: 0,
                            tension: 0,
                            pointRadius: 0,
                            order: 3
                        },
                        {
                            label: 'Trabalho Irreversível (Degraus)',
                            data: steppedPoints,
                            borderColor: '#2980b9',
                            backgroundColor: 'rgba(41, 128, 185, 0.3)',
                            borderWidth: 1.5,
                            fill: 'origin',
                            tension: 0,
                            pointRadius: 0,
                            order: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { 
                            type: 'linear', 
                            title: { display: true, text: 'Volume (V / L)' },
                            min: curveStart,
                            max: curveEnd
                        },
                        y: { 
                            title: { display: true, text: 'Pressão (p / bar)' },
                            min: 0, 
                            suggestedMax: Math.max(...fillAreaPoints.map(p => p.y)) * 1.2
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `(${context.parsed.x.toFixed(2)} L, ${context.parsed.y.toFixed(2)} bar)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        btnUpdate.addEventListener("click", updateSimulation);
        updateSimulation(); 
    });
});
