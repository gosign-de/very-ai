# Contributing to very-ai

Thank you for your interest in contributing to very-ai!

## How to Contribute

### Reporting Bugs

- Use the [Bug Report](../../issues/new?template=bug_report.md) issue template
- Include steps to reproduce, expected vs. actual behavior
- Include your environment (OS, Docker version, Node.js version)

### Suggesting Features

- Use the [Feature Request](../../issues/new?template=feature_request.md) issue template
- Explain the use case, not just the feature

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Write clean, documented code
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Ensure linting passes: `npm run lint`
7. Commit with a clear message: `git commit -m 'Add: your feature description'`
8. Push and open a Pull Request against `main`

### Commit Messages

We use conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or fixing tests
- `chore:` Maintenance tasks

### Code Style

- TypeScript strict mode
- ESLint + Prettier (run `npm run lint` before committing)
- English comments and variable names
- No `console.log` in production code

## Development Setup

```bash
git clone https://github.com/gosign-de/very-ai.git
cd very-ai
cp .env.example .env
npm install
npm run dev
```

## Code of Conduct

By participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
