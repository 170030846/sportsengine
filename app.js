// Application data
const appData = {
  "systemMetrics": {
    "uptime": "99.995%",
    "latency": "87ms",
    "throughput": "7,542 streams/sec",
    "accuracy": "99.991%",
    "errorRate": "0.009%",
    "eventsProcessed": "2,847,392",
    "monthlyCost": "$1,847"
  },
  "liveEvents": [
    {
      "id": "nfl_chiefs_bills",
      "sport": "NFL",
      "homeTeam": "Kansas City Chiefs",
      "awayTeam": "Buffalo Bills",
      "score": {"home": 21, "away": 17},
      "status": "Q3 - 8:47",
      "source": "SportsDataIO",
      "lastUpdate": "2 seconds ago"
    },
    {
      "id": "nba_lakers_warriors",
      "sport": "NBA", 
      "homeTeam": "LA Lakers",
      "awayTeam": "Golden State Warriors",
      "score": {"home": 95, "away": 92},
      "status": "Q4 - 2:15",
      "source": "Sportradar",
      "lastUpdate": "1 second ago"
    },
    {
      "id": "mlb_yankees_redsox",
      "sport": "MLB",
      "homeTeam": "New York Yankees", 
      "awayTeam": "Boston Red Sox",
      "score": {"home": 4, "away": 2},
      "status": "Bottom 7th",
      "source": "API-Sports",
      "lastUpdate": "5 seconds ago"
    }
  ],
  "bettingOdds": [
    {
      "gameId": "nfl_chiefs_bills",
      "bookmaker": "DraftKings",
      "moneyline": {"home": -110, "away": +95},
      "spread": {"line": -2.5, "home": -110, "away": -110},
      "total": {"over": 47.5, "under": 47.5},
      "lastUpdate": "3 seconds ago"
    },
    {
      "gameId": "nba_lakers_warriors", 
      "bookmaker": "FanDuel",
      "moneyline": {"home": +105, "away": -125},
      "spread": {"line": +3, "home": -110, "away": -110},
      "total": {"over": 215.5, "under": 215.5},
      "lastUpdate": "1 second ago"
    }
  ],
  "apiStatus": [
    {
      "name": "SportsDataIO",
      "status": "healthy",
      "responseTime": "89ms",
      "quotaUsed": "67%",
      "errorRate": "0.01%",
      "lastCall": "1 second ago"
    },
    {
      "name": "Sportradar",
      "status": "healthy", 
      "responseTime": "45ms",
      "quotaUsed": "23%",
      "errorRate": "0.00%",
      "lastCall": "2 seconds ago"
    },
    {
      "name": "The Odds API",
      "status": "warning",
      "responseTime": "1,847ms",
      "quotaUsed": "89%", 
      "errorRate": "0.05%",
      "lastCall": "47 seconds ago"
    },
    {
      "name": "API-Sports",
      "status": "healthy",
      "responseTime": "234ms",
      "quotaUsed": "45%",
      "errorRate": "0.02%", 
      "lastCall": "12 seconds ago"
    }
  ],
  "lambdaMetrics": [
    {
      "functionName": "data-ingestion",
      "invocations": "1,247,892",
      "duration": "156ms",
      "errors": "23",
      "successRate": "99.998%",
      "memory": "512MB"
    },
    {
      "functionName": "websocket-handler", 
      "invocations": "892,547",
      "duration": "67ms",
      "errors": "8",
      "successRate": "99.999%",
      "memory": "256MB"
    },
    {
      "functionName": "stream-processor",
      "invocations": "1,247,869",
      "duration": "234ms", 
      "errors": "15",
      "successRate": "99.999%",
      "memory": "1024MB"
    }
  ],
  "costBreakdown": [
    {"service": "Lambda", "cost": 105, "percentage": 5.7},
    {"service": "DynamoDB", "cost": 250, "percentage": 13.5},
    {"service": "API Gateway", "cost": 47, "percentage": 2.5},
    {"service": "Data Transfer", "cost": 45, "percentage": 2.4},
    {"service": "External APIs", "cost": 1350, "percentage": 73.1},
    {"service": "Monitoring", "cost": 50, "percentage": 2.7}
  ]
};

// Chart instances
let charts = {};

// Navigation
function initializeNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const pages = document.querySelectorAll('.page');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = link.getAttribute('data-page');
      
      // Update navigation
      navLinks.forEach(nl => nl.classList.remove('active'));
      link.classList.add('active');
      
      // Update pages
      pages.forEach(page => page.classList.remove('active'));
      document.getElementById(targetPage).classList.add('active');
      
      // Initialize page-specific functionality
      initializePage(targetPage);
    });
  });
}

