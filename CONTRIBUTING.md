# Contributing to VoidMind

Thank you for your interest in contributing to VoidMind!

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported.
2. Open a new issue with a clear title and description.
3. Include steps to reproduce, expected behavior, and actual behavior.
4. Include your environment (OS, Node.js version, Ollama version).

### Suggesting Features

1. Open an issue describing the feature and its use case.
2. Discuss the feature with maintainers before implementing.

### Pull Requests

1. Fork the repository.
2. Create a new branch: `git checkout -b feature/my-feature` or `fix/my-bugfix`.
3. Make your changes.
4. Add or update tests.
5. Ensure all tests pass: `npm test`.
6. Ensure linting passes: `npm run lint`.
7. Commit with clear messages.
8. Push and open a pull request.

## Code Style

- Use ES6+ features where appropriate.
- Follow existing patterns in the codebase.
- Write clear, concise comments.
- No user data in logs, comments, or test fixtures.

## Testing

- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Compliance tests: `npm run test:compliance`

## Security

If you find a security issue, please see [SECURITY.md](SECURITY.md) for responsible disclosure.
