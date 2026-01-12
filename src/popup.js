/**
 * Employee popup component for BambooHR Map
 * Shows employee list when a pin is clicked
 */

const BambooPopup = (function() {
  let popupElement = null;
  let isOpen = false;
  
  /**
   * Create the popup element if it doesn't exist
   */
  function createPopup() {
    if (popupElement) return popupElement;
    
    popupElement = document.createElement('div');
    popupElement.className = 'bamboo-popup';
    popupElement.innerHTML = `
      <div class="bamboo-popup-header">
        <h3 class="bamboo-popup-title"></h3>
        <span class="bamboo-popup-count"></span>
        <button class="bamboo-popup-close" aria-label="Close">&times;</button>
      </div>
      <div class="bamboo-popup-content">
        <ul class="bamboo-popup-list"></ul>
      </div>
    `;
    
    // Close button handler
    popupElement.querySelector('.bamboo-popup-close').addEventListener('click', close);
    
    // Close on click outside
    document.addEventListener('click', (e) => {
      if (isOpen && !popupElement.contains(e.target) && !e.target.closest('.bamboo-pin-group')) {
        close();
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
    
    document.body.appendChild(popupElement);
    return popupElement;
  }
  
  /**
   * Generate consistent color based on name
   */
  function getAvatarColor(firstName, lastName) {
    const colors = [
      '#4CAF50', '#2196F3', '#9C27B0', '#FF5722', '#607D8B',
      '#E91E63', '#00BCD4', '#FF9800', '#795548', '#3F51B5'
    ];
    const str = (firstName || '') + (lastName || '');
    const colorIndex = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex];
  }
  
  /**
   * Generate employee list item HTML
   */
  function renderEmployee(employee) {
    const firstName = employee.firstName || '';
    const lastName = employee.lastName || '';
    const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    const bgColor = getAvatarColor(firstName, lastName);
    
    // Only use photo URL if it passes security validation
    const rawPhotoUrl = employee.photoUrl || '';
    const safePhotoUrl = isValidPhotoUrl(rawPhotoUrl) ? rawPhotoUrl : '';
    
    // Combine division and department with dot separator
    const division = employee.division || '';
    const department = employee.department || '';
    const deptDivision = [division, department].filter(Boolean).join(' · ');
    
    return `
      <li class="bamboo-popup-employee" data-initials="${escapeHtml(initials)}" data-color="${escapeHtml(bgColor)}">
        <div class="bamboo-popup-avatar bamboo-popup-avatar-initials" style="background-color: ${escapeHtml(bgColor)}">
          ${safePhotoUrl ? `<img src="${escapeHtml(safePhotoUrl)}" alt="" class="bamboo-popup-avatar-img">` : escapeHtml(initials)}
        </div>
        <div class="bamboo-popup-employee-info">
          <div class="bamboo-popup-employee-name">
            ${escapeHtml(firstName)} ${escapeHtml(lastName)}
          </div>
          <div class="bamboo-popup-employee-title">
            ${escapeHtml(employee.jobTitle || '')}
          </div>
          <div class="bamboo-popup-employee-dept">
            ${escapeHtml(deptDivision)}
          </div>
        </div>
      </li>
    `;
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Validate photo URL to prevent loading from untrusted sources
   * Only allows HTTPS URLs from known BambooHR-related domains
   */
  function isValidPhotoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      
      // Only allow HTTPS
      if (parsed.protocol !== 'https:') return false;
      
      // Allowlist of trusted domains for employee photos
      const trustedDomains = [
        '.bamboohr.com',
        '.cloudfront.net',  // AWS CloudFront CDN often used by BambooHR
        '.amazonaws.com'    // AWS S3 storage
      ];
      
      const hostname = parsed.hostname.toLowerCase();
      return trustedDomains.some(domain => 
        hostname === domain.slice(1) || hostname.endsWith(domain)
      );
    } catch {
      return false;
    }
  }
  
  /**
   * Handle image load errors by showing initials instead
   */
  function setupImageErrorHandlers(container) {
    const images = container.querySelectorAll('.bamboo-popup-avatar-img');
    images.forEach(img => {
      img.onerror = function() {
        // Hide the broken image and show parent's initials
        this.style.display = 'none';
        const parent = this.closest('.bamboo-popup-avatar');
        const li = this.closest('.bamboo-popup-employee');
        if (parent && li) {
          const initials = li.dataset.initials || '?';
          // Only add initials text if not already there
          if (!parent.querySelector('.bamboo-initials-text')) {
            const span = document.createElement('span');
            span.className = 'bamboo-initials-text';
            span.textContent = initials;
            parent.appendChild(span);
          }
        }
      };
      img.onload = function() {
        // Image loaded successfully, ensure it's visible
        this.style.display = 'block';
      };
    });
  }
  
  /**
   * Show the popup with employee data
   * @param {Object} data - Pin data with {name, employees: [...], lat, lng}
   * @param {MouseEvent} event - Click event for positioning
   */
  function show(data, event) {
    const popup = createPopup();
    
    // Update content
    popup.querySelector('.bamboo-popup-title').textContent = data.name;
    popup.querySelector('.bamboo-popup-count').textContent = 
      `${data.employees.length} employee${data.employees.length !== 1 ? 's' : ''}`;
    
    // Sort employees by name
    const sortedEmployees = [...data.employees].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    // Render employee list
    const list = popup.querySelector('.bamboo-popup-list');
    list.innerHTML = sortedEmployees.map(renderEmployee).join('');
    
    // Setup image error handlers
    setupImageErrorHandlers(list);
    
    // Position popup
    positionPopup(event);
    
    // Show with animation
    popup.classList.add('bamboo-popup-visible');
    isOpen = true;
  }
  
  /**
   * Position the popup near the click event
   */
  function positionPopup(event) {
    if (!popupElement) return;
    
    const popup = popupElement;
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Reset position to measure dimensions
    popup.style.left = '0px';
    popup.style.top = '0px';
    
    const rect = popup.getBoundingClientRect();
    const popupWidth = rect.width;
    const popupHeight = rect.height;
    
    let left = event.clientX + padding;
    let top = event.clientY + padding;
    
    // Adjust if popup would go off screen
    if (left + popupWidth > viewportWidth - padding) {
      left = event.clientX - popupWidth - padding;
    }
    if (top + popupHeight > viewportHeight - padding) {
      top = viewportHeight - popupHeight - padding;
    }
    
    // Ensure minimum position
    left = Math.max(padding, left);
    top = Math.max(padding, top);
    
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }
  
  /**
   * Close the popup
   */
  function close() {
    if (popupElement) {
      popupElement.classList.remove('bamboo-popup-visible');
      isOpen = false;
    }
  }
  
  /**
   * Check if popup is currently open
   */
  function isVisible() {
    return isOpen;
  }
  
  /**
   * Destroy the popup element
   */
  function destroy() {
    if (popupElement) {
      popupElement.remove();
      popupElement = null;
    }
    isOpen = false;
  }
  
  // Public API
  return {
    show,
    close,
    isVisible,
    destroy
  };
})();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.BambooPopup = BambooPopup;
}

