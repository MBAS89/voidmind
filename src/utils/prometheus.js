/**
 * VoidMind — Prometheus Metrics
 * Exposes operational metrics for Grafana/Prometheus scraping.
 * No user data, no content — only counts, latencies, and system stats.
 */

const logger = require('./logger');

// In-memory metric stores (counters, histograms, gauges)
const counters = {};
const histograms = {};
const gauges = {};

function incCounter(name, labels = {}, value = 1) {
  const key = formatLabels(name, labels);
  counters[key] = (counters[key] || 0) + value;
}

function observeHistogram(name, labels, value, buckets = [0.1, 0.5, 1, 2, 5, 10, 30]) {
  const key = formatLabels(name, labels);
  if (!histograms[key]) {
    histograms[key] = { buckets: {}, sum: 0, count: 0 };
    for (const b of buckets) histograms[key].buckets[b] = 0;
  }
  const h = histograms[key];
  for (const b of buckets) {
    if (value <= b) h.buckets[b] += 1;
  }
  h.sum += value;
  h.count += 1;
}

function setGauge(name, labels, value) {
  const key = formatLabels(name, labels);
  gauges[key] = value;
}

function formatLabels(name, labels) {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return labelStr ? `${name}{${labelStr}}` : name;
}

function renderMetrics() {
  const lines = [];
  lines.push('# VoidMind Prometheus Metrics');
  lines.push('');

  // Counters
  for (const [key, value] of Object.entries(counters)) {
    lines.push(`# TYPE ${key.split('{')[0]} counter`);
    lines.push(`${key} ${value}`);
  }

  // Histograms
  for (const [key, h] of Object.entries(histograms)) {
    const baseName = key.split('{')[0];
    const labelPart = key.includes('{') ? key.slice(key.indexOf('{')) : '';
    lines.push(`# TYPE ${baseName} histogram`);
    for (const [b, c] of Object.entries(h.buckets)) {
      lines.push(`${baseName}_bucket{le="${b}"${labelPart.slice(1) || ''} ${c}`);
    }
    lines.push(`${baseName}_sum${labelPart} ${h.sum}`);
    lines.push(`${baseName}_count${labelPart} ${h.count}`);
  }

  // Gauges
  for (const [key, value] of Object.entries(gauges)) {
    lines.push(`# TYPE ${key.split('{')[0]} gauge`);
    lines.push(`${key} ${value}`);
  }

  return lines.join('\n');
}

module.exports = {
  incCounter,
  observeHistogram,
  setGauge,
  renderMetrics,
};
