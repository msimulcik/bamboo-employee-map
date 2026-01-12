/**
 * D3-based world map renderer for BambooHR Employee Map
 * Features: zoom, pan, employee pins with clustering
 */

const BambooMap = (function() {
  let svg = null;
  let g = null;
  let projection = null;
  let path = null;
  let zoom = null;
  let width = 0;
  let height = 0;
  let worldData = null;
  let topoData = null;
  let currentTransform = d3.zoomIdentity;
  let onPinClick = null;
  
  const config = {
    minZoom: 0.3,
    maxZoom: 8,
    initialScale: 1,
    transitionDuration: 300,
    pinBaseRadius: 6,
    pinMaxRadius: 20
  };
  
  /**
   * Escape HTML to prevent XSS attacks
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Initialize the map in a container element
   */
  async function init(container, options = {}) {
    const rect = container.getBoundingClientRect();
    width = rect.width || 800;
    height = options.height || 400;
    
    if (options.onPinClick) {
      onPinClick = options.onPinClick;
    }
    
    // Create SVG
    svg = d3.select(container)
      .append('svg')
      .attr('class', 'bamboo-map-svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);
    
    // Add background
    svg.append('rect')
      .attr('class', 'bamboo-map-background')
      .attr('width', width)
      .attr('height', height);
    
    // Create main group for map elements
    g = svg.append('g').attr('class', 'bamboo-map-container');
    
    // Setup projection (Natural Earth for aesthetic appeal)
    // Smaller scale = more zoomed out to see all countries
    projection = d3.geoNaturalEarth1()
      .scale(width / 8)
      .translate([width / 2, height / 1.8]);
    
    path = d3.geoPath().projection(projection);
    
    // Setup zoom behavior
    zoom = d3.zoom()
      .scaleExtent([config.minZoom, config.maxZoom])
      .on('zoom', handleZoom);
    
    svg.call(zoom);
    
    // Load and render world data
    await loadWorldData();
    renderMap();
    
    // Add controls
    addControls(container);
    
    return { svg, projection, g };
  }
  
  /**
   * Load TopoJSON world data
   */
  async function loadWorldData() {
    try {
      const url = chrome.runtime.getURL('data/world-110m.json');
      const response = await fetch(url);
      topoData = await response.json();
      
      // Convert TopoJSON to GeoJSON
      worldData = {
        countries: topojson.feature(topoData, topoData.objects.countries),
        land: topoData.objects.land ? topojson.feature(topoData, topoData.objects.land) : null
      };
    } catch (error) {
      // Silently fail - map will show error state
    }
  }
  
  /**
   * Render the base map
   */
  function renderMap() {
    if (!worldData || !topoData) return;
    
    // Render countries
    g.selectAll('.bamboo-country')
      .data(worldData.countries.features)
      .enter()
      .append('path')
      .attr('class', 'bamboo-country')
      .attr('d', path);
    
    // Add country borders using original TopoJSON for mesh
    g.append('path')
      .datum(topojson.mesh(topoData, topoData.objects.countries, (a, b) => a !== b))
      .attr('class', 'bamboo-country-border')
      .attr('d', path);
  }
  
  /**
   * Handle zoom events
   */
  function handleZoom(event) {
    currentTransform = event.transform;
    g.attr('transform', currentTransform);
    
    // Scale pins inversely to maintain consistent size
    const scale = currentTransform.k;
    g.selectAll('.bamboo-pin-group')
      .attr('transform', d => {
        const [x, y] = projection([d.lng, d.lat]);
        return `translate(${x}, ${y}) scale(${1/scale})`;
      });
  }
  
  /**
   * Add map controls (zoom buttons, reset)
   */
  function addControls(container) {
    const controls = document.createElement('div');
    controls.className = 'bamboo-map-controls';
    controls.innerHTML = `
      <button class="bamboo-map-btn" data-action="zoom-in" title="Zoom in">+</button>
      <button class="bamboo-map-btn" data-action="zoom-out" title="Zoom out">−</button>
      <button class="bamboo-map-btn" data-action="reset" title="Reset view">⟲</button>
    `;
    
    controls.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'zoom-in') {
        svg.transition().duration(config.transitionDuration).call(zoom.scaleBy, 1.5);
      } else if (action === 'zoom-out') {
        svg.transition().duration(config.transitionDuration).call(zoom.scaleBy, 0.67);
      } else if (action === 'reset') {
        svg.transition().duration(config.transitionDuration).call(zoom.transform, d3.zoomIdentity);
      }
    });
    
    container.appendChild(controls);
  }
  
  /**
   * Calculate pin radius based on employee count
   */
  function getPinRadius(count, maxCount) {
    const normalized = Math.log(count + 1) / Math.log(maxCount + 1);
    return config.pinBaseRadius + normalized * (config.pinMaxRadius - config.pinBaseRadius);
  }
  
  /**
   * Render employee pins on the map
   * @param {Array} locations - Array of {lat, lng, name, employees: [...]}
   */
  function renderPins(locations) {
    if (!g || !projection) {
      console.error('[BambooMap] Map not initialized');
      return;
    }
    
    // Remove existing pins
    g.selectAll('.bamboo-pin-group').remove();
    
    if (!locations || locations.length === 0) {
      return;
    }
    
    const maxCount = Math.max(...locations.map(l => l.employees.length));
    const scale = currentTransform.k;
    
    // Create pin groups
    const pinGroups = g.selectAll('.bamboo-pin-group')
      .data(locations)
      .enter()
      .append('g')
      .attr('class', 'bamboo-pin-group')
      .attr('transform', d => {
        const [x, y] = projection([d.lng, d.lat]);
        return `translate(${x}, ${y}) scale(${1/scale})`;
      })
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onPinClick) {
          onPinClick(d, event);
        }
      });
    
    // Add pin circles
    pinGroups.append('circle')
      .attr('class', 'bamboo-pin')
      .attr('r', d => getPinRadius(d.employees.length, maxCount))
      .attr('cx', 0)
      .attr('cy', 0);
    
    // Add count labels for pins with multiple employees
    pinGroups.filter(d => d.employees.length > 1)
      .append('text')
      .attr('class', 'bamboo-pin-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .text(d => d.employees.length);
    
    // Add hover effect
    pinGroups
      .on('mouseenter', function(event, d) {
        d3.select(this).select('.bamboo-pin')
          .transition()
          .duration(150)
          .attr('r', d => getPinRadius(d.employees.length, maxCount) * 1.2);
        
        showTooltip(event, d);
      })
      .on('mouseleave', function(event, d) {
        d3.select(this).select('.bamboo-pin')
          .transition()
          .duration(150)
          .attr('r', d => getPinRadius(d.employees.length, maxCount));
        
        hideTooltip();
      });
  }
  
  /**
   * Show tooltip on pin hover
   */
  function showTooltip(event, data) {
    let tooltip = document.querySelector('.bamboo-map-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'bamboo-map-tooltip';
      document.body.appendChild(tooltip);
    }
    
    const count = data.employees.length;
    tooltip.innerHTML = `
      <strong>${escapeHtml(data.name)}</strong><br>
      ${count} employee${count !== 1 ? 's' : ''}
    `;
    
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.style.display = 'block';
  }
  
  /**
   * Hide the tooltip
   */
  function hideTooltip() {
    const tooltip = document.querySelector('.bamboo-map-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }
  
  /**
   * Zoom to a specific location
   */
  function zoomToLocation(lat, lng, zoomLevel = 4) {
    const [x, y] = projection([lng, lat]);
    
    svg.transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(zoomLevel)
          .translate(-x, -y)
      );
  }
  
  /**
   * Reset the map view
   */
  function resetView() {
    svg.transition()
      .duration(config.transitionDuration)
      .call(zoom.transform, d3.zoomIdentity);
  }
  
  /**
   * Resize the map
   */
  function resize(newWidth, newHeight) {
    width = newWidth;
    height = newHeight;
    
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    
    projection
      .scale(width / 8)
      .translate([width / 2, height / 1.8]);
    
    // Re-render
    g.selectAll('.bamboo-country').attr('d', path);
    g.selectAll('.bamboo-country-border').attr('d', path);
  }
  
  /**
   * Destroy the map and clean up
   */
  function destroy() {
    if (svg) {
      svg.remove();
    }
    const tooltip = document.querySelector('.bamboo-map-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
    svg = null;
    g = null;
    projection = null;
    worldData = null;
  }
  
  // Public API
  return {
    init,
    renderPins,
    zoomToLocation,
    resetView,
    resize,
    destroy,
    getProjection: () => projection,
    getSvg: () => svg
  };
})();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.BambooMap = BambooMap;
}

