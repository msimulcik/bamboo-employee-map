/**
 * Local geocoder for converting location strings to coordinates
 * Supports country and US/CA/AU state level geocoding
 */

const BambooGeocoder = (function() {
  let data = null;
  const cache = new Map();
  
  /**
   * Initialize the geocoder by loading location data
   */
  async function init() {
    if (data) return data;
    
    try {
      const url = chrome.runtime.getURL('data/cities.json');
      const response = await fetch(url);
      data = await response.json();
      return data;
    } catch (error) {
      // Silently fail - geocoding will return null for all locations
      return null;
    }
  }
  
  /**
   * Normalize a string for comparison (lowercase, remove special chars)
   */
  function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }
  
  /**
   * Parse a location string into components
   * Handles formats like:
   * - "California - Work From Home"
   * - "Remote - United Kingdom"
   * - "Remote - Argentina"
   * - "New York"
   * - "UK"
   */
  function parseLocation(locationStr) {
    if (!locationStr) return null;
    
    let str = locationStr.trim();
    
    // Remove common suffixes/prefixes
    const removePatterns = [
      /\s*-?\s*work\s*from\s*home\s*/gi,
      /\s*-?\s*wfh\s*/gi,
      /\s*-?\s*home\s*office\s*/gi,
      /\s*-?\s*office\s*/gi,
      /^\s*remote\s*-?\s*/gi,
      /\s*-?\s*remote\s*$/gi,
    ];
    
    for (const pattern of removePatterns) {
      str = str.replace(pattern, ' ');
    }
    str = str.replace(/\s+/g, ' ').trim();
    
    // Handle empty result after cleaning
    if (!str) {
      str = locationStr.trim();
    }
    
    // Split by common delimiters
    const parts = str.split(/[,\-]+/).map(p => p.trim()).filter(p => p);
    
    if (parts.length === 0) {
      return null;
    }
    
    return {
      original: locationStr,
      parts: parts
    };
  }
  
  /**
   * Find a matching US state
   */
  function findUSState(str) {
    if (!data || !str) return null;
    
    const normalized = normalize(str);
    const states = data.states?.US || [];
    
    return states.find(s => 
      normalize(s.name) === normalized ||
      s.code.toLowerCase() === normalized
    );
  }
  
  /**
   * Find a matching Canadian province
   */
  function findCAProvince(str) {
    if (!data || !str) return null;
    
    const normalized = normalize(str);
    const provinces = data.states?.CA || [];
    
    return provinces.find(p => 
      normalize(p.name) === normalized ||
      p.code.toLowerCase() === normalized
    );
  }
  
  /**
   * Find a matching Australian state
   */
  function findAUState(str) {
    if (!data || !str) return null;
    
    const normalized = normalize(str);
    const states = data.states?.AU || [];
    
    return states.find(s => 
      normalize(s.name) === normalized ||
      s.code.toLowerCase() === normalized
    );
  }
  
  /**
   * Find a matching country
   */
  function findCountry(str) {
    if (!data || !str) return null;
    
    const normalized = normalize(str);
    
    return data.countries.find(c => 
      normalize(c.name) === normalized ||
      c.code.toLowerCase() === normalized
    );
  }
  
  /**
   * Geocode a location string to coordinates
   * @param {string} locationStr - Location string from BambooHR
   * @returns {Promise<{lat: number, lng: number, name: string}|null>}
   */
  async function geocode(locationStr) {
    if (!locationStr) return null;
    
    // Check cache
    const cacheKey = normalize(locationStr);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    
    // Ensure data is loaded
    await init();
    if (!data) return null;
    
    const parsed = parseLocation(locationStr);
    if (!parsed) {
      return null;
    }
    
    let result = null;
    
    // Try each part to find a match
    for (const part of parsed.parts) {
      // Try US state first
      const usState = findUSState(part);
      if (usState) {
        result = {
          lat: usState.lat,
          lng: usState.lng,
          name: `${usState.name}, United States`,
          displayName: usState.name
        };
        break;
      }
      
      // Try Canadian province
      const caProvince = findCAProvince(part);
      if (caProvince) {
        result = {
          lat: caProvince.lat,
          lng: caProvince.lng,
          name: `${caProvince.name}, Canada`,
          displayName: caProvince.name
        };
        break;
      }
      
      // Try Australian state
      const auState = findAUState(part);
      if (auState) {
        result = {
          lat: auState.lat,
          lng: auState.lng,
          name: `${auState.name}, Australia`,
          displayName: auState.name
        };
        break;
      }
      
      // Try country
      const country = findCountry(part);
      if (country) {
        result = {
          lat: country.lat,
          lng: country.lng,
          name: country.name,
          displayName: country.name
        };
        break;
      }
    }
    
    // Cache the result
    cache.set(cacheKey, result);
    
    return result;
  }
  
  /**
   * Geocode multiple locations in batch
   * @param {string[]} locations - Array of location strings
   * @returns {Promise<Map<string, object>>} - Map of location string to coordinates
   */
  async function geocodeBatch(locations) {
    await init();
    
    const results = new Map();
    const unique = [...new Set(locations.filter(Boolean))];
    
    for (const location of unique) {
      const coords = await geocode(location);
      if (coords) {
        results.set(location, coords);
      }
    }
    
    return results;
  }
  
  /**
   * Clear the geocoding cache
   */
  function clearCache() {
    cache.clear();
  }
  
  // Public API
  return {
    init,
    geocode,
    geocodeBatch,
    clearCache,
    parseLocation
  };
})();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.BambooGeocoder = BambooGeocoder;
}
