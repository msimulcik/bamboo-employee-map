# Contributing to BambooHR Employee Map

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Load the extension in Chrome (Developer mode)
4. Make your changes
5. Test thoroughly
6. Submit a pull request

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/bamboo-employee-map.git
   cd bamboo-employee-map
   ```

2. Load in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project folder

3. Make changes and reload:
   - Edit files in `src/`
   - Click refresh on the extension card in `chrome://extensions/`
   - Reload the BambooHR page to see changes

## Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add JSDoc comments for functions
- Keep functions small and focused
- Use meaningful variable names

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit with clear messages:
   ```bash
   git commit -m "Add: description of what you added"
   git commit -m "Fix: description of what you fixed"
   ```

3. **Test your changes**:
   - Verify the extension loads without errors
   - Test on the BambooHR directory page
   - Check browser console for errors
   - Test with different filter combinations

4. **Push and create a PR**:
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

## Reporting Bugs

When reporting bugs, please include:

- Chrome version
- Extension version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Console errors (if any)
- Screenshots (if applicable)

## Requesting Features

Feature requests are welcome! Please:

- Check if the feature already exists or is planned
- Describe the use case clearly
- Explain why it would benefit users

## Adding New Locations

If you notice a country or region is missing from the geocoding database:

1. Edit `data/cities.json`
2. Add the country to the `countries` array:
   ```json
   {"name": "Country Name", "code": "XX", "lat": 0.0, "lng": 0.0}
   ```
3. For US/CA/AU states, add to the appropriate `states` object
4. Submit a PR with the additions

## Questions?

Feel free to open an issue for any questions about contributing.

