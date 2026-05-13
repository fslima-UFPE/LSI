document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".toolbox").forEach(box => {
        if (box.id !== "work-tool") return;

        const canvas = box.querySelector("#workChart");
        const btnUpdate = box.querySelector(".generate-work-btn");
        const resultsPanel = box.querySelector("#results-panel");
        
        let chartInstance = null;

        // Constants
        const R_JOULES = 8.314; // J/(mol K) for energy math
        const R_LBAR = 0.08314; // L bar/(mol K) for pressure mapping

        function updateSimulation() {
            // Retrieve values
            const T = parseFloat(box.querySelector(".param-t").value);
            const n = parseFloat(box.querySelector(".param-n").value);
            const Vi = parseFloat(box.querySelector(".param-vi").value);
            const Vf = parseFloat(box.querySelector(".param-vf").value);
            const S = parseInt(box.querySelector(".param-s").value);

            if (Vi === Vf || S < 1) {
                alert("O volume inicial deve ser diferente do final, e o número de etapas maior que 0.");
                return;
            }

            const isExpansion = Vf > Vi;
            const dV = (Vf - Vi) / S; // will be negative for compression
            
            // 1. Calculate Reversible Work (W = -nRT ln(Vf/Vi))
            const wRev = -n * R_JOULES * T * Math.log(Vf / Vi);

            // 2. Calculate Irreversible Work and Map Box Coordinates
            let wIrrTotal = 0;
            let stepTextOutputs = [];
            let steppedPoints = [{ x: Vi, y: 0 }]; // Start baseline for polygon fill

            for (let k = 1; k <= S; k++) {
                let V_prev = Vi + (k - 1) * dV;
                let V_curr = Vi + k * dV;
                
                // External pressure of the step dictates the work done
                let P_ext = (n * R_LBAR * T) / V_curr;
                
                // Work for this step in Joules (P in bar, V in L -> L.bar to Joules = * 100)
                let wStep = -P_ext * dV * 100; 
                wIrrTotal += wStep;

                stepTextOutputs.push(`Etapa ${k}: W = ${wStep.toFixed(1)} J`);

                // Map coordinates for the step block visualization
                steppedPoints.push({ x: V_prev, y: P_ext });
                steppedPoints.push({ x: V_curr, y: P_ext });
            }
            // Close the polygon back to 0
            steppedPoints.push({ x: Vf, y: 0 });

            // 3. Map Continuous Isotherm Curve
            let isothermPoints = [];
            let vStart = Math.min(Vi, Vf);
            let vEnd = Math.max(Vi, Vf);
            let curveSteps = 100;
            let vStepSize = (vEnd - vStart) / curveSteps;

            for (let i = 0; i <= curveSteps; i++) {
                let v = vStart + i * vStepSize;
                let p = (n * R_LBAR * T) / v;
                isothermPoints.push({ x: v, y: p });
            }

            // 4. Determine steps needed for 5% difference
            let error = Math.abs((wIrrTotal - wRev) / wRev);
            let targetS = S;
            let stepsNeededStr = "";

            if (error <= 0.05) {
                stepsNeededStr = `Com ${S} etapas, o caminho já atinge uma diferença menor ou igual a 5% em relação ao trabalho reversível.`;
            } else {
                let wTestIrr = 0;
                let testS = S;
                let testError = error;

                // Loop to find the number of steps to reach <= 5% error
                while (testError > 0.05 && testS <= 5000) {
                    testS++;
                    let dVTest = (Vf - Vi) / testS;
                    wTestIrr = 0;
                    for (let k = 1; k <= testS; k++) {
                        let Vk = Vi + k * dVTest;
                        let Pk = (n * R_LBAR * T) / Vk;
                        wTestIrr += -Pk * dVTest * 100;
                    }
                    testError = Math.abs((wTestIrr - wRev) / wRev);
                }
                
                if (testS > 5000) {
                    stepsNeededStr = `Serão necessárias mais de 5000 etapas para atingir uma diferença de 5%.`;
                } else {
                    stepsNeededStr = `Faltam <b>${testS - S}</b> etapa(s) (totalizando ${testS} etapas) para que a diferença entre o trabalho irreversível e o reversível fique dentro da margem de 5%.`;
                }
            }

            // 5. Update the Text Results Panel
            // Format text indicating the thermodynamic implication
            let magnitudeComparison = isExpansion 
                ? "Em expansões, o trabalho reversível fornece a <b>maior magnitude</b> (maior quantidade de energia útil extraída)."
                : "Em compressões, o caminho reversível requer a <b>menor magnitude</b> de trabalho possível (menor gasto de energia).";

            resultsPanel.style.display = "block";
            resultsPanel.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <strong>Tipo de Processo:</strong> ${isExpansion ? 'Expansão' : 'Compressão'} Isotérmica<br>
                    <strong>Trabalho Reversível (Contínuo):</strong> ${wRev.toFixed(1)} J<br>
                    <strong>Trabalho Irreversível Total (${S} etapas):</strong> ${wIrrTotal.toFixed(1)} J<br>
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

            // 6. Draw Chart
            if (chartInstance) chartInstance.destroy();

            chartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [
                        {
                            label: 'Isoterma (Caminho Reversível)',
                            data: isothermPoints,
                            borderColor: '#e74c3c',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            tension: 0,
                            pointRadius: 0,
                            order: 1
                        },
                        {
                            label: 'Etapas (Trabalho Irreversível)',
                            data: steppedPoints,
                            borderColor: '#2980b9',
                            backgroundColor: 'rgba(41, 128, 185, 0.2)',
                            borderWidth: 1.5,
                            fill: true,
                            tension: 0,
                            pointRadius: 0,
                            stepped: false, // We created the steps manually with coordinates
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
                            min: vStart - (vStart * 0.1),
                            max: vEnd + (vEnd * 0.1)
                        },
                        y: { 
                            title: { display: true, text: 'Pressão (p / bar)' },
                            min: 0, // Pressure base is zero for area visualization
                            suggestedMax: Math.max(...isothermPoints.map(p => p.y)) * 1.1
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

        // Initialize and bind
        btnUpdate.addEventListener("click", updateSimulation);
        updateSimulation(); // Run on load
    });
});