// Initialize specific page functionality
function initializePage(pageId) {
  switch(pageId) {
    case 'dashboard':
      initializeDashboard();
      break;
    case 'live-feed':
      initializeLiveFeed();
      break;
    case 'architecture':
      initializeArchitecture();
      break;
    case 'api-management':
      initializeApiManagement();
      break;
    case 'monitoring':
      initializeMonitoring();
      break;
    case 'cost-analysis':
      initializeCostAnalysis();
      break;
  }
}

// Dashboard initialization
function initializeDashboard() {
  updateDashboardMetrics();
  createThroughputChart();
  createCostChart();
  updateEventsSummary();
}

function updateDashboardMetrics() {
  const metrics = appData.systemMetrics;
  document.getElementById('uptime').textContent = metrics.uptime;
  document.getElementById('latency').textContent = metrics.latency;
  document.getElementById('throughput').textContent = metrics.throughput.split(' ')[0];
  document.getElementById('accuracy').textContent = metrics.accuracy;
}

function createThroughputChart() {
  const ctx = document.getElementById('throughputChart');
  if (!ctx) return;

  // Generate sample data for the last 24 hours
  const labels = [];
  const data = [];
  const now = new Date();
  
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    data.push(Math.floor(Math.random() * 2000) + 6000);
  }

  if (charts.throughput) {
    charts.throughput.destroy();
  }

  charts.throughput = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Streams/sec',
        data: data,
        borderColor: '#1FB8CD',
        backgroundColor: 'rgba(31, 184, 205, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        }
      }
    }
  });
}

function createCostChart() {
  const ctx = document.getElementById('costChart');
  if (!ctx) return;

  if (charts.cost) {
    charts.cost.destroy();
  }

  charts.cost = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: appData.costBreakdown.map(item => item.service),
      datasets: [{
        data: appData.costBreakdown.map(item => item.cost),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true
          }
        }
      }
    }
  });
}

function updateEventsSummary() {
  document.getElementById('total-events').textContent = appData.systemMetrics.eventsProcessed;
  document.getElementById('active-streams').textContent = '5,284';
  document.getElementById('monthly-cost').textContent = appData.systemMetrics.monthlyCost;
}

// Live Feed initialization
function initializeLiveFeed() {
  renderLiveEvents();
  renderBettingOdds();
  setupSportFilter();
}

function renderLiveEvents() {
  const container = document.getElementById('live-events');
  if (!container) return;

  container.innerHTML = appData.liveEvents.map(event => `
    <div class="event-item">
      <div class="event-header">
        <div class="event-teams">${event.awayTeam} @ ${event.homeTeam}</div>
        <div class="event-sport">${event.sport}</div>
      </div>
      <div class="event-score">
        <div class="score">${event.score.away} - ${event.score.home}</div>
        <div class="event-status">${event.status}</div>
      </div>
      <div class="event-meta">
        <div class="event-source">${event.source}</div>
        <div class="event-updated">${event.lastUpdate}</div>
      </div>
    </div>
  `).join('');
}

function renderBettingOdds() {
  const container = document.getElementById('betting-odds');
  if (!container) return;

  container.innerHTML = appData.bettingOdds.map(odds => {
    const event = appData.liveEvents.find(e => e.id === odds.gameId);
    return `
      <div class="odds-item">
        <div class="event-header">
          <div class="event-teams">${event ? `${event.awayTeam} @ ${event.homeTeam}` : 'Game'}</div>
          <div class="event-sport">${odds.bookmaker}</div>
        </div>
        <div class="odds-grid">
          <div class="odds-section">
            <div class="odds-label">Moneyline</div>
            <div class="odds-values">${odds.moneyline.away > 0 ? '+' : ''}${odds.moneyline.away} / ${odds.moneyline.home > 0 ? '+' : ''}${odds.moneyline.home}</div>
          </div>
          <div class="odds-section">
            <div class="odds-label">Spread</div>
            <div class="odds-values">${odds.spread.line > 0 ? '+' : ''}${odds.spread.line}</div>
          </div>
          <div class="odds-section">
            <div class="odds-label">Total</div>
            <div class="odds-values">O/U ${odds.total.over}</div>
          </div>
        </div>
        <div class="event-meta">
          <div class="event-updated">${odds.lastUpdate}</div>
        </div>
      </div>
    `;
  }).join('');
}

