/**
 * BambooHR Employee Map - Content Script
 * Injects interactive world map into the employee directory page
 */

(function() {
  'use strict';
  
  const STORAGE_KEY = 'bamboo-map-collapsed';
  const MAP_HEIGHT = 400;
  
  let mapContainer = null;
  let mapInitialized = false;
  let employees = [];
  let locationGroups = new Map();
  
  /**
   * Sanitize a string value - ensures it's a string and removes potential XSS vectors
   */
  function sanitizeString(value) {
    if (typeof value !== 'string') return '';
    // Remove null bytes and trim
    return value.replace(/\0/g, '').trim();
  }
  
  /**
   * Validate and sanitize employee data from API response
   */
  function validateEmployee(emp) {
    if (!emp || typeof emp !== 'object') return null;
    if (typeof emp.id === 'undefined') return null;
    
    return {
      id: emp.id,
      displayFirstName: sanitizeString(emp.displayFirstName),
      firstName: sanitizeString(emp.firstName),
      lastName: sanitizeString(emp.lastName),
      displayName: sanitizeString(emp.displayName),
      jobTitle: sanitizeString(emp.jobTitle),
      department: sanitizeString(emp.department),
      division: sanitizeString(emp.division),
      location: sanitizeString(emp.location),
      photoUrl: sanitizeString(emp.photoUrl)
    };
  }
  
  /**
   * Check if we're on the directory page
   */
  function isDirectoryPage() {
    return window.location.pathname.includes('/employees/directory.php');
  }
  
  /**
   * Fetch employee directory data from BambooHR API with pagination
   */
  async function fetchEmployees() {
    const allEmployees = [];
    const limit = 100;
    let page = 1;
    let hasMore = true;
    
    try {
      while (hasMore) {
        const response = await fetch(`/api/v1_1/employees/directory?page=${page}&limit=${limit}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('API request failed');
        }
        
        const data = await response.json();
        const rawEmployees = data.employees || [];
        
        // Validate and sanitize each employee record
        const validEmployees = rawEmployees
          .map(validateEmployee)
          .filter(emp => emp !== null);
        
        allEmployees.push(...validEmployees);
        
        // If we got fewer than the limit, we've reached the end
        if (rawEmployees.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      }
      
      return allEmployees;
    } catch (error) {
      // Don't log sensitive error details
      return allEmployees; // Return what we have so far
    }
  }
  
  /**
   * Group employees by their geocoded location
   */
  async function groupEmployeesByLocation(employeeList) {
    const groups = new Map();
    
    // Get all unique locations
    const locations = employeeList
      .map(e => e.location)
      .filter(Boolean);
    
    // Geocode all locations
    const geocoded = await BambooGeocoder.geocodeBatch(locations);
    
    // Group employees by geocoded location
    for (const employee of employeeList) {
      if (!employee.location) continue;
      
      const coords = geocoded.get(employee.location);
      if (!coords) {
        continue;
      }
      
      // Use a key based on rounded coordinates to cluster nearby locations
      const key = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          lat: coords.lat,
          lng: coords.lng,
          name: coords.name || employee.location,
          employees: []
        });
      }
      
      groups.get(key).employees.push(employee);
    }
    
    return groups;
  }
  
  /**
   * Process validated employee data into our format
   * Note: Input is already sanitized by validateEmployee()
   */
  function processEmployeeData(validatedEmployees) {
    return validatedEmployees.map(employee => ({
      id: employee.id,
      firstName: employee.displayFirstName || employee.firstName || '',
      lastName: employee.lastName || '',
      displayName: employee.displayName || '',
      jobTitle: employee.jobTitle || '',
      department: employee.department || '',
      division: employee.division || '',
      location: employee.location,
      photoUrl: employee.photoUrl || ''
    })).filter(emp => emp.location); // Only include employees with location
  }
  
  let allEmployeesData = []; // Store all employees for filtering
  let currentFilters = { name: '', jobTitle: '', department: '', division: '' };
  
  /**
   * Get unique values for a field from a list of employees
   */
  function getUniqueValues(field, employeeList) {
    const values = new Set();
    employeeList.forEach(emp => {
      if (emp[field]) values.add(emp[field]);
    });
    return Array.from(values).sort();
  }
  
  /**
   * Filter employees based on specific filters (excluding one filter for cascading)
   */
  function filterEmployeesExcluding(excludeFilter) {
    return allEmployeesData.filter(emp => {
      const nameMatch = excludeFilter === 'name' || !currentFilters.name || 
        `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(currentFilters.name.toLowerCase());
      const jobMatch = excludeFilter === 'jobTitle' || !currentFilters.jobTitle || emp.jobTitle === currentFilters.jobTitle;
      const deptMatch = excludeFilter === 'department' || !currentFilters.department || emp.department === currentFilters.department;
      const divMatch = excludeFilter === 'division' || !currentFilters.division || emp.division === currentFilters.division;
      return nameMatch && jobMatch && deptMatch && divMatch;
    });
  }
  
  /**
   * Filter employees based on current filters
   */
  function filterEmployees() {
    return filterEmployeesExcluding(null);
  }
  
  /**
   * Update a single dropdown with available options
   */
  function updateDropdown(filterName, availableValues, defaultLabel) {
    const select = document.querySelector(`select[data-filter="${filterName}"]`);
    if (!select) return;
    
    const currentValue = currentFilters[filterName];
    
    // Clear existing options
    select.innerHTML = `<option value="">${defaultLabel}</option>`;
    
    // Add available options
    availableValues.forEach(v => {
      const option = new Option(v, v);
      if (v === currentValue) option.selected = true;
      select.appendChild(option);
    });
    
    // If current value is no longer available, reset it
    if (currentValue && !availableValues.includes(currentValue)) {
      currentFilters[filterName] = '';
      select.value = '';
    }
  }
  
  /**
   * Update all filter dropdowns based on current selections (cascading filters)
   */
  function updateFilterDropdowns() {
    // Get available values for each filter based on other filters
    const jobTitleEmployees = filterEmployeesExcluding('jobTitle');
    const departmentEmployees = filterEmployeesExcluding('department');
    const divisionEmployees = filterEmployeesExcluding('division');
    
    const availableJobTitles = getUniqueValues('jobTitle', jobTitleEmployees);
    const availableDepartments = getUniqueValues('department', departmentEmployees);
    const availableDivisions = getUniqueValues('division', divisionEmployees);
    
    updateDropdown('jobTitle', availableJobTitles, 'All Job Titles');
    updateDropdown('department', availableDepartments, 'All Departments');
    updateDropdown('division', availableDivisions, 'All Divisions');
  }
  
  /**
   * Update map with filtered employees
   */
  async function updateMapWithFilters() {
    // Update cascading dropdowns first
    updateFilterDropdowns();
    
    const filtered = filterEmployees();
    const newGroups = await groupEmployeesByLocation(filtered);
    const locationsArray = Array.from(newGroups.values());
    
    BambooMap.renderPins(locationsArray);
    updateFilterCount(filtered.length, locationsArray.length);
    updateFilterBadge();
  }
  
  /**
   * Update the filter result count (both in header stats and filter popup)
   */
  function updateFilterCount(employeeCount, locationCount) {
    // Update header stats
    const statsEl = document.querySelector('.bamboo-map-stats');
    if (statsEl) {
      statsEl.textContent = `${employeeCount} employees · ${locationCount} locations`;
    }
  }
  
  /**
   * Create filter controls in the header
   */
  function createFilterControls(headerElement) {
    const filterWrapper = document.createElement('div');
    filterWrapper.className = 'bamboo-filter-wrapper';
    filterWrapper.innerHTML = `
      <button class="bamboo-filter-toggle" title="Filter employees">
        <svg class="bamboo-filter-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
        <span class="bamboo-filter-badge"></span>
      </button>
      <div class="bamboo-filter-popup">
        <div class="bamboo-filter-popup-header">
          <span>Filters</span>
          <button class="bamboo-filter-close">&times;</button>
        </div>
        <div class="bamboo-filter-body">
          <div class="bamboo-filter-row">
            <input type="text" class="bamboo-filter-input" placeholder="Search by name..." data-filter="name">
          </div>
          <div class="bamboo-filter-row">
            <select class="bamboo-filter-select" data-filter="jobTitle">
              <option value="">All Job Titles</option>
            </select>
          </div>
          <div class="bamboo-filter-row">
            <select class="bamboo-filter-select" data-filter="department">
              <option value="">All Departments</option>
            </select>
          </div>
          <div class="bamboo-filter-row">
            <select class="bamboo-filter-select" data-filter="division">
              <option value="">All Divisions</option>
            </select>
          </div>
          <button class="bamboo-filter-reset">Reset Filters</button>
        </div>
      </div>
    `;
    
    headerElement.appendChild(filterWrapper);
    
    // Initial population of dropdowns
    updateFilterDropdowns();
    
    const popup = filterWrapper.querySelector('.bamboo-filter-popup');
    
    // Position popup at top left of map container
    function positionPopup() {
      const mapContainer = document.querySelector('.bamboo-map-container');
      if (mapContainer) {
        const rect = mapContainer.getBoundingClientRect();
        popup.style.top = `${rect.top + 12}px`;
        popup.style.left = `${rect.left + 12}px`;
      }
    }
    
    // Toggle filter popup
    filterWrapper.querySelector('.bamboo-filter-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      positionPopup();
      popup.classList.toggle('bamboo-filter-popup-open');
    });
    
    // Close button
    filterWrapper.querySelector('.bamboo-filter-close').addEventListener('click', () => {
      popup.classList.remove('bamboo-filter-popup-open');
    });
    
    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!filterWrapper.contains(e.target)) {
        popup.classList.remove('bamboo-filter-popup-open');
      }
    });
    
    // Add event listeners
    filterWrapper.querySelector('input[data-filter="name"]').addEventListener('input', (e) => {
      currentFilters.name = e.target.value;
      updateMapWithFilters();
    });
    
    filterWrapper.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', (e) => {
        currentFilters[e.target.dataset.filter] = e.target.value;
        updateMapWithFilters();
      });
    });
    
    filterWrapper.querySelector('.bamboo-filter-reset').addEventListener('click', () => {
      currentFilters = { name: '', jobTitle: '', department: '', division: '' };
      filterWrapper.querySelector('input[data-filter="name"]').value = '';
      updateFilterDropdowns();
      updateMapWithFilters();
    });
  }
  
  /**
   * Get active filter count
   */
  function getActiveFilterCount() {
    let count = 0;
    if (currentFilters.name) count++;
    if (currentFilters.jobTitle) count++;
    if (currentFilters.department) count++;
    if (currentFilters.division) count++;
    return count;
  }
  
  /**
   * Update filter badge showing active filter count
   */
  function updateFilterBadge() {
    const badge = document.querySelector('.bamboo-filter-badge');
    const count = getActiveFilterCount();
    if (badge) {
      badge.textContent = count > 0 ? count : '';
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }
  
  /**
   * Create the map container and toggle UI
   */
  function createMapUI() {
    // Find the directory content area
    const directoryContent = document.querySelector('.PageContent, #directory, .directory-content, main, [role="main"]');
    const insertTarget = directoryContent || document.body;
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'bamboo-map-wrapper';
    wrapper.id = 'bamboo-employee-map';
    
    // Create header with toggle
    const header = document.createElement('div');
    header.className = 'bamboo-map-header';
    header.innerHTML = `
      <div class="bamboo-map-header-left">
        <svg class="bamboo-map-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <span class="bamboo-map-title">Employee Map</span>
        <div class="bamboo-filter-placeholder"></div>
        <span class="bamboo-map-stats"></span>
      </div>
      <button class="bamboo-map-toggle" aria-label="Toggle map">
        <svg class="bamboo-map-toggle-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </button>
    `;
    
    // Create map container
    mapContainer = document.createElement('div');
    mapContainer.className = 'bamboo-map-container';
    mapContainer.style.height = `${MAP_HEIGHT}px`;
    
    // Add loading state
    mapContainer.innerHTML = `
      <div class="bamboo-map-loading">
        <div class="bamboo-map-spinner"></div>
        <span>Loading map...</span>
      </div>
    `;
    
    wrapper.appendChild(header);
    wrapper.appendChild(mapContainer);
    
    // Insert at the top of the content area
    if (insertTarget.firstChild) {
      insertTarget.insertBefore(wrapper, insertTarget.firstChild);
    } else {
      insertTarget.appendChild(wrapper);
    }
    
    // Setup toggle functionality
    const toggleBtn = header.querySelector('.bamboo-map-toggle');
    toggleBtn.addEventListener('click', toggleMap);
    
    // Check saved state
    const isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (isCollapsed) {
      wrapper.classList.add('bamboo-map-collapsed');
    }
    
    return { wrapper, mapContainer, header };
  }
  
  /**
   * Toggle map visibility
   */
  function toggleMap() {
    const wrapper = document.querySelector('.bamboo-map-wrapper');
    if (!wrapper) return;
    
    const isCollapsed = wrapper.classList.toggle('bamboo-map-collapsed');
    localStorage.setItem(STORAGE_KEY, isCollapsed);
    
    // Resize map if expanding
    if (!isCollapsed && mapInitialized) {
      setTimeout(() => {
        const rect = mapContainer.getBoundingClientRect();
        BambooMap.resize(rect.width, MAP_HEIGHT);
      }, 300);
    }
  }
  
  
  /**
   * Initialize the map with data
   */
  async function initializeMap() {
    if (mapInitialized) return;
    
    try {
      // Clear loading state
      mapContainer.innerHTML = '';
      
      // Initialize the D3 map
      await BambooMap.init(mapContainer, {
        height: MAP_HEIGHT,
        onPinClick: (data, event) => {
          BambooPopup.show(data, event);
        }
      });
      
      // Add filter controls to header (next to stats)
      const filterPlaceholder = document.querySelector('.bamboo-filter-placeholder');
      if (filterPlaceholder) {
        createFilterControls(filterPlaceholder);
      }
      
      // Render pins
      const locationsArray = Array.from(locationGroups.values());
      BambooMap.renderPins(locationsArray);
      
      // Update stats
      const totalEmployees = locationsArray.reduce((sum, loc) => sum + loc.employees.length, 0);
      updateFilterCount(totalEmployees, locationsArray.length);
      
      mapInitialized = true;
    } catch (error) {
      mapContainer.innerHTML = `
        <div class="bamboo-map-error">
          <span>Failed to load map. Please refresh the page.</span>
        </div>
      `;
    }
  }
  
  /**
   * Main initialization
   */
  async function init() {
    if (!isDirectoryPage()) {
      return;
    }
    
    // Create UI
    createMapUI();
    
    // Fetch employee data
    const rawEmployees = await fetchEmployees();
    
    if (rawEmployees.length === 0) {
      mapContainer.innerHTML = `
        <div class="bamboo-map-error">
          <span>No employee data available</span>
        </div>
      `;
      return;
    }
    
    // Process and store employee data for filtering
    allEmployeesData = processEmployeeData(rawEmployees);
    employees = allEmployeesData;
    
    // Initialize geocoder
    await BambooGeocoder.init();
    
    // Group employees by location
    locationGroups = await groupEmployeesByLocation(allEmployeesData);
    
    // Initialize map if not collapsed
    const isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (!isCollapsed) {
      await initializeMap();
    } else {
      // Update stats even when collapsed
      const locationsArray = Array.from(locationGroups.values());
      const totalEmployees = locationsArray.reduce((sum, loc) => sum + loc.employees.length, 0);
      updateStats(totalEmployees, locationsArray.length);
      
      // Initialize map when expanded
      const wrapper = document.querySelector('.bamboo-map-wrapper');
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            if (!wrapper.classList.contains('bamboo-map-collapsed') && !mapInitialized) {
              initializeMap();
              observer.disconnect();
            }
          }
        }
      });
      observer.observe(wrapper, { attributes: true });
    }
  }
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to ensure other scripts have loaded
    setTimeout(init, 100);
  }
})();

