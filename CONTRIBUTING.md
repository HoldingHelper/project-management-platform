# Contributing

Thank you for helping improve the Project Management Platform.

## Development workflow

1. Fork the repository and create a focused branch.
2. Copy the example environment files; never commit credentials or local data.
3. Keep domain logic inside its backend module and avoid cross-module model imports.
4. Add or update tests for behavior changes.
5. Run the backend checks and frontend build before opening a pull request.

```bash
cd backend
pytest
ruff check .

cd ../frontend
npm ci
npm run build
```

Pull requests should explain the problem, the chosen approach, verification performed, and any migration or configuration impact. Keep unrelated refactors separate.