function setupSportFilter() {
  const filter = document.getElementById('sport-filter');
  if (!filter) return;

  filter.addEventListener('change', (e) => {
    const selectedSport = e.target.value;
    const eventItems = document.querySelectorAll('.event-item');
    
    eventItems.forEach(item => {
      const sportElement = item.querySelector('.event-sport');
      const sport = sportElement ? sportElement.textContent : '';
      
      if (selectedSport === 'all' || sport === selectedSport) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  });
}

// Architecture initialization
function initializeArchitecture() {
  const toggleBtn = document.getElementById('toggle-metrics');
  const metricsSection = document.querySelector('.architecture-metrics');
  
  if (toggleBtn && metricsSection) {
    toggleBtn.addEventListener('click', () => {
      metricsSection.style.display = metricsSection.style.display === 'none' ? 'block' : 'none';
      toggleBtn.textContent = metricsSection.style.display === 'none' ? 'Show Metrics' : 'Hide Metrics';
    });
  }
}

// API Management initialization
function initializeApiManagement() {
  renderApiCards();
  createApiResponseChart();
  createApiQuotaChart();
}

function renderApiCards() {
  const container = document.getElementById('api-list');
  if (!container) return;

  container.innerHTML = appData.apiStatus.map(api => `
    <div class="api-card">
      <div class="api-header">
        <div class="api-name">${api.name}</div>
        <div class="api-status ${api.status}">${api.status.toUpperCase()}</div>
      </div>
      <div class="api-metrics">
        <div class="api-metric">
          <div class="api-metric-value">${api.responseTime}</div>
          <div class="api-metric-label">Response Time</div>
        </div>
        <div class="api-metric">
          <div class="api-metric-value">${api.quotaUsed}</div>
          <div class="api-metric-label">Quota Used</div>
        </div>
        <div class="api-metric">
          <div class="api-metric-value">${api.errorRate}</div>
          <div class="api-metric-label">Error Rate</div>
        </div>
        <div class="api-metric">
          <div class="api-metric-value">${api.lastCall}</div>
          <div class="api-metric-label">Last Call</div>
        </div>
      </div>
    </div>
  `).join('');
}

function createApiResponseChart() {
  const ctx = document.getElementById('apiResponseChart');
  if (!ctx) return;

  if (charts.apiResponse) {
    charts.apiResponse.destroy();
  }

  charts.apiResponse = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: appData.apiStatus.map(api => api.name),
      datasets: [{
        label: 'Response Time (ms)',
        data: appData.apiStatus.map(api => parseInt(api.responseTime)),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        }
      }
    }
  });
}

function createApiQuotaChart() {
  const ctx = document.getElementById('apiQuotaChart');
  if (!ctx) return;

  if (charts.apiQuota) {
    charts.apiQuota.destroy();
  }

  charts.apiQuota = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: appData.apiStatus.map(api => api.name),
      datasets: [{
        data: appData.apiStatus.map(api => parseInt(api.quotaUsed)),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true
          }
        }
      }
    }
  });
}

// Monitoring initialization
function initializeMonitoring() {
  renderLambdaCards();
  createLambdaInvocationsChart();
  createErrorRatesChart();
}

