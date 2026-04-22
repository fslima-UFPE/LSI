document.addEventListener('DOMContentLoaded', function() {
    
    const K1 = 2.54;
    const K2 = 6.46;
    const selVar = document.getElementById('sel-var');
    
    // Caixas de texto da coluna 1 (Valores Fixos)
    const baseInputs = {
        'N': document.getElementById('base-n'),
        'L': document.getElementById('base-l'),
        'T': document.getElementById('base-t'),
        'm': document.getElementById('base-m')
    };
    
    // Caixas de texto da coluna 2 (Valores de Teste)
    const valInputs = [
        document.getElementById('val-1'),
        document.getElementById('val-2'),
        document.getElementById('val-3'),
        document.getElementById('val-4'),
        document.getElementById('val-5')
    ];

    const btnPlot = document.getElementById('btn-plot');
    
    // Textos que precisam mudar de nome (N, L, T ou m)
    const lblTestVar = document.getElementById('lbl-var-test');
    const lblsEixoX = document.querySelectorAll('.lbl-eixo-x');

    let chartFreqInstance = null;
    let chartPressInstance = null;

    // Valores padrões
    const defaultTestValues = {
        'N': [50, 100, 150, 200, 250],
        'L': [30, 50, 70, 90, 110],
        'T': [100, 200, 300, 400, 500],
        'm': [10, 30, 50, 70, 90]
    };
    
    selVar.addEventListener('change', function() {
        const v = selVar.value; // Pega o que o usuário escolheu: 'N', 'L', 'T' ou 'm'
        
        // Atualiza o título da coluna 2 e dos gráficos
        lblTestVar.innerText = v;
        lblsEixoX.forEach(lbl => lbl.innerText = v);

        // Habilita todas as caixas da coluna 1, e desabilita só a que virou Eixo X
        for (let key in baseInputs) {
            baseInputs[key].disabled = false;
            baseInputs[key].style.opacity = '1';
        }
        baseInputs[v].disabled = true;
        baseInputs[v].style.opacity = '0.5';

        // Preenche a coluna 2 com os novos valores baseados na escolha
        for(let i = 0; i < 5; i++) {
            valInputs[i].value = defaultTestValues[v][i];
        }
    });

    btnPlot.addEventListener('click', function() {
        const v = selVar.value;
        
        const bN = parseFloat(baseInputs['N'].value);
        const bL = parseFloat(baseInputs['L'].value);
        const bT = parseFloat(baseInputs['T'].value);
        const bm = parseFloat(baseInputs['m'].value);

        let eixoX = [];
        let eixoFreq = [];
        let eixoPressao = [];

        for(let i = 0; i < 5; i++) {
            let xVal = parseFloat(valInputs[i].value);
            eixoX.push(xVal);

            let N = (v === 'N') ? xVal : bN;
            let L = (v === 'L') ? xVal : bL;
            let T = (v === 'T') ? xVal : bT;
            let m = (v === 'm') ? xVal : bm;

            let f = K1 * (N / L) * Math.sqrt(T / m);
            let P = K2 * (N * T) / (L * L); 

            eixoFreq.push(f.toFixed(2));
            eixoPressao.push(P.toFixed(2));
        }

        desenharGraficoFreq(eixoX, eixoFreq, v);
        desenharGraficoPressao(eixoX, eixoPressao, v);
    });


    function desenharGraficoFreq(xData, yData, labelX) {
        const ctx = document.getElementById('chart-freq').getContext('2d');
        if (chartFreqInstance) chartFreqInstance.destroy();

        chartFreqInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: xData,
                datasets: [{
                    label: 'Frequência (f)',
                    data: yData,
                    borderColor: '#003366',
                    backgroundColor: 'rgba(0, 51, 102, 0.1)',
                    borderWidth: 3,
                    pointRadius: 6,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: `Variável ${labelX}` } },
                    y: { title: { display: true, text: 'Frequência' } }
                }
            }
        });
    }

    function desenharGraficoPressao(xData, yData, labelX) {
        const ctx = document.getElementById('chart-press').getContext('2d');
        if (chartPressInstance) chartPressInstance.destroy();

        chartPressInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: xData,
                datasets: [{
                    label: 'Pressão (P)',
                    data: yData,
                    borderColor: '#d9534f',
                    backgroundColor: 'rgba(217, 83, 79, 0.1)',
                    borderWidth: 3,
                    pointRadius: 6,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: `Variável ${labelX}` } },
                    y: { title: { display: true, text: 'Pressão' } }
                }
            }
        });
    }

    // Clica no botão automaticamente ao carregar a página
    btnPlot.click();
});
