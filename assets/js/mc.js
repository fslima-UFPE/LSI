document.addEventListener("DOMContentLoaded", () => {

  const PARTICLES = {
    IG: { eps: 0, sig: 0 },
    HS: { eps: 0, sig: 4.055 },
    He: { eps: 5.465, sig: 2.628 },
    Ne: { eps: 36.831, sig: 2.775 },
    Ar: { eps: 116.81, sig: 3.401 },
    Kr: { eps: 164.56, sig: 3.601 },
    Xe: { eps: 218.18, sig: 4.055 }
  };

  document.querySelectorAll(".toolbox").forEach(box => {
    if (box.id !== "mc-lj-tool") return;

    const canvas = box.querySelector("#mcCanvas");
    const ctx = canvas.getContext("2d");

    const energyCanvas = box.querySelector("#energyChart");
    const pressureCanvas = box.querySelector("#pressureChart");

    const startBtn = box.querySelector("#startBtn");
    const stepBtn = box.querySelector("#stepBtn");
    const status = box.querySelector("#status");

    let sim = null;
    let running = false;

    let energyChart, pressureChart;

    // ================= INIT =================
    function initSim() {

      const N = parseInt(box.querySelector("#np").value);
      const boxSize = parseFloat(box.querySelector("#box").value);
      const T = parseFloat(box.querySelector("#temp").value);
      const dx = parseFloat(box.querySelector("#dx").value);
      const type = box.querySelector("#ptype").value;

      const { eps, sig } = PARTICLES[type];

      const r = [];

      for (let i = 0; i < N; i++) {
        r.push([
          Math.random() * boxSize,
          Math.random() * boxSize,
          Math.random() * boxSize
        ]);
      }

      const kB = 1.380649e-23;
      const v = Math.pow(boxSize, 3) * 1e-27;
      const pcoef = kB / (T * v);

      sim = {
        N, box: boxSize, T, dx,
        eps, sig,
        r,
        en: 0,
        xi: 0,
        pcoef,
        energy: [],
        pressure: [],
        step: 0
      };

      computeTotalEnergy();
    }

    // ================= DIST =================
    function dist(a, b, box) {
      let dx = Math.abs(a[0] - b[0]);
      let dy = Math.abs(a[1] - b[1]);
      let dz = Math.abs(a[2] - b[2]);

      dx -= Math.round(dx / box) * box;
      dy -= Math.round(dy / box) * box;
      dz -= Math.round(dz / box) * box;

      return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }

    // ================= LJ =================
    function encalc(r) {
      if (sim.eps === 0) return { en: 0, xi: 0 };

      const sr = sim.sig / r;
      const sr6 = sr**6;
      const sr12 = sr6**2;

      const en = 4 * sim.eps * (sr12 - sr6);
      const xi = 24 * sim.eps * (2*sr12 - sr6);

      return { en, xi };
    }

    // ================= TOTAL ENERGY =================
    function computeTotalEnergy() {
      sim.en = 0;
      sim.xi = 0;

      for (let i = 0; i < sim.N; i++) {
        for (let j = i + 1; j < sim.N; j++) {
          const r = dist(sim.r[i], sim.r[j], sim.box);
          const { en, xi } = encalc(r);
          sim.en += en;
          sim.xi += xi;
        }
      }
    }

    // ================= MC STEP =================
    function mcStep() {

      const i = Math.floor(Math.random() * sim.N);
      const old = [...sim.r[i]];

      const trial = [
        (old[0] + (Math.random()-0.5)*sim.dx + sim.box) % sim.box,
        (old[1] + (Math.random()-0.5)*sim.dx + sim.box) % sim.box,
        (old[2] + (Math.random()-0.5)*sim.dx + sim.box) % sim.box
      ];

      let dE = 0;
      let dXi = 0;
      let reject = false;

      for (let j = 0; j < sim.N; j++) {
        if (j === i) continue;

        const rOld = dist(old, sim.r[j], sim.box);
        const rNew = dist(trial, sim.r[j], sim.box);

        // HARD SPHERE
        if (sim.eps === 0 && sim.sig > 0) {
          if (rNew < sim.sig) {
            reject = true;
            break;
          }
          continue;
        }

        const oldVal = encalc(rOld);
        const newVal = encalc(rNew);

        dE += newVal.en - oldVal.en;
        dXi += newVal.xi - oldVal.xi;
      }

      if (!reject) {
        if (dE < 0 || Math.random() < Math.exp(-dE / sim.T)) {
          sim.r[i] = trial;
          sim.en += dE;
          sim.xi += dXi;
        }
      }

      sim.step++;

      sim.energy.push({ x: sim.step, y: sim.en });
      sim.pressure.push({ x: sim.step, y: sim.xi * sim.pcoef });

      if (sim.energy.length > 300) {
        sim.energy.shift();
        sim.pressure.shift();
      }
    }

    // ================= DRAW =================
    function draw() {
      const size = canvas.width = canvas.clientWidth;
      canvas.height = size;

      ctx.clearRect(0,0,size,size);

      for (let p of sim.r) {
        const x = (p[0] / sim.box) * size;
        const y = (p[1] / sim.box) * size;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2*Math.PI);
        ctx.fillStyle = "#007bff";
        ctx.fill();
      }
    }

    // ================= CHARTS =================
    function initCharts() {

      if (energyChart) energyChart.destroy();
      if (pressureChart) pressureChart.destroy();

      energyChart = new Chart(energyCanvas, {
        type: 'line',
        data: { datasets: [{ label: "Energy", data: [], borderColor: "#2980b9", pointRadius: 0 }] },
        options: {
          animation: false,
          responsive: true,
          scales: {
            x: { type: 'linear', title: { display: true, text: 'Steps' } },
            y: { title: { display: true, text: 'Energy' } }
          }
        }
      });

      pressureChart = new Chart(pressureCanvas, {
        type: 'line',
        data: { datasets: [{ label: "Pressure", data: [], borderColor: "#e74c3c", pointRadius: 0 }] },
        options: {
          animation: false,
          responsive: true,
          scales: {
            x: { type: 'linear', title: { display: true, text: 'Steps' } },
            y: { title: { display: true, text: 'Pressure' } }
          }
        }
      });
    }

    function updateCharts() {
      energyChart.data.datasets[0].data = sim.energy;
      energyChart.update();

      pressureChart.data.datasets[0].data = sim.pressure;
      pressureChart.update();
    }

    // ================= LOOP =================
    function loop() {
      if (!running) return;

      for (let i = 0; i < 5; i++) mcStep();

      draw();
      updateCharts();

      status.textContent =
        `E=${sim.en.toFixed(2)} | P=${(sim.xi * sim.pcoef).toExponential(2)}`;

      requestAnimationFrame(loop);
    }

    // ================= BUTTONS =================
    startBtn.addEventListener("click", () => {
      initSim();
      initCharts();
      running = true;
      loop();
    });

    stepBtn.addEventListener("click", () => {
      if (!sim) {
        initSim();
        initCharts();
      }
      mcStep();
      draw();
      updateCharts();
    });

  });

});