function renderLambdaCards() {
  const container = document.getElementById('lambda-metrics');
  if (!container) return;

  container.innerHTML = appData.lambdaMetrics.map(lambda => `
    <div class="lambda-card">
      <div class="lambda-name">${lambda.functionName}</div>
      <div class="lambda-metrics">
        <div class="metric">
          <span class="metric-label">Invocations:</span>
          <span class="metric-value">${lambda.invocations}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Duration:</span>
          <span class="metric-value">${lambda.duration}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Errors:</span>
          <span class="metric-value">${lambda.errors}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Success Rate:</span>
          <span class="metric-value">${lambda.successRate}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory:</span>
          <span class="metric-value">${lambda.memory}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function createLambdaInvocationsChart() {
  const ctx = document.getElementById('lambdaInvocationsChart');
  if (!ctx) return;

  if (charts.lambdaInvocations) {
    charts.lambdaInvocations.destroy();
  }

  charts.lambdaInvocations = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: appData.lambdaMetrics.map(lambda => lambda.functionName),
      datasets: [{
        label: 'Invocations',
        data: appData.lambdaMetrics.map(lambda => parseInt(lambda.invocations.replace(/,/g, ''))),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        }
      }
    }
  });
}

function createErrorRatesChart() {
  const ctx = document.getElementById('errorRatesChart');
  if (!ctx) return;

  if (charts.errorRates) {
    charts.errorRates.destroy();
  }

  // Generate sample error rate data over time
  const labels = [];
  const datasets = [];
  const colors = ['#1FB8CD', '#FFC185', '#B4413C'];
  
  // Generate time labels for last 12 hours
  for (let i = 11; i >= 0; i--) {
    const time = new Date(Date.now() - i * 60 * 60 * 1000);
    labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
  }

  appData.lambdaMetrics.forEach((lambda, index) => {
    const data = Array.from({ length: 12 }, () => Math.random() * 0.1);
    datasets.push({
      label: lambda.functionName,
      data: data,
      borderColor: colors[index],
      backgroundColor: colors[index] + '20',
      fill: false,
      tension: 0.4
    });
  });

  charts.errorRates = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 0.2,
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        }
      }
    }
  });
}

// Cost Analysis initialization
function initializeCostAnalysis() {
  createCostBreakdownChart();
  createCostTrendChart();
  renderCostTable();
}

function createCostBreakdownChart() {
  const ctx = document.getElementById('costBreakdownChart');
  if (!ctx) return;

  if (charts.costBreakdown) {
    charts.costBreakdown.destroy();
  }

  charts.costBreakdown = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: appData.costBreakdown.map(item => item.service),
      datasets: [{
        data: appData.costBreakdown.map(item => item.cost),
        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 20,
            usePointStyle: true
          }
        }
      }
    }
  });
}

function createCostTrendChart() {
  const ctx = document.getElementById('costTrendChart');
  if (!ctx) return;

  if (charts.costTrend) {
    charts.costTrend.destroy();
  }

  // Generate sample monthly cost data
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const costs = [1654, 1723, 1598, 1834, 1902, 1847];

  charts.costTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Monthly Cost ($)',
        data: costs,
        borderColor: '#1FB8CD',
        backgroundColor: 'rgba(31, 184, 205, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        },
        x: {
          grid: {
            color: 'rgba(94, 82, 64, 0.1)'
          }
        }
      }
    }
  });
}

function renderCostTable() {
  const tbody = document.getElementById('cost-table-body');
  if (!tbody) return;

  tbody.innerHTML = appData.costBreakdown.map(item => {
    const trend = Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable';
    const trendSymbol = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    
    return `
      <tr>
        <td>${item.service}</td>
        <td>$${item.cost}</td>
        <td>${item.percentage}%</td>
        <td class="trend-${trend}">${trendSymbol}</td>
      </tr>
    `;
  }).join('');
}

// Real-time updates
function startRealTimeUpdates() {
  // Update metrics every 5 seconds
  setInterval(() => {
    updateRealTimeMetrics();
  }, 5000);

  // Update last updated timestamp
  setInterval(() => {
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
      lastUpdatedElement.textContent = 'now';
    }
  }, 1000);
}

function updateRealTimeMetrics() {
  // Simulate real-time metric updates
  const latencyElement = document.getElementById('latency');
  if (latencyElement) {
    const currentLatency = parseInt(latencyElement.textContent);
    const newLatency = Math.max(50, currentLatency + Math.floor(Math.random() * 20) - 10);
    latencyElement.textContent = newLatency + 'ms';
  }

  const throughputElement = document.getElementById('throughput');
  if (throughputElement) {
    const currentThroughput = parseInt(throughputElement.textContent.replace(/,/g, ''));
    const newThroughput = Math.max(5000, currentThroughput + Math.floor(Math.random() * 1000) - 500);
    throughputElement.textContent = newThroughput.toLocaleString();
  }

  // Update active streams
  const activeStreamsElement = document.getElementById('active-streams');
  if (activeStreamsElement) {
    const currentStreams = parseInt(activeStreamsElement.textContent.replace(/,/g, ''));
    const newStreams = Math.max(4000, currentStreams + Math.floor(Math.random() * 200) - 100);
    activeStreamsElement.textContent = newStreams.toLocaleString();
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  initializeNavigation();
  initializeDashboard(); // Initialize default page
  startRealTimeUpdates();
});

// Add some CSS for odds display
const style = document.createElement('style');
style.textContent = `
  .odds-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-12);
    margin: var(--space-12) 0;
  }
  
  .odds-section {
    text-align: center;
    padding: var(--space-8);
    background: var(--color-background);
    border-radius: var(--radius-sm);
  }
  
  .odds-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-4);
  }
  
  .odds-values {
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
  }
`;
document.head.appendChild(style);