/*****************************
 *  ChartJS Score Chart for VAD and WakeWord Scores
 *  17.09.2025 Daniel Graf
 *****************************/
export class ScoreChart {
  constructor(canvasId, maxPoints = 10) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.maxPoints = maxPoints;
    this.vadHistory = [];
    this.wakewordHistory = [];

    // Chart.js Setup
    const chartData = {
      labels: Array(this.maxPoints).fill(""),
      datasets: [
        {
          label: "VAD Score",
          data: Array(this.maxPoints).fill(0),
          borderColor: "rgba(75, 192, 192, 1)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          tension: 0.25,
          fill: true,
        },
        {
          label: "WakeWord Score",
          data: Array(this.maxPoints).fill(0),
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.2)",
          tension: 0.25,
          fill: true,
        },
      ],
    };

    const chartConfig = {
      type: "line",
      data: chartData,
      options: {
        animation: false,
        responsive: true,
        scales: {
          y: {
            min: 0,
            max: 1,
          },
        },
        plugins: {
          legend: {
            position: "bottom",
          },
        },
      },
    };

    this.chart = new Chart(this.canvas, chartConfig);

    // init
    for (let i = 0; i < this.maxPoints; i++) {
      this.vadHistory.push(0);
      this.wakewordHistory.push(0);
    }
  }

  addData(vadScore, wakewordScore) {
    this.vadHistory.push(vadScore);
    this.wakewordHistory.push(wakewordScore);

    // only keep n last points
    if (this.vadHistory.length > this.maxPoints) this.vadHistory.shift();
    if (this.wakewordHistory.length > this.maxPoints) this.wakewordHistory.shift();

    this.chart.data.labels = this.vadHistory.map((_, i) => i + 1);
    this.chart.data.datasets[0].data = this.vadHistory;
    this.chart.data.datasets[1].data = this.wakewordHistory;
    this.chart.update();
  }

  clear() {
    this.vadHistory = [];
    this.wakewordHistory = [];
    this.chart.data.labels = Array(this.maxPoints).fill("");
    this.chart.data.datasets.forEach((d) => (d.data = Array(this.maxPoints).fill(0)));
    this.chart.update();
  }
}
