# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-12

### Added
- Interactive world map on BambooHR employee directory page
- Employee pins with clustering by location
- Click pins to view employee list with photo, name, job title, department, and division
- Filter employees by name, job title, department, and division
- Cascading filters (options update based on other selections)
- Real-time stats showing employee and location counts
- Collapsible map with state persistence
- Zoom and pan controls
- Support for 229 countries and US/CA/AU states
- Local geocoding (no external API calls)

### Technical
- Chrome Extension Manifest V3
- D3.js for map rendering
- TopoJSON for efficient map data
- Bundled Natural Earth 110m world map

