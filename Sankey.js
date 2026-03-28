// ── Color by a_origin_id ──────────────────────────────────────────────────────
const originColors = {
  "Both Ancestral Sides": { node: "#534AB7", link: "rgba(83,74,183,0.35)"  },
  "Maternal Only":        { node: "#185FA5", link: "rgba(24,95,165,0.35)"  },
  "Paternal Only":        { node: "#6d1111", link: "rgba(109,17,17,0.35)"  },
  "Neither Ancestral":    { node: "#888780", link: "rgba(136,135,128,0.35)"},
};
const fallback = { node: "#888780", link: "rgba(136,135,128,0.25)" };

const isDark = matchMedia("(prefers-color-scheme: dark)").matches;

const layout = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor:  "rgba(0,0,0,0)",
  font: { size: 12, color: isDark ? "#d1d0ca" : "#2C2C2A", family: "sans-serif" },
  margin: { l: 10, r: 10, t: 10, b: 10 },
};

const config = { displayModeBar: false, responsive: true };

// ── Parse links.csv ───────────────────────────────────────────────────────────
// Expected columns: (index), source, target, value, a_origin_id, origin_id, ...
// Rows where origin_id is blank are tier-1 (ancestral → parental).
// Rows where origin_id is set are tiers 2–3 (parental → disorder → subclass).
function parseCSV(text) {
  const lines = text.trim().split("\n");
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    return {
      source:      cols[1].trim(),
      target:      cols[2].trim(),
      value:       +cols[3],
      a_origin_id: cols[4].trim(),
      origin_id:   cols[5].trim(),
    };
  });
}

function dedupe(links) {
  const map = {};
  links.forEach(({ s, t, v, origin }) => {
    const k = `${s}||${t}||${origin}`;
    if (!map[k]) map[k] = { s, t, v: 0, origin };
    map[k].v += v;
  });
  return Object.values(map);
}


function buildTrace(rawData, mode) {
  let links = [];

  if (mode === "all") {
    // Tier 1: ancestral → parental (origin_id is blank)
    rawData.filter(r => r.origin_id === "").forEach(r =>
      links.push({ s: r.a_origin_id, t: r.target, v: r.value, origin: r.a_origin_id })
    );
    // Tiers 2 & 3: parental → disorder → subclass (origin_id is set)
    rawData.filter(r => r.origin_id !== "").forEach(r =>
      links.push({ s: r.source, t: r.target, v: r.value, origin: r.a_origin_id })
    );
  } else {
    // "parental": only rows with origin_id set; source is origin_id
    rawData.filter(r => r.origin_id !== "").forEach(r =>
      links.push({ s: r.origin_id, t: r.target, v: r.value, origin: r.a_origin_id })
    );
  }

  // Dedupe on s+t+origin so each ancestry color gets its own flow band
  const dedupedLinks = dedupe(links);

  // Node index keyed on label only — shared across all origins
  const nodeSet = [];
  const nodeIndex = {};
  dedupedLinks.forEach(({ s, t }) => {
    [s, t].forEach(n => {
      if (!(n in nodeIndex)) { nodeIndex[n] = nodeSet.length; nodeSet.push(n); }
    });
  });

  // In parental mode, ancestral source nodes are absent — color each remaining
  // node by whichever a_origin_id contributes the most total flow through it.
  const nodeDominantOrigin = {};
  if (mode === "parental") {
    const totals = {};
    dedupedLinks.forEach(({ s, t, v, origin }) => {
      [s, t].forEach(n => {
        if (!totals[n]) totals[n] = {};
        totals[n][origin] = (totals[n][origin] || 0) + v;
      });
    });
    Object.keys(totals).forEach(n => {
      nodeDominantOrigin[n] = Object.entries(totals[n])
        .sort((a, b) => b[1] - a[1])[0][0];
    });
  }

  function nodeColor(n) {
    if (originColors[n]) return originColors[n].node;
    if (mode === "parental" && nodeDominantOrigin[n])
      return (originColors[nodeDominantOrigin[n]] || fallback).node;
    return fallback.node;
  }

  return {
    type: "sankey",
    arrangement: "snap",
    node: {
      label:     nodeSet,
      color:     nodeSet.map(n => nodeColor(n)),
      pad:       20,
      thickness: 15,
      line:      { color: "rgba(0,0,0,0)", width: 0 },
    },
    link: {
      source: dedupedLinks.map(l => nodeIndex[l.s]),
      target: dedupedLinks.map(l => nodeIndex[l.t]),
      value:  dedupedLinks.map(l => l.v),
      color:  dedupedLinks.map(l => (originColors[l.origin] || fallback).link),
    },
  };
}

// ── Init: load CSV then render ────────────────────────────────────────────────
fetch("links.csv")
  .then(r => r.text())
  .then(text => {
    const rawData = parseCSV(text);

    Plotly.newPlot("sankey", [buildTrace(rawData, "all")], layout, config);

    document.getElementById("sankeyMode").addEventListener("change", e => {
      Plotly.react("sankey", [buildTrace(rawData, e.target.value)], layout, config);
    });
  });
