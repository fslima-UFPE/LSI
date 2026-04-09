document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".toolbox").forEach(box => {
    const canvas = box.querySelector(".graph-canvas");
    const sliderA = box.querySelector(".slider-a");
    const sliderB = box.querySelector(".slider-b");
    if (!canvas || !sliderA) return;

    const ctx = canvas.getContext("2d");

    function drawGraph() {
      const a = parseFloat(sliderA.value);
      const b = parseFloat(sliderB.value);
      const c = 0;

      ctx.clearRect(0,0,canvas.width,canvas.height);

      ctx.beginPath();
      for (let x=-10; x<=10; x+=0.1){
        const y = a*x*x + b*x + c;
        const px = (x+10)/20*canvas.width;
        const py = canvas.height - (y+50)/100*canvas.height;
        if (x===-10) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    sliderA.addEventListener("input", drawGraph);
    sliderB.addEventListener("input", drawGraph);

    drawGraph();
  });
});
